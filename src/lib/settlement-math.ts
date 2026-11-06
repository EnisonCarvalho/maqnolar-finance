export type SplitRuleSnapshot = {
  technicianPercent: number | null;
  companyPercent: number | null;
  technicianFixedCents: number | null;
  companyFixedCents: number | null;
};

export type ShareSplit = {
  technicianShareCents: number;
  companyShareCents: number;
};

/**
 * Divide a mão de obra entre técnico e MaqnoLar.
 * Regra fixa (visita) usa os valores fixos; regra percentual arredonda a parte
 * do técnico e atribui o restante à empresa, garantindo que a soma seja exata.
 */
export function splitLabor(laborCents: number, rule: SplitRuleSnapshot): ShareSplit {
  if (rule.technicianFixedCents != null && rule.companyFixedCents != null) {
    return { technicianShareCents: rule.technicianFixedCents, companyShareCents: rule.companyFixedCents };
  }
  const pct = rule.technicianPercent ?? 50;
  const technicianShareCents = Math.round((laborCents * pct) / 100);
  return { technicianShareCents, companyShareCents: laborCents - technicianShareCents };
}

export type PartPurchaseInput = {
  buyerType: "maqnolar" | "tecnico" | "outro";
  totalCents: number;
};

export type SettlementInput = {
  totalCents: number;
  technicianShareCents: number;
  companyShareCents: number;
  purchases: PartPurchaseInput[];
  receiverType: "maqnolar" | "tecnico" | "outro" | null;
};

export type Settlement = {
  partsPaidByTechnicianCents: number;
  partsPaidByCompanyCents: number;
  partsPaidByOtherCents: number;
  /** Reembolso de peças + participação a repassar ao técnico (quando a MaqnoLar recebeu). */
  transferToTechnicianCents: number;
  /** Valor que o técnico deve repassar à MaqnoLar (quando ele recebeu do cliente). */
  transferToCompanyCents: number;
  /** Parte econômica final da MaqnoLar neste atendimento. */
  companyEconomicShareCents: number;
  /** Parte econômica final do técnico neste atendimento. */
  technicianEconomicShareCents: number;
};

/**
 * Calcula o acerto previsto do atendimento.
 * - MaqnoLar recebeu: repassa ao técnico o reembolso das peças que ele pagou + sua participação.
 * - Técnico recebeu: ele repassa à MaqnoLar o total recebido menos as peças que pagou e sua participação
 *   (equivale a: peças pagas pela MaqnoLar + participação da MaqnoLar).
 * Valores são previstos — não representam transações realizadas.
 */
export function computeSettlement(input: SettlementInput): Settlement {
  const partsPaidByTechnicianCents = input.purchases
    .filter((p) => p.buyerType === "tecnico")
    .reduce((s, p) => s + p.totalCents, 0);
  const partsPaidByCompanyCents = input.purchases
    .filter((p) => p.buyerType === "maqnolar")
    .reduce((s, p) => s + p.totalCents, 0);
  const partsPaidByOtherCents = input.purchases
    .filter((p) => p.buyerType === "outro")
    .reduce((s, p) => s + p.totalCents, 0);

  let transferToTechnicianCents = 0;
  let transferToCompanyCents = 0;
  if (input.receiverType === "maqnolar") {
    transferToTechnicianCents = partsPaidByTechnicianCents + input.technicianShareCents;
  } else if (input.receiverType === "tecnico") {
    transferToCompanyCents = input.totalCents - partsPaidByTechnicianCents - input.technicianShareCents;
  }

  return {
    partsPaidByTechnicianCents,
    partsPaidByCompanyCents,
    partsPaidByOtherCents,
    transferToTechnicianCents,
    transferToCompanyCents,
    companyEconomicShareCents: input.companyShareCents,
    technicianEconomicShareCents: input.technicianShareCents,
  };
}
