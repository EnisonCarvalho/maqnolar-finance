import { describe, expect, it } from "vitest";
import { isValidEmail, normalizeEmail, validateTechnicianEmailChange } from "@/lib/user-email";

describe("Edição de e-mail de técnicos", () => {
  it("normaliza e valida formato de e-mail", () => {
    expect(normalizeEmail("  Dario@MaqnoLar.com ")).toBe("dario@maqnolar.com");
    expect(isValidEmail("dario@maqnolar.com")).toBe(true);
    expect(isValidEmail("invalido")).toBe(false);
    expect(isValidEmail("sem-dominio@")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("aceita alteração válida para técnico cadastrado", () => {
    const res = validateTechnicianEmailChange({
      currentAuthEmail: "antigo@exemplo.com",
      currentProfileEmail: "antigo@exemplo.com",
      linkedTechnicianEmail: "antigo@exemplo.com",
      nextEmail: "  Novo@Exemplo.com ",
      targetRoles: ["tecnico"],
      otherEmails: ["outro@exemplo.com"],
    });
    expect(res).toEqual({ ok: true, email: "novo@exemplo.com" });
  });

  it("impede duplicidade com outro usuário (case-insensitive)", () => {
    const res = validateTechnicianEmailChange({
      currentAuthEmail: "antigo@exemplo.com",
      currentProfileEmail: "antigo@exemplo.com",
      nextEmail: "OUTRO@EXEMPLO.COM",
      targetRoles: ["tecnico"],
      otherEmails: ["outro@exemplo.com"],
    });
    expect(res.ok).toBe(false);
  });

  it("bloqueia alteração de administrador ou usuário sem perfil técnico", () => {
    const adminRes = validateTechnicianEmailChange({
      currentAuthEmail: "admin@exemplo.com",
      currentProfileEmail: "admin@exemplo.com",
      nextEmail: "novo@exemplo.com",
      targetRoles: ["admin"],
      otherEmails: [],
    });
    expect(adminRes.ok).toBe(false);

    const noneRes = validateTechnicianEmailChange({
      currentAuthEmail: "sem@exemplo.com",
      currentProfileEmail: "sem@exemplo.com",
      nextEmail: "novo@exemplo.com",
      targetRoles: [],
      otherEmails: [],
    });
    expect(noneRes.ok).toBe(false);
  });

  it("permite sincronizar quando auth difere do cadastro de técnico já atualizado", () => {
    const res = validateTechnicianEmailChange({
      currentAuthEmail: "antigo@exemplo.com",
      currentProfileEmail: "antigo@exemplo.com",
      linkedTechnicianEmail: "novo@exemplo.com",
      nextEmail: "novo@exemplo.com",
      targetRoles: ["tecnico"],
      otherEmails: [],
    });
    expect(res).toEqual({ ok: true, email: "novo@exemplo.com" });
  });

  it("recusa quando o novo e-mail já é igual ao atual em todos os cadastros", () => {
    const res = validateTechnicianEmailChange({
      currentAuthEmail: "mesmo@exemplo.com",
      currentProfileEmail: "mesmo@exemplo.com",
      linkedTechnicianEmail: "mesmo@exemplo.com",
      nextEmail: "MESMO@exemplo.com",
      targetRoles: ["tecnico"],
      otherEmails: [],
    });
    expect(res.ok).toBe(false);
  });
});