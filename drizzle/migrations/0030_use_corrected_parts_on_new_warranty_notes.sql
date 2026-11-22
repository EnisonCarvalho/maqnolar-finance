CREATE OR REPLACE FUNCTION public.use_corrected_order_on_warranty_note() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.service_orders;
BEGIN
 SELECT * INTO o FROM public.service_orders WHERE id=NEW.order_id;
 IF o.corrected_parts IS NOT NULL THEN
  SELECT coalesce(array_agg(value->>'description'),'{}'::text[]) INTO NEW.part_names FROM jsonb_array_elements(o.corrected_parts);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER warranty_note_corrected_parts BEFORE INSERT ON public.warranty_notes FOR EACH ROW EXECUTE FUNCTION public.use_corrected_order_on_warranty_note();