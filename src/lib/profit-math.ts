/**
 * Distribuição eventual de lucros (Enison 50% / Jonathan 50%).
 *
 * Regras centrais:
 * - A aprovação NÃO movimenta o caixa; somente o pagamento efetivo sai da conta.
 * - Pagamento de distribuição NÃO é despesa operacional.
 * - Cada sócio recebe no máximo metade do total (arredondada para cima) e o total pago nunca excede o aprovado.
 * - Saldo bancário não é presumido como disponível para distribuição.
 */

export type ProfitDistribution = {
  id: string;
  total_cents: number;
  decision_date: string;
  notes: string | null;
  status: string;
  void_reason: string | null;
  created_at: string;
};

export type DistributionPayment = {
  id: string;
  distribution_id: string;
  partner_id: string;
  amount_cents: number;
  paid_at: string;
  account_id: string;
  notes: string | null;
  receipt_path: string | null;
  status: string;
  void_reason: string | null;
  created_at: string;
};

/** Participação máxima de cada sócio (50%, arredondada para cima). */
export function partnerShareCents(totalCents: number): number {
  return Math.ceil(totalCents / 2);
}

export type DistributionStatus = {
  distributionId: string;
  totalCents: number;
  shareCents: number;
  paidByPartner: Map<string, number>;
  paidTotalCents: number;
  pendingCents: number;
  /** Pendente por sócio (participação − pago). */
  pendingByPartner: (partnerId: string) => number;
};

export function distributionStatus(d: ProfitDistribution, payments: DistributionPayment[]): DistributionStatus {
  const active = payments.filter((p) => p.distribution_id === d.id && p.status === "ativo");
  const paidByPartner = new Map<string, number>();
  for (const p of active) paidByPartner.set(p.partner_id, (paidByPartner.get(p.partner_id) ?? 0) + p.amount_cents);
  const paidTotalCents = active.reduce((s, p) => s + p.amount_cents, 0);
  const shareCents = partnerShareCents(d.total_cents);
  return {
    distributionId: d.id,
    totalCents: d.total_cents,
    shareCents,
    paidByPartner,
    paidTotalCents,
    pendingCents: d.total_cents - paidTotalCents,
    pendingByPartner: (partnerId) => Math.max(shareCents - (paidByPartner.get(partnerId) ?? 0), 0),
  };
}

export type DistributionTotals = {
  approvedCents: number;
  paidCents: number;
  paidByPartner: Map<string, number>;
  pendingCents: number;
};

/** Totais gerais considerando apenas distribuições ativas. */
export function summarizeDistributions(distributions: ProfitDistribution[], payments: DistributionPayment[]): DistributionTotals {
  const active = distributions.filter((d) => d.status === "ativa");
  const ids = new Set(active.map((d) => d.id));
  const paidByPartner = new Map<string, number>();
  let paidCents = 0;
  for (const p of payments) {
    if (p.status !== "ativo" || !ids.has(p.distribution_id)) continue;
    paidCents += p.amount_cents;
    paidByPartner.set(p.partner_id, (paidByPartner.get(p.partner_id) ?? 0) + p.amount_cents);
  }
  const approvedCents = active.reduce((s, d) => s + d.total_cents, 0);
  return { approvedCents, paidCents, paidByPartner, pendingCents: approvedCents - paidCents };
}
