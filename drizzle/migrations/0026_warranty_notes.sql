CREATE TABLE public.warranty_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.service_orders(id),
  note_year integer NOT NULL,
  note_seq integer NOT NULL,
  number text NOT NULL UNIQUE,
  order_code text NOT NULL,
  customer_name text NOT NULL,
  customer_phone text,
  customer_cpf text,
  customer_address text,
  equipment text,
  service_description text NOT NULL,
  part_names text[] NOT NULL DEFAULT '{}',
  technician_name text,
  service_date date NOT NULL,
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  payment_method text NOT NULL,
  installments integer CHECK (installments IS NULL OR installments BETWEEN 1 AND 36),
  warranty_days integer NOT NULL CHECK (warranty_days BETWEEN 1 AND 3650),
  warranty_start date NOT NULL,
  warranty_end date NOT NULL,
  observations text,
  issued_by uuid,
  issued_by_name text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_year, note_seq)
);
GRANT SELECT ON public.warranty_notes TO authenticated;
GRANT ALL ON public.warranty_notes TO service_role;
ALTER TABLE public.warranty_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins veem notas de garantia" ON public.warranty_notes FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.guard_warranty_note_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Nota de garantia emitida não pode ser alterada nem excluída.'; END $$;
CREATE TRIGGER warranty_notes_immutable BEFORE UPDATE OR DELETE ON public.warranty_notes FOR EACH ROW EXECUTE FUNCTION public.guard_warranty_note_immutable();

CREATE OR REPLACE FUNCTION public.issue_warranty_note(_order uuid, _description text, _payment_method text, _installments integer, _warranty_days integer, _warranty_start date, _observations text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; f record; existing uuid; yr integer; seq integer; nid uuid; parts text[]; addr text; pname text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente administradores podem emitir notas de garantia.'; END IF;
  SELECT * INTO o FROM public.service_orders WHERE id=_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atendimento não encontrado.'; END IF;
  SELECT id INTO existing FROM public.warranty_notes WHERE order_id=_order;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  SELECT * INTO f FROM public.order_financials WHERE order_id=_order;
  IF o.status<>'finalizado' OR o.financial_confirmed_at IS NULL OR f.kind IS DISTINCT FROM 'servico' THEN
    RAISE EXCEPTION 'Só é possível emitir nota para serviço finalizado pelo administrador.'; END IF;
  IF length(trim(coalesce(_description,'')))=0 THEN RAISE EXCEPTION 'Informe a descrição do serviço.'; END IF;
  IF length(trim(coalesce(_payment_method,'')))=0 THEN RAISE EXCEPTION 'Informe a forma de pagamento.'; END IF;
  IF _warranty_days IS NULL OR _warranty_days<1 OR _warranty_start IS NULL THEN RAISE EXCEPTION 'Informe o prazo e o início da garantia.'; END IF;
  SELECT coalesce(array_agg(d ORDER BY d),'{}') INTO parts FROM (
    SELECT DISTINCT trim(p->>'description') d FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.technician_reported_parts)='array' THEN o.technician_reported_parts ELSE '[]'::jsonb END) p WHERE length(trim(coalesce(p->>'description','')))>0
    UNION SELECT DISTINCT trim(description) FROM public.part_purchases WHERE order_id=_order AND length(trim(coalesce(description,'')))>0) x;
  addr := concat_ws(', ', nullif(o.endereco,''), nullif(o.numero,''), nullif(o.complemento,''), nullif(o.bairro,''), nullif(concat_ws(' - ', nullif(o.cidade,''), nullif(o.estado,'')),''), nullif(o.cep,''));
  SELECT full_name INTO pname FROM public.profiles WHERE id=auth.uid();
  PERFORM pg_advisory_xact_lock(hashtext('warranty_note_seq'));
  yr := extract(year FROM now() AT TIME ZONE 'America/Fortaleza')::int;
  SELECT coalesce(max(note_seq),0)+1 INTO seq FROM public.warranty_notes WHERE note_year=yr;
  INSERT INTO public.warranty_notes(order_id,note_year,note_seq,number,order_code,customer_name,customer_phone,customer_cpf,customer_address,equipment,service_description,part_names,technician_name,service_date,total_cents,payment_method,installments,warranty_days,warranty_start,warranty_end,observations,issued_by,issued_by_name)
  SELECT _order,yr,seq,lpad(seq::text,3,'0')||'-'||yr,o.code,c.full_name,c.phone,NULL,nullif(addr,''),e.name,trim(_description),parts,t.full_name,
    (coalesce(o.completed_at,o.executed_at,o.financial_confirmed_at) AT TIME ZONE 'America/Fortaleza')::date,
    f.total_cents,trim(_payment_method),CASE WHEN _installments>1 THEN _installments END,_warranty_days,_warranty_start,_warranty_start+_warranty_days,nullif(trim(coalesce(_observations,'')),''),auth.uid(),pname
  FROM public.customers c LEFT JOIN public.equipment_types e ON e.id=o.equipment_type_id LEFT JOIN public.technicians t ON t.id=o.technician_id
  WHERE c.id=o.customer_id RETURNING id INTO nid;
  INSERT INTO public.service_order_events(order_id,event_type,description,actor_user_id,actor_name) VALUES(_order,'nota_garantia','Nota de garantia '||lpad(seq::text,3,'0')||'-'||yr||' emitida.',auth.uid(),pname);
  RETURN nid;
END $$;
REVOKE ALL ON FUNCTION public.issue_warranty_note(uuid,text,text,integer,integer,date,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.issue_warranty_note(uuid,text,text,integer,integer,date,text) TO authenticated;