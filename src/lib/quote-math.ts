export type QuotePartInput = {
  description: string;
  quantity: number;
  unitPriceCents: number;
};

export type QuoteTotals = {
  parts: { description: string; quantity: number; unitPriceCents: number; totalCents: number }[];
  partsTotalCents: number;
  totalCents: number;
};

export function calcQuoteTotals(laborCents: number, parts: QuotePartInput[]): QuoteTotals {
  const computed = parts.map((p) => ({
    description: p.description,
    quantity: p.quantity,
    unitPriceCents: p.unitPriceCents,
    totalCents: Math.round(p.quantity * p.unitPriceCents),
  }));
  const partsTotalCents = computed.reduce((sum, p) => sum + p.totalCents, 0);
  return { parts: computed, partsTotalCents, totalCents: laborCents + partsTotalCents };
}
