import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLATFORMS = ["meta_ads", "google_ads", "outra"];
const STATUSES = ["planejada", "ativa", "pausada", "encerrada"];
const clean = (s: unknown, max = 500) => String(s ?? "").trim().slice(0, max);
const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Acesso negado: somente administradores.");
}
function dbErr(e: { message: string } | null) {
  if (e) throw new Error(e.message.replace(/^.*?ERROR:\s*/, ""));
}

type CampaignInput = { id?: string | null; name: string; platform: string; platformLabel?: string; externalCode?: string; serviceId?: string | null; serviceLabel?: string; startDate: string; endDate?: string | null; status: string; plannedBudgetCents: number; notes?: string };

export const saveCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: CampaignInput) => {
    const name = clean(i.name, 160);
    if (!name) throw new Error("Informe o nome da campanha.");
    if (!PLATFORMS.includes(i.platform)) throw new Error("Plataforma inválida.");
    if (!STATUSES.includes(i.status)) throw new Error("Status inválido.");
    if (!isDate(i.startDate)) throw new Error("Data de início inválida.");
    const endDate = i.endDate ? (isDate(i.endDate) ? i.endDate : (() => { throw new Error("Data de término inválida."); })()) : null;
    if (endDate && endDate < i.startDate) throw new Error("O término não pode ser antes do início.");
    const budget = Math.round(Number(i.plannedBudgetCents));
    if (!Number.isFinite(budget) || budget < 0 || budget > 1_000_000_000) throw new Error("Orçamento inválido.");
    return {
      id: isUuid(i.id) ? i.id : null, name, platform: i.platform,
      platformLabel: i.platform === "outra" ? clean(i.platformLabel, 80) || null : null,
      externalCode: clean(i.externalCode, 120) || null, serviceId: isUuid(i.serviceId) ? i.serviceId : null,
      serviceLabel: clean(i.serviceLabel, 160) || null, startDate: i.startDate, endDate, status: i.status, budget, notes: clean(i.notes, 1000) || null,
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const row = { name: data.name, platform: data.platform, platform_label: data.platformLabel, external_code: data.externalCode, service_id: data.serviceId, service_label: data.serviceLabel, start_date: data.startDate, end_date: data.endDate, status: data.status, planned_budget_cents: data.budget, notes: data.notes };
    const { error } = data.id ? await context.supabase.from("campaigns").update(row).eq("id", data.id) : await context.supabase.from("campaigns").insert(row);
    dbErr(error);
    return { ok: true as const };
  });

export const setCampaignStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; status: string }) => {
    if (!isUuid(i.id) || !STATUSES.includes(i.status)) throw new Error("Dados inválidos.");
    return i;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const patch: { status: string; end_date?: string } = { status: data.status };
    if (data.status === "encerrada") {
      const { data: c } = await context.supabase.from("campaigns").select("end_date, start_date").eq("id", data.id).maybeSingle();
      const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
      if (c && !c.end_date) patch.end_date = today < c.start_date ? c.start_date : today;
    }
    const { error } = await context.supabase.from("campaigns").update(patch).eq("id", data.id);
    dbErr(error);
    return { ok: true as const };
  });

export const allocateExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { campaignId: string; expenseId: string; amountCents: number; notes?: string }) => {
    if (!isUuid(i.campaignId) || !isUuid(i.expenseId)) throw new Error("Selecione a despesa.");
    const amount = Math.round(Number(i.amountCents));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Informe um valor válido.");
    return { campaignId: i.campaignId, expenseId: i.expenseId, amount, notes: clean(i.notes, 300) || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("campaign_expense_allocations").insert({ campaign_id: data.campaignId, expense_id: data.expenseId, amount_cents: data.amount, notes: data.notes });
    if (error?.message.includes("campaign_alloc_unique_active")) throw new Error("Essa despesa já está vinculada a esta campanha.");
    dbErr(error);
    return { ok: true as const };
  });

export const removeAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; reason: string }) => {
    if (!isUuid(i.id)) throw new Error("Vínculo inválido.");
    const reason = clean(i.reason, 300);
    if (!reason) throw new Error("Informe o motivo.");
    return { id: i.id, reason };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase.from("campaign_expense_allocations").update({ status: "removido", remove_reason: data.reason }).eq("id", data.id).eq("status", "ativo").select("id").maybeSingle();
    dbErr(error);
    if (!row) throw new Error("Vínculo não encontrado ou já removido.");
    return { ok: true as const };
  });
