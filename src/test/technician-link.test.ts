import { describe, expect, it } from "vitest";
import { canLinkTechnicianAccount } from "@/lib/technician-link";

describe("canLinkTechnicianAccount", () => {
  it("permite vincular conta ativa e livre a técnico sem vínculo", () => {
    expect(
      canLinkTechnicianAccount({
        userExists: true,
        userActive: true,
        userLinkedTechnicianId: null,
        technicianLinkedUserId: null,
      }),
    ).toEqual({ ok: true });
  });

  it("bloqueia usuário inexistente", () => {
    const r = canLinkTechnicianAccount({
      userExists: false,
      userActive: false,
      userLinkedTechnicianId: null,
      technicianLinkedUserId: null,
    });
    expect(r.ok).toBe(false);
  });

  it("bloqueia usuário inativo", () => {
    const r = canLinkTechnicianAccount({
      userExists: true,
      userActive: false,
      userLinkedTechnicianId: null,
      technicianLinkedUserId: null,
    });
    expect(r).toEqual({ ok: false, error: "Usuário inativo não pode ser vinculado." });
  });

  it("bloqueia conta já vinculada a outro técnico", () => {
    const r = canLinkTechnicianAccount({
      userExists: true,
      userActive: true,
      userLinkedTechnicianId: "outro-tecnico",
      technicianLinkedUserId: null,
    });
    expect(r.ok).toBe(false);
  });

  it("bloqueia técnico que já possui conta vinculada", () => {
    const r = canLinkTechnicianAccount({
      userExists: true,
      userActive: true,
      userLinkedTechnicianId: null,
      technicianLinkedUserId: "usuario-existente",
    });
    expect(r).toEqual({ ok: false, error: "Este técnico já possui uma conta vinculada. Desvincule antes." });
  });
});
