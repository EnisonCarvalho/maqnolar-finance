ALTER TABLE public.service_orders ADD COLUMN service_description text, ADD COLUMN corrected_parts jsonb;
ALTER TABLE public.warranty_notes ADD COLUMN current_snapshot jsonb, ADD COLUMN revision_history jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE OR REPLACE FUNCTION public.guard_warranty_note_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND public.has_role(auth.uid(),'admin')
 AND (to_jsonb(NEW)-ARRAY['current_snapshot','revision_history'])=(to_jsonb(OLD)-ARRAY['current_snapshot','revision_history'])
 AND NEW.current_snapshot IS NOT NULL
 AND NEW.revision_history=OLD.revision_history || jsonb_build_array(coalesce(OLD.current_snapshot,to_jsonb(OLD)-ARRAY['current_snapshot','revision_history'])) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'A nota original é imutável. Somente uma correção administrativa pode acrescentar uma versão.';
END $$;
CREATE OR REPLACE FUNCTION public.guard_technician_order_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ex text[] := ARRAY['status','updated_at','executed_at','completed_at','technician_reported_cents','technician_reported_at','technician_reported_by','technician_reported_name','technician_reported_parts','offered_warranty_days'];
BEGIN
 IF public.has_role(auth.uid(),'admin') THEN
  IF NEW.technician_reported_cents IS DISTINCT FROM OLD.technician_reported_cents OR NEW.technician_reported_parts IS DISTINCT FROM OLD.technician_reported_parts OR NEW.technician_reported_by IS DISTINCT FROM OLD.technician_reported_by OR NEW.technician_reported_at IS DISTINCT FROM OLD.technician_reported_at OR NEW.technician_reported_name IS DISTINCT FROM OLD.technician_reported_name THEN RAISE EXCEPTION 'A declaração original do técnico é preservada; corrija a apuração administrativa.'; END IF;
  RETURN NEW;
 END IF;
 IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
  IF NOT public.has_role(auth.uid(),'tecnico') OR OLD.technician_id IS DISTINCT FROM public.my_technician_id() THEN RAISE EXCEPTION 'Este atendimento não é seu.'; END IF;
  IF (to_jsonb(NEW)-ex) IS DISTINCT FROM (to_jsonb(OLD)-ex) THEN RAISE EXCEPTION 'Técnico não pode alterar dados administrativos ou financeiros.'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT ((NEW.status='servico_em_andamento' AND OLD.status IN ('novo','aguardando_agendamento','visita_agendada','tecnico_a_caminho','em_diagnostico','orcamento_aprovado','aguardando_peca')) OR (NEW.status IN ('servico_concluido','visita_concluida') AND OLD.status='servico_em_andamento')) THEN RAISE EXCEPTION 'Transição de atendimento não permitida nesta etapa.'; END IF;
  IF NEW.status='servico_concluido' AND OLD.status<>'servico_concluido' AND NEW.technician_reported_cents IS NULL THEN RAISE EXCEPTION 'Informe o valor total cobrado para concluir o serviço.'; END IF;
  IF (NEW.technician_reported_cents IS DISTINCT FROM OLD.technician_reported_cents OR NEW.technician_reported_parts IS DISTINCT FROM OLD.technician_reported_parts OR NEW.offered_warranty_days IS DISTINCT FROM OLD.offered_warranty_days) AND NOT (OLD.status='servico_em_andamento' AND NEW.status='servico_concluido') THEN RAISE EXCEPTION 'O valor cobrado é informado somente ao concluir o serviço.'; END IF;
 END IF;
 IF NEW.technician_reported_cents IS DISTINCT FROM OLD.technician_reported_cents OR NEW.technician_reported_parts IS DISTINCT FROM OLD.technician_reported_parts OR NEW.offered_warranty_days IS DISTINCT FROM OLD.offered_warranty_days THEN
  IF NOT public.has_role(auth.uid(),'tecnico') OR OLD.technician_id IS DISTINCT FROM public.my_technician_id() THEN RAISE EXCEPTION 'Somente o técnico responsável pode informar este valor.'; END IF;
  IF OLD.financial_confirmed_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.order_financials WHERE order_id=OLD.id) THEN RAISE EXCEPTION 'Apuração financeira já confirmada; valor do técnico bloqueado.'; END IF;
  IF OLD.status IN ('cancelado','finalizado') THEN RAISE EXCEPTION 'Atendimento encerrado.'; END IF;
  IF NEW.technician_reported_cents IS NULL THEN RAISE EXCEPTION 'Informe um valor válido.'; END IF;
  NEW.technician_reported_at:=now(); NEW.technician_reported_by:=auth.uid(); SELECT full_name INTO NEW.technician_reported_name FROM public.profiles WHERE id=auth.uid();
 ELSE NEW.technician_reported_at:=OLD.technician_reported_at; NEW.technician_reported_by:=OLD.technician_reported_by; NEW.technician_reported_name:=OLD.technician_reported_name;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.correct_confirmed_order(_order uuid,_data jsonb,_total integer,_parts jsonb,_warranty_days integer,_reason text,_expected_updated_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.service_orders; f public.order_financials; n public.warranty_notes; c public.customers; old_c jsonb; part_sum bigint:=0; labor integer; tech integer; cname text; snap jsonb; p jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente administradores podem corrigir OS confirmadas.'; END IF;
 IF length(trim(coalesce(_reason,'')))<3 THEN RAISE EXCEPTION 'Informe o motivo da correção.'; END IF;
 SELECT * INTO o FROM public.service_orders WHERE id=_order FOR UPDATE;
 IF NOT FOUND OR o.test_reset_batch IS NOT NULL THEN RAISE EXCEPTION 'OS indisponível.'; END IF;
 IF o.updated_at IS DISTINCT FROM _expected_updated_at THEN RAISE EXCEPTION 'Esta OS foi alterada. Reabra a edição antes de salvar.'; END IF;
 IF o.financial_confirmed_at IS NULL OR o.status NOT IN ('finalizado','visita_concluida') THEN RAISE EXCEPTION 'Esta correção exige uma OS finalizada e confirmada.'; END IF;
 SELECT * INTO f FROM public.order_financials WHERE order_id=_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Apuração não encontrada.'; END IF;
 PERFORM public.assert_month_open((coalesce(o.completed_at,o.financial_confirmed_at) AT TIME ZONE 'America/Fortaleza')::date);
 IF _total IS NULL OR _total<0 OR jsonb_typeof(_parts) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Valores inválidos.'; END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(_parts) LOOP
  IF length(trim(coalesce(p->>'description','')))=0 OR coalesce(p->>'cents','') !~ '^\d+$' THEN RAISE EXCEPTION 'Informe a descrição e um valor válido para cada peça.'; END IF;
  part_sum:=part_sum+(p->>'cents')::bigint;
 END LOOP;
 IF part_sum>_total THEN RAISE EXCEPTION 'Peças não podem superar o valor total.'; END IF;
 IF _warranty_days IS NOT NULL AND _warranty_days<1 THEN RAISE EXCEPTION 'Garantia deve ser um inteiro positivo.'; END IF;
 IF length(trim(coalesce(_data->>'serviceDescription','')))=0 OR length(trim(coalesce(_data->>'customerName','')))=0 THEN RAISE EXCEPTION 'Informe o cliente e a descrição do serviço.'; END IF;
 IF _total<(SELECT coalesce(sum(amount_cents),0) FROM public.customer_payments WHERE order_id=_order AND status='ativo') THEN RAISE EXCEPTION 'Estorne os recebimentos excedentes com motivo antes de reduzir o total.'; END IF;
 labor:=_total-part_sum;
 IF f.kind='visita' AND f.rule_technician_fixed_cents IS NOT NULL AND f.rule_company_fixed_cents IS NOT NULL THEN
  IF labor<>f.rule_technician_fixed_cents+f.rule_company_fixed_cents THEN RAISE EXCEPTION 'O total da visita deve respeitar a regra fixa de divisão existente.'; END IF;
  tech:=f.rule_technician_fixed_cents;
 ELSE tech:=round(labor*coalesce(f.rule_technician_percent,50)/100); END IF;
 SELECT * INTO c FROM public.customers WHERE id=(_data->>'customerId')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado.'; END IF;
 old_c:=to_jsonb(c);
 UPDATE public.customers SET full_name=trim(_data->>'customerName'),phone=nullif(trim(_data->>'customerPhone'),'') WHERE id=c.id;
 UPDATE public.service_orders SET customer_id=c.id,equipment_type_id=nullif(_data->>'equipmentTypeId','')::uuid,
 reported_problem=coalesce(nullif(trim(_data->>'reportedProblem'),''),reported_problem),service_description=trim(_data->>'serviceDescription'),notes=nullif(_data->>'notes',''),corrected_parts=_parts,offered_warranty_days=_warranty_days,
 endereco=nullif(_data->>'endereco',''),numero=nullif(_data->>'numero',''),complemento=nullif(_data->>'complemento',''),bairro=nullif(_data->>'bairro',''),cidade=nullif(_data->>'cidade',''),estado=nullif(_data->>'estado',''),cep=nullif(_data->>'cep',''),ponto_referencia=nullif(_data->>'ponto_referencia','') WHERE id=_order;
 UPDATE public.order_financials SET total_cents=_total,parts_estimated_cents=part_sum,labor_cents=labor,technician_share_cents=tech,company_share_cents=labor-tech WHERE order_id=_order;
 SELECT full_name INTO cname FROM public.profiles WHERE id=auth.uid();
 INSERT INTO public.service_order_events(order_id,event_type,description,actor_user_id,actor_name) VALUES(_order,'correcao_administrativa','Correção sem alteração do status. Motivo: '||trim(_reason)||'. Dados anteriores: '||to_jsonb(o)::text||'. Cliente anterior: '||old_c::text||'. Dados corrigidos: '||_data::text||'. Peças: '||_parts::text||'. Total: '||_total||' centavos. Garantia: '||coalesce(_warranty_days::text,'não informada'),auth.uid(),cname);
 SELECT * INTO n FROM public.warranty_notes WHERE order_id=_order FOR UPDATE;
 IF FOUND THEN
  snap:=coalesce(n.current_snapshot,to_jsonb(n)-ARRAY['current_snapshot','revision_history']);
  snap:=snap || jsonb_build_object('customer_name',trim(_data->>'customerName'),'customer_phone',nullif(trim(_data->>'customerPhone'),''),'customer_address',nullif(concat_ws(', ',nullif(_data->>'endereco',''),nullif(_data->>'numero',''),nullif(_data->>'complemento',''),nullif(_data->>'bairro',''),nullif(_data->>'cidade',''),nullif(_data->>'estado',''),nullif(_data->>'cep','')),''),'equipment',(SELECT name FROM public.equipment_types WHERE id=nullif(_data->>'equipmentTypeId','')::uuid),'service_description',trim(_data->>'serviceDescription'),'part_names',coalesce((SELECT jsonb_agg(value->>'description') FROM jsonb_array_elements(_parts)),'[]'::jsonb),'technician_name',(SELECT full_name FROM public.technicians WHERE id=o.technician_id),'total_cents',_total,'observations',nullif(_data->>'notes',''),'issued_at',now());
  IF _warranty_days IS NOT NULL THEN snap:=snap||jsonb_build_object('warranty_days',_warranty_days,'warranty_end',(snap->>'warranty_start')::date+_warranty_days); END IF;
  UPDATE public.warranty_notes SET current_snapshot=snap,revision_history=revision_history||jsonb_build_array(coalesce(current_snapshot,to_jsonb(n)-ARRAY['current_snapshot','revision_history'])) WHERE id=n.id;
  INSERT INTO public.service_order_events(order_id,event_type,description,actor_user_id,actor_name) VALUES(_order,'nota_garantia','Nota '||n.number||': nova versão '||(jsonb_array_length(n.revision_history)+2)||'; versão anterior preservada. Motivo: '||trim(_reason),auth.uid(),cname);
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.correct_confirmed_order(uuid,jsonb,integer,jsonb,integer,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.correct_confirmed_order(uuid,jsonb,integer,jsonb,integer,text,timestamptz) TO authenticated;