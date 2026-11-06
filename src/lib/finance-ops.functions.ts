import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildMovements, computeAccountFlows, computeIndicators, nextDueDate, type Account } from "@/lib/cashflow-math";

const METHODS = ["pix", "dinheiro", "credito", "debito", "transferencia", "outro"];

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Acesso negado: somente administradores.");
}
const clean = (s: unknown, max = 500) => String(s ?? "").trim().slice(0, max);
const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const optUuid = (s: unknown) => (isUuid(s) ? s : null);
function cents(v: unknown, allowZero = false): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) throw new Error("Informe um valor válido.");
  if (n > 1_000_000_000) throw new Error("Valor muito alto.");
  return n;
}
function reqDate(v: unknown, label: string): string {
  if (!isDate(v)) throw new Error(`${label} inválida.`);
  return v;
}
function dbErr(e: { message: string } | null) {
  if (e) throw new Error(e.message.replace(/^.*?ERROR:\s*/, ""));
}
const reason = (r: unknown) => {
  const s = clean(r, 300);
  if (!s) throw new Error("Informe o motivo.");
  return s;
};

// ---------- Contas ----------
export const saveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id?: string | null; name: string; institution?: string; holder?: string; accountType: string; ownership: string; openingBalanceCents: number; openingDate: string; active: boolean }) => {
    const name = clean(i.name, 120);
    if (!name) throw new Error("Informe o nome da conta.");
    if (!["banco", "carteira_digital", "caixa", "outro"].includes(i.accountType)) throw new Error("Tipo de conta inválido.");
    if (!["empresa", "socio"].includes(i.ownership)) throw new Error("Classificação inválida.");
    const ob = Math.round(Number(i.openingBalanceCents));
    if (!Number.isFinite(ob)) throw new Error("Saldo inicial inválido.");
    return { id: optUuid(i.id), name, institution: clean(i.institution, 120) || null, holder: clean(i.holder, 120) || null, accountType: i.accountType, ownership: i.ownership, ob, openingDate: reqDate(i.openingDate, "Data do saldo inicial"), active: Boolean(i.active) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const row = { name: data.name, institution: data.institution, holder: data.holder, account_type: data.accountType, ownership: data.ownership, opening_balance_cents: data.ob, opening_date: data.openingDate, active: data.active };
    const { error } = data.id
      ? await context.supabase.from("financial_accounts").update(row).eq("id", data.id)
      : await context.supabase.from("financial_accounts").insert(row);
    dbErr(error);
    return { ok: true as const };
  });

export const createAccountTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { fromAccountId: string; toAccountId: string; amountCents: number; date: string; notes?: string }) => {
    if (!isUuid(i.fromAccountId) || !isUuid(i.toAccountId)) throw new Error("Selecione as contas.");
    if (i.fromAccountId === i.toAccountId) throw new Error("Escolha contas diferentes.");
    return { from: i.fromAccountId, to: i.toAccountId, amount: cents(i.amountCents), date: reqDate(i.date, "Data"), notes: clean(i.notes) || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("account_transfers").insert({ from_account_id: data.from, to_account_id: data.to, amount_cents: data.amount, transfer_date: data.date, notes: data.notes });
    dbErr(error);
    return { ok: true as const };
  });

// ---------- Categorias ----------
export const saveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id?: string | null; name: string; kind: string; sortOrder?: number; active: boolean }) => {
    const name = clean(i.name, 80);
    if (!name) throw new Error("Informe o nome da categoria.");
    if (!["receita", "despesa"].includes(i.kind)) throw new Error("Tipo inválido.");
    return { id: optUuid(i.id), name, kind: i.kind, sortOrder: Math.round(Number(i.sortOrder ?? 100)) || 100, active: Boolean(i.active) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const row = { name: data.name, kind: data.kind, sort_order: data.sortOrder, active: data.active };
    const { error } = data.id ? await context.supabase.from("finance_categories").update(row).eq("id", data.id) : await context.supabase.from("finance_categories").insert(row);
    if (error?.message.includes("duplicate")) throw new Error("Já existe uma categoria com esse nome.");
    dbErr(error);
    return { ok: true as const };
  });

// ---------- Receitas avulsas ----------
export const createRevenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { description: string; categoryId?: string | null; amountCents: number; competenceDate: string; receivedAt?: string | null; method?: string | null; accountId?: string | null; origin?: string; notes?: string; receiptPath?: string | null }) => {
    const description = clean(i.description, 200);
    if (!description) throw new Error("Informe a descrição.");
    const receivedAt = i.receivedAt ? reqDate(i.receivedAt, "Data do recebimento") : null;
    if (receivedAt && !isUuid(i.accountId)) throw new Error("Selecione a conta que recebeu.");
    if (receivedAt && !METHODS.includes(String(i.method))) throw new Error("Selecione a forma de pagamento.");
    return { description, categoryId: optUuid(i.categoryId), amount: cents(i.amountCents), competence: reqDate(i.competenceDate, "Data de competência"), receivedAt, method: receivedAt ? i.method! : null, accountId: receivedAt ? i.accountId! : optUuid(i.accountId), origin: clean(i.origin, 120) || null, notes: clean(i.notes) || null, receiptPath: clean(i.receiptPath, 300) || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("other_revenues").insert({ description: data.description, category_id: data.categoryId, amount_cents: data.amount, competence_date: data.competence, received_at: data.receivedAt, method: data.method, account_id: data.accountId, origin: data.origin, notes: data.notes, receipt_path: data.receiptPath });
    dbErr(error);
    return { ok: true as const };
  });

export const receiveRevenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; receivedAt: string; method: string; accountId: string }) => {
    if (!isUuid(i.id) || !isUuid(i.accountId)) throw new Error("Dados inválidos.");
    if (!METHODS.includes(i.method)) throw new Error("Forma inválida.");
    return { id: i.id, receivedAt: reqDate(i.receivedAt, "Data"), method: i.method, accountId: i.accountId };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase.from("other_revenues").update({ received_at: data.receivedAt, method: data.method, account_id: data.accountId }).eq("id", data.id).is("received_at", null).eq("status", "ativo").select("id").maybeSingle();
    dbErr(error);
    if (!row) throw new Error("Receita não encontrada ou já recebida.");
    return { ok: true as const };
  });

export const voidRevenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; reason: string }) => ({ id: isUuid(i.id) ? i.id : (() => { throw new Error("Registro inválido."); })(), reason: reason(i.reason) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase.from("other_revenues").update({ status: "estornado", void_reason: data.reason }).eq("id", data.id).eq("status", "ativo").select("id").maybeSingle();
    dbErr(error);
    if (!row) throw new Error("Receita não encontrada ou já estornada.");
    return { ok: true as const };
  });

// ---------- Despesas ----------
type ExpenseInput = { id?: string | null; description: string; categoryId?: string | null; amountCents: number; competenceDate: string; dueDate: string; plannedAccountId?: string | null; responsible?: string; notes?: string; receiptPath?: string | null; payNow?: { paidAt: string; method: string; accountId: string } | null };
export const saveExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: ExpenseInput) => {
    const description = clean(i.description, 200);
    if (!description) throw new Error("Informe a descrição.");
    let payNow: ExpenseInput["payNow"] = null;
    if (i.payNow) {
      if (!isUuid(i.payNow.accountId)) throw new Error("Selecione a conta utilizada.");
      if (!METHODS.includes(i.payNow.method)) throw new Error("Forma de pagamento inválida.");
      payNow = { paidAt: reqDate(i.payNow.paidAt, "Data do pagamento"), method: i.payNow.method, accountId: i.payNow.accountId };
    }
    return { id: optUuid(i.id), description, categoryId: optUuid(i.categoryId), amount: cents(i.amountCents), competence: reqDate(i.competenceDate, "Data de competência"), due: reqDate(i.dueDate, "Data de vencimento"), planned: optUuid(i.plannedAccountId), responsible: clean(i.responsible, 120) || null, notes: clean(i.notes) || null, receiptPath: clean(i.receiptPath, 300) || null, payNow };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const row: any = { description: data.description, category_id: data.categoryId, amount_cents: data.amount, competence_date: data.competence, due_date: data.due, planned_account_id: data.planned, responsible: data.responsible, notes: data.notes };
    if (data.receiptPath) row["receipt_path"] = data.receiptPath;
    if (data.id) {
      const { error } = await context.supabase.from("expenses").update(row).eq("id", data.id).neq("status", "cancelada");
      dbErr(error);
      return { ok: true as const };
    }
    const { data: created, error } = await context.supabase.from("expenses").insert(row).select("id").single();
    dbErr(error);
    if (data.payNow) {
      const { error: pe } = await context.supabase.from("expense_payments").insert({ expense_id: created!.id, amount_cents: data.amount, paid_at: data.payNow.paidAt, method: data.payNow.method, account_id: data.payNow.accountId, receipt_path: data.receiptPath });
      if (pe) throw new Error(`Despesa criada como pendente, mas o pagamento não foi registrado: ${pe.message.replace(/^.*?ERROR:\s*/, "")}`);
    }
    return { ok: true as const };
  });

export const payExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { expenseId: string; amountCents: number; paidAt: string; method: string; accountId: string; notes?: string; receiptPath?: string | null }) => {
    if (!isUuid(i.expenseId) || !isUuid(i.accountId)) throw new Error("Selecione a conta utilizada.");
    if (!METHODS.includes(i.method)) throw new Error("Forma inválida.");
    return { expenseId: i.expenseId, amount: cents(i.amountCents), paidAt: reqDate(i.paidAt, "Data do pagamento"), method: i.method, accountId: i.accountId, notes: clean(i.notes) || null, receiptPath: clean(i.receiptPath, 300) || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("expense_payments").insert({ expense_id: data.expenseId, amount_cents: data.amount, paid_at: data.paidAt, method: data.method, account_id: data.accountId, notes: data.notes, receipt_path: data.receiptPath });
    dbErr(error);
    return { ok: true as const };
  });

export const voidExpensePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; reason: string }) => ({ id: isUuid(i.id) ? i.id : (() => { throw new Error("Registro inválido."); })(), reason: reason(i.reason) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase.from("expense_payments").update({ status: "estornado", void_reason: data.reason }).eq("id", data.id).eq("status", "ativo").select("id").maybeSingle();
    dbErr(error);
    if (!row) throw new Error("Pagamento não encontrado ou já estornado.");
    return { ok: true as const };
  });

export const cancelExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; reason: string }) => ({ id: isUuid(i.id) ? i.id : (() => { throw new Error("Registro inválido."); })(), reason: reason(i.reason) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("expenses").update({ status: "cancelada", cancel_reason: data.reason }).eq("id", data.id);
    dbErr(error);
    return { ok: true as const };
  });

// ---------- Recorrências ----------
export const saveRecurring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id?: string | null; description: string; categoryId?: string | null; amountCents: number; frequency: string; nextDueDate: string; accountId?: string | null; responsible?: string; status: string; notes?: string }) => {
    const description = clean(i.description, 200);
    if (!description) throw new Error("Informe a descrição.");
    if (!["semanal", "mensal", "anual"].includes(i.frequency)) throw new Error("Frequência inválida.");
    if (!["ativa", "pausada", "encerrada"].includes(i.status)) throw new Error("Status inválido.");
    return { id: optUuid(i.id), description, categoryId: optUuid(i.categoryId), amount: cents(i.amountCents), frequency: i.frequency, next: reqDate(i.nextDueDate, "Próximo vencimento"), accountId: optUuid(i.accountId), responsible: clean(i.responsible, 120) || null, status: i.status, notes: clean(i.notes) || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const row = { description: data.description, category_id: data.categoryId, amount_cents: data.amount, frequency: data.frequency, next_due_date: data.next, account_id: data.accountId, responsible: data.responsible, status: data.status, notes: data.notes };
    const { error } = data.id ? await context.supabase.from("recurring_expenses").update(row).eq("id", data.id) : await context.supabase.from("recurring_expenses").insert(row);
    dbErr(error);
    return { ok: true as const };
  });

/** Gera as obrigações (despesas pendentes) com vencimento até a data limite. Nunca registra pagamento. */
export const generateRecurring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { untilDate: string }) => ({ until: reqDate(i.untilDate, "Data limite") }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: recs, error } = await context.supabase.from("recurring_expenses").select("*").eq("status", "ativa").lte("next_due_date", data.until);
    dbErr(error);
    let created = 0;
    for (const r of recs ?? []) {
      let due: string = r.next_due_date;
      let guard = 0;
      while (due <= data.until && guard < 60) {
        guard += 1;
        const { error: ie } = await context.supabase.from("expenses").insert({ description: r.description, category_id: r.category_id, amount_cents: r.amount_cents, competence_date: due, due_date: due, planned_account_id: r.account_id, responsible: r.responsible, recurring_id: r.id, notes: "Gerada pela recorrência" });
        if (ie && !ie.message.includes("duplicate")) throw new Error(ie.message.replace(/^.*?ERROR:\s*/, ""));
        if (!ie) created += 1;
        due = nextDueDate(due, r.frequency as "semanal" | "mensal" | "anual");
      }
      const { error: ue } = await context.supabase.from("recurring_expenses").update({ next_due_date: due }).eq("id", r.id);
      dbErr(ue);
    }
    return { created };
  });

// ---------- Visão consolidada ----------
async function loadAll(supabase: any) {
  const q = await Promise.all([
    supabase.from("financial_accounts").select("*").order("name"),
    supabase.from("customer_payments").select("id, order_id, amount_cents, paid_at, receiver_type, receiver_technician_id, account_id, status, service_orders(code)"),
    supabase.from("other_revenues").select("id, description, amount_cents, competence_date, received_at, account_id, category_id, status"),
    supabase.from("expense_payments").select("id, expense_id, amount_cents, paid_at, account_id, status, expenses(description, category_id)"),
    supabase.from("part_purchases").select("id, order_id, total_cents, purchased_at, buyer_type, account_id, description"),
    supabase.from("technician_transfers").select("id, technician_id, amount_cents, transfer_date, direction, account_id, status"),
    supabase.from("account_transfers").select("id, from_account_id, to_account_id, amount_cents, transfer_date, status"),
    supabase.from("order_financials").select("order_id, total_cents, company_share_cents, technician_share_cents, parts_estimated_cents, labor_cents, kind, created_at, service_orders(status, completed_at, opened_at)"),
    supabase.from("expenses").select("id, amount_cents, competence_date, due_date, status"),
    supabase.from("partner_movements").select("id, partner_id, type, amount_cents, movement_date, account_id, status, description"),
  ]);
  for (const r of q) dbErr(r.error);
  const [acc, cp, or, ep, pp, tt, at, of, ex, pm] = q.map((r: any) => r.data ?? []);
  const paidByExpense = new Map<string, number>();
  for (const p of ep) if (p.status === "ativo") paidByExpense.set(p.expense_id, (paidByExpense.get(p.expense_id) ?? 0) + p.amount_cents);
  return {
    accounts: acc as any[],
    raw: {
      customerPayments: cp.map((p: any) => ({ ...p, code: p.service_orders?.code })),
      otherRevenues: or,
      expensePayments: ep.map((p: any) => ({ ...p, description: p.expenses?.description, category_id: p.expenses?.category_id })),
      partPurchases: pp,
      technicianTransfers: tt,
      accountTransfers: at,
      partnerMovements: pm,
    },
    orders: of.map((f: any) => ({
      orderId: f.order_id,
      // Competência do atendimento: conclusão; se ainda não concluído, abertura.
      competenceDate: String(f.service_orders?.completed_at ?? f.service_orders?.opened_at ?? f.created_at).slice(0, 10),
      totalCents: f.total_cents,
      companyShareCents: f.company_share_cents,
      technicianShareCents: f.technician_share_cents,
      partsCents: f.kind === "servico" ? Math.max(f.total_cents - f.labor_cents, 0) : 0,
      cancelled: f.service_orders?.status === "cancelado",
    })),
    expenses: ex.map((e: any) => ({ ...e, paid_cents: paidByExpense.get(e.id) ?? 0 })),
  };
}

export const getFinanceOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { start: string; end: string }) => ({ start: reqDate(i.start, "Data inicial"), end: reqDate(i.end, "Data final") }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const all = await loadAll(context.supabase);
    const accounts: Account[] = all.accounts.map((a) => ({ id: a.id, name: a.name, ownership: a.ownership, openingBalanceCents: a.opening_balance_cents, openingDate: a.opening_date, active: a.active }));
    const movements = buildMovements(all.raw as any);
    const cash = computeAccountFlows(accounts, movements, data.start, data.end);
    const indicators = computeIndicators({ orders: all.orders, customerPayments: all.raw.customerPayments, otherRevenues: all.raw.otherRevenues, expenses: all.expenses }, data.start, data.end);
    // Previsto no período: despesas a vencer e receitas avulsas a receber
    const plannedOut = all.expenses.filter((e: any) => e.status !== "cancelada" && e.due_date >= data.start && e.due_date <= data.end).reduce((s: number, e: any) => s + Math.max(e.amount_cents - e.paid_cents, 0), 0);
    const plannedIn = all.raw.otherRevenues.filter((r: any) => r.status === "ativo" && !r.received_at && r.competence_date >= data.start && r.competence_date <= data.end).reduce((s: number, r: any) => s + r.amount_cents, 0);
    const { data: closings } = await context.supabase.from("monthly_closings").select("*").order("month", { ascending: false }).limit(24);
    return {
      indicators,
      cash,
      planned: { inflowCents: plannedIn, outflowCents: plannedOut },
      movements: movements.filter((m) => m.date >= data.start && m.date <= data.end).reverse(),
      unassignedCount: movements.filter((m) => !m.accountId).length,
      closings: closings ?? [],
    };
  });

export const closeMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { month: string; notes?: string }) => {
    if (!/^\d{4}-\d{2}$/.test(i.month)) throw new Error("Mês inválido.");
    return { month: `${i.month}-01`, notes: clean(i.notes) || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const [y, m] = data.month.split("-").map(Number) as [number, number];
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const all = await loadAll(context.supabase);
    const accounts: Account[] = all.accounts.map((a) => ({ id: a.id, name: a.name, ownership: a.ownership, openingBalanceCents: a.opening_balance_cents, openingDate: a.opening_date, active: a.active }));
    const cash = computeAccountFlows(accounts, buildMovements(all.raw as any), data.month, end);
    const indicators = computeIndicators({ orders: all.orders, customerPayments: all.raw.customerPayments, otherRevenues: all.raw.otherRevenues, expenses: all.expenses }, data.month, end);
    const { error } = await context.supabase.from("monthly_closings").insert({ month: data.month, snapshot: { indicators, cash }, notes: data.notes });
    dbErr(error);
    return { ok: true as const };
  });

export const reopenMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; reason: string }) => ({ id: isUuid(i.id) ? i.id : (() => { throw new Error("Registro inválido."); })(), reason: reason(i.reason) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase.from("monthly_closings").update({ status: "reaberto", reopen_reason: data.reason }).eq("id", data.id).eq("status", "fechado").select("id").maybeSingle();
    dbErr(error);
    if (!row) throw new Error("Fechamento não encontrado ou já reaberto.");
    return { ok: true as const };
  });

export const voidAccountTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; reason: string }) => ({ id: isUuid(i.id) ? i.id : (() => { throw new Error("Registro inválido."); })(), reason: reason(i.reason) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase.from("account_transfers").update({ status: "estornado", void_reason: data.reason }).eq("id", data.id).eq("status", "ativo").select("id").maybeSingle();
    dbErr(error);
    if (!row) throw new Error("Transferência não encontrada ou já estornada.");
    return { ok: true as const };
  });
