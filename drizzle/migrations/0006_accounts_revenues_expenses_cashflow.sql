-- Fechamento mensal (bloqueia lançamentos em meses fechados)
CREATE TABLE public.monthly_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'fechado' CHECK (status IN ('fechado','reaberto')),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  closed_by UUID,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reopen_reason TEXT,
  reopened_by UUID,
  reopened_at TIMESTAMPTZ,
  CHECK (extract(day FROM month) = 1)
);

CREATE OR REPLACE FUNCTION public.assert_month_open(_d DATE)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _d IS NOT NULL AND EXISTS (SELECT 1 FROM public.monthly_closings WHERE status = 'fechado' AND month = date_trunc('month', _d)::date) THEN
    RAISE EXCEPTION 'O mês de % está fechado. Reabra o fechamento mensal para lançar ou corrigir movimentações.', to_char(_d, 'MM/YYYY');
  END IF;
END $$;

-- Contas financeiras
CREATE TABLE public.financial_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  institution TEXT,
  holder TEXT,
  account_type TEXT NOT NULL DEFAULT 'banco' CHECK (account_type IN ('banco','carteira_digital','caixa','outro')),
  ownership TEXT NOT NULL DEFAULT 'empresa' CHECK (ownership IN ('empresa','socio')),
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  opening_date DATE NOT NULL DEFAULT current_date,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Categorias de receitas e despesas
CREATE TABLE public.finance_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('receita','despesa')),
  sort_order INTEGER NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, name)
);

-- Receitas avulsas (as de atendimento vêm dos recebimentos existentes)
CREATE TABLE public.other_revenues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  category_id UUID REFERENCES public.finance_categories(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  competence_date DATE NOT NULL,
  received_at DATE,
  method TEXT CHECK (method IN ('pix','dinheiro','credito','debito','transferencia','outro')),
  account_id UUID REFERENCES public.financial_accounts(id),
  origin TEXT,
  notes TEXT,
  receipt_path TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','estornado')),
  void_reason TEXT,
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (received_at IS NULL OR account_id IS NOT NULL)
);

-- Recorrências
CREATE TABLE public.recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  category_id UUID REFERENCES public.finance_categories(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('semanal','mensal','anual')),
  next_due_date DATE NOT NULL,
  account_id UUID REFERENCES public.financial_accounts(id),
  responsible TEXT,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','pausada','encerrada')),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Despesas (obrigações) e seus pagamentos
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  category_id UUID REFERENCES public.finance_categories(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  competence_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','parcial','paga','cancelada')),
  planned_account_id UUID REFERENCES public.financial_accounts(id),
  responsible TEXT,
  notes TEXT,
  receipt_path TEXT,
  recurring_id UUID REFERENCES public.recurring_expenses(id),
  cancel_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_expenses_recurring_due ON public.expenses(recurring_id, due_date) WHERE recurring_id IS NOT NULL;

CREATE TABLE public.expense_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  paid_at DATE NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('pix','dinheiro','credito','debito','transferencia','outro')),
  account_id UUID NOT NULL REFERENCES public.financial_accounts(id),
  notes TEXT,
  receipt_path TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','estornado')),
  void_reason TEXT,
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transferências entre contas da própria empresa
CREATE TABLE public.account_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id UUID NOT NULL REFERENCES public.financial_accounts(id),
  to_account_id UUID NOT NULL REFERENCES public.financial_accounts(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  transfer_date DATE NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','estornado')),
  void_reason TEXT,
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_account_id <> to_account_id)
);

-- Conta da empresa usada nos módulos existentes (opcional, sem alterar dados)
ALTER TABLE public.customer_payments ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.financial_accounts(id);
ALTER TABLE public.technician_transfers ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.financial_accounts(id);
ALTER TABLE public.part_purchases ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.financial_accounts(id);

GRANT SELECT, INSERT, UPDATE ON public.monthly_closings, public.financial_accounts, public.finance_categories,
  public.other_revenues, public.recurring_expenses, public.expenses, public.expense_payments, public.account_transfers TO authenticated;
GRANT ALL ON public.monthly_closings, public.financial_accounts, public.finance_categories,
  public.other_revenues, public.recurring_expenses, public.expenses, public.expense_payments, public.account_transfers TO service_role;

ALTER TABLE public.monthly_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.other_revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_transfers ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['monthly_closings','financial_accounts','finance_categories','other_revenues','recurring_expenses','expenses','expense_payments','account_transfers'] LOOP
    EXECUTE format('CREATE POLICY "Admins read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('CREATE POLICY "Admins insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('CREATE POLICY "Admins update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.audit_finance_row()', t);
  END LOOP;
END $$;

CREATE TRIGGER trg_financial_accounts_updated_at BEFORE UPDATE ON public.financial_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_recurring_updated_at BEFORE UPDATE ON public.recurring_expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Bloqueio de exclusões em todas as tabelas financeiras novas
CREATE OR REPLACE FUNCTION public.block_finance_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Movimentações e cadastros financeiros não podem ser excluídos; use estorno, cancelamento ou desativação.';
END $$;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['monthly_closings','financial_accounts','finance_categories','other_revenues','recurring_expenses','expenses','expense_payments','account_transfers'] LOOP
    EXECUTE format('CREATE TRIGGER trg_block_delete_%1$s BEFORE DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.block_finance_delete()', t);
  END LOOP;
END $$;

-- Contas: saldo inicial só pode mudar enquanto não houver movimentação; conta de sócio não é caixa da empresa
CREATE OR REPLACE FUNCTION public.validate_financial_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.opening_balance_cents <> OLD.opening_balance_cents OR NEW.opening_date <> OLD.opening_date) THEN
    IF EXISTS (SELECT 1 FROM public.expense_payments WHERE account_id = NEW.id)
       OR EXISTS (SELECT 1 FROM public.other_revenues WHERE account_id = NEW.id AND received_at IS NOT NULL)
       OR EXISTS (SELECT 1 FROM public.account_transfers WHERE from_account_id = NEW.id OR to_account_id = NEW.id)
       OR EXISTS (SELECT 1 FROM public.customer_payments WHERE account_id = NEW.id)
       OR EXISTS (SELECT 1 FROM public.technician_transfers WHERE account_id = NEW.id)
       OR EXISTS (SELECT 1 FROM public.part_purchases WHERE account_id = NEW.id) THEN
      RAISE EXCEPTION 'O saldo inicial não pode ser alterado depois que a conta tem movimentações.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_financial_account BEFORE UPDATE ON public.financial_accounts FOR EACH ROW EXECUTE FUNCTION public.validate_financial_account();

CREATE OR REPLACE FUNCTION public.assert_company_account(_id UUID)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financial_accounts WHERE id = _id AND ownership = 'empresa' AND active) THEN
    RAISE EXCEPTION 'Selecione uma conta ativa da empresa. Contas pessoais de sócios não movimentam o caixa da MaqnoLar.';
  END IF;
END $$;

-- Receitas avulsas
CREATE OR REPLACE FUNCTION public.validate_other_revenue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.assert_month_open(NEW.competence_date);
    PERFORM public.assert_month_open(NEW.received_at);
    PERFORM public.assert_company_account(NEW.account_id);
    IF EXISTS (SELECT 1 FROM public.other_revenues WHERE status = 'ativo' AND amount_cents = NEW.amount_cents
               AND competence_date = NEW.competence_date AND lower(description) = lower(NEW.description)) THEN
      RAISE EXCEPTION 'Receita duplicada: já existe uma receita igual (descrição, valor e competência).';
    END IF;
    NEW.created_by := auth.uid();
    RETURN NEW;
  END IF;
  IF OLD.status = 'estornado' THEN RAISE EXCEPTION 'Receita estornada não pode ser alterada.'; END IF;
  IF NEW.amount_cents <> OLD.amount_cents OR NEW.competence_date <> OLD.competence_date THEN
    RAISE EXCEPTION 'Valor e competência não podem ser alterados; estorne e lance novamente.';
  END IF;
  IF OLD.received_at IS NOT NULL AND (NEW.received_at IS DISTINCT FROM OLD.received_at OR NEW.account_id IS DISTINCT FROM OLD.account_id) AND NEW.status = 'ativo' THEN
    RAISE EXCEPTION 'Recebimento já registrado; estorne para corrigir.';
  END IF;
  IF OLD.received_at IS NULL AND NEW.received_at IS NOT NULL THEN
    PERFORM public.assert_month_open(NEW.received_at);
    PERFORM public.assert_company_account(NEW.account_id);
  END IF;
  IF NEW.status = 'estornado' THEN
    IF coalesce(trim(NEW.void_reason),'') = '' THEN RAISE EXCEPTION 'Informe o motivo do estorno.'; END IF;
    PERFORM public.assert_month_open(coalesce(OLD.received_at, OLD.competence_date));
    NEW.voided_by := auth.uid(); NEW.voided_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_other_revenue BEFORE INSERT OR UPDATE ON public.other_revenues FOR EACH ROW EXECUTE FUNCTION public.validate_other_revenue();

-- Despesas
CREATE OR REPLACE FUNCTION public.validate_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE paid INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.assert_month_open(NEW.competence_date);
    IF NEW.recurring_id IS NULL AND EXISTS (SELECT 1 FROM public.expenses WHERE status <> 'cancelada' AND amount_cents = NEW.amount_cents
               AND due_date = NEW.due_date AND lower(description) = lower(NEW.description)) THEN
      RAISE EXCEPTION 'Despesa duplicada: já existe uma despesa igual (descrição, valor e vencimento).';
    END IF;
    NEW.status := 'pendente';
    NEW.created_by := auth.uid();
    RETURN NEW;
  END IF;
  IF OLD.status = 'cancelada' AND NEW.status <> 'cancelada' THEN RAISE EXCEPTION 'Despesa cancelada não pode ser reativada.'; END IF;
  SELECT coalesce(sum(amount_cents),0) INTO paid FROM public.expense_payments WHERE expense_id = NEW.id AND status = 'ativo';
  IF NEW.amount_cents <> OLD.amount_cents OR NEW.competence_date <> OLD.competence_date THEN
    IF paid > 0 THEN RAISE EXCEPTION 'Valor e competência não podem ser alterados após pagamentos; estorne os pagamentos primeiro.'; END IF;
    PERFORM public.assert_month_open(OLD.competence_date);
    PERFORM public.assert_month_open(NEW.competence_date);
  END IF;
  IF NEW.status = 'cancelada' AND OLD.status <> 'cancelada' THEN
    IF paid > 0 THEN RAISE EXCEPTION 'Estorne os pagamentos antes de cancelar a despesa.'; END IF;
    IF coalesce(trim(NEW.cancel_reason),'') = '' THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.'; END IF;
    PERFORM public.assert_month_open(OLD.competence_date);
  ELSIF NEW.status <> 'cancelada' THEN
    NEW.status := CASE WHEN paid <= 0 THEN 'pendente' WHEN paid < NEW.amount_cents THEN 'parcial' ELSE 'paga' END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_expense BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.validate_expense();

CREATE OR REPLACE FUNCTION public.validate_expense_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE exp RECORD; paid INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtext('expense:' || NEW.expense_id::text));
    SELECT * INTO exp FROM public.expenses WHERE id = NEW.expense_id;
    IF exp.status = 'cancelada' THEN RAISE EXCEPTION 'Despesa cancelada não aceita pagamentos.'; END IF;
    PERFORM public.assert_month_open(NEW.paid_at);
    PERFORM public.assert_company_account(NEW.account_id);
    SELECT coalesce(sum(amount_cents),0) INTO paid FROM public.expense_payments WHERE expense_id = NEW.expense_id AND status = 'ativo';
    IF paid + NEW.amount_cents > exp.amount_cents THEN
      RAISE EXCEPTION 'Pagamento acima do valor da despesa: restam R$ %.', to_char((exp.amount_cents - paid)/100.0, 'FM999G999G990D00');
    END IF;
    IF EXISTS (SELECT 1 FROM public.expense_payments WHERE expense_id = NEW.expense_id AND status = 'ativo'
               AND amount_cents = NEW.amount_cents AND paid_at = NEW.paid_at AND account_id = NEW.account_id) THEN
      RAISE EXCEPTION 'Pagamento duplicado: já existe um pagamento igual para esta despesa.';
    END IF;
    NEW.created_by := auth.uid();
    RETURN NEW;
  END IF;
  IF NEW.amount_cents <> OLD.amount_cents OR NEW.paid_at <> OLD.paid_at OR NEW.account_id <> OLD.account_id OR NEW.expense_id <> OLD.expense_id THEN
    RAISE EXCEPTION 'Pagamentos não podem ser alterados; estorne e registre novamente.';
  END IF;
  IF OLD.status = 'estornado' AND NEW.status <> 'estornado' THEN RAISE EXCEPTION 'Pagamento estornado não pode ser reativado.'; END IF;
  IF NEW.status = 'estornado' AND OLD.status = 'ativo' THEN
    IF coalesce(trim(NEW.void_reason),'') = '' THEN RAISE EXCEPTION 'Informe o motivo do estorno.'; END IF;
    PERFORM public.assert_month_open(OLD.paid_at);
    NEW.voided_by := auth.uid(); NEW.voided_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_expense_payment BEFORE INSERT OR UPDATE ON public.expense_payments FOR EACH ROW EXECUTE FUNCTION public.validate_expense_payment();

CREATE OR REPLACE FUNCTION public.refresh_expense_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.expenses SET updated_at = now() WHERE id = NEW.expense_id AND status <> 'cancelada';
  RETURN NULL;
END $$;
CREATE TRIGGER trg_refresh_expense_status AFTER INSERT OR UPDATE ON public.expense_payments FOR EACH ROW EXECUTE FUNCTION public.refresh_expense_status();

-- Transferências entre contas
CREATE OR REPLACE FUNCTION public.validate_account_transfer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.assert_month_open(NEW.transfer_date);
    PERFORM public.assert_company_account(NEW.from_account_id);
    PERFORM public.assert_company_account(NEW.to_account_id);
    IF EXISTS (SELECT 1 FROM public.account_transfers WHERE status = 'ativo' AND from_account_id = NEW.from_account_id
               AND to_account_id = NEW.to_account_id AND amount_cents = NEW.amount_cents AND transfer_date = NEW.transfer_date) THEN
      RAISE EXCEPTION 'Transferência duplicada: já existe uma transferência igual.';
    END IF;
    NEW.created_by := auth.uid();
    RETURN NEW;
  END IF;
  IF NEW.amount_cents <> OLD.amount_cents OR NEW.transfer_date <> OLD.transfer_date
     OR NEW.from_account_id <> OLD.from_account_id OR NEW.to_account_id <> OLD.to_account_id THEN
    RAISE EXCEPTION 'Transferências não podem ser alteradas; estorne e registre novamente.';
  END IF;
  IF OLD.status = 'estornado' AND NEW.status <> 'estornado' THEN RAISE EXCEPTION 'Transferência estornada não pode ser reativada.'; END IF;
  IF NEW.status = 'estornado' AND OLD.status = 'ativo' THEN
    IF coalesce(trim(NEW.void_reason),'') = '' THEN RAISE EXCEPTION 'Informe o motivo do estorno.'; END IF;
    PERFORM public.assert_month_open(OLD.transfer_date);
    NEW.voided_by := auth.uid(); NEW.voided_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_account_transfer BEFORE INSERT OR UPDATE ON public.account_transfers FOR EACH ROW EXECUTE FUNCTION public.validate_account_transfer();

-- Meses fechados também valem para recebimentos de clientes e repasses de técnicos
CREATE OR REPLACE FUNCTION public.check_month_customer_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.assert_month_open(NEW.paid_at);
    IF NEW.receiver_type = 'maqnolar' THEN PERFORM public.assert_company_account(NEW.account_id); END IF;
  ELSIF NEW.status = 'estornado' AND OLD.status = 'ativo' THEN
    PERFORM public.assert_month_open(OLD.paid_at);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_month_customer_payment BEFORE INSERT OR UPDATE ON public.customer_payments FOR EACH ROW EXECUTE FUNCTION public.check_month_customer_payment();

CREATE OR REPLACE FUNCTION public.check_month_technician_transfer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.assert_month_open(NEW.transfer_date);
    PERFORM public.assert_company_account(NEW.account_id);
  ELSIF NEW.status = 'estornado' AND OLD.status = 'ativo' THEN
    PERFORM public.assert_month_open(OLD.transfer_date);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_month_technician_transfer BEFORE INSERT OR UPDATE ON public.technician_transfers FOR EACH ROW EXECUTE FUNCTION public.check_month_technician_transfer();

-- Fechamento mensal: um ativo por mês, reabertura com justificativa
CREATE OR REPLACE FUNCTION public.validate_monthly_closing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.monthly_closings WHERE month = NEW.month AND status = 'fechado') THEN
      RAISE EXCEPTION 'Este mês já está fechado.';
    END IF;
    NEW.status := 'fechado'; NEW.closed_by := auth.uid(); NEW.closed_at := now();
    RETURN NEW;
  END IF;
  IF OLD.status = 'reaberto' OR NEW.status <> 'reaberto' OR NEW.snapshot <> OLD.snapshot OR NEW.month <> OLD.month THEN
    RAISE EXCEPTION 'Um fechamento mensal só pode ser reaberto, preservando os valores registrados.';
  END IF;
  IF coalesce(trim(NEW.reopen_reason),'') = '' THEN RAISE EXCEPTION 'Informe a justificativa da reabertura.'; END IF;
  NEW.reopened_by := auth.uid(); NEW.reopened_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_monthly_closing BEFORE INSERT OR UPDATE ON public.monthly_closings FOR EACH ROW EXECUTE FUNCTION public.validate_monthly_closing();

REVOKE EXECUTE ON FUNCTION public.validate_financial_account(), public.validate_other_revenue(), public.validate_expense(),
  public.validate_expense_payment(), public.refresh_expense_status(), public.validate_account_transfer(),
  public.check_month_customer_payment(), public.check_month_technician_transfer(), public.validate_monthly_closing(),
  public.block_finance_delete() FROM PUBLIC, anon, authenticated;

-- Categorias iniciais
INSERT INTO public.finance_categories (name, kind, sort_order) VALUES
  ('Google Ads','despesa',10),('Meta Ads / Facebook','despesa',20),('Hospedagem Hostinger','despesa',30),
  ('ChatGPT','despesa',40),('Claude','despesa',50),('GPTMaker','despesa',60),('Lovable','despesa',70),
  ('n8n','despesa',80),('Domínios','despesa',90),('Servidores','despesa',100),('Telefone e internet','despesa',110),
  ('Chip e recarga','despesa',120),('Tarifas bancárias','despesa',130),('Transporte','despesa',140),
  ('Materiais','despesa',150),('Despesas administrativas','despesa',160),('Outros','despesa',999),
  ('Serviço avulso','receita',10),('Venda de peças','receita',20),('Rendimentos','receita',30),('Outros','receita',999);