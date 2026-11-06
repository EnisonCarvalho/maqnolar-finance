/**
 * Aportes e retiradas dos sócios (Enison e Jonathan).
 *
 * Regras centrais:
 * - Aportes e empréstimos de sócios NÃO são receita operacional; retiradas e devoluções NÃO são despesa.
 * - Movimentam o saldo da conta da empresa (caixa), mas nunca os indicadores de receita/lucro.
 * - Aportes de capital e empréstimos são controlados separadamente.
 * - Retirada não é presumida como distribuição de lucros.
 */

export type PartnerMovementType = "aporte" | "emprestimo_socio" | "devolucao_emprestimo" | "retirada";

export const PARTNER_TYPE_LABELS: Record<PartnerMovementType, string> = {
  aporte: "Aporte de capital",
  emprestimo_socio: "Empréstimo do sócio",
  devolucao_emprestimo: "Devolução de empréstimo",
  retirada: "Retirada / adiantamento",
};

/** Entrada (+) ou saída (−) no caixa da empresa. */
export const PARTNER_TYPE_SIGN: Record<PartnerMovementType, 1 | -1> = {
  aporte: 1,
  emprestimo_socio: 1,
  devolucao_emprestimo: -1,
  retirada: -1,
};

export type PartnerMovement = {
  id: string;
  partner_id: string;
  type: PartnerMovementType;
  amount_cents: number;
  movement_date: string;
  account_id: string;
  description: string;
  notes: string | null;
  receipt_path: string | null;
  status: string;
  void_reason: string | null;
  created_at: string;
};

export type PartnerSummary = {
  partnerId: string;
  aportesCents: number;
  emprestimosCents: number;
  devolvidosCents: number;
  saldoEmprestimosCents: number;
  retiradasCents: number;
};

/** Totais por sócio considerando apenas movimentações ativas. */
export function summarizePartnerMovements(movements: PartnerMovement[]): PartnerSummary[] {
  const byPartner = new Map<string, PartnerSummary>();
  const get = (id: string) => {
    let s = byPartner.get(id);
    if (!s) {
      s = { partnerId: id, aportesCents: 0, emprestimosCents: 0, devolvidosCents: 0, saldoEmprestimosCents: 0, retiradasCents: 0 };
      byPartner.set(id, s);
    }
    return s;
  };
  for (const m of movements) {
    if (m.status !== "ativo") continue;
    const s = get(m.partner_id);
    if (m.type === "aporte") s.aportesCents += m.amount_cents;
    else if (m.type === "emprestimo_socio") s.emprestimosCents += m.amount_cents;
    else if (m.type === "devolucao_emprestimo") s.devolvidosCents += m.amount_cents;
    else if (m.type === "retirada") s.retiradasCents += m.amount_cents;
  }
  for (const s of byPartner.values()) s.saldoEmprestimosCents = s.emprestimosCents - s.devolvidosCents;
  return [...byPartner.values()];
}
