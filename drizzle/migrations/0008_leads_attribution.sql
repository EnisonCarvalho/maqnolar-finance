CREATE TABLE public.lead_lost_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.lead_lost_reasons (name, sort_order) VALUES
 ('Preço',10),('Fora da região atendida',20),('Não respondeu',30),('Apenas pesquisando',40),('Procurava comprar ou vender equipamento',50),('Outro',90);

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text,
  phone_digits text,
  contacted_at timestamptz NOT NULL DEFAULT now(),
  service_id uuid REFERENCES public.services(id),
  equipment_type_id uuid REFERENCES public.equipment_types(id),
  interest_label text,
  origin text NOT NULL CHECK (origin IN ('meta_ads','google_ads','indicacao','organico','outra')),
  campaign_id uuid REFERENCES public.campaigns(id),
  creative_code text,
  bairro text,
  cidade text,
  notes text,
  status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','em_contato','agendado','convertido','perdido')),
  lost_reason_id uuid REFERENCES public.lead_lost_reasons(id),
  lost_notes text,
  customer_id uuid REFERENCES public.customers(id),
  order_id uuid UNIQUE REFERENCES public.service_orders(id),
  converted_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'perdido' OR lost_reason_id IS NOT NULL),
  CHECK (status <> 'convertido' OR order_id IS NOT NULL)
);
CREATE INDEX leads_campaign ON public.leads(campaign_id);
CREATE INDEX leads_contacted ON public.leads(contacted_at);
CREATE INDEX leads_phone ON public.leads(phone_digits);

ALTER TABLE public.service_orders ADD COLUMN lead_id uuid REFERENCES public.leads(id);
ALTER TABLE public.service_orders ADD COLUMN origin text CHECK (origin IS NULL OR origin IN ('meta_ads','google_ads','indicacao','organico','outra'));
ALTER TABLE public.service_orders ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id);
ALTER TABLE public.service_orders ADD COLUMN creative_code text;
CREATE UNIQUE INDEX service_orders_lead_unique ON public.service_orders(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX service_orders_campaign ON public.service_orders(campaign_id);

CREATE TABLE public.origin_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('lead','order')),
  entity_id uuid NOT NULL,
  old_origin text, new_origin text,
  old_campaign_id uuid, new_campaign_id uuid,
  old_creative_code text, new_creative_code text,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  actor_user_id uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX origin_corrections_entity ON public.origin_corrections(entity_id);

GRANT SELECT, INSERT, UPDATE ON public.lead_lost_reasons TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.leads TO authenticated;
GRANT SELECT, INSERT ON public.origin_corrections TO authenticated;
GRANT ALL ON public.lead_lost_reasons, public.leads, public.origin_corrections TO service_role;
ALTER TABLE public.lead_lost_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.origin_corrections ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['lead_lost_reasons','leads'] LOOP
    EXECUTE format('CREATE POLICY "Admins read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('CREATE POLICY "Admins insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('CREATE POLICY "Admins update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('CREATE TRIGGER trg_block_delete_%1$s BEFORE DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.block_finance_delete()', t);
  END LOOP;
END $$;
CREATE TRIGGER trg_audit_leads AFTER INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.audit_finance_row();
CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Admins read origin_corrections" ON public.origin_corrections FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert origin_corrections" ON public.origin_corrections FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Origem de atendimento só muda via correção registrada; vínculo ao lead nunca muda.
CREATE OR REPLACE FUNCTION public.guard_order_origin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.lead_id IS DISTINCT FROM OLD.lead_id AND OLD.lead_id IS NOT NULL THEN
    RAISE EXCEPTION 'O lead de origem de um atendimento não pode ser alterado.';
  END IF;
  IF (NEW.origin IS DISTINCT FROM OLD.origin OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id OR NEW.creative_code IS DISTINCT FROM OLD.creative_code)
     AND NOT EXISTS (SELECT 1 FROM public.origin_corrections WHERE entity_type='order' AND entity_id = NEW.id AND created_at > now() - interval '1 minute'
                     AND new_origin IS NOT DISTINCT FROM NEW.origin AND new_campaign_id IS NOT DISTINCT FROM NEW.campaign_id) THEN
    RAISE EXCEPTION 'A origem do atendimento só pode ser alterada por correção com justificativa.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_order_origin BEFORE UPDATE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.guard_order_origin();
REVOKE EXECUTE ON FUNCTION public.guard_order_origin() FROM PUBLIC, anon, authenticated;