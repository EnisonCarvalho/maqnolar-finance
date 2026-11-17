ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS test_reset_batch text;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS test_reset_batch text;
COMMENT ON COLUMN public.service_orders.test_reset_batch IS 'Lote de reset de testes: OS marcada (e sua apuração/peças) fica fora das leituras do app; registro preservado.';
COMMENT ON COLUMN public.financial_accounts.test_reset_batch IS 'Lote de reset de testes: conta marcada fica fora das leituras e totais do app; registro preservado.';
CREATE POLICY "Lote de reset fora das leituras" ON public.service_orders AS RESTRICTIVE FOR SELECT TO authenticated USING (test_reset_batch IS NULL);
CREATE POLICY "Lote de reset fora das leituras" ON public.financial_accounts AS RESTRICTIVE FOR SELECT TO authenticated USING (test_reset_batch IS NULL);
CREATE POLICY "Lote de reset fora das leituras" ON public.order_financials AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT EXISTS (SELECT 1 FROM public.service_orders o WHERE o.id = order_financials.order_id AND o.test_reset_batch IS NOT NULL));
CREATE POLICY "Lote de reset fora das leituras" ON public.part_purchases AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT EXISTS (SELECT 1 FROM public.service_orders o WHERE o.id = part_purchases.order_id AND o.test_reset_batch IS NOT NULL));