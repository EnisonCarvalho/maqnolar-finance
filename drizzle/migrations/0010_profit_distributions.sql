CREATE TABLE public.profit_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  decision_date DATE NOT NULL,
  notes TEXT,
  validated_distributable BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','estornada')),
  void_reason TEXT,
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.profit_distribution_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_id UUID NOT NULL REFERENCES public.profit_distributions(id),
  partner_id UUID NOT NULL REFERENCES public.profiles(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  paid_at DATE NOT NULL,
  account_id UUID NOT NULL REFERENCES public.financial_accounts(id),
  notes TEXT,
  receipt_path TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','estornado')),
  void_reason TEXT,
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profit_distributions, public.profit_distribution_payments TO authenticated;
GRANT ALL ON public.profit_distributions, public.profit_distribution_payments TO service_role;

ALTER TABLE public.profit_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_distribution_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read profit_distributions" ON public.profit_distributions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert profit_distributions" ON public.profit_distributions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update profit_distributions" ON public.profit_distributions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read profit_distribution_payments" ON public.profit_distribution_payments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert profit_distribution_payments" ON public.profit_distribution_payments FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update profit_distribution_payments" ON public.profit_distribution_payments FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_audit_profit_distributions AFTER INSERT OR UPDATE ON public.profit_distributions FOR EACH ROW EXECUTE FUNCTION public.audit_finance_row();
CREATE TRIGGER trg_audit_profit_distribution_payments AFTER INSERT OR UPDATE ON public.profit_distribution_payments FOR EACH ROW EXECUTE FUNCTION public.audit_finance_row();
CREATE TRIGGER trg_block_delete_profit_distributions BEFORE DELETE ON public.profit_distributions FOR EACH ROW EXECUTE FUNCTION public.block_finance_delete();
CREATE TRIGGER trg_block_delete_profit_distribution_payments BEFORE DELETE ON public.profit_distribution_payments FOR EACH ROW EXECUTE FUNCTION public.block_finance_delete();

CREATE OR REPLACE FUNCTION public.validate_profit_distribution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.assert_month_open(NEW.decision_date);
    IF NOT NEW.validated_distributable THEN
      RAISE EXCEPTION 'Confirme que o valor foi validado como lucro distribuível antes de aprovar.';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'estornada' THEN
    RAISE EXCEPTION 'Distribuição estornada não pode ser alterada.';
  END IF;
  IF NEW.status = 'estornada' THEN
    IF NEW.void_reason IS NULL OR length(trim(NEW.void_reason)) = 0 THEN
      RAISE EXCEPTION 'Informe o motivo do estorno.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profit_distribution_payments WHERE distribution_id = OLD.id AND status = 'ativo') THEN
      RAISE EXCEPTION 'Estorne os pagamentos ativos antes de estornar a distribuição.';
    END IF;
    PERFORM public.assert_month_open(OLD.decision_date);
    NEW.voided_by := auth.uid();
    NEW.voided_at := now();
    RETURN NEW;
  END IF;
  IF NEW.total_cents <> OLD.total_cents OR NEW.decision_date <> OLD.decision_date THEN
    RAISE EXCEPTION 'Distribuições aprovadas não podem ser editadas; estorne e aprove novamente.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_profit_distribution BEFORE INSERT OR UPDATE ON public.profit_distributions FOR EACH ROW EXECUTE FUNCTION public.validate_profit_distribution();

CREATE OR REPLACE FUNCTION public.validate_distribution_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _total INTEGER; _paid_partner INTEGER; _paid_all INTEGER; _cap INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT total_cents INTO _total FROM public.profit_distributions WHERE id = NEW.distribution_id AND status = 'ativa';
    IF _total IS NULL THEN
      RAISE EXCEPTION 'Distribuição não encontrada ou estornada.';
    END IF;
    IF NOT public.has_role(NEW.partner_id, 'admin') THEN
      RAISE EXCEPTION 'O sócio selecionado precisa ser um administrador ativo.';
    END IF;
    PERFORM public.assert_company_account(NEW.account_id);
    PERFORM public.assert_month_open(NEW.paid_at);
    -- Divisão 50/50: cada sócio recebe no máximo metade (arredondada para cima) e o total pago nunca excede o aprovado
    _cap := (_total + 1) / 2;
    SELECT coalesce(sum(amount_cents), 0) INTO _paid_partner FROM public.profit_distribution_payments WHERE distribution_id = NEW.distribution_id AND partner_id = NEW.partner_id AND status = 'ativo';
    IF _paid_partner + NEW.amount_cents > _cap THEN
      RAISE EXCEPTION 'Pagamento excede a participação do sócio nesta distribuição (máximo %).', _cap;
    END IF;
    SELECT coalesce(sum(amount_cents), 0) INTO _paid_all FROM public.profit_distribution_payments WHERE distribution_id = NEW.distribution_id AND status = 'ativo';
    IF _paid_all + NEW.amount_cents > _total THEN
      RAISE EXCEPTION 'O total pago não pode exceder o valor aprovado da distribuição.';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'estornado' THEN
    RAISE EXCEPTION 'Pagamento estornado não pode ser alterado.';
  END IF;
  IF NEW.status = 'estornado' THEN
    IF NEW.void_reason IS NULL OR length(trim(NEW.void_reason)) = 0 THEN
      RAISE EXCEPTION 'Informe o motivo do estorno.';
    END IF;
    PERFORM public.assert_month_open(OLD.paid_at);
    NEW.voided_by := auth.uid();
    NEW.voided_at := now();
    RETURN NEW;
  END IF;
  IF NEW.distribution_id <> OLD.distribution_id OR NEW.partner_id <> OLD.partner_id OR NEW.amount_cents <> OLD.amount_cents
     OR NEW.paid_at <> OLD.paid_at OR NEW.account_id <> OLD.account_id THEN
    RAISE EXCEPTION 'Pagamentos de distribuição não podem ser editados; estorne e registre novamente.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_distribution_payment BEFORE INSERT OR UPDATE ON public.profit_distribution_payments FOR EACH ROW EXECUTE FUNCTION public.validate_distribution_payment();

-- Conta com pagamento de distribuição também não pode ter saldo inicial alterado
CREATE OR REPLACE FUNCTION public.validate_financial_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.opening_balance_cents <> OLD.opening_balance_cents OR NEW.opening_date <> OLD.opening_date) THEN
    IF EXISTS (SELECT 1 FROM public.expense_payments WHERE account_id = NEW.id)
       OR EXISTS (SELECT 1 FROM public.other_revenues WHERE account_id = NEW.id AND received_at IS NOT NULL)
       OR EXISTS (SELECT 1 FROM public.account_transfers WHERE from_account_id = NEW.id OR to_account_id = NEW.id)
       OR EXISTS (SELECT 1 FROM public.customer_payments WHERE account_id = NEW.id)
       OR EXISTS (SELECT 1 FROM public.technician_transfers WHERE account_id = NEW.id)
       OR EXISTS (SELECT 1 FROM public.part_purchases WHERE account_id = NEW.id)
       OR EXISTS (SELECT 1 FROM public.partner_movements WHERE account_id = NEW.id)
       OR EXISTS (SELECT 1 FROM public.profit_distribution_payments WHERE account_id = NEW.id) THEN
      RAISE EXCEPTION 'O saldo inicial não pode ser alterado depois que a conta tem movimentações.';
    END IF;
  END IF;
  RETURN NEW;
END $$;