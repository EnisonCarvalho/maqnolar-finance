import { describe, expect, it } from "vitest";
import { formatBRL, parseBRLToCents } from "@/lib/format";

describe("formatBRL", () => {
  it("formata centavos em reais no padrão brasileiro", () => {
    expect(formatBRL(3000)).toBe("R$ 30,00");
    expect(formatBRL(2000)).toBe("R$ 20,00");
    expect(formatBRL(100000)).toBe("R$ 1.000,00");
  });

  it("retorna traço para valores ausentes", () => {
    expect(formatBRL(null)).toBe("—");
    expect(formatBRL(undefined)).toBe("—");
  });
});

describe("parseBRLToCents", () => {
  it("converte texto brasileiro em centavos inteiros", () => {
    expect(parseBRLToCents("30,00")).toBe(3000);
    expect(parseBRLToCents("1.000,00")).toBe(100000);
    expect(parseBRLToCents("20")).toBe(2000);
  });

  it("rejeita texto inválido", () => {
    expect(parseBRLToCents("")).toBeNull();
    expect(parseBRLToCents("abc")).toBeNull();
  });
});
