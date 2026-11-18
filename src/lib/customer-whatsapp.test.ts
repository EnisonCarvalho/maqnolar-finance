import { describe, it, expect } from "vitest";
import { customerWhatsappNumber, customerGreeting } from "./whatsapp-summary";

describe("WhatsApp do cliente", () => {
  it("adiciona 55 a número com DDD", () => expect(customerWhatsappNumber("(85) 99115-4744")).toBe("5585991154744"));
  it("mantém número que já tem 55", () => expect(customerWhatsappNumber("+55 85 99115-4744")).toBe("5585991154744"));
  it("ausente ou inválido não gera link", () => {
    expect(customerWhatsappNumber(null)).toBeNull();
    expect(customerWhatsappNumber("12345")).toBeNull();
  });
  it("mensagem com primeiro nome e técnico", () =>
    expect(customerGreeting("Maria Souza", "Westerley Cardoso")).toBe("Olá, Maria! Tudo bem? Sou Westerley Cardoso, da equipe da MaqnoLar Assistência Técnica. Estou entrando em contato para combinar os detalhes do atendimento."));
  it("sem nome do cliente", () => expect(customerGreeting("", "Carlos")).toMatch(/^Olá! Tudo bem\? Sou Carlos,/));
});
