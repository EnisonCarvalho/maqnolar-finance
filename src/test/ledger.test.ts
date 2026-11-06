import { describe, expect, it } from "vitest";
import { buildEntries, summarize, closingStatus, type LedgerOrder, type LedgerPayment } from "@/lib/ledger-math";

const W = "tech-westerley";
const C = "tech-carlos";

function order(partial: Partial<LedgerOrder> = {}): LedgerOrder {
  return {
    orderId: "o1",
    code: "ATD-00001",
    customerName: "Cliente",
    technicianId: W,
    totalCents: 100000,
    technicianShareCents: 30000,
    companyShareCents: 30000,
    partsByTechnician: {},
    partsByCompanyCents: 0,
    ...partial,
  };
}
let seq = 0;
function pay(p: Partial<LedgerPayment>): LedgerPayment {
  seq += 1;
  return {
    id: `p${seq}`,
    orderId: "o1",
    amountCents: 100000,
    paidAt: "2026-11-02",
    createdAt: `2026-11-02T10:00:${String(seq).padStart(2, "0")}Z`,
    receiverType: "maqnolar",
    receiverTechnicianId: null,
    ...p,
  };
}
const tech = (orders: LedgerOrder[], payments: LedgerPayment[], transfers = [] as Parameters<typeof summarize>[1], start: string | null = null, end: string | null = null) =>
  summarize(buildEntries(orders, payments), transfers, start, end).find((s) => s.technicianId === W)!;

describe("Cenários obrigatórios (recebimentos efetivos)", () => {
  it("A: técnico pagou a peça de R$ 400 e MaqnoLar recebeu R$ 1.000 → MaqnoLar repassa R$ 700", () => {
    const s = tech([order({ partsByTechnician: { [W]: 40000 } })], [pay({ receiverType: "maqnolar" })]);
    expect(s.pendingCents).toBe(70000);
    expect(s.reimbursementCents).toBe(40000);
    expect(s.technicianShareCents).toBe(30000);
    expect(s.companyShareCents).toBe(30000);
  });

  it("B: técnico pagou a peça e recebeu R$ 1.000 → técnico repassa R$ 300", () => {
    const s = tech([order({ partsByTechnician: { [W]: 40000 } })], [pay({ receiverType: "tecnico", receiverTechnicianId: W })]);
    expect(s.pendingCents).toBe(-30000);
  });

  it("C: MaqnoLar pagou a peça e técnico recebeu R$ 1.000 → técnico repassa R$ 700", () => {
    const s = tech([order({ partsByCompanyCents: 40000 })], [pay({ receiverType: "tecnico", receiverTechnicianId: W })]);
    expect(s.pendingCents).toBe(-70000);
    expect(s.companyShareCents).toBe(70000);
  });

  it("D: visita recusada R$ 30 recebida integralmente pelo técnico → repassa R$ 10", () => {
    const visit = order({ totalCents: 3000, technicianShareCents: 2000, companyShareCents: 1000 });
    const s = tech([visit], [pay({ amountCents: 3000, receiverType: "tecnico", receiverTechnicianId: W })]);
    expect(s.technicianShareCents).toBe(2000);
    expect(s.pendingCents).toBe(-1000);
  });

  it("sem recebimento efetivo não há saldo, mesmo com valores previstos", () => {
    const s = summarize(buildEntries([order({ partsByTechnician: { [W]: 40000 } })], []), [], null, null);
    expect(s).toHaveLength(0);
  });
});

describe("Pagamentos parciais e recebedores diferentes", () => {
  it("cliente paga R$ 500 à MaqnoLar e R$ 500 ao técnico (cenário A): saldo final R$ 200 a pagar", () => {
    const o = order({ partsByTechnician: { [W]: 40000 } });
    const s = tech([o], [pay({ amountCents: 50000, paidAt: "2026-11-01" }), pay({ amountCents: 50000, paidAt: "2026-11-03", receiverType: "tecnico", receiverTechnicianId: W })]);
    expect(s.receivedFromClientsCents).toBe(100000);
    expect(s.pendingCents).toBe(70000 - 50000);
  });

  it("pagamento parcial reconhece o direito do técnico proporcionalmente", () => {
    const s = tech([order({ partsByTechnician: { [W]: 40000 } })], [pay({ amountCents: 50000 })]);
    expect(s.pendingCents).toBe(35000);
  });

  it("valores com centavos: três parcelas somam exatamente a participação", () => {
    const o = order({ totalCents: 10000, technicianShareCents: 3333, companyShareCents: 6667 });
    const s = tech([o], [pay({ amountCents: 3333 }), pay({ amountCents: 3333 }), pay({ amountCents: 3334 })]);
    expect(s.technicianShareCents).toBe(3333);
    expect(s.pendingCents).toBe(3333);
  });
});

describe("Repasses, compensação e separação por técnico", () => {
  it("repasse parcial reduz o saldo sem zerá-lo", () => {
    const s = tech([order({ partsByTechnician: { [W]: 40000 } })], [pay({})], [
      { id: "t1", technicianId: W, amountCents: 50000, date: "2026-11-02", direction: "empresa_para_tecnico" },
    ]);
    expect(s.pendingCents).toBe(20000);
    expect(s.settledCents).toBe(50000);
    expect(closingStatus(s.pendingCents)).toBe("fechado_com_pendencia");
  });

  it("compensa saldos entre atendimentos do mesmo técnico: deve R$ 700 em um, recebe R$ 700 em outro → zero", () => {
    const o1 = order({ orderId: "o1", partsByTechnician: { [W]: 40000 } }); // A: MaqnoLar deve 700
    const o2 = order({ orderId: "o2", partsByCompanyCents: 40000 }); // C: técnico deve 700
    const s = tech([o1, o2], [pay({ orderId: "o1" }), pay({ orderId: "o2", receiverType: "tecnico", receiverTechnicianId: W })]);
    expect(s.toPayTechnicianCents).toBe(70000);
    expect(s.toReceiveFromTechnicianCents).toBe(70000);
    expect(s.compensatedCents).toBe(70000);
    expect(s.pendingCents).toBe(0);
    expect(closingStatus(s.pendingCents)).toBe("fechado");
  });

  it("não mistura saldos de técnicos diferentes", () => {
    const o1 = order({ orderId: "o1", technicianId: W });
    const o2 = order({ orderId: "o2", technicianId: C });
    const all = summarize(buildEntries([o1, o2], [pay({ orderId: "o1" }), pay({ orderId: "o2", receiverType: "tecnico", receiverTechnicianId: C })]), [], null, null);
    expect(all.find((s) => s.technicianId === W)!.pendingCents).toBe(30000);
    expect(all.find((s) => s.technicianId === C)!.pendingCents).toBe(-70000);
  });

  it("técnico que recebe por atendimento de outro deve o valor integral à MaqnoLar", () => {
    const all = summarize(buildEntries([order({ technicianId: W })], [pay({ receiverType: "tecnico", receiverTechnicianId: C })]), [], null, null);
    expect(all.find((s) => s.technicianId === C)!.pendingCents).toBe(-100000);
    expect(all.find((s) => s.technicianId === W)!.pendingCents).toBe(30000);
  });
});

describe("Datas financeiras", () => {
  it("atendimento aberto em 31/10 e pago em 02/11 entra no período de novembro, não no de outubro", () => {
    const entries = buildEntries([order()], [pay({ paidAt: "2026-11-02" })]);
    expect(summarize(entries, [], "2026-10-01", "2026-10-31")).toHaveLength(0);
    expect(summarize(entries, [], "2026-11-01", "2026-11-30")[0].receivedFromClientsCents).toBe(100000);
  });
});
