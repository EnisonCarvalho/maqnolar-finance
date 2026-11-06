CREATE TABLE public.partner_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.profiles(id),
  type TEXT NOT NULL CHECK (type IN ('aporte','emprestimo_socio','devolucao_emprestimo','retirada')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  movement_date DATE NOT NULL,
  account_id UUID NOT NULL REFERENCES public.financial_accounts(id),
  description TEXT NOT NULL,
  notes TEXT,
  receipt_path TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','estornado')),
  void_reason TEXT,
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.partner_movements TO authenticated;
GRANT ALL ON public.partner_movements TO service_role;

ALTER TABLE public.partner_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read partner_movements" ON public.partner_movements FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert partner_movements" ON public.partner_movements FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update partner_movements" ON public.partner_movements FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_audit_partner_movements AFTER INSERT OR UPDATE ON public.partner_movements FOR EACH ROW EXECUTE FUNCTION public.audit_finance_row();
CREATE TRIGGER trg_block_delete_partner_movements BEFORE DELETE ON public.partner_movements FOR EACH ROW EXECUTE FUNCTION public.block_finance_delete();

CREATE OR REPLACE FUNCTION public.validate_partner_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.has_role(NEW.partner_id, 'admin') THEN
      RAISE EXCEPTION 'O sócio selecionado precisa ser um administrador ativo.';
    END IF;
    PERFORM public.assert_company_account(NEW.account_id);
    PERFORM public.assert_month_open(NEW.movement_date);
    IF length(trim(NEW.description)) = 0 THEN
      RAISE EXCEPTION 'Informe a descrição da movimentação.';
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE
  IF OLD.status = 'estornado' THEN
    RAISE EXCEPTION 'Movimentação estornada não pode ser alterada.';
  END IF;
  IF NEW.status = 'estornado' THEN
    IF NEW.void_reason IS NULL OR length(trim(NEW.void_reason)) = 0 THEN
      RAISE EXCEPTION 'Informe o motivo do estorno.';
    END IF;
    PERFORM public.assert_month_open(OLD.movement_date);
    NEW.voided_by := auth.uid();
    NEW.voided_at := now();
    RETURN NEW;
  END IF;
  IF NEW.partner_id <> OLD.partner_id OR NEW.type <> OLD.type OR NEW.amount_cents <> OLD.amount_cents
     OR NEW.movement_date <> OLD.movement_date OR NEW.account_id <> OLD.account_id OR NEW.description <> OLD.description THEN
    RAISE EXCEPTION 'Movimentações de sócios não podem ser editadas; estorne e registre novamente.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_partner_movement BEFORE INSERT OR UPDATE ON public.partner_movements FOR EACH ROW EXECUTE FUNCTION public.validate_partner_movement();

-- Conta com movimentação de sócio também não pode ter saldo inicial alterado
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
       OR EXISTS (SELECT 1 FROM public.partner_movements WHERE account_id = NEW.id) THEN
      RAISE EXCEPTION 'O saldo inicial não pode ser alterado depois que a conta tem movimentações.';
    END IF;
  END IF;
  RETURN NEW;
END $$;