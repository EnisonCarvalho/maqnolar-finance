import { describe, it, expect } from "vitest";
import { writeFileSync } from "fs";
import { exportReportPdf, exportReportXlsx, reportFilename, type ReportData } from "@/lib/report-export";

const rows: (string | number | null)[][] = Array.from({ length: 80 }, (_, i) => [
  `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, `ATD-${String(i + 1).padStart(5, "0")}`, `Cliente ${i + 1}`, "Lavadora", "Westerley Cardoso", "Finalizado", 15000 + i * 100,
]);
const total = rows.reduce((s, r) => s + Number(r[6]), 0);

const data: ReportData = {
  title: "Relatório de Atendimentos",
  period: { start: "2026-01-01", end: "2026-12-31" },
  criteria: "Data de abertura do atendimento.",
  indicators: [
    { label: "Atendimentos", text: "80" },
    { label: "Valor total", text: "R$ 15.160,00", cents: total },
  ],
  columns: ["Abertura", "Código", "Cliente", "Equipamento", "Técnico", "Status", "Valor"],
  colTypes: ["date", "text", "text", "text", "text", "text", "money"],
  rows,
};

describe("exportação de relatórios", () => {
  it("gera PDF com paginação automática para relatórios extensos", async () => {
    const blob = await exportReportPdf(data);
    expect(blob.size).toBeGreaterThan(5000);
    expect(blob.type).toBe("application/pdf");
    writeFileSync("/tmp/multi.pdf", Buffer.from(await blob.arrayBuffer()));
  });

  it("gera Excel com abas Resumo e Detalhamento, valores numéricos e datas reais", async () => {
    const blob = await exportReportXlsx(data);
    expect(blob.size).toBeGreaterThan(3000);
    writeFileSync("/tmp/multi.xlsx", Buffer.from(await blob.arrayBuffer()));
    const XLSX = await import("xlsx");
    const wb = XLSX.read(Buffer.from(await blob.arrayBuffer()), { type: "buffer", cellDates: true });
    expect(wb.SheetNames).toEqual(["Resumo", "Detalhamento"]);
    const det = wb.Sheets["Detalhamento"]!;
    // 80 linhas + cabeçalho
    const ref = det["!ref"]!;
    expect(ref).toContain("A81");
    // Valor monetário é número (não texto) com formato de moeda
    const money = det["G2"]!;
    expect(typeof money.v).toBe("number");
    expect(money.v).toBe(150);
    expect(money.z).toContain("R$");
    // Data é célula de data real
    const date = det["A2"]!;
    expect(date.v instanceof Date || typeof date.v === "number").toBe(true);
    // Resumo: indicador monetário numérico e igual ao total da tela
    const resumo = wb.Sheets["Resumo"]!;
    const valorTotal = resumo["B8"]!;
    expect(valorTotal.v).toBe(total / 100);
  });

  it("nome de arquivo inclui relatório e período", () => {
    expect(reportFilename(data, "pdf")).toBe("maqnolar-relatorio-de-atendimentos-2026-01-01_a_2026-12-31.pdf");
  });
});
