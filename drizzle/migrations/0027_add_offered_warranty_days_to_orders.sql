ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS offered_warranty_days integer
  CHECK (offered_warranty_days IS NULL OR offered_warranty_days > 0);

CREATE OR REPLACE FUNCTION public.guard_technician_order_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ex text[] := ARRAY['status','updated_at','executed_at','completed_at','technician_reported_cents','technician_reported_at','technician_reported_by','technician_reported_name','technician_reported_parts','offered_warranty_days'];
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
  IF NOT public.has_role(auth.uid(),'tecnico') OR OLD.technician_id IS DISTINCT FROM public.my_technician_id() THEN RAISE EXCEPTION 'Este atendimento não é seu.'; END IF;
  IF (to_jsonb(NEW)-ex) IS DISTINCT FROM (to_jsonb(OLD)-ex) THEN RAISE EXCEPTION 'Técnico não pode alterar dados administrativos ou financeiros.'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
     (NEW.status='servico_em_andamento' AND OLD.status IN ('novo','aguardando_agendamento','visita_agendada','tecnico_a_caminho','em_diagnostico','orcamento_aprovado','aguardando_peca'))
  OR (NEW.status IN ('servico_concluido','visita_concluida') AND OLD.status='servico_em_andamento')
  ) THEN RAISE EXCEPTION 'Transição de atendimento não permitida nesta etapa.'; END IF;
  IF NEW.status='servico_concluido' AND OLD.status<>'servico_concluido' AND NEW.technician_reported_cents IS NULL THEN RAISE EXCEPTION 'Informe o valor total cobrado para concluir o serviço.'; END IF;
  IF (NEW.technician_reported_cents IS DISTINCT FROM OLD.technician_reported_cents
      OR NEW.technician_reported_parts IS DISTINCT FROM OLD.technician_reported_parts
      OR NEW.offered_warranty_days IS DISTINCT FROM OLD.offered_warranty_days)
     AND NOT (OLD.status='servico_em_andamento' AND NEW.status='servico_concluido') THEN RAISE EXCEPTION 'O valor cobrado é informado somente ao concluir o serviço.'; END IF;
 END IF;
 IF NEW.technician_reported_cents IS DISTINCT FROM OLD.technician_reported_cents
    OR NEW.technician_reported_parts IS DISTINCT FROM OLD.technician_reported_parts
    OR NEW.offered_warranty_days IS DISTINCT FROM OLD.offered_warranty_days THEN
  IF NOT public.has_role(auth.uid(),'tecnico') OR OLD.technician_id IS DISTINCT FROM public.my_technician_id() THEN RAISE EXCEPTION 'Somente o técnico responsável pode informar este valor.'; END IF;
  IF OLD.financial_confirmed_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.order_financials WHERE order_id=OLD.id) THEN RAISE EXCEPTION 'Apuração financeira já confirmada; valor do técnico bloqueado.'; END IF;
  IF OLD.status IN ('cancelado','finalizado') THEN RAISE EXCEPTION 'Atendimento encerrado.'; END IF;
  IF NEW.technician_reported_cents IS NULL THEN RAISE EXCEPTION 'Informe um valor válido.'; END IF;
  NEW.technician_reported_at:=now(); NEW.technician_reported_by:=auth.uid();
  SELECT full_name INTO NEW.technician_reported_name FROM public.profiles WHERE id=auth.uid();
 ELSE
  NEW.technician_reported_at:=OLD.technician_reported_at; NEW.technician_reported_by:=OLD.technician_reported_by; NEW.technician_reported_name:=OLD.technician_reported_name;
 END IF;
 RETURN NEW;
END $$;

DROP FUNCTION IF EXISTS public.complete_service_with_values(uuid, integer, jsonb);

CREATE OR REPLACE FUNCTION public.complete_service_with_values(_order uuid, _cents integer, _parts jsonb, _warranty_days integer DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE p jsonb; norm jsonb := '[]'::jsonb; d text; c integer; s integer := 0; summary text := ''; wtext text := '';
BEGIN
 IF NOT public.has_role(auth.uid(),'tecnico') THEN RAISE EXCEPTION 'Somente o técnico responsável conclui o serviço.'; END IF;
 IF _cents IS NULL OR _cents<0 THEN RAISE EXCEPTION 'Informe o valor total cobrado.'; END IF;
 IF _warranty_days IS NOT NULL AND _warranty_days<1 THEN RAISE EXCEPTION 'Informe um prazo de garantia inteiro positivo em dias.'; END IF;
 IF _parts IS NULL THEN _parts:='[]'::jsonb; END IF;
 IF jsonb_typeof(_parts)<>'array' OR jsonb_array_length(_parts)>50 THEN RAISE EXCEPTION 'Lista de peças inválida.'; END IF;
 FOR p IN SELECT * FROM jsonb_array_elements(_parts) LOOP
  d:=left(trim(coalesce(p->>'description','')),200);
  IF d='' THEN RAISE EXCEPTION 'Informe a descrição de cada peça.'; END IF;
  IF jsonb_typeof(p->'cents')<>'number' THEN RAISE EXCEPTION 'Valor de peça inválido.'; END IF;
  c:=(p->>'cents')::integer;
  IF c<0 THEN RAISE EXCEPTION 'Valor de peça inválido.'; END IF;
  s:=s+c; norm:=norm||jsonb_build_array(jsonb_build_object('description',d,'cents',c));
  summary:=summary||CASE WHEN summary='' THEN '' ELSE '; ' END||d||' '||c||' centavos';
 END LOOP;
 IF s>_cents THEN RAISE EXCEPTION 'A soma das peças não pode ultrapassar o total cobrado.'; END IF;
 UPDATE public.service_orders SET status='servico_concluido', technician_reported_cents=_cents, technician_reported_parts=norm, offered_warranty_days=_warranty_days WHERE id=_order AND technician_id=public.my_technician_id() AND status='servico_em_andamento';
 IF NOT FOUND THEN RAISE EXCEPTION 'Atendimento não está em serviço iniciado ou não é seu.'; END IF;
 wtext := CASE WHEN _warranty_days IS NULL THEN '' ELSE ', garantia informada: '||_warranty_days||' dias' END;
 INSERT INTO public.service_order_events(order_id,event_type,description,actor_user_id,actor_name)
 SELECT _order,'conclusao','Serviço concluído pelo técnico: total cobrado '||_cents||' centavos, peças '||s||' centavos'||CASE WHEN summary='' THEN ' (nenhuma peça)' ELSE ' ('||summary||')' END||wtext||'. Aguardando conferência do administrador.',auth.uid(),full_name FROM public.profiles WHERE id=auth.uid();
END $$;

REVOKE ALL ON FUNCTION public.complete_service_with_values(uuid, integer, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_service_with_values(uuid, integer, jsonb, integer) TO authenticated;