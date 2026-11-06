-- Datas operacionais separadas das financeiras
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.set_order_operational_dates()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('em_diagnostico','servico_em_andamento') AND NEW.executed_at IS NULL THEN
      NEW.executed_at := now();
    END IF;
    IF NEW.status IN ('servico_concluido','aguardando_pagamento','finalizado') AND NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
      IF NEW.executed_at IS NULL THEN NEW.executed_at := now(); END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_order_operational_dates BEFORE UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.set_order_operational_dates();

-- Recebimentos de clientes
CREATE TABLE public.customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.service_orders(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  paid_at DATE NOT NULL,
  receiver_type TEXT NOT NULL CHECK (receiver_type IN ('maqnolar','tecnico','outro')),
  receiver_technician_id UUID REFERENCES public.technicians(id),
  receiver_label TEXT,
  method TEXT NOT NULL CHECK (method IN ('pix','dinheiro','credito','debito','transferencia','outro')),
  destination_account TEXT,
  notes TEXT,
  receipt_path TEXT,
  authorized_reason TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','estornado')),
  void_reason TEXT,
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (receiver_type <> 'tecnico' OR receiver_technician_id IS NOT NULL)
);
CREATE INDEX idx_customer_payments_order ON public.customer_payments(order_id);
CREATE INDEX idx_customer_payments_paid_at ON public.customer_payments(paid_at);

-- Repasses entre MaqnoLar e técnicos (não são receita nem despesa)
CREATE TABLE public.technician_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID NOT NULL REFERENCES public.technicians(id),
  transfer_date DATE NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  direction TEXT NOT NULL CHECK (direction IN ('empresa_para_tecnico','tecnico_para_empresa')),
  payer_label TEXT,
  receiver_label TEXT,
  method TEXT NOT NULL CHECK (method IN ('pix','dinheiro','credito','debito','transferencia','outro')),
  source_account TEXT,
  destination_account TEXT,
  order_ids UUID[] NOT NULL DEFAULT '{}',
  notes TEXT,
  receipt_path TEXT,
  authorized_reason TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','estornado')),
  void_reason TEXT,
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_transfers_tech_date ON public.technician_transfers(technician_id, transfer_date);

-- Fechamentos de acerto (snapshot calculado no servidor)
CREATE TABLE public.settlement_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID NOT NULL REFERENCES public.technicians(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('fechado','fechado_com_pendencia','reaberto')),
  received_cents INTEGER NOT NULL DEFAULT 0,
  technician_share_cents INTEGER NOT NULL DEFAULT 0,
  reimbursement_cents INTEGER NOT NULL DEFAULT 0,
  company_share_cents INTEGER NOT NULL DEFAULT 0,
  to_pay_technician_cents INTEGER NOT NULL DEFAULT 0,
  to_receive_technician_cents INTEGER NOT NULL DEFAULT 0,
  settled_cents INTEGER NOT NULL DEFAULT 0,
  pending_cents INTEGER NOT NULL DEFAULT 0,
  client_pending_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  closed_by UUID,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reopen_reason TEXT,
  reopened_by UUID,
  reopened_at TIMESTAMPTZ,
  CHECK (period_end >= period_start)
);

-- Auditoria financeira
CREATE TABLE public.finance_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  actor_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.customer_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.technician_transfers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.settlement_closings TO authenticated;
GRANT SELECT ON public.finance_audit TO authenticated;
GRANT ALL ON public.customer_payments TO service_role;
GRANT ALL ON public.technician_transfers TO service_role;
GRANT ALL ON public.settlement_closings TO service_role;
GRANT ALL ON public.finance_audit TO service_role;

ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read payments" ON public.customer_payments FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins insert payments" ON public.customer_payments FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update payments" ON public.customer_payments FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins read transfers" ON public.technician_transfers FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins insert transfers" ON public.technician_transfers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update transfers" ON public.technician_transfers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins read closings" ON public.settlement_closings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins insert closings" ON public.settlement_closings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update closings" ON public.settlement_closings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins read finance audit" ON public.finance_audit FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Regras de integridade dos recebimentos
CREATE OR REPLACE FUNCTION public.validate_customer_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  due INTEGER;
  received INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Recebimentos não podem ser excluídos; use o estorno com justificativa.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.amount_cents <> OLD.amount_cents OR NEW.order_id <> OLD.order_id OR NEW.paid_at <> OLD.paid_at
       OR NEW.receiver_type <> OLD.receiver_type OR NEW.receiver_technician_id IS DISTINCT FROM OLD.receiver_technician_id THEN
      RAISE EXCEPTION 'Recebimentos registrados não podem ser alterados; estorne e registre novamente.';
    END IF;
    IF OLD.status = 'estornado' AND NEW.status <> 'estornado' THEN
      RAISE EXCEPTION 'Um recebimento estornado não pode ser reativado.';
    END IF;
    IF NEW.status = 'estornado' AND OLD.status = 'ativo' THEN
      IF coalesce(trim(NEW.void_reason),'') = '' THEN RAISE EXCEPTION 'Informe o motivo do estorno.'; END IF;
      NEW.voided_by := auth.uid();
      NEW.voided_at := now();
    END IF;
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('payment:' || NEW.order_id::text));
  SELECT total_cents INTO due FROM public.order_financials WHERE order_id = NEW.order_id;
  IF due IS NULL THEN
    RAISE EXCEPTION 'Este atendimento ainda não possui composição financeira.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.customer_payments
    WHERE order_id = NEW.order_id AND status = 'ativo' AND amount_cents = NEW.amount_cents
      AND paid_at = NEW.paid_at AND receiver_type = NEW.receiver_type
      AND receiver_technician_id IS NOT DISTINCT FROM NEW.receiver_technician_id
  ) AND coalesce(trim(NEW.authorized_reason),'') = '' THEN
    RAISE EXCEPTION 'Recebimento duplicado: já existe um lançamento igual (mesmo valor, data e recebedor).';
  END IF;
  SELECT coalesce(sum(amount_cents),0) INTO received FROM public.customer_payments
    WHERE order_id = NEW.order_id AND status = 'ativo';
  IF received + NEW.amount_cents > due AND coalesce(trim(NEW.authorized_reason),'') = '' THEN
    RAISE EXCEPTION 'Valor acima do devido: saldo do cliente é R$ %.', to_char((due - received)/100.0, 'FM999G999G990D00');
  END IF;
  NEW.created_by := auth.uid();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_customer_payment BEFORE INSERT OR UPDATE OR DELETE ON public.customer_payments
FOR EACH ROW EXECUTE FUNCTION public.validate_customer_payment();

-- Atualiza a situação da composição financeira conforme os recebimentos efetivos
CREATE OR REPLACE FUNCTION public.refresh_financial_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  due INTEGER;
  received INTEGER;
BEGIN
  SELECT total_cents INTO due FROM public.order_financials WHERE order_id = NEW.order_id;
  SELECT coalesce(sum(amount_cents),0) INTO received FROM public.customer_payments WHERE order_id = NEW.order_id AND status = 'ativo';
  UPDATE public.order_financials
    SET status = CASE WHEN received <= 0 THEN 'previsto' WHEN received < due THEN 'parcial' ELSE 'realizado' END
    WHERE order_id = NEW.order_id;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_refresh_financial_status AFTER INSERT OR UPDATE ON public.customer_payments
FOR EACH ROW EXECUTE FUNCTION public.refresh_financial_status();

-- Regras de integridade dos repasses
CREATE OR REPLACE FUNCTION public.validate_technician_transfer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Repasses não podem ser excluídos; use o estorno com justificativa.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.amount_cents <> OLD.amount_cents OR NEW.technician_id <> OLD.technician_id
       OR NEW.transfer_date <> OLD.transfer_date OR NEW.direction <> OLD.direction THEN
      RAISE EXCEPTION 'Repasses registrados não podem ser alterados; estorne e registre novamente.';
    END IF;
    IF OLD.status = 'estornado' AND NEW.status <> 'estornado' THEN
      RAISE EXCEPTION 'Um repasse estornado não pode ser reativado.';
    END IF;
    IF NEW.status = 'estornado' AND OLD.status = 'ativo' THEN
      IF coalesce(trim(NEW.void_reason),'') = '' THEN RAISE EXCEPTION 'Informe o motivo do estorno.'; END IF;
      NEW.voided_by := auth.uid();
      NEW.voided_at := now();
    END IF;
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('transfer:' || NEW.technician_id::text));
  IF EXISTS (
    SELECT 1 FROM public.technician_transfers
    WHERE technician_id = NEW.technician_id AND status = 'ativo' AND amount_cents = NEW.amount_cents
      AND transfer_date = NEW.transfer_date AND direction = NEW.direction
  ) AND coalesce(trim(NEW.authorized_reason),'') = '' THEN
    RAISE EXCEPTION 'Repasse duplicado: já existe um lançamento igual (mesmo técnico, valor, data e sentido).';
  END IF;
  NEW.created_by := auth.uid();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_technician_transfer BEFORE INSERT OR UPDATE OR DELETE ON public.technician_transfers
FOR EACH ROW EXECUTE FUNCTION public.validate_technician_transfer();

-- Regras dos fechamentos
CREATE OR REPLACE FUNCTION public.validate_settlement_closing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Fechamentos não podem ser excluídos; reabra com justificativa.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'reaberto' THEN RAISE EXCEPTION 'Este fechamento já foi reaberto.'; END IF;
    IF NEW.status <> 'reaberto' OR NEW.pending_cents <> OLD.pending_cents OR NEW.settled_cents <> OLD.settled_cents
       OR NEW.period_start <> OLD.period_start OR NEW.period_end <> OLD.period_end OR NEW.technician_id <> OLD.technician_id THEN
      RAISE EXCEPTION 'Um fechamento só pode ser reaberto, sem alterar os valores registrados.';
    END IF;
    IF coalesce(trim(NEW.reopen_reason),'') = '' THEN RAISE EXCEPTION 'Informe a justificativa da reabertura.'; END IF;
    NEW.reopened_by := auth.uid();
    NEW.reopened_at := now();
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('closing:' || NEW.technician_id::text));
  IF EXISTS (
    SELECT 1 FROM public.settlement_closings
    WHERE technician_id = NEW.technician_id AND status <> 'reaberto'
      AND period_start <= NEW.period_end AND period_end >= NEW.period_start
  ) THEN
    RAISE EXCEPTION 'Já existe um fechamento ativo para este técnico neste período. Reabra-o antes de fechar novamente.';
  END IF;
  IF NEW.pending_cents <> 0 AND NEW.status = 'fechado' THEN
    NEW.status := 'fechado_com_pendencia';
  END IF;
  NEW.closed_by := auth.uid();
  NEW.closed_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_settlement_closing BEFORE INSERT OR UPDATE OR DELETE ON public.settlement_closings
FOR EACH ROW EXECUTE FUNCTION public.validate_settlement_closing();

-- Auditoria automática
CREATE OR REPLACE FUNCTION public.audit_finance_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.finance_audit(table_name, record_id, action, old_data, new_data, actor_user_id)
  VALUES (TG_TABLE_NAME, NEW.id, lower(TG_OP),
          CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END, to_jsonb(NEW), auth.uid());
  RETURN NULL;
END $$;
CREATE TRIGGER trg_audit_customer_payments AFTER INSERT OR UPDATE ON public.customer_payments FOR EACH ROW EXECUTE FUNCTION public.audit_finance_row();
CREATE TRIGGER trg_audit_technician_transfers AFTER INSERT OR UPDATE ON public.technician_transfers FOR EACH ROW EXECUTE FUNCTION public.audit_finance_row();
CREATE TRIGGER trg_audit_settlement_closings AFTER INSERT OR UPDATE ON public.settlement_closings FOR EACH ROW EXECUTE FUNCTION public.audit_finance_row();

REVOKE EXECUTE ON FUNCTION public.validate_customer_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_financial_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_technician_transfer() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_settlement_closing() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_finance_row() FROM PUBLIC, anon, authenticated;

-- Comprovantes (bucket privado) — somente administradores
CREATE POLICY "Admins read receipts" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'comprovantes' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins upload receipts" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprovantes' AND public.has_role(auth.uid(),'admin'));