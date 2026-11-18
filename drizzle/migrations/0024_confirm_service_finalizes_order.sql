CREATE OR REPLACE FUNCTION public.confirm_service_composition(_order uuid, _total integer, _parts integer, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE r public.split_rules; labor integer; tech integer; paid integer; initial_confirmation boolean := length(trim(coalesce(_reason,'')))=0; order_status text; prev_kind text;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente administradores confirmam a composição financeira.'; END IF;
 IF _total IS NULL OR _parts IS NULL OR _total<0 OR _parts<0 OR _parts>_total THEN RAISE EXCEPTION 'Valores inválidos: peças não podem superar o total.'; END IF;
 IF NOT initial_confirmation AND length(trim(_reason))<3 THEN RAISE EXCEPTION 'Informe a justificativa da correção.'; END IF;
 SELECT status::text INTO order_status FROM public.service_orders WHERE id=_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Atendimento não encontrado.'; END IF;
 IF order_status='cancelado' THEN RAISE EXCEPTION 'Atendimento cancelado não pode ter valores confirmados.'; END IF;
 SELECT kind INTO prev_kind FROM public.order_financials WHERE order_id=_order;
 IF initial_confirmation THEN
  IF prev_kind IS NOT NULL OR EXISTS(SELECT 1 FROM public.service_orders WHERE id=_order AND financial_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Valores já confirmados. Para alterar, use a correção com justificativa.'; END IF;
 END IF;
 IF prev_kind='visita' THEN
  IF EXISTS(SELECT 1 FROM public.customer_payments WHERE order_id=_order AND status='ativo') THEN RAISE EXCEPTION 'Há recebimento ativo da visita nesta OS. Estorne-o antes de corrigir para serviço.'; END IF;
  IF EXISTS(SELECT 1 FROM public.technician_transfers WHERE _order=ANY(order_ids) AND status='ativo') THEN RAISE EXCEPTION 'Há repasse ativo vinculado a esta OS. Estorne-o antes de corrigir para serviço.'; END IF;
 END IF;
 IF order_status NOT IN ('servico_concluido','aguardando_pagamento','finalizado') THEN
  UPDATE public.service_orders SET status='servico_concluido' WHERE id=_order;
 END IF;
 PERFORM public.assert_month_open((SELECT coalesce(completed_at,now())::date FROM public.service_orders WHERE id=_order));
 SELECT coalesce(sum(amount_cents),0) INTO paid FROM public.customer_payments WHERE order_id=_order AND status='ativo';
 IF _total<paid THEN RAISE EXCEPTION 'Total inferior aos recebimentos já registrados.'; END IF;
 SELECT * INTO r FROM public.split_rules WHERE kind='mao_obra' AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) ORDER BY valid_from DESC LIMIT 1;
 labor:=_total-_parts; tech:=round(labor*coalesce(r.technician_percent,50)/100);
 INSERT INTO public.order_financials(order_id,kind,total_cents,labor_cents,parts_estimated_cents,rule_technician_percent,rule_company_percent,technician_share_cents,company_share_cents,status,created_by)
 VALUES(_order,'servico',_total,labor,_parts,coalesce(r.technician_percent,50),coalesce(r.company_percent,50),tech,labor-tech,CASE WHEN paid=0 THEN 'previsto' WHEN paid>=_total THEN 'realizado' ELSE 'parcial' END,auth.uid())
 ON CONFLICT(order_id) DO UPDATE SET kind='servico',total_cents=_total,labor_cents=labor,parts_estimated_cents=_parts,rule_technician_percent=coalesce(r.technician_percent,50),rule_company_percent=coalesce(r.company_percent,50),rule_technician_fixed_cents=NULL,rule_company_fixed_cents=NULL,technician_share_cents=tech,company_share_cents=labor-tech,status=CASE WHEN paid=0 THEN 'previsto' WHEN paid>=_total THEN 'realizado' ELSE 'parcial' END;
 INSERT INTO public.service_order_events(order_id,event_type,description,actor_user_id,actor_name) SELECT _order,'apuracao_financeira','Composição confirmada pelo administrador: total '||_total||' centavos; peças '||_parts||' centavos'||CASE WHEN prev_kind='visita' THEN ' (substitui a apuração de visita)' ELSE '' END||'. Justificativa: '||CASE WHEN initial_confirmation THEN 'Confirmação inicial dos valores do serviço' ELSE trim(_reason) END,auth.uid(),full_name FROM public.profiles WHERE id=auth.uid();
 IF initial_confirmation THEN
  UPDATE public.service_orders SET status='finalizado' WHERE id=_order AND status<>'finalizado';
 END IF;
END $function$;