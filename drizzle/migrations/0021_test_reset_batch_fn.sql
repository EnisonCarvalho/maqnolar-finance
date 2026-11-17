CREATE OR REPLACE FUNCTION public.order_in_test_reset(_order uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.service_orders WHERE id=_order AND test_reset_batch IS NOT NULL) $$;
REVOKE ALL ON FUNCTION public.order_in_test_reset(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_in_test_reset(uuid) TO authenticated;
DROP POLICY "Lote de reset fora das leituras" ON public.order_financials;
DROP POLICY "Lote de reset fora das leituras" ON public.part_purchases;
CREATE POLICY "Lote de reset fora das leituras" ON public.order_financials AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT public.order_in_test_reset(order_id));
CREATE POLICY "Lote de reset fora das leituras" ON public.part_purchases AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT public.order_in_test_reset(order_id));