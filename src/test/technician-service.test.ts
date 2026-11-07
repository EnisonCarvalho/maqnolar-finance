import { describe, it, expect } from "vitest";
import { canEditTechnicianValue, canStartPartnerService, reportedReaisToCents, canConfirmServiceValues, serviceCompositionPreview } from "@/lib/technician-service";

describe("Serviço do técnico parceiro", () => {
  it("confirma serviço concluído uma única vez", () => {
    expect(canConfirmServiceValues("servico_concluido", null)).toBe(true);
    expect(canConfirmServiceValues("servico_em_andamento", null)).toBe(false);
    expect(canConfirmServiceValues("servico_concluido", "2026-11-07T00:41:00Z")).toBe(false);
  });
  it("deduz peças e divide a mão de obra 50/50", () => {
    expect(serviceCompositionPreview("1.000,00", "400,00", { technicianPercent: 50, companyPercent: 50, technicianFixedCents: null, companyFixedCents: null })).toEqual({ totalCents: 100000, partsCents: 40000, laborCents: 60000, technicianShareCents: 30000, companyShareCents: 30000 });
  });
  it("permite peças zero e rejeita peças acima do total", () => {
    const rule = { technicianPercent: 50, companyPercent: 50, technicianFixedCents: null, companyFixedCents: null };
    expect(serviceCompositionPreview("500,00", "0,00", rule).laborCents).toBe(50000);
    expect(() => serviceCompositionPreview("500,00", "500,01", rule)).toThrow();
  });
  it("inicia sem diagnóstico ou orçamento", () => { expect(canStartPartnerService("visita_agendada")).toBe(true); expect(canStartPartnerService("novo")).toBe(true); });
  it("permite incluir valor após conclusão sem apuração", () => expect(canEditTechnicianValue("servico_concluido", null)).toBe(true));
  it("bloqueia declaração após apuração mesmo em serviço concluído", () => expect(canEditTechnicianValue("servico_concluido", "2026-11-06T22:46:00Z")).toBe(false));
  it("não reabre serviço concluído", () => expect(canStartPartnerService("servico_concluido")).toBe(false));
  it("converte reais em centavos sem confiar em totais do navegador", () => expect(reportedReaisToCents("1.000,50")).toBe(100050));
  it("rejeita negativos e casas decimais extras", () => { expect(() => reportedReaisToCents("-10,00")).toThrow(); expect(() => reportedReaisToCents("1,001")).toThrow(); });
});