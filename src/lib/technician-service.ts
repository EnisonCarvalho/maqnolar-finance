import type { OrderStatus } from "@/lib/order-status";
import { splitLabor, type SplitRuleSnapshot } from "@/lib/settlement-math";

export function canConfirmServiceValues(status: string, confirmedAt: string | null): boolean {
  return !confirmedAt && ["servico_concluido", "aguardando_pagamento", "finalizado"].includes(status);
}

export function canConfirmVisit(status: string, confirmedAt: string | null): boolean {
  return !confirmedAt && status === "visita_concluida";
}

/** Regra fixa da visita (padrão R$ 30: R$ 20 técnico / R$ 10 MaqnoLar), com cópia da regra vigente. */
export function visitCompositionPreview(rule: { technicianFixedCents: number | null; companyFixedCents: number | null } | null | undefined) {
  const technicianShareCents = rule?.technicianFixedCents ?? 2000;
  const companyShareCents = rule?.companyFixedCents ?? 1000;
  return { totalCents: technicianShareCents + companyShareCents, technicianShareCents, companyShareCents };
}

export function serviceCompositionPreview(totalReais: string, partsReais: string, rule: SplitRuleSnapshot) {
  const totalCents = reportedReaisToCents(totalReais);
  const partsCents = reportedReaisToCents(partsReais);
  if (partsCents > totalCents) throw new Error("Peças não podem superar o valor total cobrado.");
  const laborCents = totalCents - partsCents;
  return { totalCents, partsCents, laborCents, ...splitLabor(laborCents, rule) };
}

export function canEditTechnicianValue(status: OrderStatus, confirmedAt: string | null): boolean {
  return !confirmedAt && status !== "cancelado" && status !== "finalizado";
}

export function canStartPartnerService(status: OrderStatus): boolean {
  return !["cancelado", "finalizado", "servico_concluido", "visita_concluida", "aguardando_pagamento", "servico_em_andamento"].includes(status);
}

/** Reais digitados pelo técnico; conversão e validação também no servidor. */
export function reportedReaisToCents(value: string): number {
  const normalized = value.trim().replace(/^R\$\s*/, "").replace(/\./g, "");
  if (!/^\d+(,\d{1,2})?$/.test(normalized)) throw new Error("Informe um valor em reais, como 150,00.");
  const [whole, fraction = ""] = normalized.split(",");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 2147483647) throw new Error("Valor acima do limite permitido.");
  return cents;
}