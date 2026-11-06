export const ORDER_STATUSES = [
  "novo",
  "aguardando_agendamento",
  "visita_agendada",
  "tecnico_a_caminho",
  "em_diagnostico",
  "orcamento_enviado",
  "aguardando_aprovacao",
  "orcamento_aprovado",
  "orcamento_recusado",
  "aguardando_peca",
  "servico_em_andamento",
  "servico_concluido",
  "aguardando_pagamento",
  "finalizado",
  "cancelado",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  novo: "Novo atendimento",
  aguardando_agendamento: "Aguardando agendamento",
  visita_agendada: "Visita agendada",
  tecnico_a_caminho: "Técnico a caminho",
  em_diagnostico: "Em diagnóstico",
  orcamento_enviado: "Orçamento enviado",
  aguardando_aprovacao: "Aguardando aprovação",
  orcamento_aprovado: "Orçamento aprovado",
  orcamento_recusado: "Orçamento recusado",
  aguardando_peca: "Aguardando peça",
  servico_em_andamento: "Serviço em andamento",
  servico_concluido: "Serviço concluído",
  aguardando_pagamento: "Aguardando pagamento",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  novo: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  aguardando_agendamento: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  visita_agendada: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  tecnico_a_caminho: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  em_diagnostico: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  orcamento_enviado: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  aguardando_aprovacao: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  orcamento_aprovado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  orcamento_recusado: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  aguardando_peca: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  servico_em_andamento: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  servico_concluido: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  aguardando_pagamento: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  finalizado: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  cancelado: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aprovado: "Aprovado",
  recusado: "Recusado",
  substituido: "Substituído",
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  criacao: "Criação",
  origem_corrigida: "Origem corrigida",
  designacao: "Técnico",
  agendamento: "Agendamento",
  reagendamento: "Reagendamento",
  status: "Status",
  diagnostico: "Diagnóstico",
  observacao: "Observação",
  orcamento: "Orçamento",
  financeiro: "Financeiro",
  conclusao: "Conclusão",
  cancelamento: "Cancelamento",
};
