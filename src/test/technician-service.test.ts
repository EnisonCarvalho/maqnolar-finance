import { describe, it, expect } from "vitest";
import { canEditTechnicianValue, canStartPartnerService, reportedReaisToCents, canConfirmServiceValues, serviceCompositionPreview, canConfirmVisit, visitCompositionPreview } from "@/lib/technician-service";

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

describe("Somente visita realizada", () => {
  it("confirma visita uma única vez e somente no status de visita concluída", () => {
    expect(canConfirmVisit("visita_concluida", null)).toBe(true);
    expect(canConfirmVisit("servico_concluido", null)).toBe(false);
    expect(canConfirmVisit("visita_concluida", "2026-11-07T00:41:00Z")).toBe(false);
  });
  it("aplica a regra fixa padrão de R$ 30 (20 técnico / 10 MaqnoLar)", () => {
    expect(visitCompositionPreview(null)).toEqual({ totalCents: 3000, technicianShareCents: 2000, companyShareCents: 1000 });
  });
  it("usa a cópia da regra vigente quando configurada", () => {
    expect(visitCompositionPreview({ technicianFixedCents: 2500, companyFixedCents: 1500 })).toEqual({ totalCents: 4000, technicianShareCents: 2500, companyShareCents: 1500 });
  });
  it("não reabre atendimento marcado como somente visita", () => expect(canStartPartnerService("visita_concluida")).toBe(false));
});
import { technicianStep, completionPreview } from "@/lib/technician-service";
describe("conclusão pelo técnico", () => {
  it("aceita 150,00 e 150.00 como R$ 150,00", () => { expect(reportedReaisToCents("150,00")).toBe(15000); expect(reportedReaisToCents("150.00")).toBe(15000); expect(reportedReaisToCents("1.500")).toBe(150000); });
  it("mostra só a etapa atual", () => { expect(technicianStep("novo")).toBe("iniciar"); expect(technicianStep("visita_agendada")).toBe("iniciar"); expect(technicianStep("servico_em_andamento")).toBe("concluir"); expect(technicianStep("servico_concluido")).toBeNull(); });
  it("soma peças e bloqueia soma acima do total", () => {
    expect(completionPreview("150.00", [{ description: "Rolamento", valueReais: "40" }, { description: "Correia", valueReais: "10,50" }]).partsCents).toBe(5050);
    expect(() => completionPreview("100", [{ description: "Motor", valueReais: "120" }])).toThrow();
  });
});

import { serviceCompositionPreview as scp } from "@/lib/technician-service";
describe("confirmação de valores do serviço (exemplo do Enison)", () => {
  it("R$500 cobrados − R$200 peças = R$300 mão de obra, 150/150", () => {
    const p = scp("500,00", "200,00", { technicianPercent: 50, companyPercent: 50, technicianFixedCents: null, companyFixedCents: null });
    expect(p.laborCents).toBe(30000);
    expect(p.technicianShareCents).toBe(15000);
    expect(p.companyShareCents).toBe(15000);
  });
});
