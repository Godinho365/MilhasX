// Limite mensal do bônus de transferência (ex.: Clube LATAM Pass, até 30 mil milhas de bônus por mês).

export type BonusCap = { cap: number; used: number; left: number; pctUsed: number; transferable: number | null };

/** Quanto do limite do mês já foi usado e quantos pontos ainda dá para transferir com bônus cheio. */
export function bonusCapStatus(cap: number, used: number, bonusPct: number | null): BonusCap {
  const left = Math.max(cap - used, 0);
  return {
    cap,
    used,
    left,
    pctUsed: cap > 0 ? Math.min(Math.round((used / cap) * 100), 100) : 100,
    transferable: bonusPct && bonusPct > 0 ? Math.ceil((left * 100) / bonusPct) : null,
  };
}

/** Bônus de uma transferência respeitando o que sobra do limite do mês. */
export const cappedBonus = (bonus: number, left: number | null) => (left == null ? bonus : Math.max(Math.min(bonus, left), 0));
