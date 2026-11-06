import { describe, expect, it } from "vitest";
import { distributionStatus, partnerShareCents, summarizeDistributions, type DistributionPayment, type ProfitDistribution } from "@/lib/profit-math";
import { buildMovements, computeAccountFlows, computeIndicators, type Account, type RawFinance } from "@/lib/cashflow-math";

const empty: RawFinance = { customerPayments: [], otherRevenues: [], expensePayments: [], partPurchases: [], technicianTransfers: [], accountTransfers: [], partnerMovements: [], distributionPayments: [] };
const BANK: Account = { id: "bank", name: "Banco", ownership: "empresa", openingBalanceCents: 200000, openingDate: "2026-10-01", active: true };
const NOV = ["2026-11-01", "2026-11-30"] as const;

const dist = (p: Partial<ProfitDistribution>): ProfitDistribution => ({
  id: "d1", total_cents: 100000, decision_date: "2026-11-03", notes: null, status: "ativa", void_reason: null, created_at: "2026-11-03T00:00:00Z", ...p,
});
const pay = (p: Partial<DistributionPayment>): DistributionPayment => ({
  id: "p1", distribution_id: "d1", partner_id: "enison", amount_cents: 50000, paid_at: "2026-11-05", account_id: "bank", notes: null, receipt_path: null, status: "ativo", void_reason: null, created_at: "2026-11-05T00:00:00Z", ...p,
});

describe("Distribuição de R$ 1.000 (50/50)", () => {
  it("cada sócio tem participação de R$ 500", () => {
    expect(partnerShareCents(100000)).toBe(50000);
  });

  it("pagamento parcial em datas diferentes mantém o pendente por sócio", () => {
    const st = distributionStatus(dist({}), [pay({ amount_cents: 20000, paid_at: "2026-11-05" })]);
    expect(st.paidTotalCents).toBe(20000);
    expect(st.pendingCents).toBe(80000);
    expect(st.pendingByPartner("enison")).toBe(30000);
    expect(st.pendingByPartner("jonathan")).toBe(50000);
  });

  it("pagamento estornado volta a contar como pendente", () => {
    const st = distributionStatus(dist({}), [pay({ status: "estornado" })]);
    expect(st.paidTotalCents).toBe(0);
    expect(st.pendingByPartner("enison")).toBe(50000);
  });

  it("totais gerais: aprovado, pago por sócio e pendente", () => {
    const t = summarizeDistributions([dist({})], [pay({}), pay({ id: "p2", partner_id: "jonathan", amount_cents: 50000, paid_at: "2026-11-10" })]);
    expect(t.approvedCents).toBe(100000);
    expect(t.paidCents).toBe(100000);
    expect(t.paidByPartner.get("enison")).toBe(50000);
    expect(t.paidByPartner.get("jonathan")).toBe(50000);
    expect(t.pendingCents).toBe(0);
  });

  it("distribuição estornada sai dos totais", () => {
    const t = summarizeDistributions([dist({ status: "estornada" })], []);
    expect(t.approvedCents).toBe(0);
  });
});

describe("Integração com o fluxo de caixa", () => {
  it("aprovação não movimenta o caixa; somente o pagamento efetivo sai da conta", () => {
    const semPagamento = buildMovements({ ...empty });
    expect(computeAccountFlows([BANK], semPagamento, ...NOV).totals.closingCents).toBe(200000);
    const comPagamento = buildMovements({ ...empty, distributionPayments: [pay({})] });
    const { totals } = computeAccountFlows([BANK], comPagamento, ...NOV);
    expect(totals.outflowCents).toBe(50000);
    expect(totals.closingCents).toBe(150000);
  });

  it("pagamento de distribuição NÃO é despesa operacional nem altera o lucro", () => {
    const before = computeIndicators({ orders: [], customerPayments: [], otherRevenues: [], expenses: [] }, ...NOV);
    const movements = buildMovements({ ...empty, distributionPayments: [pay({})] });
    expect(movements).toHaveLength(1);
    const after = computeIndicators({ orders: [], customerPayments: [], otherRevenues: [], expenses: [] }, ...NOV);
    expect(after).toEqual(before);
    expect(after.operationalExpensesCents).toBe(0);
    expect(after.economicResultCents).toBe(0);
  });

  it("pagamento estornado não movimenta o caixa", () => {
    const movements = buildMovements({ ...empty, distributionPayments: [pay({ status: "estornado" })] });
    expect(movements).toHaveLength(0);
  });
});
