import { describe, expect, it } from "vitest";
import { refundSplit } from "@/lib/refund-math";
import { splitLabor } from "@/lib/settlement-math";

describe("OS fictícia R$ 500 com R$ 200 de peças (50/50)", () => {
  const share = splitLabor(50000 - 20000, { technicianPercent: 50, companyPercent: 50, technicianFixedCents: null, companyFixedCents: null } as any);
  it("técnico recebe R$ 150", () => expect(share.technicianShareCents).toBe(15000));
  it("MaqnoLar recebe R$ 150", () => expect(share.companyShareCents).toBe(15000));
});

describe("devolução sem duplicidade", () => {
  it("devolução parcial deixa só o saldo", () => expect(refundSplit(15000, 5000).remainderCents).toBe(10000));
  it("devolução total zera", () => expect(refundSplit(15000, 15000).remainderCents).toBe(0));
  it("não devolve mais que o pago", () => expect(() => refundSplit(15000, 15001)).toThrow());
});

import { computeIndicators } from "@/lib/cashflow-math";
describe("Fluxo de caixa simplificado: OS R$ 500 com R$ 200 de peças", () => {
  const order = { orderId: "a", competenceDate: "2026-11-18", totalCents: 50000, companyShareCents: 15000, technicianShareCents: 15000, partsCents: 20000, cancelled: false };
  const run = (orders: typeof order[]) => computeIndicators({ orders, customerPayments: [], otherRevenues: [], expenses: [] }, "2026-11-01", "2026-11-30");
  it("faturamento bruto R$ 500", () => expect(run([order]).grossBillingCents).toBe(50000));
  it("receita da MaqnoLar R$ 150", () => expect(run([order]).companyEconomicRevenueCents).toBe(15000));
  it("resultado R$ 150 sem despesas", () => expect(run([order]).economicResultCents).toBe(15000));
  it("confirmação não conta como dinheiro recebido", () => expect(run([order]).receivedByCompanyCents).toBe(0));
});
