CREATE OR REPLACE FUNCTION public.guard_technician_order_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ex text[] := ARRAY['status','updated_at','executed_at','completed_at','technician_reported_cents','technician_reported_at','technician_reported_by','technician_reported_name','technician_reported_parts'];
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
  IF NOT public.has_role(auth.uid(),'tecnico') OR OLD.technician_id IS DISTINCT FROM public.my_technician_id() THEN RAISE EXCEPTION 'Este atendimento não é seu.'; END IF;
  IF (to_jsonb(NEW)-ex) IS DISTINCT FROM (to_jsonb(OLD)-ex) THEN RAISE EXCEPTION 'Técnico não pode alterar dados administrativos ou financeiros.'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
     (NEW.status='servico_em_andamento' AND OLD.status IN ('novo','aguardando_agendamento','visita_agendada','tecnico_a_caminho','em_diagnostico','orcamento_aprovado','aguardando_peca'))
  OR (NEW.status IN ('servico_concluido','visita_concluida') AND OLD.status='servico_em_andamento')
  ) THEN RAISE EXCEPTION 'Transição de atendimento não permitida nesta etapa.'; END IF;
  IF NEW.status='servico_concluido' AND OLD.status<>'servico_concluido' AND NEW.technician_reported_cents IS NULL THEN RAISE EXCEPTION 'Informe o valor total cobrado para concluir o serviço.'; END IF;
  IF (NEW.technician_reported_cents IS DISTINCT FROM OLD.technician_reported_cents OR NEW.technician_reported_parts IS DISTINCT FROM OLD.technician_reported_parts)
     AND NOT (OLD.status='servico_em_andamento' AND NEW.status='servico_concluido') THEN RAISE EXCEPTION 'O valor cobrado é informado somente ao concluir o serviço.'; END IF;
 END IF;
 IF NEW.technician_reported_cents IS DISTINCT FROM OLD.technician_reported_cents OR NEW.technician_reported_parts IS DISTINCT FROM OLD.technician_reported_parts THEN
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