ALTER TABLE public.service_orders ADD COLUMN technician_reported_cents integer CHECK (technician_reported_cents >= 0), ADD COLUMN technician_reported_at timestamptz, ADD COLUMN technician_reported_by uuid REFERENCES public.profiles(id), ADD COLUMN technician_reported_name text, ADD COLUMN financial_confirmed_at timestamptz;
UPDATE public.service_orders o SET financial_confirmed_at=f.created_at FROM public.order_financials f WHERE f.order_id=o.id;
CREATE OR REPLACE FUNCTION public.guard_technician_order_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
  IF NOT public.has_role(auth.uid(),'tecnico') OR OLD.technician_id IS DISTINCT FROM public.my_technician_id() THEN RAISE EXCEPTION 'Este atendimento não é seu.'; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','updated_at','executed_at','completed_at','technician_reported_cents','technician_reported_at','technician_reported_by','technician_reported_name']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','executed_at','completed_at','technician_reported_cents','technician_reported_at','technician_reported_by','technician_reported_name']) THEN RAISE EXCEPTION 'Técnico não pode alterar dados administrativos ou financeiros.'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND (OLD.status IN ('cancelado','finalizado','servico_concluido','aguardando_pagamento') OR NEW.status NOT IN ('tecnico_a_caminho','em_diagnostico','servico_em_andamento','servico_concluido')) THEN RAISE EXCEPTION 'Transição de atendimento não permitida.'; END IF;
 END IF;
 IF NEW.technician_reported_cents IS DISTINCT FROM OLD.technician_reported_cents THEN
  IF NOT public.has_role(auth.uid(),'tecnico') OR OLD.technician_id IS DISTINCT FROM public.my_technician_id() THEN RAISE EXCEPTION 'Somente o técnico responsável pode informar este valor.'; END IF;
  IF OLD.financial_confirmed_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.order_financials WHERE order_id=OLD.id) THEN RAISE EXCEPTION 'Apuração financeira já confirmada; valor do técnico bloqueado.'; END IF;
  IF OLD.status IN ('cancelado','finalizado') THEN RAISE EXCEPTION 'Atendimento encerrado.'; END IF;
  IF NEW.technician_reported_cents IS NULL THEN RAISE EXCEPTION 'Informe um valor válido.'; END IF;
  NEW.technician_reported_at:=now(); NEW.technician_reported_by:=auth.uid();
  SELECT full_name INTO NEW.technician_reported_name FROM public.profiles WHERE id=auth.uid();
 ELSE
  NEW.technician_reported_at:=OLD.technician_reported_at; NEW.technician_reported_by:=OLD.technician_reported_by; NEW.technician_reported_name:=OLD.technician_reported_name;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_a_guard_technician_order BEFORE UPDATE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.guard_technician_order_update();
CREATE OR REPLACE FUNCTION public.audit_technician_reported_value() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.technician_reported_cents IS DISTINCT FROM OLD.technician_reported_cents THEN
 INSERT INTO public.service_order_events(order_id,event_type,description,actor_user_id,actor_name) VALUES(NEW.id,'valor_tecnico','Valor informado pelo técnico: '||coalesce(OLD.technician_reported_cents::text,'não informado')||' → '||NEW.technician_reported_cents||' centavos. Sem registro de recebimento.',NEW.technician_reported_by,NEW.technician_reported_name);
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER trg_reported_value_audit AFTER UPDATE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.audit_technician_reported_value();
CREATE OR REPLACE FUNCTION public.lock_order_financial_declaration() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.service_orders WHERE id=NEW.order_id FOR UPDATE;
 UPDATE public.service_orders SET financial_confirmed_at=coalesce(financial_confirmed_at,now()) WHERE id=NEW.order_id AND financial_confirmed_at IS NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_lock_financial_declaration BEFORE INSERT OR UPDATE ON public.order_financials FOR EACH ROW EXECUTE FUNCTION public.lock_order_financial_declaration();
CREATE OR REPLACE FUNCTION public.report_technician_value(_order uuid,_cents integer) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF _cents IS NULL OR _cents<0 THEN RAISE EXCEPTION 'Informe um valor válido.'; END IF;
 IF NOT public.has_role(auth.uid(),'tecnico') THEN RAISE EXCEPTION 'Acesso exclusivo do técnico.'; END IF;
 PERFORM 1 FROM public.service_orders WHERE id=_order AND technician_id=public.my_technician_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Este atendimento não é seu.'; END IF;
 IF EXISTS(SELECT 1 FROM public.service_orders WHERE id=_order AND financial_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Apuração financeira já confirmada.'; END IF;
 UPDATE public.service_orders SET technician_reported_cents=_cents WHERE id=_order;
END $$;
CREATE OR REPLACE FUNCTION public.confirm_service_composition(_order uuid,_total integer,_parts integer,_reason text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r public.split_rules; labor integer; tech integer; paid integer;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Somente administradores confirmam a composição financeira.'; END IF;
 IF _total IS NULL OR _parts IS NULL OR _total<0 OR _parts<0 OR _parts>_total THEN RAISE EXCEPTION 'Valores inválidos: peças não podem superar o total.'; END IF;
 IF length(trim(coalesce(_reason,'')))<3 THEN RAISE EXCEPTION 'Informe a justificativa da apuração.'; END IF;
 PERFORM 1 FROM public.service_orders WHERE id=_order FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Atendimento não encontrado.'; END IF;
 PERFORM public.assert_month_open((SELECT coalesce(completed_at,now())::date FROM public.service_orders WHERE id=_order));
 SELECT coalesce(sum(amount_cents),0) INTO paid FROM public.customer_payments WHERE order_id=_order AND status='ativo';
 IF _total<paid THEN RAISE EXCEPTION 'Total inferior aos recebimentos já registrados.'; END IF;
 SELECT * INTO r FROM public.split_rules WHERE kind='mao_obra' AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) ORDER BY valid_from DESC LIMIT 1;
 labor:=_total-_parts; tech:=round(labor*coalesce(r.technician_percent,50)/100);
 INSERT INTO public.order_financials(order_id,kind,total_cents,labor_cents,parts_estimated_cents,rule_technician_percent,rule_company_percent,technician_share_cents,company_share_cents,status,created_by)
 VALUES(_order,'servico',_total,labor,_parts,coalesce(r.technician_percent,50),coalesce(r.company_percent,50),tech,labor-tech,CASE WHEN paid=0 THEN 'previsto' WHEN paid>=_total THEN 'realizado' ELSE 'parcial' END,auth.uid())
 ON CONFLICT(order_id) DO UPDATE SET kind='servico',total_cents=_total,labor_cents=labor,parts_estimated_cents=_parts,rule_technician_percent=coalesce(r.technician_percent,50),rule_company_percent=coalesce(r.company_percent,50),rule_technician_fixed_cents=NULL,rule_company_fixed_cents=NULL,technician_share_cents=tech,company_share_cents=labor-tech,status=CASE WHEN paid=0 THEN 'previsto' WHEN paid>=_total THEN 'realizado' ELSE 'parcial' END;
 INSERT INTO public.service_order_events(order_id,event_type,description,actor_user_id,actor_name) SELECT _order,'apuracao_financeira','Composição confirmada pelo administrador: total '||_total||' centavos; peças '||_parts||' centavos. Justificativa: '||trim(_reason),auth.uid(),full_name FROM public.profiles WHERE id=auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.report_technician_value(uuid,integer),public.confirm_service_composition(uuid,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.report_technician_value(uuid,integer),public.confirm_service_composition(uuid,integer,integer,text) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_technician_order_update(),public.audit_technician_reported_value(),public.lock_order_financial_declaration() FROM PUBLIC,anon,authenticated;