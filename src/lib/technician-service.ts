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
  let normalized = value.trim().replace(/^R\$\s*/, "").replace(/\s/g, "");
  // "150.00" / "150.5" sem vírgula: ponto é separador decimal; caso contrário, ponto é milhar.
  if (!normalized.includes(",") && /^\d+\.\d{1,2}$/.test(normalized)) normalized = normalized.replace(".", ",");
  else normalized = normalized.replace(/\./g, "");
  if (!/^\d+(,\d{1,2})?$/.test(normalized)) throw new Error("Informe um valor em reais, como 150,00.");
  const [whole, fraction = ""] = normalized.split(",");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 2147483647) throw new Error("Valor acima do limite permitido.");
  return cents;
}

/** Próximas ações do técnico: somente a etapa atual (validado também no banco). */
export type TechnicianStep = "iniciar" | "concluir";
export function technicianStep(status: OrderStatus): TechnicianStep | null {
  if (["novo", "aguardando_agendamento", "visita_agendada", "tecnico_a_caminho", "em_diagnostico", "orcamento_aprovado", "aguardando_peca"].includes(status)) return "iniciar";
  if (status === "servico_em_andamento") return "concluir";
  return null;
}

export type ReportedPart = { description: string; cents: number };

export function parseWarrantyDays(value: string | null | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) throw new Error("Informe um número inteiro positivo de dias para a garantia.");
  const days = Number(trimmed);
  if (!Number.isSafeInteger(days) || days < 1 || days > 2147483647) {
    throw new Error("Informe um número inteiro positivo de dias para a garantia.");
  }
  return days;
}

export function initialWarrantyNoteDays(offeredWarrantyDays: number | null | undefined): string {
  return offeredWarrantyDays != null && offeredWarrantyDays > 0 ? String(offeredWarrantyDays) : "90";
}

export function completionPreview(totalReais: string, parts: { description: string; valueReais: string }[], warrantyDays?: string) {
  const totalCents = reportedReaisToCents(totalReais);
  const normalized: ReportedPart[] = parts.map((p) => {
    const description = p.description.trim();
    if (!description) throw new Error("Informe a descrição de cada peça.");
    return { description, cents: reportedReaisToCents(p.valueReais) };
  });
  const partsCents = normalized.reduce((a, p) => a + p.cents, 0);
  if (partsCents > totalCents) throw new Error("A soma das peças não pode ultrapassar o total cobrado.");
  return { totalCents, partsCents, parts: normalized, warrantyDays: parseWarrantyDays(warrantyDays) };
}
