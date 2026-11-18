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
