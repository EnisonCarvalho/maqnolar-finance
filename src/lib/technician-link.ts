/**
 * Regras puras do vínculo conta ↔ técnico (Passo 11A).
 * O vínculo é sempre explícito e feito por um administrador; estas regras
 * são validadas novamente no backend antes de gravar.
 */

export type LinkCheckInput = {
  userExists: boolean;
  userActive: boolean;
  userLinkedTechnicianId: string | null;
  technicianLinkedUserId: string | null;
};

export type LinkCheckResult = { ok: true } | { ok: false; error: string };

/** Valida se uma conta de usuário pode ser vinculada a um técnico. */
export function canLinkTechnicianAccount(input: LinkCheckInput): LinkCheckResult {
  if (!input.userExists) return { ok: false, error: "Usuário não encontrado." };
  if (!input.userActive) return { ok: false, error: "Usuário inativo não pode ser vinculado." };
  if (input.userLinkedTechnicianId) {
    return { ok: false, error: "Esta conta já está vinculada a outro técnico." };
  }
  if (input.technicianLinkedUserId) {
    return { ok: false, error: "Este técnico já possui uma conta vinculada. Desvincule antes." };
  }
  return { ok: true };
}
