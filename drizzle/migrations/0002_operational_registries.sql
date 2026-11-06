CREATE TABLE public.technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  bairro TEXT,
  cidade TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technicians TO authenticated;
GRANT ALL ON public.technicians TO service_role;
ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage technicians" ON public.technicians FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER technicians_updated_at BEFORE UPDATE ON public.technicians FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  ponto_referencia TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage customers" ON public.customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.equipment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_types TO authenticated;
GRANT ALL ON public.equipment_types TO service_role;
ALTER TABLE public.equipment_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage equipment types" ON public.equipment_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Technicians read equipment types" ON public.equipment_types FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tecnico'));

CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  equipment_type_id UUID REFERENCES public.equipment_types(id),
  suggested_price_cents INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage services" ON public.services FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Technicians read services" ON public.services FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tecnico'));

CREATE TABLE public.split_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('visita', 'mao_obra')),
  technician_percent NUMERIC(5,2),
  company_percent NUMERIC(5,2),
  technician_fixed_cents INTEGER,
  company_fixed_cents INTEGER,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.split_rules TO authenticated;
GRANT ALL ON public.split_rules TO service_role;
ALTER TABLE public.split_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage split rules" ON public.split_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.equipment_types (name) VALUES
  ('Geladeira'), ('Máquina de lavar'), ('Tanquinho'), ('Freezer'),
  ('Gelágua'), ('Frigobar'), ('Purificador de água'), ('Ar-condicionado');

INSERT INTO public.services (name) VALUES
  ('Visita técnica'), ('Diagnóstico'), ('Manutenção'), ('Reparo'),
  ('Troca de peças'), ('Instalação'), ('Limpeza técnica'), ('Outros');

INSERT INTO public.split_rules (kind, technician_fixed_cents, company_fixed_cents) VALUES
  ('visita', 2000, 1000);
INSERT INTO public.split_rules (kind, technician_percent, company_percent) VALUES
  ('mao_obra', 50, 50);

INSERT INTO public.technicians (full_name) VALUES
  ('Westerley Cardoso'), ('Carlos Eduardo');