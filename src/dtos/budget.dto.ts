// Les formes des données qui ENTRENT et SORTENT de l'API des budgets.
// La consommation n'est jamais stockée : elle se calcule à partir des
// transactions de la période courante (voir dashboard.service.ts).

export type PeriodeBudgetDto = "HEBDOMADAIRE" | "MENSUEL" | "ANNUEL";

export interface CreerBudgetDto {
  categorieId: string;
  montantPlafond: number;
  periode?: PeriodeBudgetDto;
}

export interface BudgetDto {
  id: string;
  categorieId: string;
  montantPlafond: number;
  periode: PeriodeBudgetDto;
  actif: boolean;
}
