CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('meta_ads','google_ads','outra')),
  platform_label text,
  external_code text,
  service_id uuid REFERENCES public.services(id),
  service_label text,
  start_date date NOT NULL,
  end_date date,
  status text NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada','ativa','pausada','encerrada')),
  planned_budget_cents integer NOT NULL DEFAULT 0 CHECK (planned_budget_cents >= 0),
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE TABLE public.campaign_expense_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
  expense_id uuid NOT NULL REFERENCES public.expenses(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  notes text,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','removido')),
  remove_reason text,
  removed_by uuid,
  removed_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX campaign_alloc_unique_active ON public.campaign_expense_allocations(campaign_id, expense_id) WHERE status = 'ativo';
CREATE INDEX campaign_alloc_expense ON public.campaign_expense_allocations(expense_id);

GRANT SELECT, INSERT, UPDATE ON public.campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.campaign_expense_allocations TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
GRANT ALL ON public.campaign_expense_allocations TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_expense_allocations ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['campaigns','campaign_expense_allocations'] LOOP
    EXECUTE format('CREATE POLICY "Admins read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('CREATE POLICY "Admins insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('CREATE POLICY "Admins update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.audit_finance_row()', t);
    EXECUTE format('CREATE TRIGGER trg_block_delete_%1$s BEFORE DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.block_finance_delete()', t);
  END LOOP;
END $$;
CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_campaign_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE exp record; used integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.campaign_id <> OLD.campaign_id OR NEW.expense_id <> OLD.expense_id OR NEW.amount_cents <> OLD.amount_cents THEN
      RAISE EXCEPTION 'Vínculos não podem ser alterados; remova e crie novamente.';
    END IF;
    IF OLD.status = 'removido' THEN RAISE EXCEPTION 'Vínculo já removido.'; END IF;
    IF NEW.status = 'removido' THEN
      IF coalesce(trim(NEW.remove_reason),'') = '' THEN RAISE EXCEPTION 'Informe o motivo da remoção.'; END IF;
      NEW.removed_by := auth.uid(); NEW.removed_at := now();
    END IF;
    RETURN NEW;
  END IF;
  NEW.status := 'ativo';
  SELECT id, amount_cents, status INTO exp FROM public.expenses WHERE id = NEW.expense_id FOR UPDATE;
  IF exp.id IS NULL THEN RAISE EXCEPTION 'Despesa não encontrada.'; END IF;
  IF exp.status = 'cancelada' THEN RAISE EXCEPTION 'Despesa cancelada não pode ser vinculada.'; END IF;
  SELECT coalesce(sum(amount_cents),0) INTO used FROM public.campaign_expense_allocations WHERE expense_id = NEW.expense_id AND status = 'ativo';
  IF used + NEW.amount_cents > exp.amount_cents THEN
    RAISE EXCEPTION 'A soma dos vínculos (%) ultrapassa o valor da despesa (%).', used + NEW.amount_cents, exp.amount_cents;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_campaign_alloc BEFORE INSERT OR UPDATE ON public.campaign_expense_allocations FOR EACH ROW EXECUTE FUNCTION public.validate_campaign_allocation();
REVOKE EXECUTE ON FUNCTION public.validate_campaign_allocation() FROM PUBLIC, anon, authenticated;