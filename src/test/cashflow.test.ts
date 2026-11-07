import { describe, expect, it } from "vitest";
import { buildMovements, computeAccountFlows, computeIndicators, nextDueDate, periodRange, type RawFinance, type Account } from "@/lib/cashflow-math";

const empty: RawFinance = { customerPayments: [], otherRevenues: [], expensePayments: [], partPurchases: [], technicianTransfers: [], accountTransfers: [], partnerMovements: [], distributionPayments: [] };
const BANK: Account = { id: "bank", name: "Banco", ownership: "empresa", openingBalanceCents: 100000, openingDate: "2026-10-01", active: true };
const CASH: Account = { id: "cash", name: "Caixa", ownership: "empresa", openingBalanceCents: 0, openingDate: "2026-10-01", active: true };
const SOCIO: Account = { id: "socio", name: "Conta pessoal", ownership: "socio", openingBalanceCents: 999999, openingDate: "2026-10-01", active: true };
const NOV = ["2026-11-01", "2026-11-30"] as const;

const pay = (p: Partial<RawFinance["customerPayments"][number]>) => ({ id: "p", order_id: "o1", amount_cents: 100000, paid_at: "2026-11-02", receiver_type: "maqnolar", receiver_technician_id: null, account_id: "bank", status: "ativo", ...p });
const order = { orderId: "o1", competenceDate: "2026-10-31", totalCents: 100000, companyShareCents: 30000, technicianShareCents: 30000, partsCents: 40000, cancelled: false };

describe("Integração com atendimentos (R$ 1.000 = peça 400 + mão de obra 600, 300/300)", () => {
  it("confirmação sem pagamento reconhece faturamento/participações sem movimentar caixa", () => {
    const i = computeIndicators({ orders: [{ ...order, competenceDate: "2026-11-06" }], customerPayments: [], otherRevenues: [], expenses: [] }, ...NOV);
    expect(i.grossBillingCents).toBe(100000);
    expect(i.technicianShareCents).toBe(30000);
    expect(i.companyEconomicRevenueCents).toBe(30000);
    expect(i.receivedByCompanyCents).toBe(0);
    expect(buildMovements(empty)).toEqual([]);
    expect(computeAccountFlows([BANK], buildMovements(empty), ...NOV).totals.closingCents).toBe(100000);
  });
  it("faturamento bruto R$ 1.000, receita econômica da MaqnoLar R$ 300 — os R$ 1.000 não são lucro", () => {
    const i = computeIndicators({ orders: [order], customerPayments: [], otherRevenues: [], expenses: [] }, "2026-10-01", "2026-10-31");
    expect(i.grossBillingCents).toBe(100000);
    expect(i.companyEconomicRevenueCents).toBe(30000);
    expect(i.technicianShareCents).toBe(30000);
    expect(i.partsCents).toBe(40000);
    expect(i.economicResultCents).toBe(30000);
  });

  it("competência x caixa: atendimento de outubro pago em 02/11 entra no caixa de novembro", () => {
    const mv = buildMovements({ ...empty, customerPayments: [pay({})] });
    expect(computeAccountFlows([BANK], mv, "2026-10-01", "2026-10-31").totals.inflowCents).toBe(0);
    expect(computeAccountFlows([BANK], mv, ...NOV).totals.inflowCents).toBe(100000);
    const nov = computeIndicators({ orders: [order], customerPayments: [pay({})], otherRevenues: [], expenses: [] }, ...NOV);
    expect(nov.grossBillingCents).toBe(0);
    expect(nov.receivedByCompanyCents).toBe(100000);
  });

  it("pagamento recebido pelo técnico não entra no caixa da empresa", () => {
    const mv = buildMovements({ ...empty, customerPayments: [pay({ receiver_type: "tecnico", receiver_technician_id: "w", account_id: null })] });
    expect(mv).toHaveLength(0);
    const i = computeIndicators({ orders: [order], customerPayments: [pay({ receiver_type: "tecnico" })], otherRevenues: [], expenses: [] }, ...NOV);
    expect(i.receivedByTechniciansCents).toBe(100000);
    expect(i.receivedByCompanyCents).toBe(0);
  });

  it("repasse do técnico entra no caixa mas não é receita; repasse ao técnico sai mas não é despesa", () => {
    const raw = { ...empty, technicianTransfers: [
      { id: "t1", technician_id: "w", amount_cents: 70000, transfer_date: "2026-11-03", direction: "tecnico_para_empresa", account_id: "bank", status: "ativo" },
      { id: "t2", technician_id: "w", amount_cents: 20000, transfer_date: "2026-11-04", direction: "empresa_para_tecnico", account_id: "bank", status: "ativo" },
    ] };
    const f = computeAccountFlows([BANK], buildMovements(raw), ...NOV).totals;
    expect(f.inflowCents).toBe(70000);
    expect(f.outflowCents).toBe(20000);
    const i = computeIndicators({ orders: [], customerPayments: [], otherRevenues: [], expenses: [] }, ...NOV);
    expect(i.companyEconomicRevenueCents).toBe(0);
    expect(i.operationalExpensesCents).toBe(0);
  });

  it("peça paga pela empresa sai do caixa sem virar despesa operacional; peça paga pelo técnico não sai do caixa", () => {
    const raw = { ...empty, partPurchases: [
      { id: "a", order_id: "o1", total_cents: 40000, purchased_at: "2026-11-02T12:00:00Z", buyer_type: "maqnolar", account_id: "bank", description: "Placa" },
      { id: "b", order_id: "o2", total_cents: 40000, purchased_at: "2026-11-02T12:00:00Z", buyer_type: "tecnico", account_id: null, description: "Placa" },
    ] };
    const mv = buildMovements(raw);
    expect(mv).toHaveLength(1);
    expect(mv[0]?.kind).toBe("peca_atendimento");
    expect(computeAccountFlows([BANK], mv, ...NOV).totals.outflowCents).toBe(40000);
  });
});

describe("Receitas, despesas e contas", () => {
  it("receita avulsa recebida entra no caixa e na receita econômica; pendente fica em contas a receber", () => {
    const revs = [
      { id: "r1", description: "Venda", amount_cents: 5000, competence_date: "2026-11-05", received_at: "2026-11-05", account_id: "cash", category_id: null, status: "ativo" },
      { id: "r2", description: "Outra", amount_cents: 2000, competence_date: "2026-11-06", received_at: null, account_id: null, category_id: null, status: "ativo" },
    ];
    const i = computeIndicators({ orders: [], customerPayments: [], otherRevenues: revs, expenses: [] }, ...NOV);
    expect(i.companyEconomicRevenueCents).toBe(7000);
    expect(i.receivedByCompanyCents).toBe(5000);
    expect(i.receivablesCents).toBe(2000);
    expect(computeAccountFlows([CASH], buildMovements({ ...empty, otherRevenues: revs }), ...NOV).totals.inflowCents).toBe(5000);
  });

  it("despesa pendente conta no resultado (competência) e em contas a pagar, mas não sai do caixa", () => {
    const i = computeIndicators({ orders: [], customerPayments: [], otherRevenues: [], expenses: [{ id: "e", amount_cents: 12000, competence_date: "2026-11-10", due_date: "2026-11-20", status: "pendente", paid_cents: 0 }] }, ...NOV);
    expect(i.operationalExpensesCents).toBe(12000);
    expect(i.economicResultCents).toBe(-12000);
    expect(i.payablesCents).toBe(12000);
    expect(computeAccountFlows([BANK], buildMovements(empty), ...NOV).totals.outflowCents).toBe(0);
  });

  it("despesa paga sai do caixa; despesa cancelada e pagamento estornado não contam", () => {
    const raw = { ...empty, expensePayments: [
      { id: "1", expense_id: "e", amount_cents: 12000, paid_at: "2026-11-10", account_id: "bank", status: "ativo" },
      { id: "2", expense_id: "e", amount_cents: 999, paid_at: "2026-11-10", account_id: "bank", status: "estornado" },
    ] };
    const f = computeAccountFlows([BANK], buildMovements(raw), ...NOV);
    expect(f.totals.openingCents).toBe(100000);
    expect(f.totals.outflowCents).toBe(12000);
    expect(f.totals.closingCents).toBe(88000);
    const i = computeIndicators({ orders: [], customerPayments: [], otherRevenues: [], expenses: [{ id: "x", amount_cents: 5000, competence_date: "2026-11-10", due_date: "2026-11-10", status: "cancelada", paid_cents: 0 }] }, ...NOV);
    expect(i.operationalExpensesCents).toBe(0);
    expect(i.payablesCents).toBe(0);
  });

  it("transferência entre contas não altera o saldo total nem gera receita/despesa", () => {
    const raw = { ...empty, accountTransfers: [{ id: "x", from_account_id: "bank", to_account_id: "cash", amount_cents: 30000, transfer_date: "2026-11-05", status: "ativo" }] };
    const r = computeAccountFlows([BANK, CASH], buildMovements(raw), ...NOV);
    expect(r.flows.find((f) => f.accountId === "bank")?.closingCents).toBe(70000);
    expect(r.flows.find((f) => f.accountId === "cash")?.closingCents).toBe(30000);
    expect(r.totals.closingCents).toBe(100000);
  });

  it("conta pessoal de sócio não entra no caixa da empresa", () => {
    const r = computeAccountFlows([BANK, SOCIO], buildMovements(empty), ...NOV);
    expect(r.totals.closingCents).toBe(100000);
  });

  it("saldo inicial considera movimentações anteriores ao período", () => {
    const mv = buildMovements({ ...empty, customerPayments: [pay({ paid_at: "2026-10-15", amount_cents: 5000 })] });
    expect(computeAccountFlows([BANK], mv, ...NOV).totals.openingCents).toBe(105000);
  });
});

describe("Recorrências e períodos", () => {
  it("calcula próximos vencimentos", () => {
    expect(nextDueDate("2026-01-31", "mensal")).toBe("2026-02-28");
    expect(nextDueDate("2026-12-10", "mensal")).toBe("2027-01-10");
    expect(nextDueDate("2026-03-15", "anual")).toBe("2027-03-15");
    expect(nextDueDate("2026-11-28", "semanal")).toBe("2026-12-05");
  });
  it("trimestre e semestre", () => {
    const now = new Date(2026, 10, 6);
    expect(periodRange("trimestre", { start: "", end: "" }, now)).toEqual({ start: "2026-10-01", end: "2026-12-31" });
    expect(periodRange("semestre", { start: "", end: "" }, now)).toEqual({ start: "2026-07-01", end: "2026-12-31" });
  });
});
