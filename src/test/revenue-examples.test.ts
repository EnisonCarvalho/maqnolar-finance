import { describe, it, expect } from "vitest";
import { serviceCompositionPreview, visitCompositionPreview } from "@/lib/technician-service";
import { computeIndicators } from "@/lib/cashflow-math";

describe("receita da MaqnoLar", () => {
  const svc = serviceCompositionPreview("500,00", "200,00", { technicianPercent: 50, companyPercent: 50, technicianFixedCents: null, companyFixedCents: null });
  const visit = visitCompositionPreview({ technicianFixedCents: 2000, companyFixedCents: 1000 });
  it("visita de R$ 30 gera R$ 10 para a MaqnoLar", () => expect(visit.companyShareCents).toBe(1000));
  it("serviço de R$ 500 com R$ 200 de peças a 50/50 gera R$ 150", () => { expect(svc.laborCents).toBe(30000); expect(svc.companyShareCents).toBe(15000); });
  it("usa a regra da OS, sem fixar 50/50", () => expect(serviceCompositionPreview("500,00", "200,00", { technicianPercent: 60, companyPercent: 40, technicianFixedCents: null, companyFixedCents: null }).companyShareCents).toBe(12000));
  it("cada OS conta uma vez e confirmação não é recebimento", () => {
    const i = computeIndicators({
      orders: [
        { orderId: "v", competenceDate: "2026-11-17", totalCents: 3000, companyShareCents: 1000, technicianShareCents: 2000, partsCents: 0, cancelled: false },
        { orderId: "s", competenceDate: "2026-11-17", totalCents: 50000, companyShareCents: 15000, technicianShareCents: 15000, partsCents: 20000, cancelled: false },
      ],
      customerPayments: [], otherRevenues: [], expenses: [{ id: "e", amount_cents: 5000, competence_date: "2026-11-17", due_date: "2026-11-17", status: "pendente", paid_cents: 0 }],
    }, "2026-11-01", "2026-11-30");
    expect(i.companyEconomicRevenueCents).toBe(16000);
    expect(i.economicResultCents).toBe(11000);
    expect(i.receivedByCompanyCents).toBe(0);
  });
});
