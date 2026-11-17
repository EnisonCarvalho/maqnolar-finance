import { formatBRL } from "@/lib/format";

/** Número da empresa que recebe o resumo de conclusão (somente link wa.me, sem envio automático). */
export const COMPANY_WHATSAPP = "5585984574934";

export type CompletionSummaryInput = {
  code: string;
  customerName: string | null | undefined;
  technicianName: string | null | undefined;
  completedAt: string | null | undefined;
  kind: "visita" | "servico";
  totalCents?: number | null;
  parts?: { description: string; cents: number }[] | null;
};

export function completionSummaryText(i: CompletionSummaryInput): string {
  const date = new Date(i.completedAt ?? Date.now()).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Fortaleza" });
  const lines = [
    `*Atendimento concluído — ${i.code}*`,
    `Cliente: ${i.customerName || "—"}`,
    `Técnico: ${i.technicianName || "—"}`,
    `Data: ${date}`,
  ];
  if (i.kind === "visita") {
    lines.push("Tipo: Somente visita realizada", `Total: ${formatBRL(3000)}`, `Técnico: ${formatBRL(2000)} · MaqnoLar: ${formatBRL(1000)}`);
  } else {
    lines.push("Tipo: Serviço concluído", `Total cobrado: ${i.totalCents == null ? "Não informado" : formatBRL(i.totalCents)}`);
    const parts = i.parts ?? [];
    if (parts.length === 0) lines.push("Sem peças trocadas");
    else { lines.push("Peças trocadas:"); for (const p of parts) lines.push(`- ${p.description}: ${formatBRL(p.cents)}`); }
  }
  return lines.join("\n");
}

export function whatsappLink(text: string): string {
  return `https://wa.me/${COMPANY_WHATSAPP}?text=${encodeURIComponent(text)}`;
}
