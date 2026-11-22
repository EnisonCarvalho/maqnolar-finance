/**
 * Nota de Serviço com Termos de Garantia — gerada no navegador a partir do
 * registro imutável em warranty_notes. O único valor em reais é o total cobrado.
 */
import { formatBRL } from "@/lib/format";
import { formatISODate } from "@/components/finance-shared";

export type WarrantyNote = {
  id: string; order_id: string; number: string; order_code: string;
  customer_name: string; customer_phone: string | null; customer_cpf: string | null; customer_address: string | null;
  equipment: string | null; service_description: string; part_names: string[]; technician_name: string | null;
  service_date: string; total_cents: number; payment_method: string; installments: number | null;
  warranty_days: number; warranty_start: string; warranty_end: string; observations: string | null; issued_at: string;
  current_snapshot?: WarrantyNote | null;
  revision_history?: WarrantyNote[];
};

/** Original imutável; a versão atual é um snapshot, nunca outra nota numerada. */
export function currentWarrantyNote(note: WarrantyNote): WarrantyNote {
  return note.current_snapshot ? { ...note.current_snapshot, revision_history: note.revision_history ?? [] } : note;
}

export const PAYMENT_METHODS = ["Pix", "Dinheiro", "Cartão de débito", "Cartão de crédito", "Transferência bancária", "Boleto"];

/** Validade = início + prazo em dias (mesma regra do banco). */
export function warrantyEnd(startISO: string, days: number): string {
  const [y = 0, m = 1, d = 1] = startISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function paymentText(n: Pick<WarrantyNote, "payment_method" | "installments">): string {
  return n.installments && n.installments > 1 ? `${n.payment_method} em ${n.installments}x` : `${n.payment_method} à vista`;
}

// Texto exato do modelo da MAQNOLAR.
export const WARRANTY_TERMS = "A garantia cobre exclusivamente o serviço executado e as peças substituídas descritas nesta nota, contada a partir da data do serviço. Não cobre danos causados por mau uso, quedas, oscilações da rede elétrica, violação do equipamento ou intervenção de terceiros.";

/** Todos os textos com R$ que o PDF imprime — usado no teste da regra "um único valor". */
export function moneyTexts(n: WarrantyNote): string[] {
  return [formatBRL(n.total_cents)];
}

const NAVY: [number, number, number] = [16, 46, 110];
const TEAL: [number, number, number] = [16, 160, 130];
const SOFT: [number, number, number] = [241, 245, 250];
const GREY: [number, number, number] = [100, 110, 125];
const MONTHS = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const longDate = (iso: string) => { const [y = 0, m = 1, d = 1] = iso.split("-").map(Number); return `${d} de ${MONTHS[m - 1]} de ${y}`; };

/** Notas emitidas antes desta data mantêm o PDF original, sem rubrica. */
export const SIGNATURE_FROM = "2026-11-18T19:06:00Z";
export const hasCompanySignature = (issuedAt: string) => !issuedAt || new Date(issuedAt) >= new Date(SIGNATURE_FROM);

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
  } catch { return null; }
}
const loadLogo = async () => toDataUrl((await import("@/assets/maqnolar-logo.jpg")).default as string);
const loadSignature = async () => toDataUrl((await import("@/assets/maqnolar-rubrica.png")).default as string);

export async function buildWarrantyPdf(n: WarrantyNote, logoOverride?: string, signatureOverride?: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const W = 210, M = 14, CW = W - 2 * M;
  const logo = logoOverride ?? (await loadLogo());
  if (logo) doc.addImage(logo, "JPEG", M, 12, 26, 26);
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...NAVY);
  doc.text("MaqnoLar", M + 30, 22);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(...TEAL);
  doc.text("Assistência Técnica em Eletrodomésticos", M + 30, 28);
  for (let i = 0; i < 40; i++) {
    const t = i / 39;
    doc.setFillColor(NAVY[0] + (TEAL[0] - NAVY[0]) * t, NAVY[1] + (TEAL[1] - NAVY[1]) * t, NAVY[2] + (TEAL[2] - NAVY[2]) * t);
    doc.rect(M + (CW / 40) * i, 41, CW / 40 + 0.2, 1, "F");
  }
  let y = 46;
  doc.setFillColor(...NAVY); doc.roundedRect(M, y, CW, 14, 2, 2, "F");
  doc.setTextColor(200, 210, 235); doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
  doc.text("N O T A   D E   S E R V I Ç O", M + 5, y + 4.8);
  doc.text("D A T A   D O   S E R V I Ç O", W - M - 5, y + 4.8, { align: "right" });
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text(`Nº ${n.number}`, M + 5, y + 11);
  doc.text(formatISODate(n.service_date), W - M - 5, y + 11, { align: "right" });
  y += 20;

  const header = (title: string) => {
    doc.setFillColor(...SOFT); doc.roundedRect(M, y, CW, 8, 1.5, 1.5, "F");
    doc.setFillColor(...TEAL); doc.roundedRect(M + 3, y + 2, 1.2, 4, 0.5, 0.5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
    doc.text(title, M + 7, y + 5.6); y += 13;
  };
  const label = (t: string, x = M + 1, align: "left" | "right" = "left") => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GREY);
    doc.text(t.toUpperCase(), x, y, align === "right" ? { align } : { align, charSpace: 0.6 });
  };
  const body = (t: string, opts: { bold?: boolean; size?: number; color?: [number, number, number] } = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal"); doc.setFontSize(opts.size ?? 10); doc.setTextColor(...(opts.color ?? [30, 35, 45] as [number, number, number]));
    const lines = doc.splitTextToSize(t, CW - 50) as string[]; doc.text(lines, M + 1, y); y += lines.length * ((opts.size ?? 10) * 0.45) + 1.2;
  };

  header("Cliente");
  const top = y;
  label("Telefone", W - M - 1, "right");
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(30, 35, 45);
  doc.text(n.customer_phone || "—", W - M - 1, y + 4.5, { align: "right" });
  y = top + 1;
  body(n.customer_name, { bold: true, size: 12 });
  if (n.customer_cpf) body(`CPF: ${n.customer_cpf}`);
  if (n.customer_address) body(n.customer_address, { color: GREY });
  y += 4;

  header("Serviço");
  label("Descrição"); y += 2; doc.setDrawColor(220); doc.setLineWidth(0.2); doc.line(M, y, W - M, y); y += 5;
  if (n.equipment) body(n.equipment, { bold: true });
  body(n.service_description);
  y += 4;

  header("Peças");
  label("Peças compradas"); y += 2; doc.line(M, y, W - M, y); y += 5;
  if (n.part_names.length === 0) body("Nenhuma peça substituída.", { color: GREY });
  for (const p of n.part_names) { doc.setFillColor(...TEAL); doc.circle(M + 2, y - 1.2, 0.7, "F"); doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(30, 35, 45); doc.text(p, M + 5, y); y += 5.5; }
  y += 3;

  header("Observações");
  body(n.observations || "—");
  y += 5;

  const gap = 5, bw = (CW - 2 * gap - 8) / 3, bh = 30;
  const box = (x: number, w: number, title: string, rows: [string, string][], dark = false) => {
    doc.setFillColor(...(dark ? NAVY : SOFT)); doc.roundedRect(x, y, w, bh, 2.5, 2.5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.setTextColor(...(dark ? [255, 255, 255] as [number, number, number] : NAVY));
    doc.text(title, x + 5, y + 8);
    rows.forEach(([l, v], i) => {
      const ry = y + 14 + i * 9;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...(dark ? [190, 200, 230] as [number, number, number] : GREY));
      doc.text(l.toUpperCase(), x + 5, ry, { charSpace: 0.5 });
      doc.setFontSize(10.5); doc.setTextColor(...(dark ? [255, 255, 255] as [number, number, number] : [30, 35, 45] as [number, number, number]));
      doc.text(v, x + 5, ry + 4.5);
    });
  };
  box(M, bw, "Pagamento", [["Forma de pagamento", n.payment_method], ["Condição", n.installments && n.installments > 1 ? `${n.installments} parcelas` : "À vista"]]);
  box(M + bw + gap, bw, "Garantia", [["Período", `${n.warranty_days} dias`], ["Válida até", formatISODate(n.warranty_end)]]);
  const tx = M + 2 * (bw + gap), tw = CW - 2 * (bw + gap);
  box(tx, tw, "Total", [["Valor do serviço", ""]], true);
  doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(255, 255, 255);
  doc.text(formatBRL(n.total_cents), tx + tw - 5, y + 25, { align: "right" });
  y += bh + 10;

  const termsY = y;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GREY);
  doc.text("TERMOS DE GARANTIA", M + 1, y, { charSpace: 0.6 });
  doc.setFontSize(8.5);
  doc.text(doc.splitTextToSize(WARRANTY_TERMS, 92) as string[], M + 1, y + 5);

  const sx = W - M - 45;
  doc.setFontSize(10); doc.setTextColor(30, 35, 45);
  doc.text(longDate(n.service_date), sx, termsY, { align: "center" });
  if (hasCompanySignature(n.issued_at)) {
    const sig = signatureOverride ?? (await loadSignature());
    // Rubrica da empresa (760x387 px), acima da linha como no modelo.
    if (sig) doc.addImage(sig, "PNG", sx - 22, termsY + 2.5, 44, 44 * 387 / 760);
  }
  doc.setDrawColor(40); doc.setLineWidth(0.3); doc.line(sx - 40, termsY + 22, sx + 40, termsY + 22);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
  doc.text("MaqnoLar", sx, termsY + 27, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GREY);
  doc.text(`Técnico responsável: ${n.technician_name || "—"}`, sx, termsY + 32, { align: "center" });

  doc.setDrawColor(225); doc.line(M, 284, W - M, 284);
  doc.setFontSize(8); doc.setTextColor(...GREY);
  doc.text(`MaqnoLar · Assistência Técnica em Eletrodomésticos · Nota de serviço Nº ${n.number}`, M, 289);
  doc.text("Página 1/1", W - M, 289, { align: "right" });
  return doc.output("blob");
}
