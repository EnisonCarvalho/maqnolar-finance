DROP POLICY IF EXISTS "No physical delete of customers" ON public.customers;
CREATE POLICY "Delete only unlinked customers" ON public.customers AS RESTRICTIVE FOR DELETE TO authenticated
 USING (public.has_role(auth.uid(),'admin') AND NOT EXISTS (SELECT 1 FROM public.service_orders o WHERE o.customer_id=customers.id) AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.customer_id=customers.id));

CREATE OR REPLACE FUNCTION public.remove_customer(_id uuid) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente administradores removem clientes.'; END IF;
 PERFORM 1 FROM public.customers WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado.'; END IF;
 IF EXISTS (SELECT 1 FROM public.service_orders WHERE customer_id=_id) OR EXISTS (SELECT 1 FROM public.leads WHERE customer_id=_id) THEN
  UPDATE public.customers SET active=false WHERE id=_id;
  RETURN 'desativado';
 END IF;
 DELETE FROM public.customers WHERE id=_id;
 RETURN 'removido';
END $$;
REVOKE ALL ON FUNCTION public.remove_customer(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.remove_customer(uuid) TO authenticated;