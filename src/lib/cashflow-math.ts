/**
 * Fluxo de caixa e indicadores da MaqnoLar.
 *
 * Regras centrais:
 * - Caixa considera somente movimentações EFETIVAS em contas da empresa (ownership "empresa").
 * - Valores recebidos diretamente por técnicos não entram no caixa.
 * - Repasses técnico↔empresa e transferências entre contas movimentam saldo, mas NUNCA são receita ou despesa.
 * - Compra de peça paga pela empresa sai do caixa como "peça de atendimento", não como despesa operacional
 *   (a peça já está fora da participação econômica da MaqnoLar na composição do atendimento).
 * - Resultado econômico (competência) ≠ saldo bancário (caixa).
 */

export type MovementKind =
  | "recebimento_cliente"
  | "receita_avulsa"
  | "despesa"
  | "peca_atendimento"
  | "repasse_do_tecnico"
  | "repasse_ao_tecnico"
  | "transferencia_entrada"
  | "transferencia_saida";

export const MOVEMENT_LABELS: Record<MovementKind, string> = {
  recebimento_cliente: "Recebimento de cliente",
  receita_avulsa: "Receita avulsa",
  despesa: "Pagamento de despesa",
  peca_atendimento: "Peça de atendimento",
  repasse_do_tecnico: "Repasse recebido de técnico",
  repasse_ao_tecnico: "Repasse pago a técnico",
  transferencia_entrada: "Transferência entre contas (entrada)",
  transferencia_saida: "Transferência entre contas (saída)",
};

export type Movement = {
  id: string;
  kind: MovementKind;
  date: string; // YYYY-MM-DD
  accountId: string | null;
  /** Positivo = entrada; negativo = saída. */
  amountCents: number;
  description: string;
  categoryId?: string | null;
  technicianId?: string | null;
  orderId?: string | null;
};

export type Account = {
  id: string;
  name: string;
  ownership: "empresa" | "socio";
  openingBalanceCents: number;
  openingDate: string;
  active: boolean;
};

export type RawFinance = {
  customerPayments: { id: string; order_id: string; amount_cents: number; paid_at: string; receiver_type: string; receiver_technician_id: string | null; account_id: string | null; status: string; code?: string }[];
  otherRevenues: { id: string; description: string; amount_cents: number; competence_date: string; received_at: string | null; account_id: string | null; category_id: string | null; status: string }[];
  expensePayments: { id: string; expense_id: string; amount_cents: number; paid_at: string; account_id: string; status: string; description?: string; category_id?: string | null }[];
  partPurchases: { id: string; order_id: string; total_cents: number; purchased_at: string; buyer_type: string; account_id: string | null; description: string }[];
  technicianTransfers: { id: string; technician_id: string; amount_cents: number; transfer_date: string; direction: string; account_id: string | null; status: string }[];
  accountTransfers: { id: string; from_account_id: string; to_account_id: string; amount_cents: number; transfer_date: string; status: string }[];
};

/** Converte os registros dos módulos em movimentações de caixa (somente efetivas, sem duplicar). */
export function buildMovements(raw: RawFinance): Movement[] {
  const m: Movement[] = [];
  for (const p of raw.customerPayments) {
    if (p.status !== "ativo" || p.receiver_type !== "maqnolar") continue; // técnico/outro: fora do caixa
    m.push({ id: `cp-${p.id}`, kind: "recebimento_cliente", date: p.paid_at, accountId: p.account_id, amountCents: p.amount_cents, description: `Recebimento ${p.code ?? "atendimento"}`, orderId: p.order_id });
  }
  for (const r of raw.otherRevenues) {
    if (r.status !== "ativo" || !r.received_at) continue;
    m.push({ id: `or-${r.id}`, kind: "receita_avulsa", date: r.received_at, accountId: r.account_id, amountCents: r.amount_cents, description: r.description, categoryId: r.category_id });
  }
  for (const e of raw.expensePayments) {
    if (e.status !== "ativo") continue;
    m.push({ id: `ep-${e.id}`, kind: "despesa", date: e.paid_at, accountId: e.account_id, amountCents: -e.amount_cents, description: e.description ?? "Despesa", categoryId: e.category_id ?? null });
  }
  for (const p of raw.partPurchases) {
    if (p.buyer_type !== "maqnolar") continue; // peça paga pelo técnico vira reembolso no acerto, não saída de caixa
    m.push({ id: `pp-${p.id}`, kind: "peca_atendimento", date: p.purchased_at.slice(0, 10), accountId: p.account_id, amountCents: -p.total_cents, description: `Peça: ${p.description}`, orderId: p.order_id });
  }
  for (const t of raw.technicianTransfers) {
    if (t.status !== "ativo") continue;
    const toTech = t.direction === "empresa_para_tecnico";
    m.push({ id: `tt-${t.id}`, kind: toTech ? "repasse_ao_tecnico" : "repasse_do_tecnico", date: t.transfer_date, accountId: t.account_id, amountCents: toTech ? -t.amount_cents : t.amount_cents, description: toTech ? "Repasse ao técnico" : "Repasse do técnico", technicianId: t.technician_id });
  }
  for (const t of raw.accountTransfers) {
    if (t.status !== "ativo") continue;
    m.push({ id: `at-out-${t.id}`, kind: "transferencia_saida", date: t.transfer_date, accountId: t.from_account_id, amountCents: -t.amount_cents, description: "Transferência entre contas" });
    m.push({ id: `at-in-${t.id}`, kind: "transferencia_entrada", date: t.transfer_date, accountId: t.to_account_id, amountCents: t.amount_cents, description: "Transferência entre contas" });
  }
  return m.sort((a, b) => a.date.localeCompare(b.date));
}

export type AccountFlow = {
  accountId: string | null;
  name: string;
  openingCents: number;
  inflowCents: number;
  outflowCents: number;
  closingCents: number;
};

/** Saldo por conta no período. Movimentos sem conta aparecem em "Sem conta definida". Contas de sócio ficam fora. */
export function computeAccountFlows(accounts: Account[], movements: Movement[], start: string, end: string): { flows: AccountFlow[]; totals: Omit<AccountFlow, "accountId" | "name"> } {
  const company = accounts.filter((a) => a.ownership === "empresa");
  const ids = new Set(company.map((a) => a.id));
  const flows: AccountFlow[] = company.map((a) => ({
    accountId: a.id,
    name: a.name,
    openingCents: a.openingDate < start ? a.openingBalanceCents : 0,
    inflowCents: 0,
    outflowCents: 0,
    closingCents: 0,
  }));
  const unassigned: AccountFlow = { accountId: null, name: "Sem conta definida", openingCents: 0, inflowCents: 0, outflowCents: 0, closingCents: 0 };
  const byId = new Map(flows.map((f) => [f.accountId, f]));
  const openingInPeriod = new Map(company.filter((a) => a.openingDate >= start && a.openingDate <= end).map((a) => [a.id, a.openingBalanceCents]));
  for (const mv of movements) {
    if (mv.date > end) continue;
    const f = mv.accountId && ids.has(mv.accountId) ? byId.get(mv.accountId)! : mv.accountId ? null : unassigned;
    if (!f) continue; // conta de sócio: não é caixa da empresa
    if (mv.date < start) f.openingCents += mv.amountCents;
    else if (mv.amountCents >= 0) f.inflowCents += mv.amountCents;
    else f.outflowCents += -mv.amountCents;
  }
  // Saldo inicial cadastrado dentro do período entra como saldo de abertura (não é entrada operacional)
  for (const [id, cents] of openingInPeriod) byId.get(id)!.openingCents += cents;
  const all = [...flows, ...(unassigned.inflowCents || unassigned.outflowCents || unassigned.openingCents ? [unassigned] : [])];
  for (const f of all) f.closingCents = f.openingCents + f.inflowCents - f.outflowCents;
  const totals = all.reduce(
    (s, f) => ({ openingCents: s.openingCents + f.openingCents, inflowCents: s.inflowCents + f.inflowCents, outflowCents: s.outflowCents + f.outflowCents, closingCents: s.closingCents + f.closingCents }),
    { openingCents: 0, inflowCents: 0, outflowCents: 0, closingCents: 0 },
  );
  return { flows: all, totals };
}

export type IndicatorInput = {
  orders: { orderId: string; competenceDate: string; totalCents: number; companyShareCents: number; technicianShareCents: number; partsCents: number; cancelled: boolean }[];
  customerPayments: RawFinance["customerPayments"];
  otherRevenues: RawFinance["otherRevenues"];
  expenses: { id: string; amount_cents: number; competence_date: string; due_date: string; status: string; paid_cents: number }[];
};

export type Indicators = {
  grossBillingCents: number;
  companyEconomicRevenueCents: number;
  technicianShareCents: number;
  partsCents: number;
  otherRevenueCents: number;
  receivedByCompanyCents: number;
  receivedByTechniciansCents: number;
  receivedByOthersCents: number;
  operationalExpensesCents: number;
  economicResultCents: number;
  payablesCents: number;
  receivablesCents: number;
};

const within = (d: string | null | undefined, s: string, e: string) => Boolean(d) && d! >= s && d! <= e;

export function computeIndicators(input: IndicatorInput, start: string, end: string): Indicators {
  const ord = input.orders.filter((o) => !o.cancelled && within(o.competenceDate, start, end));
  const grossBillingCents = ord.reduce((s, o) => s + o.totalCents, 0);
  const companyShare = ord.reduce((s, o) => s + o.companyShareCents, 0);
  const otherRevenueCents = input.otherRevenues.filter((r) => r.status === "ativo" && within(r.competence_date, start, end)).reduce((s, r) => s + r.amount_cents, 0);
  const pays = input.customerPayments.filter((p) => p.status === "ativo" && within(p.paid_at, start, end));
  const sumBy = (t: string) => pays.filter((p) => p.receiver_type === t).reduce((s, p) => s + p.amount_cents, 0);
  const otherReceived = input.otherRevenues.filter((r) => r.status === "ativo" && within(r.received_at, start, end)).reduce((s, r) => s + r.amount_cents, 0);
  const operationalExpensesCents = input.expenses.filter((e) => e.status !== "cancelada" && within(e.competence_date, start, end)).reduce((s, e) => s + e.amount_cents, 0);

  const receivedByOrder = new Map<string, number>();
  for (const p of input.customerPayments) if (p.status === "ativo") receivedByOrder.set(p.order_id, (receivedByOrder.get(p.order_id) ?? 0) + p.amount_cents);
  const clientReceivables = input.orders.filter((o) => !o.cancelled).reduce((s, o) => s + Math.max(o.totalCents - (receivedByOrder.get(o.orderId) ?? 0), 0), 0);
  const pendingOther = input.otherRevenues.filter((r) => r.status === "ativo" && !r.received_at).reduce((s, r) => s + r.amount_cents, 0);
  const payablesCents = input.expenses.filter((e) => e.status !== "cancelada").reduce((s, e) => s + Math.max(e.amount_cents - e.paid_cents, 0), 0);

  const companyEconomicRevenueCents = companyShare + otherRevenueCents;
  return {
    grossBillingCents,
    companyEconomicRevenueCents,
    technicianShareCents: ord.reduce((s, o) => s + o.technicianShareCents, 0),
    partsCents: ord.reduce((s, o) => s + o.partsCents, 0),
    otherRevenueCents,
    receivedByCompanyCents: sumBy("maqnolar") + otherReceived,
    receivedByTechniciansCents: sumBy("tecnico"),
    receivedByOthersCents: sumBy("outro"),
    operationalExpensesCents,
    economicResultCents: companyEconomicRevenueCents - operationalExpensesCents,
    payablesCents,
    receivablesCents: clientReceivables + pendingOther,
  };
}

/** Próximo vencimento de uma recorrência. */
export function nextDueDate(date: string, frequency: "semanal" | "mensal" | "anual"): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  if (frequency === "semanal") {
    const dt = new Date(Date.UTC(y, m - 1, d + 7));
    return dt.toISOString().slice(0, 10);
  }
  const targetMonth = frequency === "mensal" ? m : m - 1 + 12; // 0-based
  const ny = y + Math.floor(targetMonth / 12);
  const nm = targetMonth % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const dt = new Date(Date.UTC(ny, nm, Math.min(d, last)));
  return dt.toISOString().slice(0, 10);
}

export type PeriodPreset = "hoje" | "ontem" | "semana" | "mes" | "trimestre" | "semestre" | "ano" | "personalizado";

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function periodRange(p: PeriodPreset, custom: { start: string; end: string }, now = new Date()): { start: string; end: string } {
  const y = now.getFullYear();
  const mo = now.getMonth();
  if (p === "hoje") return { start: iso(now), end: iso(now) };
  if (p === "ontem") { const d = new Date(now); d.setDate(d.getDate() - 1); return { start: iso(d), end: iso(d) }; }
  if (p === "semana") { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const e = new Date(d); e.setDate(e.getDate() + 6); return { start: iso(d), end: iso(e) }; }
  if (p === "mes") return { start: iso(new Date(y, mo, 1)), end: iso(new Date(y, mo + 1, 0)) };
  if (p === "trimestre") { const q = Math.floor(mo / 3) * 3; return { start: iso(new Date(y, q, 1)), end: iso(new Date(y, q + 3, 0)) }; }
  if (p === "semestre") { const s = mo < 6 ? 0 : 6; return { start: iso(new Date(y, s, 1)), end: iso(new Date(y, s + 6, 0)) }; }
  if (p === "ano") return { start: `${y}-01-01`, end: `${y}-12-31` };
  return custom;
}
