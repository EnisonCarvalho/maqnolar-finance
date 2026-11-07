/**
 * Indicadores operacionais do Dashboard.
 * Contagens por status são retratos do momento; contagens "do período" usam a data de abertura/conclusão.
 * Datas convertidas para o fuso de Fortaleza (UTC-3), mesmo critério dos demais módulos.
 */

export type DashOrder = {
  id: string;
  status: string;
  opened_at: string;
  scheduled_start: string | null;
  completed_at: string | null;
  financial_confirmed_at?: string | null;
};

export type OperationalCounts = {
  atendimentosPeriodo: number;
  visitasAgendadas: number;
  orcamentosAguardando: number;
  emAndamento: number;
  concluidosPeriodo: number;
  confirmadosPeriodo: number;
  canceladosPeriodo: number;
};

const fzDate = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const inRange = (d: string, s: string, e: string) => d >= s && d <= e;

const EM_ANDAMENTO = ["tecnico_a_caminho", "em_diagnostico", "servico_em_andamento", "aguardando_peca"];
const AGUARDANDO_APROVACAO = ["orcamento_enviado", "aguardando_aprovacao"];

export function operationalCounts(orders: DashOrder[], start: string, end: string): OperationalCounts {
  const active = orders.filter((o) => o.status !== "cancelado");
  return {
    atendimentosPeriodo: orders.filter((o) => inRange(fzDate(o.opened_at), start, end)).length,
    visitasAgendadas: active.filter((o) => o.status === "visita_agendada").length,
    orcamentosAguardando: active.filter((o) => AGUARDANDO_APROVACAO.includes(o.status)).length,
    emAndamento: active.filter((o) => EM_ANDAMENTO.includes(o.status)).length,
    concluidosPeriodo: active.filter((o) => o.completed_at && inRange(fzDate(o.completed_at), start, end)).length,
    confirmadosPeriodo: active.filter((o) => o.financial_confirmed_at && o.completed_at && inRange(fzDate(o.completed_at), start, end)).length,
    canceladosPeriodo: orders.filter((o) => o.status === "cancelado" && inRange(fzDate(o.opened_at), start, end)).length,
  };
}
