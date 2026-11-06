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
