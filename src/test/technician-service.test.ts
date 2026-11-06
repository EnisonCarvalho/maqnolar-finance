import { describe, it, expect } from "vitest";
import { canEditTechnicianValue, canStartPartnerService, reportedReaisToCents } from "@/lib/technician-service";

describe("Serviço do técnico parceiro", () => {
  it("inicia sem diagnóstico ou orçamento", () => { expect(canStartPartnerService("visita_agendada")).toBe(true); expect(canStartPartnerService("novo")).toBe(true); });
  it("permite incluir valor após conclusão sem apuração", () => expect(canEditTechnicianValue("servico_concluido", null)).toBe(true));
  it("bloqueia declaração após apuração mesmo em serviço concluído", () => expect(canEditTechnicianValue("servico_concluido", "2026-11-06T22:46:00Z")).toBe(false));
  it("não reabre serviço concluído", () => expect(canStartPartnerService("servico_concluido")).toBe(false));
  it("converte reais em centavos sem confiar em totais do navegador", () => expect(reportedReaisToCents("1.000,50")).toBe(100050));
  it("rejeita negativos e casas decimais extras", () => { expect(() => reportedReaisToCents("-10,00")).toThrow(); expect(() => reportedReaisToCents("1,001")).toThrow(); });
});