/**
 * Statuskatalog der Abrechnungsläufe — an EINER Stelle.
 *
 * ── WARUM DIESE DATEI ENTSTANDEN IST ──────────────────────────────────
 * Der Katalog stand als lokale Konstante in `app/admin/abrechnung/page.tsx`.
 * `setzeLaufStatusAction` kannte ihn nicht und schrieb jede übergebene
 * Zeichenkette in die Spalte.
 *
 * Und `abrechnungslaeufe.status` hat **keinen CHECK** (Migration
 * `20260101000000`, `status text DEFAULT 'erstellt' NOT NULL`). Die
 * Datenbank nimmt also alles an. Ein Tippfehler oder ein veralteter
 * Client setzt einen Abrechnungslauf damit auf einen Zustand, den keine
 * Auswertung kennt — die Liste zeigt ihn dann mit grauem Rohtext an, weil
 * die Seite auf `|| { label: lauf.status }` zurückfällt.
 *
 * Bei einem Abrechnungslauf hängt daran, ob Geld angefordert, storniert
 * oder als bezahlt geführt wird. Ein unbekannter Zustand ist dort kein
 * Schönheitsfehler.
 *
 * ── FAIL-CLOSED ───────────────────────────────────────────────────────
 * `istLaufStatus` ist eine Erlaubnisliste: was hier nicht steht, wird gar
 * nicht erst an die Datenbank geschickt. Solange die Spalte keinen CHECK
 * hat, ist diese Liste die einzige Schranke.
 */

export interface LaufStatusEintrag {
  label: string
  color: string
}

/**
 * Die acht Zustände, welche die Oberfläche kennt und anzeigt.
 *
 * Bewusst NICHT erweitert um Werte, die nur im Abrechnungsmotor
 * vorkommen (`storniert`, `quittiert`, `erneut_eingereicht`, `fehler`):
 * die setzt der Motor selbst über eigene Wege, nicht diese Aktion. Wer
 * einen davon hier braucht, trägt ihn bewusst ein — statt die Liste
 * vorsorglich aufzuweichen.
 */
export const LAUF_STATUS: Record<string, LaufStatusEintrag> = {
  erstellt: { label: 'Erstellt', color: '#999999' },
  geprueft: { label: 'Geprüft', color: '#2196F3' },
  exportiert: { label: 'Exportiert', color: '#5C6BC0' },
  uebermittelt: { label: 'Übermittelt', color: '#E8A000' },
  akzeptiert: { label: 'Akzeptiert', color: '#5CB882' },
  teilweise_abgelehnt: { label: 'Teilw. abgelehnt', color: '#FF7043' },
  abgelehnt: { label: 'Abgelehnt', color: '#D04B3B' },
  bezahlt: { label: 'Bezahlt', color: '#C9963C' },
}

export const LAUF_STATUS_KEYS = Object.keys(LAUF_STATUS)

/** Erlaubnisliste, fail-closed. `hasOwnProperty`, damit `toString` nicht durchgeht. */
export function istLaufStatus(wert: unknown): wert is string {
  return typeof wert === 'string' && Object.prototype.hasOwnProperty.call(LAUF_STATUS, wert)
}

/**
 * Beschriftung für die Liste.
 *
 * Fällt auf den Rohwert zurück, statt zu werfen: in der DB können noch
 * Zustände aus der Zeit vor der Erlaubnisliste stehen, und eine Liste,
 * die daran abstürzt, ist schlechter als eine, die einen Schlüssel zeigt.
 */
export function laufStatusLabel(wert: string): LaufStatusEintrag {
  return LAUF_STATUS[wert] ?? { label: wert, color: '#999999' }
}

/** Zustände, in denen ein Lauf abgeschlossen ist. */
export const LAUF_ENDZUSTAENDE: readonly string[] = ['abgelehnt', 'bezahlt']
