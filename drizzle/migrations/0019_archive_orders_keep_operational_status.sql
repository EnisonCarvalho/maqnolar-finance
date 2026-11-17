ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS archived_at timestamptz, ADD COLUMN IF NOT EXISTS archived_by uuid, ADD COLUMN IF NOT EXISTS archive_reason text;
CREATE INDEX IF NOT EXISTS service_orders_active_idx ON public.service_orders (opened_at DESC) WHERE archived_at IS NULL;
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
 INSERT INTO public.service_order_events(order_id,event_type,description,actor_user_id,actor_name) SELECT _order,'apuracao_financeira','Visita confirmada pelo administrador: total '||total||' centavos (técnico '||tech||', MaqnoLar '||company||'). Justificativa: '||CASE WHEN initial_confirmation THEN 'Confirmação inicial de somente visita' ELSE trim(_reason) END,auth.uid(),full_name FROM public.profiles WHERE id=auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.confirm_visit_composition(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_visit_composition(uuid,text) TO authenticated;