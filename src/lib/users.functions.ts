import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type InviteInput = { email: string; fullName: string; role: "admin" | "tecnico"; redirectTo: string };

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
