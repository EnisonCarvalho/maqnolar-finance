ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'visita_concluida';

CREATE OR REPLACE FUNCTION public.guard_technician_order_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
  IF NOT public.has_role(auth.uid(),'tecnico') OR OLD.technician_id IS DISTINCT FROM public.my_technician_id() THEN RAISE EXCEPTION 'Este atendimento não é seu.'; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','updated_at','executed_at','completed_at','technician_reported_cents','technician_reported_at','technician_reported_by','technician_reported_name']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','executed_at','completed_at','technician_reported_cents','technician_reported_at','technician_reported_by','technician_reported_name']) THEN RAISE EXCEPTION 'Técnico não pode alterar dados administrativos ou financeiros.'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND (OLD.status IN ('cancelado','finalizado','servico_concluido','aguardando_pagamento') OR NEW.status NOT IN ('tecnico_a_caminho','em_diagnostico','servico_em_andamento','servico_concluido','visita_concluida')) THEN RAISE EXCEPTION 'Transição de atendimento não permitida.'; END IF;
 END IF;
 IF NEW.technician_reported_cents IS DISTINCT FROM OLD.technician_reported_cents THEN
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

CREATE OR REPLACE FUNCTION public.confirm_visit_composition(_order uuid,_reason text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r public.split_rules; tech integer; company integer; total integer; paid integer; initial_confirmation boolean := length(trim(coalesce(_reason,'')))=0; order_status text;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente administradores confirmam a visita.'; END IF;
 IF NOT initial_confirmation AND length(trim(_reason))<3 THEN RAISE EXCEPTION 'Informe a justificativa da correção.'; END IF;
 SELECT status::text INTO order_status FROM public.service_orders WHERE id=_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Atendimento não encontrado.'; END IF;
 IF initial_confirmation THEN
  IF EXISTS(SELECT 1 FROM public.order_financials WHERE order_id=_order) OR EXISTS(SELECT 1 FROM public.service_orders WHERE id=_order AND financial_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Valores já confirmados. Para alterar, use a correção com justificativa.'; END IF;
  IF order_status <> 'visita_concluida' THEN RAISE EXCEPTION 'A confirmação de visita exige que o técnico tenha marcado somente visita realizada.'; END IF;
 END IF;
 PERFORM public.assert_month_open((SELECT coalesce(completed_at,now())::date FROM public.service_orders WHERE id=_order));
 SELECT coalesce(sum(amount_cents),0) INTO paid FROM public.customer_payments WHERE order_id=_order AND status='ativo';
 SELECT * INTO r FROM public.split_rules WHERE kind='visita' AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) ORDER BY valid_from DESC LIMIT 1;
 tech:=coalesce(r.technician_fixed_cents,2000); company:=coalesce(r.company_fixed_cents,1000); total:=tech+company;
 IF total<paid THEN RAISE EXCEPTION 'Total inferior aos recebimentos já registrados.'; END IF;
 INSERT INTO public.order_financials(order_id,kind,total_cents,labor_cents,parts_estimated_cents,rule_technician_percent,rule_company_percent,rule_technician_fixed_cents,rule_company_fixed_cents,technician_share_cents,company_share_cents,status,created_by)
 VALUES(_order,'visita',total,0,0,r.technician_percent,r.company_percent,tech,company,tech,company,CASE WHEN paid=0 THEN 'previsto' WHEN paid>=total THEN 'realizado' ELSE 'parcial' END,auth.uid())
 ON CONFLICT(order_id) DO UPDATE SET kind='visita',total_cents=total,labor_cents=0,parts_estimated_cents=0,rule_technician_percent=r.technician_percent,rule_company_percent=r.company_percent,rule_technician_fixed_cents=tech,rule_company_fixed_cents=company,technician_share_cents=tech,company_share_cents=company,status=CASE WHEN paid=0 THEN 'previsto' WHEN paid>=total THEN 'realizado' ELSE 'parcial' END;
 IF initial_confirmation THEN UPDATE public.service_orders SET status='finalizado' WHERE id=_order; END IF;
 INSERT INTO public.service_order_events(order_id,event_type,description,actor_user_id,actor_name) SELECT _order,'apuracao_financeira','Visita confirmada pelo administrador: total '||total||' centavos (técnico '||tech||', MaqnoLar '||company||'). Justificativa: '||CASE WHEN initial_confirmation THEN 'Confirmação inicial de somente visita' ELSE trim(_reason) END,auth.uid(),full_name FROM public.profiles WHERE id=auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.confirm_visit_composition(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_visit_composition(uuid,text) TO authenticated;