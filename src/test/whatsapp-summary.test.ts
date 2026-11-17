import { describe, it, expect } from "vitest";
import { completionSummaryText, whatsappLink } from "@/lib/whatsapp-summary";

const base = { code: "ATD-TESTE", customerName: "Cliente Fictício", technicianName: "Técnico Fictício", completedAt: "2026-11-17T15:00:00Z" };

describe("resumo de conclusão no WhatsApp", () => {
  it("visita traz total R$30 e divisão 20/10", () => {
    const t = completionSummaryText({ ...base, kind: "visita" });
    expect(t).toContain("Somente visita realizada");
    expect(t).toMatch(/Total: R\$\s?30,00/);
    expect(t).toMatch(/Técnico: R\$\s?20,00 · MaqnoLar: R\$\s?10,00/);
  });
  it("serviço lista peças com valores", () => {
    const t = completionSummaryText({ ...base, kind: "servico", totalCents: 25000, parts: [{ description: "Capacitor", cents: 4000 }] });
    expect(t).toMatch(/Total cobrado: R\$\s?250,00/);
    expect(t).toMatch(/- Capacitor: R\$\s?40,00/);
  });
  it("serviço sem peças informa", () => {
    expect(completionSummaryText({ ...base, kind: "servico", totalCents: 10000, parts: [] })).toContain("Sem peças trocadas");
  });
  it("link vai para +55 85 98457-4934", () => {
    expect(whatsappLink("oi")).toBe("https://wa.me/5585984574934?text=oi");
  });
});
