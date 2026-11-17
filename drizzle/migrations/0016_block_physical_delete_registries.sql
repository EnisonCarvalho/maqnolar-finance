CREATE POLICY "No physical delete of orders" ON public.service_orders AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
CREATE POLICY "No physical delete of customers" ON public.customers AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
CREATE POLICY "No physical delete of technicians" ON public.technicians AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
CREATE POLICY "No physical delete of services" ON public.services AS RESTRICTIVE FOR DELETE TO authenticated USING (false);