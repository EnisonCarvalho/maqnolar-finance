CREATE TYPE public.order_status AS ENUM ('novo','aguardando_agendamento','visita_agendada','tecnico_a_caminho','em_diagnostico','orcamento_enviado','aguardando_aprovacao','orcamento_aprovado','orcamento_recusado','aguardando_peca','servico_em_andamento','servico_concluido','aguardando_pagamento','finalizado','cancelado');

CREATE TYPE public.quote_status AS ENUM ('rascunho','enviado','aprovado','recusado','substituido');

CREATE SEQUENCE public.service_order_code_seq START 1;

CREATE TABLE public.service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE DEFAULT ('ATD-' || lpad(nextval('public.service_order_code_seq')::text, 5, '0')),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  equipment_type_id UUID REFERENCES public.equipment_types(id),
  reported_problem TEXT NOT NULL DEFAULT '',
  technician_id UUID REFERENCES public.technicians(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_start TIMESTAMPTZ,
  estimated_minutes INTEGER NOT NULL DEFAULT 60 CHECK (estimated_minutes > 0),
  endereco TEXT, numero TEXT, complemento TEXT, bairro TEXT, cidade TEXT, estado TEXT, cep TEXT, ponto_referencia TEXT,
  notes TEXT,
  status public.order_status NOT NULL DEFAULT 'novo',
  visit_billable BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.service_order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  actor_user_id UUID,
  actor_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  labor_cents INTEGER NOT NULL DEFAULT 0 CHECK (labor_cents >= 0),
  parts_total_cents INTEGER NOT NULL DEFAULT 0 CHECK (parts_total_cents >= 0),
  total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  status public.quote_status NOT NULL DEFAULT 'rascunho',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, version)
);

CREATE TABLE public.quote_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
  total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_order_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_parts TO authenticated;
GRANT ALL ON public.service_orders TO service_role;
GRANT ALL ON public.service_order_events TO service_role;
GRANT ALL ON public.quotes TO service_role;
GRANT ALL ON public.quote_parts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.service_order_code_seq TO authenticated;
GRANT ALL ON SEQUENCE public.service_order_code_seq TO service_role;

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_parts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.my_technician_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.technicians WHERE profile_id = auth.uid() AND active LIMIT 1
$$;

CREATE POLICY "Admins manage orders" ON public.service_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Technicians read own orders" ON public.service_orders FOR SELECT TO authenticated
  USING (technician_id = public.my_technician_id());
CREATE POLICY "Technicians update own orders" ON public.service_orders FOR UPDATE TO authenticated
  USING (technician_id = public.my_technician_id()) WITH CHECK (technician_id = public.my_technician_id());

CREATE POLICY "Admins manage order events" ON public.service_order_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Technicians read own order events" ON public.service_order_events FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM public.service_orders WHERE technician_id = public.my_technician_id()));
CREATE POLICY "Technicians add events to own orders" ON public.service_order_events FOR INSERT TO authenticated
  WITH CHECK (order_id IN (SELECT id FROM public.service_orders WHERE technician_id = public.my_technician_id()));

CREATE POLICY "Admins manage quotes" ON public.quotes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Technicians read own quotes" ON public.quotes FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM public.service_orders WHERE technician_id = public.my_technician_id()));

CREATE POLICY "Admins manage quote parts" ON public.quote_parts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Technicians read own quote parts" ON public.quote_parts FOR SELECT TO authenticated
  USING (quote_id IN (SELECT q.id FROM public.quotes q JOIN public.service_orders o ON o.id = q.order_id WHERE o.technician_id = public.my_technician_id()));

CREATE OR REPLACE FUNCTION public.check_schedule_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.technician_id IS NULL OR NEW.scheduled_start IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status IN ('cancelado', 'finalizado') THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.technician_id::text));
  IF EXISTS (
    SELECT 1 FROM public.service_orders o
    WHERE o.technician_id = NEW.technician_id
      AND o.id IS DISTINCT FROM NEW.id
      AND o.scheduled_start IS NOT NULL
      AND o.status NOT IN ('cancelado', 'finalizado')
      AND tstzrange(o.scheduled_start, o.scheduled_start + make_interval(mins => o.estimated_minutes), '[)')
          && tstzrange(NEW.scheduled_start, NEW.scheduled_start + make_interval(mins => NEW.estimated_minutes), '[)')
  ) THEN
    RAISE EXCEPTION 'Conflito de agenda: o técnico já possui um atendimento neste horário.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_schedule_conflict
BEFORE INSERT OR UPDATE OF technician_id, scheduled_start, estimated_minutes, status ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.check_schedule_conflict();

CREATE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.log_order_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  actor_label TEXT;
  tech_name TEXT;
BEGIN
  SELECT full_name INTO actor_label FROM public.profiles WHERE id = actor;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.service_order_events (order_id, event_type, description, actor_user_id, actor_name)
    VALUES (NEW.id, 'criacao', 'Atendimento ' || NEW.code || ' criado', actor, actor_label);
    IF NEW.technician_id IS NOT NULL THEN
      SELECT full_name INTO tech_name FROM public.technicians WHERE id = NEW.technician_id;
      INSERT INTO public.service_order_events (order_id, event_type, description, actor_user_id, actor_name)
      VALUES (NEW.id, 'designacao', 'Técnico designado: ' || coalesce(tech_name, '—'), actor, actor_label);
    END IF;
    IF NEW.scheduled_start IS NOT NULL THEN
      INSERT INTO public.service_order_events (order_id, event_type, description, actor_user_id, actor_name)
      VALUES (NEW.id, 'agendamento', 'Visita agendada para ' || to_char(NEW.scheduled_start AT TIME ZONE 'America/Fortaleza', 'DD/MM/YYYY HH24:MI'), actor, actor_label);
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.service_order_events (order_id, event_type, description, actor_user_id, actor_name)
    VALUES (NEW.id, 'status', 'Status alterado de "' || OLD.status || '" para "' || NEW.status || '"', actor, actor_label);
  END IF;
  IF NEW.technician_id IS DISTINCT FROM OLD.technician_id THEN
    SELECT full_name INTO tech_name FROM public.technicians WHERE id = NEW.technician_id;
    INSERT INTO public.service_order_events (order_id, event_type, description, actor_user_id, actor_name)
    VALUES (NEW.id, 'designacao', 'Técnico alterado para: ' || coalesce(tech_name, 'nenhum'), actor, actor_label);
  END IF;
  IF NEW.scheduled_start IS DISTINCT FROM OLD.scheduled_start AND NEW.scheduled_start IS NOT NULL THEN
    INSERT INTO public.service_order_events (order_id, event_type, description, actor_user_id, actor_name)
    VALUES (NEW.id, CASE WHEN OLD.scheduled_start IS NULL THEN 'agendamento' ELSE 'reagendamento' END,
      'Visita ' || CASE WHEN OLD.scheduled_start IS NULL THEN 'agendada' ELSE 'reagendada' END || ' para ' || to_char(NEW.scheduled_start AT TIME ZONE 'America/Fortaleza', 'DD/MM/YYYY HH24:MI'), actor, actor_label);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_order_events
AFTER INSERT OR UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_events();