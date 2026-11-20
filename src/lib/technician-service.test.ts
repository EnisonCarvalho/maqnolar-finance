import { describe, expect, it } from "vitest";
import { completionPreview, initialWarrantyNoteDays, parseWarrantyDays } from "@/lib/technician-service";

describe("parseWarrantyDays", () => {
  it("permite valor em branco como nulo", () => {
    expect(parseWarrantyDays("")).toBeNull();
    expect(parseWarrantyDays("   ")).toBeNull();
    expect(parseWarrantyDays(null)).toBeNull();
    expect(parseWarrantyDays(undefined)).toBeNull();
  });

  it("aceita número inteiro positivo", () => {
    expect(parseWarrantyDays("90")).toBe(90);
    expect(parseWarrantyDays(" 180 ")).toBe(180);
    expect(parseWarrantyDays("1")).toBe(1);
  });

  it("rejeita zero, negativos, decimais e texto", () => {
    expect(() => parseWarrantyDays("0")).toThrow();
    expect(() => parseWarrantyDays("-30")).toThrow();
    expect(() => parseWarrantyDays("90.5")).toThrow();
    expect(() => parseWarrantyDays("90,5")).toThrow();
    expect(() => parseWarrantyDays("90 dias")).toThrow();
  });
});

describe("completionPreview com garantia", () => {
  it("retorna prazo de garantia junto com valor e peças", () => {
    const res = completionPreview("500,00", [{ description: "Bomba", valueReais: "120,00" }], "90");
    expect(res.totalCents).toBe(50000);
    expect(res.partsCents).toBe(12000);
    expect(res.warrantyDays).toBe(90);
  });

  it("permite concluir sem preencher garantia", () => {
    const res = completionPreview("300,00", [], "");
    expect(res.warrantyDays).toBeNull();
  });
});

describe("initialWarrantyNoteDays", () => {
  it("usa o prazo salvo na OS quando informado", () => {
    expect(initialWarrantyNoteDays(90)).toBe("90");
    expect(initialWarrantyNoteDays(180)).toBe("180");
  });

  it("mantém o padrão 90 quando a OS não tem prazo informado", () => {
    expect(initialWarrantyNoteDays(null)).toBe("90");
    expect(initialWarrantyNoteDays(undefined)).toBe("90");
  });
});