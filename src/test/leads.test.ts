import { describe, expect, it } from "vitest";
import { campaignLeadStats, phoneDigits, samePhone } from "@/lib/lead-math";

describe("leads", () => {
  it("normaliza telefone com +55", () => {
    expect(phoneDigits("+55 (85) 98888-7777")).toBe("85988887777");
  });
  it("reconhece o mesmo telefone com e sem nono dígito/DDD", () => {
    expect(samePhone("(85) 98888-7777", "85988887777")).toBe(true);
    expect(samePhone("8888-7777", "(85) 98888-7777")).toBe(true);
    expect(samePhone("(11) 98888-7777", "(85) 98888-7777")).toBe(false);
    expect(samePhone("", "85988887777")).toBe(false);
  });
  it("indicadores não contam o mesmo lead duas vezes", () => {
    const leads = [
      { id: "a", campaign_id: "c", status: "convertido", order_id: "o1" },
      { id: "a", campaign_id: "c", status: "convertido", order_id: "o1" },
      { id: "b", campaign_id: "c", status: "perdido", order_id: null },
      { id: "d", campaign_id: "x", status: "novo", order_id: null },
    ];
    const orders = [{ id: "o1", campaign_id: "c" }, { id: "o1", campaign_id: "c" }, { id: "o2", campaign_id: "c" }];
    expect(campaignLeadStats("c", leads, orders)).toEqual({ leads: 2, converted: 1, lost: 1, orders: 2 });
  });
});
