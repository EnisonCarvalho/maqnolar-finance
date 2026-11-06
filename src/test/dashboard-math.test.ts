import { describe, it, expect } from "vitest";
import { operationalCounts, type DashOrder } from "@/lib/dashboard-math";

const S = "2026-11-01";
const E = "2026-11-30";

let seq = 0;
function order(p: Partial<DashOrder>): DashOrder {
  seq += 1;
  return { id: `o${seq}`, status: "visita_agendada", opened_at: "2026-11-10T12:00:00Z", scheduled_start: null, completed_at: null, ...p };
}

describe("operationalCounts", () => {
  it("conta atendimentos abertos no período, inclusive cancelados", () => {
    const c = operationalCounts([
      order({ opened_at: "2026-11-05T12:00:00Z" }),
      order({ opened_at: "2026-10-31T12:00:00Z" }),
      order({ status: "cancelado", opened_at: "2026-11-20T12:00:00Z" }),
    ], S, E);
    expect(c.atendimentosPeriodo).toBe(2);
    expect(c.canceladosPeriodo).toBe(1);
  });

  it("retratos por status ignoram cancelados e o período", () => {
    const c = operationalCounts([
      order({ status: "visita_agendada", opened_at: "2026-01-01T12:00:00Z" }),
      order({ status: "orcamento_enviado", opened_at: "2026-01-01T12:00:00Z" }),
      order({ status: "servico_em_andamento", opened_at: "2026-01-01T12:00:00Z" }),
      order({ status: "cancelado", opened_at: "2026-01-01T12:00:00Z" }),
    ], S, E);
    expect(c.visitasAgendadas).toBe(1);
    expect(c.orcamentosAguardando).toBe(1);
    expect(c.emAndamento).toBe(1);
    expect(c.atendimentosPeriodo).toBe(0);
  });

  it("concluídos contam pela data de conclusão, não pela abertura", () => {
    const c = operationalCounts([
      order({ status: "finalizado", opened_at: "2026-10-20T12:00:00Z", completed_at: "2026-11-02T12:00:00Z" }),
      order({ status: "finalizado", opened_at: "2026-11-01T12:00:00Z", completed_at: "2026-12-01T12:00:00Z" }),
      order({ status: "finalizado", opened_at: "2026-11-01T12:00:00Z", completed_at: null }),
    ], S, E);
    expect(c.concluidosPeriodo).toBe(1);
  });

  it("sem atendimentos, todos os indicadores são zero", () => {
    const c = operationalCounts([], S, E);
    expect(c).toEqual({ atendimentosPeriodo: 0, visitasAgendadas: 0, orcamentosAguardando: 0, emAndamento: 0, concluidosPeriodo: 0, canceladosPeriodo: 0 });
  });
});
