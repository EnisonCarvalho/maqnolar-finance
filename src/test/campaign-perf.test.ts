import { describe, expect, it } from "vitest";
import { campaignPerformance, sumPerf, type PerfAlloc, type PerfOrder } from "@/lib/campaign-math";

const S = "2026-11-01", E = "2026-11-30";
const alloc = (amount: number, paid: number, date = "2026-11-05", expenseAmount = amount): PerfAlloc => ({ amount_cents: amount, status: "ativo", expense: { amount_cents: expenseAmount, status: "pendente", competence_date: date, payments: paid ? [{ amount_cents: paid, status: "ativo" }] : [] } });
// Serviço R$1.000: peças R$200, mão de obra R$800 dividida 50/50 → MaqnoLar R$400.
const order = (o: Partial<PerfOrder> = {}): PerfOrder => ({ id: "o1", openedDate: "2026-11-10", competenceDate: "2026-11-12", cancelled: false, totalCents: 100000, companyShareCents: 40000, receivedCents: 100000, ...o });

describe("desempenho de campanhas", () => {
  it("campanha com investimento e receita: usa só a parte da MaqnoLar", () => {
    const p = campaignPerformance({ allocs: [alloc(20000, 20000)], leads: [
      { id: "a", status: "convertido", order_id: "o1", contactedDate: "2026-11-09" },
      { id: "b", status: "perdido", order_id: null, contactedDate: "2026-11-09" },
      { id: "c", status: "novo", order_id: null, contactedDate: "2026-11-09" },
      { id: "d", status: "novo", order_id: null, contactedDate: "2026-11-09" },
    ], orders: [order()] }, S, E);
    expect(p.grossCents).toBe(100000);
    expect(p.companyRevenueCents).toBe(40000);
    expect(p.resultCents).toBe(20000);
    expect(p.roiPct).toBe(100);
    expect(p.cplCents).toBe(5000);
    expect(p.costPerOrderCents).toBe(20000);
    expect(p.conversionPct).toBe(25);
    expect(p.lost).toBe(1);
  });
  it("investimento sem leads: CPL e conversão ficam vazios, ROI -100%", () => {
    const p = campaignPerformance({ allocs: [alloc(30000, 0)], leads: [], orders: [] }, S, E);
    expect(p.cplCents).toBeNull();
    expect(p.conversionPct).toBeNull();
    expect(p.costPerOrderCents).toBeNull();
    expect(p.roiPct).toBe(-100);
    expect(p.investmentPaidCents).toBe(0);
  });
  it("sem investimento: ROI não é calculado", () => {
    const p = campaignPerformance({ allocs: [], leads: [], orders: [order()] }, S, E);
    expect(p.roiPct).toBeNull();
    expect(p.resultCents).toBe(40000);
  });
  it("pagamento parcial: receita recebida proporcional, receita econômica inteira", () => {
    const p = campaignPerformance({ allocs: [], leads: [], orders: [order({ receivedCents: 50000 })] }, S, E);
    expect(p.companyRevenueCents).toBe(40000);
    expect(p.companyRevenueReceivedCents).toBe(20000);
  });
  it("sem duplicidade de atendimento ou lead repetidos", () => {
    const l = { id: "a", status: "convertido", order_id: "o1", contactedDate: "2026-11-09" };
    const p = campaignPerformance({ allocs: [], leads: [l, l], orders: [order(), order()] }, S, E);
    expect(p.leads).toBe(1);
    expect(p.orders).toBe(1);
    expect(p.companyRevenueCents).toBe(40000);
  });
  it("filtro de período e aviso de períodos diferentes", () => {
    const p = campaignPerformance({ allocs: [alloc(20000, 0, "2026-10-20")], leads: [], orders: [order()] }, S, E);
    expect(p.investmentCents).toBe(0);
    expect(p.outsidePeriod).toBe(true);
    const out = campaignPerformance({ allocs: [], leads: [], orders: [order({ competenceDate: "2026-12-02" })] }, S, E);
    expect(out.companyRevenueCents).toBe(0);
  });
  it("atendimento cancelado e sem composição não contam receita", () => {
    const p = campaignPerformance({ allocs: [], leads: [], orders: [order({ cancelled: true }), order({ id: "o2", totalCents: null, companyShareCents: null })] }, S, E);
    expect(p.companyRevenueCents).toBe(0);
    expect(p.orders).toBe(1);
  });
  it("total geral recalcula ROI sobre somas", () => {
    const a = campaignPerformance({ allocs: [alloc(20000, 0)], leads: [], orders: [order()] }, S, E);
    const b = campaignPerformance({ allocs: [alloc(20000, 0)], leads: [], orders: [] }, S, E);
    expect(sumPerf([a, b]).roiPct).toBe(0);
  });
});
