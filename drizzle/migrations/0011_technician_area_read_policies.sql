-- Passo 11A: técnicos leem somente registros vinculados ao próprio cadastro.
-- my_technician_id() (security definer) resolve o técnico pelo profile_id do usuário logado.

-- Técnico lê o próprio cadastro
CREATE POLICY "Technicians read own record" ON public.technicians FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

-- Técnico lê clientes apenas dos próprios atendimentos
CREATE POLICY "Technicians read customers of own orders" ON public.customers FOR SELECT TO authenticated
  USING (id IN (SELECT customer_id FROM public.service_orders WHERE technician_id = public.my_technician_id()));

-- Técnico lê a composição financeira apenas dos próprios atendimentos
CREATE POLICY "Technicians read own order financials" ON public.order_financials FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM public.service_orders WHERE technician_id = public.my_technician_id()));

-- Técnico lê recebimentos apenas dos próprios atendimentos
CREATE POLICY "Technicians read payments of own orders" ON public.customer_payments FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM public.service_orders WHERE technician_id = public.my_technician_id()));

-- Técnico lê apenas os próprios repasses
CREATE POLICY "Technicians read own transfers" ON public.technician_transfers FOR SELECT TO authenticated
  USING (technician_id = public.my_technician_id());

-- Técnico lê compras de peças apenas dos próprios atendimentos (reembolsos)
CREATE POLICY "Technicians read purchases of own orders" ON public.part_purchases FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM public.service_orders WHERE technician_id = public.my_technician_id()));

-- Técnico lê apenas os próprios fechamentos de acerto
CREATE POLICY "Technicians read own closings" ON public.settlement_closings FOR SELECT TO authenticated
  USING (technician_id = public.my_technician_id());