-- Integration regression. Run as a privileged test connection; always rolls back.
-- Uses only explicitly identified fictional records, never an existing OS/customer.
BEGIN;
DO $$
DECLARE admin_id uuid; tech_user uuid; tech_id uuid; cid uuid := 'fffe0000-0000-4000-8000-000000000001';
 oid uuid := 'fffe0000-0000-4000-8000-000000000002'; nid uuid; expected timestamptz; details jsonb; denied boolean; n public.warranty_notes; f public.order_financials;
BEGIN
 SELECT p.id INTO admin_id FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id WHERE p.active AND r.role='admin' ORDER BY p.id LIMIT 1;
 SELECT t.id,t.profile_id INTO tech_id,tech_user FROM public.technicians t JOIN public.user_roles r ON r.user_id=t.profile_id WHERE t.active AND r.role='tecnico' LIMIT 1;
 IF admin_id IS NULL OR tech_user IS NULL THEN RAISE EXCEPTION 'Test requires existing active admin and technician identities.'; END IF;
 PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
 INSERT INTO public.customers(id,full_name,phone) VALUES(cid,'Cliente FICTÍCIO correção rollback','85999999999');
 INSERT INTO public.service_orders(id,code,customer_id,technician_id,reported_problem,status,completed_at,technician_reported_cents,technician_reported_parts,offered_warranty_days)
 VALUES(oid,'TEST-ROLLBACK-CORRECAO',cid,tech_id,'Serviço fictício','finalizado',now(),50000,'[{"description":"Bomba original","cents":20000}]',90);
 INSERT INTO public.order_financials(order_id,kind,total_cents,labor_cents,parts_estimated_cents,rule_technician_percent,rule_company_percent,technician_share_cents,company_share_cents,status)
 VALUES(oid,'servico',50000,30000,20000,50,50,15000,15000,'previsto');
 nid:=public.issue_warranty_note(oid,'Serviço original','Pix',1,90,current_date,'Original');
 SELECT updated_at INTO expected FROM public.service_orders WHERE id=oid;
 details:=jsonb_build_object('customerId',cid,'customerName','Cliente FICTÍCIO corrigido','customerPhone','85988888888','serviceDescription','Descrição corrigida','reportedProblem','Serviço fictício','notes','Observação corrigida','endereco','Rua fictícia','numero','123');
 PERFORM public.save_confirmed_order_correction(oid,details,60000,'[{"description":"Bomba corrigida","cents":20000}]','Teste fictício de correção',expected,120);
 SELECT * INTO f FROM public.order_financials WHERE order_id=oid;
 IF f.total_cents<>60000 OR f.parts_estimated_cents<>20000 OR f.labor_cents<>40000 OR f.technician_share_cents<>20000 OR f.company_share_cents<>20000 THEN RAISE EXCEPTION 'Incorrect recomposition.'; END IF;
 IF (SELECT status FROM public.service_orders WHERE id=oid)<>'finalizado' OR (SELECT technician_reported_cents FROM public.service_orders WHERE id=oid)<>50000 THEN RAISE EXCEPTION 'Status or original declaration was changed.'; END IF;
 IF (SELECT offered_warranty_days FROM public.service_orders WHERE id=oid)<>120 THEN RAISE EXCEPTION 'Warranty was not saved.'; END IF;
 SELECT * INTO n FROM public.warranty_notes WHERE id=nid;
 IF n.total_cents<>50000 OR (n.current_snapshot->>'total_cents')::integer<>60000 OR (n.current_snapshot->>'number')<>n.number OR jsonb_array_length(n.revision_history)<>1 OR (n.revision_history->0->>'total_cents')::integer<>50000 THEN RAISE EXCEPTION 'Original note/number/history not preserved.'; END IF;
 IF n.current_snapshot->>'service_description'<>'Descrição corrigida' OR n.current_snapshot->>'customer_name'<>'Cliente FICTÍCIO corrigido' OR n.current_snapshot->'part_names'<>'["Bomba corrigida"]'::jsonb OR (n.current_snapshot->>'warranty_days')::integer<>120 THEN RAISE EXCEPTION 'Current PDF data not refreshed.'; END IF;
 denied:=false;
 -- now() is stable within this rolled-back transaction; explicitly emulate a stale request.
 BEGIN PERFORM public.save_confirmed_order_correction(oid,details,60000,'[{"description":"Bomba corrigida","cents":20000}]','Clique com versão antiga',expected-interval '1 second',120); EXCEPTION WHEN OTHERS THEN denied:=position('foi alterada' in SQLERRM)>0; END;
 IF NOT denied THEN RAISE EXCEPTION 'Stale submit not rejected.'; END IF;
 SELECT updated_at INTO expected FROM public.service_orders WHERE id=oid;
 PERFORM public.save_confirmed_order_correction(oid,details,50000,'[{"description":"Bomba corrigida","cents":20000}]','Segunda versão fictícia',expected);
 SELECT * INTO f FROM public.order_financials WHERE order_id=oid;
 IF f.total_cents<>50000 OR f.technician_share_cents<>15000 OR f.company_share_cents<>15000 OR (SELECT count(*) FROM public.order_financials WHERE order_id=oid)<>1 THEN RAISE EXCEPTION '500/200 split or single ledger row failed.'; END IF;
 SELECT * INTO n FROM public.warranty_notes WHERE id=nid;
 IF jsonb_array_length(n.revision_history)<>2 OR (n.current_snapshot->>'total_cents')::integer<>50000 OR (n.current_snapshot->>'warranty_days')::integer<>120 THEN RAISE EXCEPTION 'Second version or blank warranty preservation failed.'; END IF;
 IF EXISTS(SELECT 1 FROM public.customer_payments WHERE order_id=oid) OR EXISTS(SELECT 1 FROM public.technician_transfers WHERE oid=ANY(order_ids)) THEN RAISE EXCEPTION 'Correction created payment or transfer.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.service_order_events WHERE order_id=oid AND event_type='correcao_administrativa') THEN RAISE EXCEPTION 'Missing correction audit.'; END IF;
 PERFORM set_config('request.jwt.claim.sub',tech_user::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF (SELECT service_description FROM public.service_orders WHERE id=oid)<>'Descrição corrigida' OR (SELECT technician_share_cents FROM public.order_financials WHERE order_id=oid)<>15000 THEN RAISE EXCEPTION 'Technician cannot read corrected own OS.'; END IF;
 denied:=false;
 BEGIN PERFORM public.save_confirmed_order_correction(oid,details,90000,'[]','Tentativa técnico',expected,120); EXCEPTION WHEN OTHERS THEN denied:=position('Somente administradores' in SQLERRM)>0; END;
 IF NOT denied THEN RAISE EXCEPTION 'Technician correction not blocked.'; END IF;
 denied:=false;
 BEGIN UPDATE public.service_orders SET service_description='Tentativa técnico' WHERE id=oid; EXCEPTION WHEN OTHERS THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Direct technician edit not blocked.'; END IF;
 EXECUTE 'RESET ROLE';
END $$;
ROLLBACK;