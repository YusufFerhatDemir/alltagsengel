/**
 * Marketing Execution Engine — Zustandsmodell und Übergänge.
 *
 * ── DAS PROBLEM, DAS SIE LÖST ─────────────────────────────────────────
 * Am 12.09.2026 lagen 54 Content-Stücke in vier Plandateien und **14**
 * Statuszeilen in der Datenbank. Ob etwas veröffentlicht wurde, war nur an
 * den Kanälen selbst abzulesen, nicht im System. Ein Redaktionsplan ohne
 * Zustand ist eine Absichtserklärung, keine Ausführung.
 *
 * ── ZWEI EBENEN, WIE BEI DER BEWERBER-PIPELINE ────────────────────────
 * `marketing_content_status.status` trägt einen CHECK auf genau vier Werte
 * (offen, geplant, veroeffentlicht, verworfen — am 12.09.2026 per Sonde
 * belegt). Die sieben beauftragten Zustände passen da nicht hinein, und die
 * Spalte zu erweitern bräuchte DDL, die aus einer Agentensitzung nicht geht.
 *
 *   STUFE (fein, 7)          →  status (grob, 4, mit CHECK)
 *   idee, entwurf, review    →  offen
 *   freigegeben, geplant     →  geplant
 *   veroeffentlicht          →  veroeffentlicht   (+ Zeitstempel, s. u.)
 *   verworfen                →  verworfen
 *
 * Die feine Stufe wird zusammen mit den Redaktionsfeldern in `notiz`
 * abgelegt — die einzige freie Textspalte. Kein schöner Ort, aber ein
 * ehrlicher: er verlangt keine Migration und geht beim Lesen nicht verloren.
 *
 * ── EIN RIEGEL, DER SCHON IN DER DATENBANK STEHT ──────────────────────
 * `marketing_content_status_beleg_check` verlangt: status = 'veroeffentlicht'
 * nur mit `veroeffentlicht_am`. „Veröffentlicht" ohne Zeitpunkt ist damit
 * nicht speicherbar — die Behauptung braucht ihren Beleg. Diese Datei hält
 * dieselbe Regel schon vorher fest, damit der Fehler im Formular auffällt
 * und nicht erst als 400 aus PostgREST.
 */

export const MARKETING_STUFEN = {
  idee: { label: 'Idee', dbStatus: 'offen', aufgabe: 'Thema schärfen, Zielgruppe festlegen' },
  entwurf: { label: 'Entwurf', dbStatus: 'offen', aufgabe: 'Hook, Caption und CTA schreiben' },
  review: { label: 'Review', dbStatus: 'offen', aufgabe: 'Gegenlesen — §45a-Aussagen und Preise prüfen' },
  freigegeben: { label: 'Freigegeben', dbStatus: 'geplant', aufgabe: 'Asset erstellen, Termin setzen' },
  geplant: { label: 'Geplant', dbStatus: 'geplant', aufgabe: 'Eingeplant — am Termin veröffentlichen' },
  veroeffentlicht: { label: 'Veröffentlicht', dbStatus: 'veroeffentlicht', aufgabe: 'Ergebnis nachtragen' },
  verworfen: { label: 'Verworfen', dbStatus: 'verworfen', aufgabe: 'Abgeschlossen' },
} as const

export type MarketingStufe = keyof typeof MARKETING_STUFEN
export type MarketingDbStatus = (typeof MARKETING_STUFEN)[MarketingStufe]['dbStatus']

/** Die vier Werte, die der CHECK erlaubt. Am 12.09.2026 live sondiert. */
export const DB_STATUS_ERLAUBT: readonly MarketingDbStatus[] =
  ['offen', 'geplant', 'veroeffentlicht', 'verworfen'] as const

/**
 * Erlaubte Übergänge. Bewusst kein „von überall nach überall": ohne Review
 * keine Freigabe, ohne Freigabe keine Planung. Genau diese Kette verhindert,
 * dass ein Entwurf mit einer §45a-Zusage aus Versehen online geht.
 *
 * `verworfen` ist von jedem offenen Zustand erreichbar — eine Idee darf
 * jederzeit sterben. Aus `veroeffentlicht` heraus nicht: was draußen war,
 * war draußen; das wird nicht rückwirkend zur Nicht-Veröffentlichung.
 */
export const UEBERGAENGE: Record<MarketingStufe, readonly MarketingStufe[]> = {
  idee: ['entwurf', 'verworfen'],
  entwurf: ['review', 'verworfen'],
  review: ['freigegeben', 'entwurf', 'verworfen'],
  freigegeben: ['geplant', 'review', 'verworfen'],
  geplant: ['veroeffentlicht', 'freigegeben', 'verworfen'],
  veroeffentlicht: [],
  verworfen: ['idee'],
}

export function istMarketingStufe(wert: unknown): wert is MarketingStufe {
  return typeof wert === 'string' && wert in MARKETING_STUFEN
}

export function dbStatusFuer(stufe: MarketingStufe): MarketingDbStatus {
  return MARKETING_STUFEN[stufe].dbStatus
}

export function darfWechseln(von: MarketingStufe, nach: MarketingStufe): boolean {
  return UEBERGAENGE[von].includes(nach)
}

/** Die Redaktionsfelder eines Stücks. */
export interface MarketingStueck {
  stufe: MarketingStufe
  projekt: string
  plattform: string
  kampagne?: string
  zielgruppe?: string
  format?: string
  hook?: string
  caption?: string
  cta?: string
  asset?: string
  zielUrl?: string
  utm?: string
  /** Geplanter Termin (YYYY-MM-DD). */
  datum?: string
  /** Was dabei herauskam — erst nach der Veröffentlichung sinnvoll. */
  ergebnis?: string
}

/** Marker in `notiz`, damit die Nutzlast beim Lesen wiederzufinden ist. */
export const NOTIZ_MARKER = 'ENGINE_V1:'

export function nachNotiz(stueck: MarketingStueck): string {
  return NOTIZ_MARKER + JSON.stringify(stueck)
}

/**
 * Liest die Nutzlast aus `notiz`. Ohne Marker (Altbestand, Handnotiz) wird
 * die Notiz als Freitext behandelt und NICHT verworfen — sie steht dann als
 * `ergebnis` in der Rückgabe.
 */
export function ausNotiz(notiz: string | null | undefined, dbStatus: string | null): MarketingStueck | null {
  if (notiz && notiz.startsWith(NOTIZ_MARKER)) {
    try {
      const roh = JSON.parse(notiz.slice(NOTIZ_MARKER.length)) as Partial<MarketingStueck>
      if (istMarketingStufe(roh.stufe)) return roh as MarketingStueck
    } catch { /* kaputte Nutzlast → unten als Altbestand behandeln */ }
  }
  const stufe = stufeAusDbStatus(dbStatus)
  if (!stufe) return null
  return { stufe, projekt: '', plattform: '', ...(notiz ? { ergebnis: notiz } : {}) }
}

/**
 * Grobe → feine Stufe für Zeilen ohne Nutzlast. Immer die ERSTE feine Stufe,
 * die zur groben passt — nie eine, die mehr behauptet. `offen` wird zu
 * „Idee", nicht zu „Review".
 */
export function stufeAusDbStatus(dbStatus: string | null | undefined): MarketingStufe | null {
  switch (dbStatus) {
    case 'offen': return 'idee'
    case 'geplant': return 'freigegeben'
    case 'veroeffentlicht': return 'veroeffentlicht'
    case 'verworfen': return 'verworfen'
    default: return null
  }
}

export interface SchreibSatz {
  status: MarketingDbStatus
  notiz: string
  veroeffentlicht_am: string | null
}

export interface SchreibErgebnis {
  satz: SchreibSatz | null
  fehler: string | null
}

/**
 * Baut die Datenbankzeile für einen Stufenwechsel — inklusive der Regeln,
 * die sonst erst PostgREST als 400 meldet.
 */
export function schreibsatzFuer(
  stueck: MarketingStueck,
  nach: MarketingStufe,
  jetzt: Date,
): SchreibErgebnis {
  if (!darfWechseln(stueck.stufe, nach)) {
    return {
      satz: null,
      fehler: `Übergang ${MARKETING_STUFEN[stueck.stufe].label} → ${MARKETING_STUFEN[nach].label} ist nicht vorgesehen`,
    }
  }
  // Vor der Freigabe muss Text da sein. Eine Freigabe auf ein leeres Stück
  // ist eine Unterschrift unter ein leeres Blatt.
  if ((nach === 'freigegeben' || nach === 'geplant') && !stueck.caption?.trim()) {
    return { satz: null, fehler: 'Ohne Caption keine Freigabe' }
  }
  if (nach === 'geplant' && !stueck.datum) {
    return { satz: null, fehler: 'Ohne Termin keine Planung' }
  }
  const neu: MarketingStueck = { ...stueck, stufe: nach }
  return {
    satz: {
      status: dbStatusFuer(nach),
      notiz: nachNotiz(neu),
      // Der DB-CHECK verlangt den Zeitstempel; hier wird er gesetzt, statt
      // den 400 abzuwarten. Bei jedem anderen Zustand bleibt er leer.
      veroeffentlicht_am: nach === 'veroeffentlicht' ? jetzt.toISOString() : null,
    },
    fehler: null,
  }
}

/**
 * UTM-Kennung aus Kampagne und Plattform. Ohne sie ist jede
 * Veröffentlichung im Nachhinein quellenlos — am 12.09.2026 kamen 25 von
 * 35 Bewerbungen ohne `utm_source` an.
 */
export function utmFuer(stueck: Pick<MarketingStueck, 'plattform' | 'kampagne'>): string {
  const sauber = (w: string) => w.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const quelle = sauber(stueck.plattform || 'organisch')
  const kampagne = sauber(stueck.kampagne || 'ohne-kampagne')
  return `utm_source=${quelle}&utm_medium=social&utm_campaign=${kampagne}`
}

/** Ziel-URL mit angehängten UTM-Parametern. */
export function zielUrlMitUtm(zielUrl: string, stueck: Pick<MarketingStueck, 'plattform' | 'kampagne'>): string {
  const trenner = zielUrl.includes('?') ? '&' : '?'
  return `${zielUrl}${trenner}${utmFuer(stueck)}`
}
