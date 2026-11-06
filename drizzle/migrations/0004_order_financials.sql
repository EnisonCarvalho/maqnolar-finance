CREATE TABLE public.order_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.service_orders(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.quotes(id),
  kind TEXT NOT NULL DEFAULT 'servico' CHECK (kind IN ('servico', 'visita')),
  total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  labor_cents INTEGER NOT NULL DEFAULT 0 CHECK (labor_cents >= 0),
  parts_estimated_cents INTEGER NOT NULL DEFAULT 0 CHECK (parts_estimated_cents >= 0),
  rule_technician_percent NUMERIC,
  rule_company_percent NUMERIC,
  rule_technician_fixed_cents INTEGER,
  rule_company_fixed_cents INTEGER,
  technician_share_cents INTEGER NOT NULL DEFAULT 0,
  company_share_cents INTEGER NOT NULL DEFAULT 0,
  receiver_type TEXT CHECK (receiver_type IN ('maqnolar', 'tecnico', 'outro')),
  receiver_label TEXT,
  status TEXT NOT NULL DEFAULT 'previsto' CHECK (status IN ('previsto', 'parcial', 'realizado')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.part_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  quote_part_id UUID REFERENCES public.quote_parts(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
  total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  buyer_type TEXT NOT NULL CHECK (buyer_type IN ('maqnolar', 'tecnico', 'outro')),
  buyer_technician_id UUID REFERENCES public.technicians(id),
  buyer_label TEXT,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  receipt_url TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_financials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.part_purchases TO authenticated;
GRANT ALL ON public.order_financials TO service_role;
GRANT ALL ON public.part_purchases TO service_role;

ALTER TABLE public.order_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_purchases ENABLE ROW LEVEL SECURITY;

-- Somente administradores acessam a composição financeira e as compras de peças.
CREATE POLICY "Admins manage order financials" ON public.order_financials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage part purchases" ON public.part_purchases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_order_financials_updated_at
BEFORE UPDATE ON public.order_financials
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auditoria de correções administrativas: registra valor anterior, novo valor e responsável.
CREATE OR REPLACE FUNCTION public.audit_order_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  actor_label TEXT;
  changes TEXT := '';
BEGIN
  SELECT full_name INTO actor_label FROM public.profiles WHERE id = actor;
  IF NEW.total_cents IS DISTINCT FROM OLD.total_cents THEN
    changes := changes || 'Total: R$ ' || (OLD.total_cents/100.0)::text || ' → R$ ' || (NEW.total_cents/100.0)::text || '; ';
  END IF;
  IF NEW.technician_share_cents IS DISTINCT FROM OLD.technician_share_cents THEN
    changes := changes || 'Parte do técnico: R$ ' || (OLD.technician_share_cents/100.0)::text || ' → R$ ' || (NEW.technician_share_cents/100.0)::text || '; ';
  END IF;
  IF NEW.company_share_cents IS DISTINCT FROM OLD.company_share_cents THEN
    changes := changes || 'Parte da MaqnoLar: R$ ' || (OLD.company_share_cents/100.0)::text || ' → R$ ' || (NEW.company_share_cents/100.0)::text || '; ';
  END IF;
  IF NEW.receiver_type IS DISTINCT FROM OLD.receiver_type THEN
    changes := changes || 'Recebedor: ' || coalesce(OLD.receiver_type, '—') || ' → ' || coalesce(NEW.receiver_type, '—') || '; ';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    changes := changes || 'Situação: ' || OLD.status || ' → ' || NEW.status || '; ';
  END IF;
  IF changes <> '' THEN
    INSERT INTO public.service_order_events (order_id, event_type, description, actor_user_id, actor_name)
    VALUES (NEW.order_id, 'financeiro', 'Ajuste financeiro: ' || changes, actor, actor_label);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_order_financials
AFTER UPDATE ON public.order_financials
FOR EACH ROW EXECUTE FUNCTION public.audit_order_financials();