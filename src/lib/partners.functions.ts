import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { summarizePartnerMovements, type PartnerMovement, type PartnerMovementType } from "@/lib/partner-math";
import { distributionStatus, summarizeDistributions, type DistributionPayment, type ProfitDistribution } from "@/lib/profit-math";
import { buildMovements, computeAccountFlows, type Account, type RawFinance } from "@/lib/cashflow-math";

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

// ---------- Distribuição eventual de lucros ----------
export const listDistributions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const [d, p] = await Promise.all([
      context.supabase.from("profit_distributions").select("*").order("decision_date", { ascending: false }).order("created_at", { ascending: false }),
      context.supabase.from("profit_distribution_payments").select("*").order("paid_at", { ascending: false }),
    ]);
    dbErr(d.error);
    dbErr(p.error);
    const distributions = (d.data ?? []) as ProfitDistribution[];
    const payments = (p.data ?? []) as DistributionPayment[];
    return { distributions, payments, totals: { ...summarizeDistributions(distributions, payments), paidByPartner: Object.fromEntries(summarizeDistributions(distributions, payments).paidByPartner) } };
  });

export const createDistribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { totalCents: number; decisionDate: string; notes?: string; validatedDistributable: boolean }) => {
    const total = Math.round(Number(i.totalCents));
    if (!Number.isFinite(total) || total <= 0) throw new Error("Informe um valor válido.");
    if (total > 1_000_000_000) throw new Error("Valor muito alto.");
    if (!isDate(i.decisionDate)) throw new Error("Data da decisão inválida.");
    if (i.validatedDistributable !== true) throw new Error("Confirme que o valor foi validado como lucro distribuível.");
    return { total, decisionDate: i.decisionDate, notes: clean(i.notes) || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("profit_distributions").insert({ total_cents: data.total, decision_date: data.decisionDate, notes: data.notes, validated_distributable: true });
    dbErr(error);
    return { ok: true as const };
  });

export const voidDistribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; reason: string }) => {
    if (!isUuid(i.id)) throw new Error("Registro inválido.");
    const reason = clean(i.reason, 300);
    if (!reason) throw new Error("Informe o motivo.");
    return { id: i.id, reason };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase.from("profit_distributions").update({ status: "estornada", void_reason: data.reason }).eq("id", data.id).eq("status", "ativa").select("id").maybeSingle();
    dbErr(error);
    if (!row) throw new Error("Distribuição não encontrada ou já estornada.");
    return { ok: true as const };
  });

/** Saldo atual da conta da empresa até a data informada, calculado no servidor a partir de todas as movimentações. */
async function accountBalanceCents(supabase: any, accountId: string, untilDate: string): Promise<number> {
  const q = await Promise.all([
    supabase.from("financial_accounts").select("*").eq("id", accountId).single(),
    supabase.from("customer_payments").select("id, order_id, amount_cents, paid_at, receiver_type, receiver_technician_id, account_id, status"),
    supabase.from("other_revenues").select("id, description, amount_cents, competence_date, received_at, account_id, category_id, status"),
    supabase.from("expense_payments").select("id, expense_id, amount_cents, paid_at, account_id, status"),
    supabase.from("part_purchases").select("id, order_id, total_cents, purchased_at, buyer_type, account_id, description"),
    supabase.from("technician_transfers").select("id, technician_id, amount_cents, transfer_date, direction, account_id, status"),
    supabase.from("account_transfers").select("id, from_account_id, to_account_id, amount_cents, transfer_date, status"),
    supabase.from("partner_movements").select("id, partner_id, type, amount_cents, movement_date, account_id, status, description"),
    supabase.from("profit_distribution_payments").select("id, distribution_id, partner_id, amount_cents, paid_at, account_id, status"),
  ]);
  for (const r of q) dbErr(r.error);
  const [acc, cp, or, ep, pp, tt, at, pm, dp] = q.map((r: any) => r.data);
  const account: Account = { id: acc.id, name: acc.name, ownership: acc.ownership, openingBalanceCents: acc.opening_balance_cents, openingDate: acc.opening_date, active: acc.active };
  const raw: RawFinance = { customerPayments: cp ?? [], otherRevenues: or ?? [], expensePayments: ep ?? [], partPurchases: pp ?? [], technicianTransfers: tt ?? [], accountTransfers: at ?? [], partnerMovements: pm ?? [], distributionPayments: dp ?? [] };
  const { flows } = computeAccountFlows([account], buildMovements(raw), "2000-01-01", untilDate);
  return flows[0]?.closingCents ?? 0;
}

export const payDistribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { distributionId: string; partnerId: string; amountCents: number; paidAt: string; accountId: string; notes?: string; receiptPath?: string | null }) => {
    if (!isUuid(i.distributionId) || !isUuid(i.partnerId) || !isUuid(i.accountId)) throw new Error("Dados inválidos.");
    const amount = Math.round(Number(i.amountCents));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Informe um valor válido.");
    if (!isDate(i.paidAt)) throw new Error("Data do pagamento inválida.");
    return { distributionId: i.distributionId, partnerId: i.partnerId, amount, paidAt: i.paidAt, accountId: i.accountId, notes: clean(i.notes) || null, receiptPath: clean(i.receiptPath, 300) || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: dist, error: de } = await context.supabase.from("profit_distributions").select("*").eq("id", data.distributionId).maybeSingle();
    dbErr(de);
    if (!dist || dist.status !== "ativa") throw new Error("Distribuição não encontrada ou estornada.");
    const { data: pays, error: pe } = await context.supabase.from("profit_distribution_payments").select("*").eq("distribution_id", data.distributionId);
    dbErr(pe);
    const st = distributionStatus(dist as ProfitDistribution, (pays ?? []) as DistributionPayment[]);
    if (data.amount > st.pendingByPartner(data.partnerId)) throw new Error("O valor excede a participação pendente do sócio nesta distribuição.");
    const balance = await accountBalanceCents(context.supabase, data.accountId, data.paidAt);
    if (data.amount > balance) throw new Error("Saldo insuficiente na conta selecionada para este pagamento.");
    const { error } = await context.supabase.from("profit_distribution_payments").insert({
      distribution_id: data.distributionId,
      partner_id: data.partnerId,
      amount_cents: data.amount,
      paid_at: data.paidAt,
      account_id: data.accountId,
      notes: data.notes,
      receipt_path: data.receiptPath,
    });
    dbErr(error);
    return { ok: true as const };
  });

export const voidDistributionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; reason: string }) => {
    if (!isUuid(i.id)) throw new Error("Registro inválido.");
    const reason = clean(i.reason, 300);
    if (!reason) throw new Error("Informe o motivo.");
    return { id: i.id, reason };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase.from("profit_distribution_payments").update({ status: "estornado", void_reason: data.reason }).eq("id", data.id).eq("status", "ativo").select("id").maybeSingle();
    dbErr(error);
    if (!row) throw new Error("Pagamento não encontrado ou já estornado.");
    return { ok: true as const };
  });
