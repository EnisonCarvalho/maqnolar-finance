import { describe, it, expect } from "vitest";
import { warrantyEnd, moneyTexts, paymentText, type WarrantyNote } from "./warranty-note";

const note: WarrantyNote = {
  id: "x", order_id: "o", number: "002-2026", order_code: "ATD-00099", customer_name: "Cliente Fictício",
  customer_phone: null, customer_cpf: null, customer_address: null, equipment: "Lavadora",
  service_description: "Troca de bomba", part_names: ["Bomba de drenagem"], technician_name: "Técnico",
  service_date: "2026-11-18", total_cents: 50000, payment_method: "Cartão de crédito", installments: 3,
  warranty_days: 90, warranty_start: "2026-11-18", warranty_end: "2027-02-16", observations: null, issued_at: "",
};

describe("nota de garantia", () => {
  it("validade = início + prazo em dias", () => {
    expect(warrantyEnd("2026-11-18", 90)).toBe("2027-02-16");
  });
  it("OS de R$ 500 com R$ 200 de peças: único valor no PDF é R$ 500,00", () => {
    const m = moneyTexts(note);
    expect(m).toHaveLength(1);
    expect(m[0]!.replace(/\s/g, " ")).toBe("R$ 500,00");
  });
  it("pagamento mostra só forma e parcelas", () => {
    expect(paymentText(note)).toBe("Cartão de crédito em 3x");
  });
});
