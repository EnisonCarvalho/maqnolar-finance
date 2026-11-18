import { describe, expect, it } from "vitest";
import { buildSpreadsheetMovements, spreadsheetCash, type RawFinance } from "@/lib/cashflow-math";

const empty: RawFinance = { customerPayments: [], otherRevenues: [], expensePayments: [], partPurchases: [], technicianTransfers: [], accountTransfers: [], partnerMovements: [], distributionPayments: [] };
const service = { orderId: "s", code: "S", totalCents: 50000, companyShareCents: 15000, cancelled: false };
const payment = (id: string, amount: number, orderId = "s", receiver = "maqnolar") => ({ id, order_id: orderId, amount_cents: amount, paid_at: "2026-11-18", receiver_type: receiver, receiver_technician_id: null, account_id: null, status: "ativo" });

describe("caixa em planilha", () => {
  it("confirmar serviço não gera entrada", () => expect(buildSpreadsheetMovements(empty, [service])).toEqual([]));
  it("500 cobrados e 200 em peças geram apenas 150 de entrada da empresa", () => expect(buildSpreadsheetMovements({ ...empty, customerPayments: [payment("1", 50000)] }, [service])[0]?.amountCents).toBe(15000));
  it("visita de 30 gera apenas 10 de entrada da empresa", () => expect(buildSpreadsheetMovements({ ...empty, customerPayments: [payment("1", 3000, "v")] }, [{ ...service, orderId: "v", totalCents: 3000, companyShareCents: 1000 }])[0]?.amountCents).toBe(1000));
  it("preserva regra diferente de 50/50", () => expect(buildSpreadsheetMovements({ ...empty, customerPayments: [payment("1", 50000)] }, [{ ...service, companyShareCents: 12000 }])[0]?.amountCents).toBe(12000));
  it("recebimento pelo técnico não é caixa da empresa", () => expect(buildSpreadsheetMovements({ ...empty, customerPayments: [payment("1", 50000, "s", "tecnico")] }, [service])).toEqual([]));
  it("pagamentos parciais e excesso não duplicam participação", () => {
    const rows = buildSpreadsheetMovements({ ...empty, customerPayments: [payment("1", 25000), payment("2", 25000), payment("3", 10000)] }, [service]);
    expect(rows.map((r) => r.amountCents)).toEqual([7500, 7500]);
  });
  it("não desconta peças novamente nem inclui repasses e transferências", () => {
    const raw: RawFinance = { ...empty, customerPayments: [payment("1", 50000)], partPurchases: [{ id: "p", order_id: "s", total_cents: 20000, purchased_at: "2026-11-18", buyer_type: "maqnolar", account_id: null, description: "Peças" }], technicianTransfers: [{ id: "t", technician_id: "t", amount_cents: 15000, transfer_date: "2026-11-18", direction: "empresa_para_tecnico", account_id: null, status: "ativo" }], accountTransfers: [{ id: "a", from_account_id: "a", to_account_id: "b", amount_cents: 30000, transfer_date: "2026-11-18", status: "ativo" }] };
    expect(spreadsheetCash(buildSpreadsheetMovements(raw, [service]), "2026-11-01", "2026-11-30").cash.totals.closingCents).toBe(15000);
  });
  it("apenas despesa efetivamente paga sai e saldo acumula", () => {
    const raw: RawFinance = { ...empty, customerPayments: [payment("1", 50000)], expensePayments: [{ id: "e", expense_id: "e", amount_cents: 5000, paid_at: "2026-11-19", account_id: "a", status: "ativo" }, { id: "x", expense_id: "e", amount_cents: 1000, paid_at: "2026-11-19", account_id: "a", status: "estornado" }] };
    const sheet = spreadsheetCash(buildSpreadsheetMovements(raw, [service]), "2026-11-19", "2026-11-30");
    expect(sheet.cash.totals).toEqual({ openingCents: 15000, inflowCents: 0, outflowCents: 5000, closingCents: 10000 });
    expect(sheet.movements[0]?.balanceCents).toBe(10000);
  });
});