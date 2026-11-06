import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { summarizePartnerMovements, type PartnerMovement, type PartnerMovementType } from "@/lib/partner-math";

const TYPES: PartnerMovementType[] = ["aporte", "emprestimo_socio", "devolucao_emprestimo", "retirada"];

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Acesso negado: somente administradores.");
}
const clean = (s: unknown, max = 500) => String(s ?? "").trim().slice(0, max);
const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
function dbErr(e: { message: string } | null) {
  if (e) throw new Error(e.message.replace(/^.*?ERROR:\s*/, ""));
}

/** Sócios = administradores ativos (Enison e Jonathan). */
export const listPartners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: roles, error: re } = await context.supabase.from("user_roles").select("user_id").eq("role", "admin");
    dbErr(re);
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (!ids.length) return { partners: [] as { id: string; full_name: string }[] };
    const { data: profiles, error: pe } = await context.supabase.from("profiles").select("id, full_name").in("id", ids).eq("active", true).order("full_name");
    dbErr(pe);
    return { partners: (profiles ?? []) as { id: string; full_name: string }[] };
  });

export const listPartnerMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { start?: string; end?: string; partnerId?: string | null; type?: string | null; accountId?: string | null }) => ({
    start: isDate(i.start) ? i.start : null,
    end: isDate(i.end) ? i.end : null,
    partnerId: isUuid(i.partnerId) ? i.partnerId : null,
    type: TYPES.includes(i.type as PartnerMovementType) ? (i.type as PartnerMovementType) : null,
    accountId: isUuid(i.accountId) ? i.accountId : null,
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    let q = context.supabase.from("partner_movements").select("*").order("movement_date", { ascending: false }).order("created_at", { ascending: false });
    if (data.start) q = q.gte("movement_date", data.start);
    if (data.end) q = q.lte("movement_date", data.end);
    if (data.partnerId) q = q.eq("partner_id", data.partnerId);
    if (data.type) q = q.eq("type", data.type);
    if (data.accountId) q = q.eq("account_id", data.accountId);
    const { data: rows, error } = await q;
    dbErr(error);
    const movements = (rows ?? []) as PartnerMovement[];
    // Resumos por sócio consideram TODAS as movimentações ativas (não só o filtro da tela)
    const { data: all, error: ae } = await context.supabase.from("partner_movements").select("partner_id, type, amount_cents, status");
    dbErr(ae);
    return { movements, summaries: summarizePartnerMovements((all ?? []) as PartnerMovement[]) };
  });

export const createPartnerMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { partnerId: string; type: string; amountCents: number; date: string; accountId: string; description: string; notes?: string; receiptPath?: string | null }) => {
    if (!isUuid(i.partnerId)) throw new Error("Selecione o sócio.");
    if (!TYPES.includes(i.type as PartnerMovementType)) throw new Error("Tipo de movimentação inválido.");
    if (!isUuid(i.accountId)) throw new Error("Selecione a conta da empresa.");
    const description = clean(i.description, 200);
    if (!description) throw new Error("Informe a descrição.");
    const amount = Math.round(Number(i.amountCents));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Informe um valor válido.");
    if (amount > 1_000_000_000) throw new Error("Valor muito alto.");
    if (!isDate(i.date)) throw new Error("Data inválida.");
    return { partnerId: i.partnerId, type: i.type as PartnerMovementType, amount, date: i.date, accountId: i.accountId, description, notes: clean(i.notes) || null, receiptPath: clean(i.receiptPath, 300) || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("partner_movements").insert({
      partner_id: data.partnerId,
      type: data.type,
      amount_cents: data.amount,
      movement_date: data.date,
      account_id: data.accountId,
      description: data.description,
      notes: data.notes,
      receipt_path: data.receiptPath,
    });
    dbErr(error);
    return { ok: true as const };
  });

export const voidPartnerMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; reason: string }) => {
    if (!isUuid(i.id)) throw new Error("Registro inválido.");
    const reason = clean(i.reason, 300);
    if (!reason) throw new Error("Informe o motivo.");
    return { id: i.id, reason };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase.from("partner_movements").update({ status: "estornado", void_reason: data.reason }).eq("id", data.id).eq("status", "ativo").select("id").maybeSingle();
    dbErr(error);
    if (!row) throw new Error("Movimentação não encontrada ou já estornada.");
    return { ok: true as const };
  });
