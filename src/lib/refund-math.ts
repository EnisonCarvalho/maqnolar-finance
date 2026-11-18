/**
 * Devolução total ou parcial de um lançamento já pago/recebido.
 * O original é estornado e, se parcial, apenas o saldo restante é relançado —
 * assim o valor ativo final é sempre (pago − devolvido), sem duplicidade.
 */
export function refundSplit(paidCents: number, refundCents: number): { remainderCents: number } {
  const refund = Math.round(refundCents);
  if (!Number.isFinite(refund) || refund <= 0) throw new Error("Informe o valor devolvido.");
  if (refund > paidCents) throw new Error("A devolução não pode ser maior que o valor pago.");
  return { remainderCents: paidCents - refund };
}
