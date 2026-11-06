import { describe, expect, it } from "vitest";
import { calcQuoteTotals } from "@/lib/quote-math";

describe("calcQuoteTotals", () => {
  it("soma mão de obra + peças (exemplo da especificação: 600 + 400 = 1000)", () => {
    const t = calcQuoteTotals(60000, [
      { description: "Motor", quantity: 1, unitPriceCents: 40000 },
    ]);
    expect(t.partsTotalCents).toBe(40000);
    expect(t.totalCents).toBe(100000);
  });

  it("multiplica quantidade × valor unitário de cada peça", () => {
    const t = calcQuoteTotals(15000, [
      { description: "Correia", quantity: 2, unitPriceCents: 3500 },
      { description: "Rolamento", quantity: 3, unitPriceCents: 1000 },
    ]);
    expect(t.parts[0].totalCents).toBe(7000);
    expect(t.parts[1].totalCents).toBe(3000);
    expect(t.partsTotalCents).toBe(10000);
    expect(t.totalCents).toBe(25000);
  });

  it("orçamento sem peças tem total igual à mão de obra", () => {
    const t = calcQuoteTotals(8000, []);
    expect(t.partsTotalCents).toBe(0);
    expect(t.totalCents).toBe(8000);
  });

  it("arredonda totais de peças com quantidade fracionária", () => {
    const t = calcQuoteTotals(0, [{ description: "Cabo (m)", quantity: 2.5, unitPriceCents: 333 }]);
    expect(t.parts[0].totalCents).toBe(833);
    expect(t.totalCents).toBe(833);
  });
});
