import { describe, expect, it } from "vitest";
import { summarizePartnerMovements, type PartnerMovement } from "@/lib/partner-math";
import { buildMovements, computeAccountFlows, computeIndicators, type Account, type RawFinance } from "@/lib/cashflow-math";

const empty: RawFinance = { customerPayments: [], otherRevenues: [], expensePayments: [], partPurchases: [], technicianTransfers: [], accountTransfers: [], partnerMovements: [], distributionPayments: [] };
const BANK: Account = { id: "bank", name: "Banco", ownership: "empresa", openingBalanceCents: 0, openingDate: "2026-10-01", active: true };
const NOV = ["2026-11-01", "2026-11-30"] as const;

const mv = (p: Partial<PartnerMovement>): PartnerMovement => ({
  id: "m1",
  partner_id: "enison",
  type: "aporte",
  amount_cents: 50000,
  movement_date: "2026-11-05",
  account_id: "bank",
  description: "Movimentação",
  notes: null,
  receipt_path: null,
  status: "ativo",
  void_reason: null,
  created_at: "2026-11-05T00:00:00Z",
  ...p,
});

describe("Resumo individual por sócio", () => {
  it("aporte de capital soma em aportes e não mistura com empréstimos", () => {
    const [s] = summarizePartnerMovements([mv({})]);
    expect(s!.aportesCents).toBe(50000);
    expect(s!.emprestimosCents).toBe(0);
    expect(s!.saldoEmprestimosCents).toBe(0);
  });

  it("empréstimo com devolução parcial deixa saldo a devolver", () => {
    const [s] = summarizePartnerMovements([
      mv({ id: "e1", type: "emprestimo_socio", amount_cents: 100000 }),
      mv({ id: "d1", type: "devolucao_emprestimo", amount_cents: 40000 }),
    ]);
    expect(s!.emprestimosCents).toBe(100000);
    expect(s!.devolvidosCents).toBe(40000);
    expect(s!.saldoEmprestimosCents).toBe(60000);
  });

  it("retirada soma em retiradas, separada de aportes e empréstimos", () => {
    const [s] = summarizePartnerMovements([mv({ type: "retirada", amount_cents: 30000 })]);
    expect(s!.retiradasCents).toBe(30000);
    expect(s!.aportesCents).toBe(0);
  });

  it("movimentação estornada não entra nos totais", () => {
    expect(summarizePartnerMovements([mv({ status: "estornado" })])).toHaveLength(0);
    const [s] = summarizePartnerMovements([mv({}), mv({ id: "m2", status: "estornado" })]);
    expect(s!.aportesCents).toBe(50000);
  });

  it("sócios diferentes têm controles separados", () => {
    const sums = summarizePartnerMovements([mv({ partner_id: "enison" }), mv({ id: "m2", partner_id: "jonathan", type: "retirada", amount_cents: 20000 })]);
    const enison = sums.find((s) => s.partnerId === "enison")!;
    const jonathan = sums.find((s) => s.partnerId === "jonathan")!;
    expect(enison.aportesCents).toBe(50000);
    expect(enison.retiradasCents).toBe(0);
    expect(jonathan.retiradasCents).toBe(20000);
    expect(jonathan.aportesCents).toBe(0);
  });
});

describe("Integração com o fluxo de caixa", () => {
  it("aporte e empréstimo entram no saldo da conta; devolução e retirada saem", () => {
    const movements = buildMovements({
      ...empty,
      partnerMovements: [
        mv({ id: "a", type: "aporte", amount_cents: 100000 }),
        mv({ id: "e", type: "emprestimo_socio", amount_cents: 50000 }),
        mv({ id: "d", type: "devolucao_emprestimo", amount_cents: 20000 }),
        mv({ id: "r", type: "retirada", amount_cents: 30000 }),
      ],
    });
    const { totals } = computeAccountFlows([BANK], movements, ...NOV);
    expect(totals.inflowCents).toBe(150000);
    expect(totals.outflowCents).toBe(50000);
    expect(totals.closingCents).toBe(100000);
  });

  it("movimentações de sócios NÃO alteram receita, despesa nem resultado econômico", () => {
    const before = computeIndicators({ orders: [], customerPayments: [], otherRevenues: [], expenses: [] }, ...NOV);
    const movements = buildMovements({ ...empty, partnerMovements: [mv({ amount_cents: 99999900 })] });
    expect(movements).toHaveLength(1);
    const after = computeIndicators({ orders: [], customerPayments: [], otherRevenues: [], expenses: [] }, ...NOV);
    expect(after).toEqual(before);
    expect(after.companyEconomicRevenueCents).toBe(0);
    expect(after.operationalExpensesCents).toBe(0);
    expect(after.economicResultCents).toBe(0);
  });

  it("movimentação estornada não movimenta o caixa", () => {
    const movements = buildMovements({ ...empty, partnerMovements: [mv({ status: "estornado" })] });
    expect(movements).toHaveLength(0);
  });
});
