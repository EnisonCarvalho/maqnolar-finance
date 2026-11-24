const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  return email.length > 0 && email.length <= 254 && EMAIL_RE.test(email);
}

export function validateTechnicianEmailChange(input: {
  currentAuthEmail: string | null;
  currentProfileEmail: string | null;
  linkedTechnicianEmail?: string | null;
  nextEmail: string;
  targetRoles: string[];
  otherEmails: string[];
}): { ok: true; email: string } | { ok: false; error: string } {
  const email = normalizeEmail(input.nextEmail);
  if (!isValidEmail(email)) {
    return { ok: false, error: "Informe um e-mail válido." };
  }
  if (!input.targetRoles.includes("tecnico") || input.targetRoles.includes("admin")) {
    return { ok: false, error: "Somente o e-mail de técnicos cadastrados pode ser editado por aqui." };
  }
  const authCur = input.currentAuthEmail ? normalizeEmail(input.currentAuthEmail) : null;
  const profCur = input.currentProfileEmail ? normalizeEmail(input.currentProfileEmail) : null;
  const techCur = input.linkedTechnicianEmail ? normalizeEmail(input.linkedTechnicianEmail) : null;
  const techSynced = input.linkedTechnicianEmail === undefined || techCur === email;
  if (authCur === email && profCur === email && techSynced) {
    return { ok: false, error: "O novo e-mail é igual ao e-mail atual." };
  }
  const taken = new Set(input.otherEmails.map(normalizeEmail));
  if (taken.has(email)) {
    return { ok: false, error: "Este e-mail já está cadastrado para outro usuário." };
  }
  return { ok: true, email };
}