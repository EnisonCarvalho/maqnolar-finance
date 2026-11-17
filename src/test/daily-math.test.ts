import { describe, it, expect } from "vitest";
import { groupDailyByTechnician, type DailyOrder } from "@/lib/daily-math";
const base = { customerName: "C", technicianId: "t1", receivedCents: 0 } as const;
describe("acerto diário por técnico", () => {
  it("soma visita e serviço do dia, mesmo sem pagamento, e separa recebido/repassado", () => {
    const orders: DailyOrder[] = [
      { ...base, orderId: "a", code: "A", kind: "visita", confirmed: true, totalCents: 3000, partsCents: 0, technicianShareCents: 2000, companyShareCents: 1000 },
      { ...base, orderId: "b", code: "B", kind: "servico", confirmed: true, totalCents: 50000, partsCents: 20000, technicianShareCents: 15000, companyShareCents: 15000, receivedCents: 50000 },
      { ...base, orderId: "c", code: "C", kind: "servico", confirmed: false, totalCents: 10000, partsCents: 0, technicianShareCents: null, companyShareCents: null },
    ];
    const g = groupDailyByTechnician(orders, [{ technicianId: "t1", amountCents: 2000, direction: "empresa_para_tecnico" }])[0]!;
    expect(g.realizadoCents).toBe(63000);
    expect(g.companyShareCents).toBe(16000);
    expect(g.technicianShareCents).toBe(17000);
    expect(g.partsCents).toBe(20000);
    expect(g.recebidoCents).toBe(50000);
    expect(g.repassadoCents).toBe(2000);
    expect(g.pendingConfirmation).toBe(1);
  });
});
