// Regras de leads e atribuição, compartilhadas entre UI e servidor.
export const LEAD_ORIGINS: Record<string, string> = { meta_ads: "Meta Ads", google_ads: "Google Ads", indicacao: "Indicação", organico: "Orgânico", outra: "Outra" };
export const LEAD_STATUSES: Record<string, string> = { novo: "Novo", em_contato: "Em contato", agendado: "Agendado", convertido: "Convertido", perdido: "Perdido" };

export function phoneDigits(phone: string | null | undefined): string | null {
  let d = String(phone ?? "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d.length >= 8 ? d : null;
}

/** Mesmo telefone? Compara pelos últimos 8 dígitos e DDD quando ambos têm. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = phoneDigits(a), y = phoneDigits(b);
  if (!x || !y) return false;
  if (x.length >= 10 && y.length >= 10) return x.slice(0, 2) === y.slice(0, 2) && x.slice(-8) === y.slice(-8);
  return x.slice(-8) === y.slice(-8);
}

export type LeadLite = { id: string; campaign_id: string | null; status: string; order_id: string | null };
export type OrderLite = { id: string; campaign_id: string | null };

/** Indicadores por campanha; cada lead/atendimento conta uma única vez. */
export function campaignLeadStats(campaignId: string, leads: LeadLite[], orders: OrderLite[]) {
  const mine = new Map(leads.filter((l) => l.campaign_id === campaignId).map((l) => [l.id, l]));
  const all = [...mine.values()];
  const ordersSet = new Set(orders.filter((o) => o.campaign_id === campaignId).map((o) => o.id));
  return {
    leads: all.length,
    converted: all.filter((l) => l.status === "convertido" || l.order_id).length,
    lost: all.filter((l) => l.status === "perdido").length,
    orders: ordersSet.size,
  };
}
