// Alertas do Chat Balcões: a mensagem dispara o alerta quando tem todas as palavras dele, sem diferenciar
// maiúsculas e acentos ("LATAM, compro" pega "Compro 100k Latam"). Para "uma ou outra", crie dois alertas.

export type AlertRule = { id: string; name: string; words: string[]; active: boolean };

/** Texto para comparar: minúsculo e sem acentos. */
export const normalizeText = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Palavras do alerta digitadas separadas por vírgula (ou por linha): sem vazias e sem repetir (maiúsculas e
 *  acentos não contam como diferença), até 10. */
export function parseAlertWords(raw: string) {
  const seen = new Set<string>();
  return raw.split(/[,;\n]/).map((w) => w.trim()).filter((w) => {
    const k = normalizeText(w);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 10);
}

/** Nomes dos alertas (ativos) que a mensagem dispara. */
export function matchAlerts(text: string, alerts: AlertRule[]) {
  const t = normalizeText(text);
  return alerts.filter((a) => a.active && a.words.length > 0 && a.words.every((w) => t.includes(normalizeText(w)))).map((a) => a.name);
}
