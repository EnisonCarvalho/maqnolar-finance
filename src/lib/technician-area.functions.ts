import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canLinkTechnicianAccount } from "@/lib/technician-link";

function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
}

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Acesso negado: somente administradores.");
}

/** Lista contas de usuário ativas para o administrador vincular a um técnico. */
export const listLinkableUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const [{ data: profiles, error: pErr }, { data: techs, error: tErr }] = await Promise.all([
      context.supabase.from("profiles").select("id, full_name, email, active").eq("active", true).order("full_name"),
      context.supabase.from("technicians").select("id, full_name, profile_id"),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (tErr) throw new Error(tErr.message);
    const linkedByUser = new Map<string, string>();
    for (const t of techs ?? []) if (t.profile_id) linkedByUser.set(t.profile_id, t.full_name);
    const nameByUser = new Map((profiles ?? []).map((p: any) => [p.id as string, p.full_name as string]));
    return {
      users: (profiles ?? []).map((p: any) => ({
        id: p.id as string,
        fullName: p.full_name as string,
        email: (p.email as string | null) ?? "",
        linkedTechnicianName: linkedByUser.get(p.id) ?? null,
      })),
      links: (techs ?? [])
        .filter((t: any) => t.profile_id)
        .map((t: any) => ({
          technicianId: t.id as string,
          userId: t.profile_id as string,
          userName: nameByUser.get(t.profile_id) ?? "Conta vinculada",
        })),
    };
  });

/**
 * Vincula uma conta de usuário existente ao cadastro de um técnico.
 * Somente administradores; o técnico nunca se vincula sozinho.
 * Se a conta não tiver papel algum, recebe o papel "tecnico"; papéis de
 * administrador (Enison/Jonathan) nunca são alterados aqui.
 */
export const linkTechnicianAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { technicianId: string; userId: string }) => {
    if (!isUuid(input.technicianId)) throw new Error("Técnico inválido.");
    if (!isUuid(input.userId)) throw new Error("Usuário inválido.");
    return { technicianId: input.technicianId, userId: input.userId };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const [{ data: profile }, { data: technician }, { data: userLink }] = await Promise.all([
      context.supabase.from("profiles").select("id, active").eq("id", data.userId).maybeSingle(),
      context.supabase.from("technicians").select("id, full_name, profile_id").eq("id", data.technicianId).maybeSingle(),
      context.supabase.from("technicians").select("id").eq("profile_id", data.userId).maybeSingle(),
    ]);
    if (!technician) throw new Error("Técnico não encontrado.");

    const check = canLinkTechnicianAccount({
      userExists: Boolean(profile),
      userActive: Boolean(profile?.active),
      userLinkedTechnicianId: userLink?.id ?? null,
      technicianLinkedUserId: technician.profile_id,
    });
    if (!check.ok) throw new Error(check.error);

    const { error } = await context.supabase
      .from("technicians")
      .update({ profile_id: data.userId })
      .eq("id", data.technicianId);
    if (error) throw new Error(error.message);

    // Papel "tecnico" só é atribuído se a conta ainda não tiver papel (nunca altera admins).
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", data.userId);
    if ((roles ?? []).length === 0) {
      const { error: roleErr } = await context.supabase.rpc("set_user_role", { _target: data.userId, _role: "tecnico" });
      if (roleErr) throw new Error(roleErr.message);
    }
    return { ok: true as const };
  });

/** Remove o vínculo conta ↔ técnico (somente administradores). */
export const unlinkTechnicianAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { technicianId: string }) => {
    if (!isUuid(input.technicianId)) throw new Error("Técnico inválido.");
    return { technicianId: input.technicianId };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: technician } = await context.supabase
      .from("technicians")
      .select("id, profile_id")
      .eq("id", data.technicianId)
      .maybeSingle();
    if (!technician) throw new Error("Técnico não encontrado.");
    if (!technician.profile_id) throw new Error("Este técnico não possui conta vinculada.");
    const { error } = await context.supabase
      .from("technicians")
      .update({ profile_id: null })
      .eq("id", data.technicianId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
