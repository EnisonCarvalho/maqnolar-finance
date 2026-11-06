import { describe, expect, it } from "vitest";
import { allocationPaid, campaignTotals, expenseAvailable, overlapsPeriod } from "@/lib/campaign-math";

const exp = (amount: number, paid: number[], status = "pendente") => ({ amount_cents: amount, status, payments: paid.map((p) => ({ amount_cents: p, status: "ativo" })) });

describe("campanhas", () => {
  it("valor pago do vínculo é proporcional ao pago da despesa", () => {
    // despesa R$1.000, paga R$500, vínculo de R$600 → R$300 pago
    expect(allocationPaid({ amount_cents: 60000, status: "ativo", expense: exp(100000, [50000]) })).toBe(30000);
  });
  it("registrado separado de pago e saldo do orçamento", () => {
    const t = campaignTotals(150000, [
      { amount_cents: 60000, status: "ativo", expense: exp(100000, [50000]) },
      { amount_cents: 40000, status: "ativo", expense: exp(40000, [40000]) },
      { amount_cents: 99999, status: "removido", expense: exp(100000, [100000]) },
    ]);
    expect(t).toEqual({ planned: 150000, registered: 100000, paid: 70000, balance: 50000 });
  });
  it("despesa cancelada não conta", () => {
    expect(campaignTotals(0, [{ amount_cents: 1000, status: "ativo", expense: exp(1000, [], "cancelada") }]).registered).toBe(0);
  });
  it("disponível para distribuir nunca é negativo", () => {
    expect(expenseAvailable(100000, [60000, 30000])).toBe(10000);
    expect(expenseAvailable(100000, [60000, 50000])).toBe(0);
  });
  it("sobreposição de período", () => {
    expect(overlapsPeriod("2026-01-10", null, "2026-02-01", "2026-02-28")).toBe(true);
    expect(overlapsPeriod("2026-01-10", "2026-01-31", "2026-02-01", "2026-02-28")).toBe(false);
  });
});
