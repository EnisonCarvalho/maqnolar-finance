// Cálculos de campanhas: compartilhados entre UI e servidor.
export type AllocExpense = { amount_cents: number; status: string; payments: { amount_cents: number; status: string }[] };
export type Allocation = { amount_cents: number; status: string; expense: AllocExpense | null };

/** Total pago (ativo) de uma despesa. */
export function expensePaid(e: AllocExpense): number {
  return e.payments.filter((p) => p.status === "ativo").reduce((s, p) => s + p.amount_cents, 0);
}

/** Parcela efetivamente paga de um vínculo: proporcional ao pago da despesa. */
export function allocationPaid(a: Allocation): number {
  if (a.status !== "ativo" || !a.expense || a.expense.status === "cancelada" || a.expense.amount_cents <= 0) return 0;
  const ratio = Math.min(1, expensePaid(a.expense) / a.expense.amount_cents);
  return Math.round(a.amount_cents * ratio);
}

export function campaignTotals(plannedCents: number, allocs: Allocation[]) {
  const active = allocs.filter((a) => a.status === "ativo" && a.expense?.status !== "cancelada");
  const registered = active.reduce((s, a) => s + a.amount_cents, 0);
  const paid = active.reduce((s, a) => s + allocationPaid(a), 0);
  return { planned: plannedCents, registered, paid, balance: plannedCents - registered };
}

/** Quanto de uma despesa ainda pode ser distribuído entre campanhas. */
export function expenseAvailable(expenseCents: number, activeAllocCents: number[]): number {
  return Math.max(0, expenseCents - activeAllocCents.reduce((s, v) => s + v, 0));
}

/** Campanha ocorre (ao menos em parte) no período? */
export function overlapsPeriod(start: string, end: string | null, from: string, to: string): boolean {
  return start <= to && (end === null || end >= from);
}

// ---------- Desempenho (Passo 7C) ----------
// Critérios de data:
//  - Investimento: data de competência da despesa vinculada.
//  - Leads: data/hora do contato.
//  - Atendimentos atribuídos: data de abertura.
//  - Faturamento e receita econômica: competência do atendimento (conclusão, ou abertura se não concluído) — mesmo critério do fluxo de caixa.
export type PerfAlloc = { amount_cents: number; status: string; expense: (AllocExpense & { competence_date: string }) | null };
export type PerfLead = { id: string; status: string; order_id: string | null; contactedDate: string };
export type PerfOrder = {
  id: string; openedDate: string; competenceDate: string; cancelled: boolean;
  /** Composição financeira (null = ainda sem orçamento aprovado). */
  totalCents: number | null; companyShareCents: number | null; receivedCents: number;
};
export type Perf = {
  investmentCents: number; investmentPaidCents: number; leads: number; converted: number; lost: number; orders: number;
  grossCents: number; companyRevenueCents: number; companyRevenueReceivedCents: number; resultCents: number;
  cplCents: number | null; costPerOrderCents: number | null; conversionPct: number | null; roiPct: number | null;
  /** Há investimento ou resultado desta campanha fora do período filtrado. */
  outsidePeriod: boolean;
};

const inRange = (d: string | null | undefined, s: string, e: string) => Boolean(d) && d! >= s && d! <= e;
export const safeDiv = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function campaignPerformance(input: { allocs: PerfAlloc[]; leads: PerfLead[]; orders: PerfOrder[] }, start: string, end: string): Perf {
  const activeAllocs = input.allocs.filter((a) => a.status === "ativo" && a.expense && a.expense.status !== "cancelada");
  const allocs = activeAllocs.filter((a) => inRange(a.expense!.competence_date, start, end));
  const investmentCents = allocs.reduce((s, a) => s + a.amount_cents, 0);
  const investmentPaidCents = allocs.reduce((s, a) => s + allocationPaid(a), 0);

  const leadMap = new Map(input.leads.filter((l) => inRange(l.contactedDate, start, end)).map((l) => [l.id, l]));
  const leads = [...leadMap.values()];
  const converted = leads.filter((l) => l.status === "convertido" || l.order_id).length;
  const lost = leads.filter((l) => l.status === "perdido").length;

  const uniqueOrders = [...new Map(input.orders.filter((o) => !o.cancelled).map((o) => [o.id, o])).values()];
  const orders = uniqueOrders.filter((o) => inRange(o.openedDate, start, end)).length;
  const econ = uniqueOrders.filter((o) => o.totalCents !== null && inRange(o.competenceDate, start, end));
  const grossCents = econ.reduce((s, o) => s + (o.totalCents ?? 0), 0);
  const companyRevenueCents = econ.reduce((s, o) => s + (o.companyShareCents ?? 0), 0);
  const companyRevenueReceivedCents = econ.reduce((s, o) => {
    const total = o.totalCents ?? 0, share = o.companyShareCents ?? 0;
    if (total <= 0) return s;
    return s + Math.round((share * Math.min(o.receivedCents, total)) / total);
  }, 0);
  const resultCents = companyRevenueCents - investmentCents;

  const outsidePeriod =
    activeAllocs.length !== allocs.length ||
    uniqueOrders.some((o) => o.totalCents !== null && !inRange(o.competenceDate, start, end));

  const pct = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 10);
  return {
    investmentCents, investmentPaidCents, leads: leads.length, converted, lost, orders,
    grossCents, companyRevenueCents, companyRevenueReceivedCents, resultCents,
    cplCents: leads.length ? Math.round(investmentCents / leads.length) : null,
    costPerOrderCents: orders ? Math.round(investmentCents / orders) : null,
    conversionPct: pct(safeDiv(converted * 100, leads.length) === null ? null : (converted / leads.length) * 100),
    roiPct: investmentCents > 0 ? pct((resultCents / investmentCents) * 100) : null,
    outsidePeriod,
  };
}

export function sumPerf(list: Perf[]): Perf {
  const z = list.reduce((a, p) => ({
    investmentCents: a.investmentCents + p.investmentCents, investmentPaidCents: a.investmentPaidCents + p.investmentPaidCents,
    leads: a.leads + p.leads, converted: a.converted + p.converted, lost: a.lost + p.lost, orders: a.orders + p.orders,
    grossCents: a.grossCents + p.grossCents, companyRevenueCents: a.companyRevenueCents + p.companyRevenueCents,
    companyRevenueReceivedCents: a.companyRevenueReceivedCents + p.companyRevenueReceivedCents, outsidePeriod: a.outsidePeriod || p.outsidePeriod,
  }), { investmentCents: 0, investmentPaidCents: 0, leads: 0, converted: 0, lost: 0, orders: 0, grossCents: 0, companyRevenueCents: 0, companyRevenueReceivedCents: 0, outsidePeriod: false });
  const resultCents = z.companyRevenueCents - z.investmentCents;
  const pct = (v: number) => Math.round(v * 10) / 10;
  return {
    ...z, resultCents,
    cplCents: z.leads ? Math.round(z.investmentCents / z.leads) : null,
    costPerOrderCents: z.orders ? Math.round(z.investmentCents / z.orders) : null,
    conversionPct: z.leads ? pct((z.converted / z.leads) * 100) : null,
    roiPct: z.investmentCents > 0 ? pct((resultCents / z.investmentCents) * 100) : null,
  };
}
