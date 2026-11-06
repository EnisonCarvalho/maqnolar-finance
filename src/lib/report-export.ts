/**
 * Exportação dos relatórios (PDF e Excel) — gerada no navegador a partir dos
 * mesmos dados já filtrados na tela. Nenhum dado do banco é alterado.
 * As bibliotecas são carregadas dinamicamente no clique (fora do SSR).
 */
import { formatBRL } from "@/lib/format";
import { formatISODate } from "@/components/finance-shared";

export type ColType = "text" | "money" | "date" | "number";
export type ReportCell = string | number | null;

export type ReportIndicator = { label: string; text: string; cents?: number | null };

export type ReportData = {
  title: string;
  period: { start: string; end: string };
  criteria: string;
  indicators: ReportIndicator[];
  columns: string[];
  colTypes: ColType[];
  rows: ReportCell[][];
};

export function deliverFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const fmtCell = (v: ReportCell, t: ColType): string => {
  if (v === null || v === "") return "—";
  if (t === "money") return formatBRL(Number(v));
  if (t === "date") return formatISODate(String(v));
  return String(v);
};

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");

export async function exportReportPdf(data: ReportData): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  doc.setFontSize(15);
  doc.text("MaqnoLar Assistência Técnica", 14, 16);
  doc.setFontSize(12);
  doc.text(data.title, 14, 24);
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Período analisado: ${formatISODate(data.period.start)} a ${formatISODate(data.period.end)}`, 14, 31);
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 14, 36);
  doc.text(doc.splitTextToSize(`Critério de data: ${data.criteria}`, 182), 14, 41);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 48,
    head: [["Indicador", "Valor"]],
    body: data.indicators.map((i) => [i.label, i.text]),
    theme: "grid",
    styles: { fontSize: 9 },
    headStyles: { fillColor: [13, 148, 136] },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });

  if (data.rows.length > 0) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [data.columns],
      body: data.rows.map((r) => r.map((c, i) => fmtCell(c, data.colTypes[i] ?? "text"))),
      theme: "striped",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [13, 148, 136] },
      margin: { left: 14, right: 14 },
    });
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Página ${p} de ${pages}`, 196, 292, { align: "right" });
  }
  return doc.output("blob");
}

const MONEY_FMT = '"R$" #,##0.00';
const DATE_FMT = "dd/mm/yyyy";

export async function exportReportXlsx(data: ReportData): Promise<Blob> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  // Aba Resumo
  const resumo: (string | number | null)[][] = [
    ["MaqnoLar Assistência Técnica"],
    [data.title],
    [`Período: ${formatISODate(data.period.start)} a ${formatISODate(data.period.end)}`],
    [`Emitido em ${new Date().toLocaleString("pt-BR")}`],
    [`Critério de data: ${data.criteria}`],
    [],
    ["Indicador", "Valor"],
    ...data.indicators.map((i) => [i.label, i.cents != null ? i.cents / 100 : i.text]),
  ];
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo);
  wsResumo["!cols"] = [{ wch: 42 }, { wch: 22 }];
  data.indicators.forEach((ind, idx) => {
    if (ind.cents == null) return;
    const cell = wsResumo[XLSX.utils.encode_cell({ r: 7 + idx, c: 1 })];
    if (cell) { cell.t = "n"; cell.z = MONEY_FMT; }
  });
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

  // Aba Detalhamento
  const header = data.columns;
  const body = data.rows.map((r) =>
    r.map((c, i) => {
      const t = data.colTypes[i] ?? "text";
      if (c === null || c === "") return null;
      if (t === "money") return Number(c) / 100;
      if (t === "number") return Number(c);
      if (t === "date") return new Date(`${String(c).slice(0, 10)}T12:00:00`);
      return String(c);
    }),
  );
  const wsDet = XLSX.utils.aoa_to_sheet([header, ...body]);
  wsDet["!cols"] = data.columns.map((c, i) => ({ wch: Math.max(c.length + 2, data.colTypes[i] === "money" ? 16 : 14) }));
  body.forEach((r, ri) => {
    r.forEach((c, ci) => {
      if (c === null) return;
      const cell = wsDet[XLSX.utils.encode_cell({ r: ri + 1, c: ci })];
      if (!cell) return;
      const t = data.colTypes[ci] ?? "text";
      if (t === "money") cell.z = MONEY_FMT;
      if (t === "date") cell.z = DATE_FMT;
    });
  });
  XLSX.utils.book_append_sheet(wb, wsDet, "Detalhamento");

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function reportFilename(data: ReportData, ext: "pdf" | "xlsx"): string {
  return `maqnolar-${slug(data.title)}-${data.period.start}_a_${data.period.end}.${ext}`;
}
