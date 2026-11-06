import type { OrderStatus } from "@/lib/order-status";

export function canEditTechnicianValue(status: OrderStatus, confirmedAt: string | null): boolean {
  return !confirmedAt && status !== "cancelado" && status !== "finalizado";
}

export function canStartPartnerService(status: OrderStatus): boolean {
  return !["cancelado", "finalizado", "servico_concluido", "aguardando_pagamento", "servico_em_andamento"].includes(status);
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