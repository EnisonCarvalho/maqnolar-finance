CREATE TABLE public.operation_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch text NOT NULL UNIQUE,
  reason text NOT NULL,
  counts jsonb NOT NULL,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.operation_resets TO authenticated;
GRANT ALL ON public.operation_resets TO service_role;
ALTER TABLE public.operation_resets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins veem resets" ON public.operation_resets FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.operation_reset_preview() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente administradores.'; END IF;
 RETURN jsonb_build_object(
  'customers',(SELECT count(*) FROM customers WHERE active),
  'orders',(SELECT count(*) FROM service_orders WHERE test_reset_batch IS NULL),
  'financial_compositions',(SELECT count(*) FROM order_financials f JOIN service_orders o ON o.id=f.order_id WHERE o.test_reset_batch IS NULL),
  'customer_payments',(SELECT count(*) FROM customer_payments WHERE status='ativo'),
  'technician_transfers',(SELECT count(*) FROM technician_transfers WHERE status='ativo'),
  'expenses',(SELECT count(*) FROM expenses WHERE status<>'cancelada'),
  'expense_payments',(SELECT count(*) FROM expense_payments WHERE status='ativo'),
  'other_revenues',(SELECT count(*) FROM other_revenues WHERE status='ativo'),
  'account_transfers',(SELECT count(*) FROM account_transfers WHERE status='ativo'),
  'partner_movements',(SELECT count(*) FROM partner_movements WHERE status='ativo'),
  'distributions',(SELECT count(*) FROM profit_distributions WHERE status='ativa'),
  'distribution_payments',(SELECT count(*) FROM profit_distribution_payments WHERE status='ativo'),
  'campaign_allocations',(SELECT count(*) FROM campaign_expense_allocations WHERE status='ativo'),
  'closed_months',(SELECT count(*) FROM monthly_closings WHERE status='fechado')
 );
END $$;

CREATE OR REPLACE FUNCTION public.reset_operation(_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b text := 'reset-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'); c jsonb; r text := trim(coalesce(_reason,''));
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente administradores podem reiniciar a operação.'; END IF;
 IF length(r)<3 THEN RAISE EXCEPTION 'Informe o motivo do reinício.'; END IF;
 IF EXISTS(SELECT 1 FROM monthly_closings WHERE status='fechado') THEN RAISE EXCEPTION 'Há meses fechados. Reabra-os antes de reiniciar a operação.'; END IF;
 c := public.operation_reset_preview();
 r := 'Reinício da operação: '||r;
 UPDATE technician_transfers SET status='estornado', void_reason=r, voided_by=auth.uid(), voided_at=now() WHERE status='ativo';
 UPDATE customer_payments SET status='estornado', void_reason=r, voided_by=auth.uid(), voided_at=now() WHERE status='ativo';
 UPDATE expense_payments SET status='estornado', void_reason=r, voided_by=auth.uid(), voided_at=now() WHERE status='ativo';
 UPDATE other_revenues SET status='estornado', void_reason=r, voided_by=auth.uid(), voided_at=now() WHERE status='ativo';
 UPDATE account_transfers SET status='estornado', void_reason=r, voided_by=auth.uid(), voided_at=now() WHERE status='ativo';
 UPDATE profit_distribution_payments SET status='estornado', void_reason=r, voided_by=auth.uid(), voided_at=now() WHERE status='ativo';
 UPDATE profit_distributions SET status='estornada', void_reason=r, voided_by=auth.uid(), voided_at=now() WHERE status='ativa';
 UPDATE partner_movements SET status='estornado', void_reason=r, voided_by=auth.uid(), voided_at=now() WHERE status='ativo';
 UPDATE campaign_expense_allocations SET status='removido', remove_reason=r, removed_by=auth.uid(), removed_at=now() WHERE status='ativo';
 UPDATE expenses SET status='cancelada', cancel_reason=r WHERE status<>'cancelada';
 UPDATE service_orders SET test_reset_batch=b, archived_at=coalesce(archived_at,now()), archived_by=coalesce(archived_by,auth.uid()), archive_reason=coalesce(archive_reason,r) WHERE test_reset_batch IS NULL;
 UPDATE customers SET active=false WHERE active;
 INSERT INTO operation_resets(batch,reason,counts,actor_user_id) VALUES(b,trim(_reason),c,auth.uid());
 RETURN c || jsonb_build_object('batch',b);
END $$;
REVOKE ALL ON FUNCTION public.operation_reset_preview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_operation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.operation_reset_preview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_operation(text) TO authenticated;