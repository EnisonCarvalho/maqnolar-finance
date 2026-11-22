import { describe, expect, it } from "vitest";
import { completionPreview } from "@/lib/technician-service";
import { splitLabor } from "@/lib/settlement-math";
import { computeIndicators } from "@/lib/cashflow-math";

const rule = { technicianPercent: 50, companyPercent: 50, technicianFixedCents: null, companyFixedCents: null };
function indicators(total: string, partValue: string) {
  const values = completionPreview(total, [{ description: "Bomba", valueReais: partValue }], "90");
  const shares = splitLabor(values.totalCents - values.partsCents, rule);
  return computeIndicators({ orders: [{ orderId: "ficticia", competenceDate: "2026-11-22", totalCents: values.totalCents,
    partsCents: values.partsCents, ...shares, cancelled: false }], customerPayments: [], otherRevenues: [], expenses: [] }, "2026-11-01", "2026-11-30");
}
describe("correção da composição existente", () => {
  it("500 com 200 de peças gera 150 para empresa e técnico", () => {
    const result = indicators("500,00", "200,00");
    expect(result.grossBillingCents).toBe(50000);
    expect(result.companyEconomicRevenueCents).toBe(15000);
    expect(result.technicianShareCents).toBe(15000);
    expect(result.economicResultCents).toBe(15000);
  });
  it("os indicadores usam os valores corrigidos, não a soma com o valor antigo", () => {
    const result = indicators("600,00", "200,00");
    expect(result.grossBillingCents).toBe(60000);
    expect(result.companyEconomicRevenueCents).toBe(20000);
    expect(result.technicianShareCents).toBe(20000);
    expect(result.economicResultCents).toBe(20000);
  });
  it("correção não se transforma em recebimento", () => {
    expect(indicators("600,00", "200,00").receivedByCompanyCents).toBe(0);
  });
  it("usa a regra financeira copiada na OS", () => {
    const values = completionPreview("500,00", [{ description: "Bomba", valueReais: "200,00" }], "120");
    expect(splitLabor(values.totalCents - values.partsCents, { ...rule, technicianPercent: 60, companyPercent: 40 })).toEqual({ technicianShareCents: 18000, companyShareCents: 12000 });
  });
});