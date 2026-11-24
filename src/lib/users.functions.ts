import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidEmail, normalizeEmail, validateTechnicianEmailChange } from "@/lib/user-email";

type InviteInput = { email: string; fullName: string; role: "admin" | "tecnico"; redirectTo: string };
type UpdateEmailInput = { userId: string; email: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: InviteInput) => {
    const email = String(input.email ?? "").trim().toLowerCase();
    const fullName = String(input.fullName ?? "").trim().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mail inválido.");
    if (!fullName) throw new Error("Informe o nome.");
    if (input.role !== "admin" && input.role !== "tecnico") throw new Error("Perfil inválido.");
    return { email, fullName, role: input.role, redirectTo: String(input.redirectTo ?? "") };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso negado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.fullName },
      ...(data.redirectTo ? { redirectTo: data.redirectTo } : {}),
    });
    if (error || !invited.user) {
      console.error("invite failed", error);
      return { ok: false as const, error: "Não foi possível convidar. O e-mail já pode estar cadastrado." };
    }
    // Role assigned as the calling admin so the audit records who did it.
    const { error: roleErr } = await context.supabase.rpc("set_user_role", {
      _target: invited.user.id,
      _role: data.role,
    });
    if (roleErr) return { ok: false as const, error: roleErr.message };
    return { ok: true as const };
  });

export const updateTechnicianEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpdateEmailInput) => {
    const userId = String(input.userId ?? "").trim();
    const email = normalizeEmail(input.email);
    if (!UUID_RE.test(userId)) throw new Error("Usuário inválido.");
    if (!isValidEmail(email)) throw new Error("Informe um e-mail válido.");
    return { userId, email };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Acesso negado.");

    const [{ data: profile, error: pErr }, { data: roles, error: rErr }, { data: linkedTech }, { data: others }] =
      await Promise.all([
        context.supabase.from("profiles").select("id, email").eq("id", data.userId).maybeSingle(),
        context.supabase.from("user_roles").select("role").eq("user_id", data.userId),
        context.supabase.from("technicians").select("id, email").eq("profile_id", data.userId).maybeSingle(),
        context.supabase.from("profiles").select("email").neq("id", data.userId).not("email", "is", null),
      ]);
    if (pErr) return { ok: false as const, error: pErr.message };
    if (rErr) return { ok: false as const, error: rErr.message };
    if (!profile) return { ok: false as const, error: "Usuário não encontrado." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authRes, error: authGetErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (authGetErr || !authRes.user) {
      console.error("getUserById failed", authGetErr);
      return { ok: false as const, error: "Conta de acesso não encontrada." };
    }

    const currentAuthEmail = authRes.user.email ?? null;
    const check = validateTechnicianEmailChange({
      currentAuthEmail,
      currentProfileEmail: profile.email,
      ...(linkedTech ? { linkedTechnicianEmail: linkedTech.email } : {}),
      nextEmail: data.email,
      targetRoles: (roles ?? []).map((r) => r.role),
      otherEmails: (others ?? []).map((o) => o.email ?? "").filter(Boolean),
    });
    if (!check.ok) return check;

    const authNeedsUpdate = !currentAuthEmail || normalizeEmail(currentAuthEmail) !== check.email;
    if (authNeedsUpdate) {
      const { error: updAuthErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        email: check.email,
      });
      if (updAuthErr) {
        console.error("updateUserById email failed", updAuthErr);
        const msg = (updAuthErr.message ?? "").toLowerCase();
        if (msg.includes("already") || msg.includes("exists") || msg.includes("duplicate") || msg.includes("registered")) {
          return { ok: false as const, error: "Este e-mail já está cadastrado para outro usuário." };
        }
        return { ok: false as const, error: "Não foi possível atualizar o e-mail de acesso." };
      }
    }

    const { error: profUpdErr } = await context.supabase
      .from("profiles")
      .update({ email: check.email })
      .eq("id", data.userId);
    if (profUpdErr) {
      if (authNeedsUpdate && currentAuthEmail) {
        await supabaseAdmin.auth.admin.updateUserById(data.userId, { email: currentAuthEmail });
      }
      return { ok: false as const, error: "Não foi possível sincronizar o perfil. A alteração foi desfeita." };
    }

    if (linkedTech) {
      const { error: techUpdErr } = await context.supabase
        .from("technicians")
        .update({ email: check.email })
        .eq("id", linkedTech.id);
      if (techUpdErr) {
        await context.supabase.from("profiles").update({ email: profile.email }).eq("id", data.userId);
        if (authNeedsUpdate && currentAuthEmail) {
          await supabaseAdmin.auth.admin.updateUserById(data.userId, { email: currentAuthEmail });
        }
        return { ok: false as const, error: "Não foi possível sincronizar o cadastro do técnico. A alteração foi desfeita." };
      }
    }

    await supabaseAdmin.from("permission_audit").insert({
      target_user_id: data.userId,
      actor_user_id: context.userId,
      action: "email_updated",
      old_value: currentAuthEmail ?? profile.email,
      new_value: check.email,
    });

    return { ok: true as const, email: check.email };
  });
