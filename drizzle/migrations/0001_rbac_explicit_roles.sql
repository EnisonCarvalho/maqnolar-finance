-- Profiles: email + active flag
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
UPDATE public.profiles p SET email = u.email FROM auth.users u WHERE u.id = p.id AND p.email IS NULL;

-- Roles only count for active users
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
    WHERE r.user_id = _user_id AND r.role = _role AND p.active
  )
$$;

-- New users: profile only, never a role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

-- Audit log of permission changes
CREATE TABLE public.permission_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  actor_user_id uuid,
  action text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permission_audit TO authenticated;
GRANT ALL ON public.permission_audit TO service_role;
ALTER TABLE public.permission_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit" ON public.permission_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Count active admins (internal)
CREATE OR REPLACE FUNCTION public.active_admin_count()
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
  WHERE r.role = 'admin' AND p.active
$$;
REVOKE EXECUTE ON FUNCTION public.active_admin_count() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.active_admin_count() > 0
$$;
GRANT EXECUTE ON FUNCTION public.admin_exists() TO authenticated;

-- Triggers: audit + last-admin protection
CREATE OR REPLACE FUNCTION public.audit_user_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.permission_audit (target_user_id, actor_user_id, action, new_value)
    VALUES (NEW.user_id, auth.uid(), 'role_added', NEW.role::text);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin' AND public.active_admin_count() = 0
       AND EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.user_id AND active) THEN
      RAISE EXCEPTION 'Não é possível remover o último administrador ativo.';
    END IF;
    INSERT INTO public.permission_audit (target_user_id, actor_user_id, action, old_value)
    VALUES (OLD.user_id, auth.uid(), 'role_removed', OLD.role::text);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER user_roles_audit AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles();

CREATE OR REPLACE FUNCTION public.audit_profile_active()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.active IS DISTINCT FROM OLD.active THEN
    IF NOT NEW.active AND public.active_admin_count() = 0 THEN
      RAISE EXCEPTION 'Não é possível desativar o último administrador ativo.';
    END IF;
    INSERT INTO public.permission_audit (target_user_id, actor_user_id, action, old_value, new_value)
    VALUES (NEW.id, auth.uid(), CASE WHEN NEW.active THEN 'user_activated' ELSE 'user_deactivated' END,
            OLD.active::text, NEW.active::text);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_active_audit AFTER UPDATE OF active ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profile_active();

-- Users can't change their own active flag / email through the self-update policy
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.active := OLD.active;
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_guard BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_update();

-- Admin-only: set a user's single role (admin | tecnico)
CREATE OR REPLACE FUNCTION public.set_user_role(_target uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _target) THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target AND role = _role) THEN RETURN; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_target, _role);
  DELETE FROM public.user_roles WHERE user_id = _target AND role <> _role;
END $$;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_user_active(_target uuid, _active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  UPDATE public.profiles SET active = _active WHERE id = _target;
END $$;
GRANT EXECUTE ON FUNCTION public.set_user_active(uuid, boolean) TO authenticated;

-- One-time bootstrap: only while no active admin exists
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bootstrap_first_admin'));
  IF public.active_admin_count() > 0 THEN RAISE EXCEPTION 'Já existe um administrador.'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin') ON CONFLICT DO NOTHING;
  INSERT INTO public.permission_audit (target_user_id, actor_user_id, action, new_value)
  VALUES (auth.uid(), auth.uid(), 'bootstrap_first_admin', 'admin');
END $$;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin() TO authenticated;