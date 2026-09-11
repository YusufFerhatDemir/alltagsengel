/**
 * Bearbeitungsstand eines Content-Stücks.
 *
 * Rein rechnend: Katalog, Prüfung, Zuordnung. Kein Datenbankzugriff und
 * kein `server-only` — die Oberfläche braucht dieselben Bezeichnungen wie
 * die Route, und zwei Listen, die dasselbe bedeuten sollen, driften.
 *
 * ── WARUM VIER ZUSTÄNDE UND NICHT ZWEI ────────────────────────────────
 * „Raus / nicht raus" reicht nicht. Zwischen beiden liegt der Fall, der im
 * Alltag am häufigsten ist: ein Stück ist für einen Tag vorgesehen und das
 * Bild fehlt noch. Ohne „geplant" tragen Menschen das in eine Notiz
 * daneben ein, und die Liste sagt weiter „offen".
 *
 * „Verworfen" ist der vierte, weil ein Stück aus dem Plan nicht gelöscht
 * wird — die Pläne sind Dokumente. Was nicht mehr gepostet werden soll,
 * muss als solches erkennbar sein, sonst schlägt es jemand wieder vor.
 */

export const CONTENT_STATUS = {
  offen: { label: 'Offen', farbe: '#8A8279' },
  geplant: { label: 'Geplant', farbe: '#E8A000' },
  veroeffentlicht: { label: 'Veröffentlicht', farbe: '#5CB882' },
  verworfen: { label: 'Verworfen', farbe: '#D04B3B' },
} as const

export type ContentStatus = keyof typeof CONTENT_STATUS

/** Der Zustand ohne Eintrag. Kein Eintrag heißt: noch nichts passiert. */
export const STATUS_VORGABE: ContentStatus = 'offen'

export const CONTENT_STATUS_WERTE = Object.keys(CONTENT_STATUS) as ContentStatus[]

/**
 * Prüft gegen die Werteliste, NICHT mit `in`.
 *
 * `wert in CONTENT_STATUS` fragt die Prototypenkette mit — damit wären
 * 'toString', 'constructor' und 'valueOf' gültige Status. Die Datenbank
 * hätte sie über ihren CHECK abgewiesen, aber erst nach dem Schreibversuch
 * und mit einem Serverfehler statt einer klaren Antwort.
 */
export function istContentStatus(wert: unknown): wert is ContentStatus {
  return typeof wert === 'string' && (CONTENT_STATUS_WERTE as string[]).includes(wert)
}

/** Eine Standzeile, wie sie aus der Tabelle kommt. */
export interface ContentStand {
  contentId: string
  status: ContentStatus
  kanal: string | null
  veroeffentlichtAm: string | null
  notiz: string | null
  geaendertAm: string | null
}

export interface StatusZeile {
  content_id?: string | null
  status?: string | null
  kanal?: string | null
  veroeffentlicht_am?: string | null
  notiz?: string | null
  updated_at?: string | null
}

/**
 * Zeilen aus der Tabelle auf Stücke abbilden.
 *
 * Ein unbekannter Statuswert wird zur Vorgabe zurückgeführt, nicht
 * durchgereicht: die Anzeige soll keinen Zustand zeigen, den sie nicht
 * erklären kann. Kommt ein fünfter Wert dazu, fällt das hier auf, statt
 * in der Oberfläche als leeres Feld zu erscheinen.
 */
export function standNachContentId(zeilen: StatusZeile[] | null): Map<string, ContentStand> {
  const map = new Map<string, ContentStand>()
  for (const z of zeilen ?? []) {
    if (!z.content_id) continue
    map.set(z.content_id, {
      contentId: z.content_id,
      status: istContentStatus(z.status) ? z.status : STATUS_VORGABE,
      kanal: z.kanal ?? null,
      veroeffentlichtAm: z.veroeffentlicht_am ?? null,
      notiz: z.notiz ?? null,
      geaendertAm: z.updated_at ?? null,
    })
  }
  return map
}

/**
 * Was beim Setzen des Standes geschrieben wird.
 *
 * Der Zeitpunkt gehört zum Zustand: „veröffentlicht" ohne Zeitpunkt wäre
 * eine Behauptung ohne Beleg, und die Datenbank weist sie über einen CHECK
 * auch ab. Umgekehrt wird der Zeitpunkt beim Verlassen dieses Zustands
 * geleert — ein Beleg für etwas, was nicht gilt, ist schlimmer als keiner.
 */
export function statusFelder(
  status: ContentStatus,
  jetzt: Date = new Date(),
  bestehenderZeitpunkt: string | null = null,
): { status: ContentStatus; veroeffentlicht_am: string | null } {
  if (status !== 'veroeffentlicht') return { status, veroeffentlicht_am: null }
  return {
    status,
    // Ein vorhandener Zeitpunkt bleibt: wer eine Notiz nachträgt, soll das
    // Veröffentlichungsdatum nicht auf heute verschieben.
    veroeffentlicht_am: bestehenderZeitpunkt ?? jetzt.toISOString(),
  }
}
