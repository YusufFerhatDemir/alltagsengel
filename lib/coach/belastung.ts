// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Belastungs-Selbsteinschätzung für pflegende Angehörige
//
// HINWEIS ZUR INSTRUMENTENWAHL: Die validierten Instrumente (BSFC-s/
// Häusliche-Pflege-Skala, Zarit Burden Interview) sind urheberrechtlich
// geschützt bzw. lizenzpflichtig. Bis zur Lizenzklärung (siehe
// audit/dipa/dipav_gap_liste.md) nutzt der MVP eine EIGENE, nicht
// validierte Kurz-Selbsteinschätzung (instrument = 'belastung_kurz').
// Sie dient der Selbstreflexion und Verlaufsdarstellung — sie ist KEIN
// diagnostisches Screening und liefert keine klinische Bewertung.
// ═══════════════════════════════════════════════════════════════

export interface BelastungsItem {
  id: string
  frage: string
}

/** 7 Items, Antwortskala 0–3 (0 = nie, 1 = manchmal, 2 = oft, 3 = fast immer). Summe 0–21. */
export const BELASTUNG_ITEMS: BelastungsItem[] = [
  { id: 'erschoepfung', frage: 'Ich fühle mich durch die Pflege körperlich erschöpft.' },
  { id: 'schlaf', frage: 'Mein Schlaf kommt wegen der Pflege zu kurz.' },
  { id: 'eigene_zeit', frage: 'Ich habe zu wenig Zeit für mich selbst.' },
  { id: 'soziale_kontakte', frage: 'Meine eigenen sozialen Kontakte kommen zu kurz.' },
  { id: 'sorgen', frage: 'Ich mache mir ständig Sorgen um die gepflegte Person.' },
  { id: 'ueberforderung', frage: 'Ich fühle mich mit den Pflegeaufgaben überfordert.' },
  { id: 'unterstuetzung', frage: 'Ich wünsche mir mehr Unterstützung bei der Pflege.' },
]

export const BELASTUNG_STUFEN = ['Nie', 'Manchmal', 'Oft', 'Fast immer'] as const

export const BELASTUNG_MAX = BELASTUNG_ITEMS.length * 3

/**
 * Summenwert aus Antwort-Objekt {itemId: 0..3}. Unbeantwortete Items → null
 * (keine Teilsummen, sonst wären Verläufe nicht vergleichbar).
 */
export function belastungSumme(antworten: Record<string, unknown>): number | null {
  let summe = 0
  for (const item of BELASTUNG_ITEMS) {
    const w = antworten[item.id]
    if (typeof w !== 'number' || w < 0 || w > 3 || !Number.isInteger(w)) return null
    summe += w
  }
  return summe
}

/**
 * Organisatorischer Hinweis-Trigger: Anstieg um >= 4 Punkte gegenüber der
 * Vorerhebung ODER Wert im oberen Drittel (>= 14). Löst ausschließlich
 * statische Hinweise auf Entlastungsangebote aus — keine Bewertung.
 */
export function belastungHinweisNoetig(aktuell: number, vorher: number | null): boolean {
  if (aktuell >= Math.ceil((BELASTUNG_MAX * 2) / 3)) return true
  if (vorher !== null && aktuell - vorher >= 4) return true
  return false
}
