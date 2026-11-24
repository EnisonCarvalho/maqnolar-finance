export type RecoveryUrlState =
  | { kind: "error"; code: string; message: string }
  | { kind: "token_hash"; tokenHash: string }
  | { kind: "session_url" }
  | { kind: "none" };

export type PasswordUpdateErrorResult = {
  expired: boolean;
  message: string;
};

function readParams(raw: string): URLSearchParams {
  const cleaned = raw.startsWith("#") || raw.startsWith("?") ? raw.slice(1) : raw;
  return new URLSearchParams(cleaned);
}

export function parseRecoveryUrl(search: string, hash: string): RecoveryUrlState {
  const searchParams = readParams(search);
  const hashParams = readParams(hash);

  const errorCode =
    hashParams.get("error_code") ??
    searchParams.get("error_code") ??
    hashParams.get("error") ??
    searchParams.get("error");

  if (errorCode) {
    const desc =
      hashParams.get("error_description") ??
      searchParams.get("error_description") ??
      "";
    const normalized = `${errorCode} ${desc}`.toLowerCase();
    const isExpiredOrUsed =
      normalized.includes("expired") ||
      normalized.includes("otp_expired") ||
      normalized.includes("invalid") ||
      normalized.includes("access_denied");

    return {
      kind: "error",
      code: errorCode,
      message: isExpiredOrUsed
        ? "Este link de recuperação expirou ou já foi utilizado. Solicite um novo link abaixo."
        : "Não foi possível validar o link de recuperação. Solicite um novo link abaixo.",
    };
  }

  const tokenHash = searchParams.get("token_hash") ?? hashParams.get("token_hash");
  const type = searchParams.get("type") ?? hashParams.get("type");
  if (tokenHash && (type === "recovery" || type === "invite")) {
    return { kind: "token_hash", tokenHash };
  }

  const hasAccessToken = Boolean(hashParams.get("access_token"));
  const hasCode = Boolean(searchParams.get("code"));
  if (hasAccessToken || hasCode || type === "recovery" || type === "invite") {
    return { kind: "session_url" };
  }

  return { kind: "none" };
}

export function classifyPasswordUpdateError(error: {
  code?: string | undefined;
  message?: string | undefined;
}): PasswordUpdateErrorResult {
  const code = (error.code ?? "").toLowerCase();
  const msg = (error.message ?? "").toLowerCase();

  if (code === "same_password" || msg.includes("different from the old password")) {
    return {
      expired: false,
      message: "A nova senha precisa ser diferente da senha anterior.",
    };
  }

  if (code === "weak_password" || msg.includes("weak") || msg.includes("at least")) {
    return {
      expired: false,
      message: "Escolha uma senha mais forte com pelo menos 8 caracteres.",
    };
  }

  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    msg.includes("rate limit") ||
    msg.includes("too many requests")
  ) {
    return {
      expired: false,
      message: "Muitas tentativas em sequência. Aguarde alguns instantes e tente novamente.",
    };
  }

  if (
    code === "session_not_found" ||
    code === "bad_jwt" ||
    code === "otp_expired" ||
    msg.includes("session missing") ||
    msg.includes("auth session") ||
    msg.includes("expired") ||
    msg.includes("invalid token")
  ) {
    return {
      expired: true,
      message: "Este link de recuperação expirou ou já foi utilizado. Solicite um novo link abaixo.",
    };
  }

  return {
    expired: false,
    message: "Não foi possível atualizar a senha. Tente novamente.",
  };
}

export function classifyResetRequestError(error: {
  code?: string | undefined;
  status?: number | undefined;
  message?: string | undefined;
}): string {
  const code = (error.code ?? "").toLowerCase();
  const msg = (error.message ?? "").toLowerCase();
  if (
    error.status === 429 ||
    code === "over_email_send_rate_limit" ||
    msg.includes("rate limit") ||
    msg.includes("security purposes")
  ) {
    return "Aguarde alguns instantes antes de solicitar outro link de recuperação.";
  }
  return "Não foi possível enviar o e-mail de recuperação. Confira o endereço e tente novamente.";
}