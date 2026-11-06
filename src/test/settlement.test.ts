import { describe, expect, it } from "vitest";
import { computeSettlement, splitLabor } from "@/lib/settlement-math";

const RULE_50_50 = { technicianPercent: 50, companyPercent: 50, technicianFixedCents: null, companyFixedCents: null };
const RULE_VISITA = { technicianPercent: null, companyPercent: null, technicianFixedCents: 2000, companyFixedCents: 1000 };

describe("splitLabor", () => {
  it("divide 50/50 a mão de obra de R$ 600,00 (exemplo da especificação)", () => {
    const s = splitLabor(60000, RULE_50_50);
    expect(s.technicianShareCents).toBe(30000);
    expect(s.companyShareCents).toBe(30000);
  });

  it("garante que a soma das participações é igual à mão de obra, mesmo com centavos ímpares", () => {
    const s = splitLabor(9999, RULE_50_50);
    expect(s.technicianShareCents + s.companyShareCents).toBe(9999);
  });

  it("visita recusada usa valores fixos: R$ 20,00 técnico / R$ 10,00 MaqnoLar", () => {
    const s = splitLabor(0, RULE_VISITA);
    expect(s.technicianShareCents).toBe(2000);
    expect(s.companyShareCents).toBe(1000);
  });
});

describe("computeSettlement — cenários da especificação (serviço R$ 1.000, peça R$ 400, mão de obra R$ 600)", () => {
  const base = { totalCents: 100000, technicianShareCents: 30000, companyShareCents: 30000 };

  it("técnico pagou a peça e a MaqnoLar recebeu: repassa R$ 700 ao técnico (R$ 400 reembolso + R$ 300 participação)", () => {
    const s = computeSettlement({
      ...base,
      purchases: [{ buyerType: "tecnico", totalCents: 40000 }],
      receiverType: "maqnolar",
    });
    expect(s.partsPaidByTechnicianCents).toBe(40000);
    expect(s.transferToTechnicianCents).toBe(70000);
    expect(s.transferToCompanyCents).toBe(0);
    expect(s.companyEconomicShareCents).toBe(30000);
  });

  it("técnico pagou a peça e recebeu do cliente: repassa R$ 300 à MaqnoLar", () => {
    const s = computeSettlement({
      ...base,
      purchases: [{ buyerType: "tecnico", totalCents: 40000 }],
      receiverType: "tecnico",
    });
    expect(s.transferToCompanyCents).toBe(30000);
    expect(s.transferToTechnicianCents).toBe(0);
    expect(s.technicianEconomicShareCents).toBe(30000);
  });

  it("MaqnoLar pagou a peça e o técnico recebeu: repassa R$ 700 à MaqnoLar (R$ 400 peça + R$ 300 participação)", () => {
    const s = computeSettlement({
      ...base,
      purchases: [{ buyerType: "maqnolar", totalCents: 40000 }],
      receiverType: "tecnico",
    });
    expect(s.partsPaidByCompanyCents).toBe(40000);
    expect(s.transferToCompanyCents).toBe(70000);
    expect(s.transferToTechnicianCents).toBe(0);
    expect(s.technicianEconomicShareCents).toBe(30000);
  });

  it("sem recebedor definido, não há repasse previsto", () => {
    const s = computeSettlement({ ...base, purchases: [], receiverType: null });
    expect(s.transferToTechnicianCents).toBe(0);
    expect(s.transferToCompanyCents).toBe(0);
  });
});
