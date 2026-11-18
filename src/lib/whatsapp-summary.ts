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

/** Normaliza telefone brasileiro para o WhatsApp; null se ausente/inválido. */
export function customerWhatsappNumber(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!/^55[1-9][1-9]\d{8,9}$/.test(d)) return null;
  if (d.length === 13 && d[4] !== "9") return null;
  return d;
}

export function customerGreeting(customerName: string | null | undefined, technicianName: string | null | undefined): string {
  const first = (customerName ?? "").trim().split(/\s+/)[0];
  const tech = (technicianName ?? "").trim();
  const hello = first ? `Olá, ${first}! Tudo bem?` : "Olá! Tudo bem?";
  return `${hello} Sou ${tech || "técnico"}, da equipe da MaqnoLar Assistência Técnica. Estou entrando em contato para combinar os detalhes do atendimento.`;
}

export function customerWhatsappLink(phone: string | null | undefined, customerName: string | null | undefined, technicianName: string | null | undefined): string | null {
  const n = customerWhatsappNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(customerGreeting(customerName, technicianName))}` : null;
}
