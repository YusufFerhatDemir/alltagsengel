/**
 * Gesetzliche Preisobergrenzen (PfluV) — Anwendungs-Guard
 *
 * ── Warum dieses Modul existiert (Befund T-9) ───────────────────────────
 * Die Tabelle `billing_gesetzliche_obergrenzen` traegt seit Migration
 * 20260808110000 die hessischen PfluV-Saetze (30,00 EUR/Std. Betreuung,
 * 25,00 EUR/Std. Entlastung im Alltag). Gelesen wurde sie bis zur Phase 8.6
 * von KEINEM Anwendungscode. Es gibt zwar den DB-Trigger
 * `enforce_tariff_obergrenze`, der aber zwei Bedingungen hat, die live
 * beide nicht erfuellt sind:
 *
 *   1. Er greift nur bei `bestaetigt = TRUE`. Der Seed steht bewusst auf
 *      FALSE (Sekundaerquellen, PfluV-Novelle in der Verbaendeanhoerung).
 *   2. Er matcht auf `verguetungsart`, NICHT auf `angebotstyp`. Die beiden
 *      Seed-Zeilen unterscheiden sich aber ausschliesslich im angebotstyp
 *      (beide: hessen / §45b SGB XI / zeit_stunde / leistungsart NULL).
 *      `billing_tariffs` hat gar keine angebotstyp-Spalte — der Trigger
 *      koennte 30 und 25 EUR also selbst bei bestaetigt = TRUE nicht
 *      auseinanderhalten und wuerde eine der beiden Zeilen willkuerlich
 *      ziehen.
 *
 * Ergebnis: die Obergrenze war dokumentiert, nicht durchgesetzt — und wer
 * einen 35-EUR-Tarif anlegte, bekam nirgends einen Hinweis.
 *
 * ── Was dieses Modul tut, und was bewusst nicht ─────────────────────────
 * Es WARNT. Es blockiert nicht. Das ist kein Kompromiss aus Bequemlichkeit,
 * sondern folgt der Datenlage: `bestaetigt = FALSE` heisst, der Wert ist
 * nicht 1:1 gegen den Verordnungstext geprueft. Eine harte Sperre auf einem
 * ungeprueften Wert wuerde legitime Tarifpflege blockieren und waere
 * schlimmer als die Luecke. Sobald jemand `bestaetigt = TRUE` setzt, greift
 * zusaetzlich die DB-Sperre — dann meldet dieses Modul das mit.
 *
 * Die Zuordnung Leistungsart → Angebotstyp ist eine fachliche Auslegung von
 * §45a Abs. 1 S. 2 SGB XI und als solche gekennzeichnet: wo sie nicht
 * eindeutig ist, wird gegen die HOECHSTE einschlaegige Grenze geprueft und
 * die Unschaerfe in der Meldung genannt. Lieber eine Warnung weniger als
 * eine falsche Warnung auf jedem zweiten Tarif — eine Warnung, der niemand
 * mehr glaubt, ist keine Kontrolle.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type Angebotstyp =
  | 'betreuungsangebot'
  | 'entlastungsangebot'
  | 'angebot_ehrenamt'
  | 'pflegedienst'
  | 'sonstiges'

/** Zeile aus `billing_gesetzliche_obergrenzen` — nur die gelesenen Felder. */
export interface ObergrenzenRegel {
  bundesland: string | null
  rechtsgrundlage: string
  leistungsart: string | null
  angebotstyp: Angebotstyp | null
  verguetungsart: string
  obergrenze_cent: number
  quelle: string
  quelle_paragraf: string | null
  bestaetigt: boolean
  gueltig_ab: string
  gueltig_bis: string | null
  ist_aktiv: boolean
}

export interface ObergrenzenEingabe {
  /** Preis des zu pruefenden Tarifs in Cent. */
  preisCent: number
  rechtsgrundlage: string
  verguetungsart: string
  /** Tarif-Schluessel (billing_tariffs.leistungsart), z. B. 'hauswirtschaft'. */
  leistungsart: string | null
  bundesland: string | null
  /** Gueltigkeitsbeginn des Tarifs, ISO YYYY-MM-DD. */
  gueltigAb: string
}

export type ObergrenzenStatus =
  /** Privattarif — gesetzliche Deckelung gilt nicht. */
  | 'privat_ausgenommen'
  /** Keine Regel fuer diese Kombination hinterlegt. */
  | 'keine_regel'
  /** Preis liegt innerhalb der Grenze. */
  | 'eingehalten'
  /** Preis liegt darueber, Regel ist unbestaetigt → nur Warnung. */
  | 'warnung'
  /** Preis liegt darueber und die Regel ist bestaetigt → die DB sperrt. */
  | 'verstoss'

export interface ObergrenzenBefund {
  status: ObergrenzenStatus
  /** Menschenlesbare Meldung (Deutsch, UI-tauglich). Leer bei 'eingehalten'. */
  meldung: string | null
  preisCent: number
  obergrenzeCent: number | null
  /** Die tatsaechlich angewandte Regel — null, wenn keine gefunden wurde. */
  regel: ObergrenzenRegel | null
  /**
   * true, wenn der Angebotstyp aus der Leistungsart nicht eindeutig
   * ableitbar war und deshalb gegen die hoechste Grenze geprueft wurde.
   */
  angebotstypUnbestimmt: boolean
}

// ---------------------------------------------------------------------------
// Leistungsart → Angebotstyp (§45a Abs. 1 S. 2 SGB XI)
// ---------------------------------------------------------------------------

/**
 * Fachliche Zuordnung der Tarif-Schluessel zu den Angebotstypen der PfluV.
 *
 *   Nr. 1 Betreuungsangebote            → 'betreuungsangebot'  (30,00 EUR)
 *   Nr. 2 Entlastung von Pflegenden     → 'betreuungsangebot'  (30,00 EUR)
 *   Nr. 3 Entlastung im Alltag          → 'entlastungsangebot' (25,00 EUR)
 *
 * Bewusst NICHT zugeordnet — und deshalb hier gar nicht aufgefuehrt:
 *
 *   alltagsbegleitung  Der Name passt auf Nr. 1 („Betreuung im Alltag") wie
 *                      auf Nr. 3 („Entlastung im Alltag"). 5 EUR Unterschied
 *                      je Stunde auf eine Wortaehnlichkeit zu stuetzen waere
 *                      geraten, nicht belegt.
 *   begleitservice     Begleitung ausser Haus laeuft je nach Ausgestaltung
 *                      unter Nr. 1 oder Nr. 3.
 *   wegepauschale      Keine Zeitleistung; die 5-EUR-Pauschale ist laut
 *                      Quellenpruefung ohne PfluV-Grundlage und deshalb auch
 *                      nicht geseedet.
 *   sonstige           Sammelposten ohne fachliche Aussage.
 *
 * Fuer diese Schluessel prueft das Modul gegen die hoechste einschlaegige
 * Grenze und weist die Unschaerfe in der Meldung aus.
 */
export const ANGEBOTSTYP_VON_LEISTUNGSART: Readonly<Record<string, Angebotstyp>> = {
  betreuung_45a:      'betreuungsangebot',
  demenzbetreuung:    'betreuungsangebot',
  nachtbetreuung:     'betreuungsangebot',
  wochenendbetreuung: 'betreuungsangebot',
  hauswirtschaft:     'entlastungsangebot',
  einkaufsservice:    'entlastungsangebot',
}

/** Angebotstyp zur Leistungsart, oder null wenn nicht eindeutig. */
export function angebotstypVon(leistungsart: string | null): Angebotstyp | null {
  if (!leistungsart) return null
  return ANGEBOTSTYP_VON_LEISTUNGSART[leistungsart.toLowerCase()] ?? null
}

// ---------------------------------------------------------------------------
// Auswahl der einschlaegigen Regel — reine Funktion, ohne Datenbank
// ---------------------------------------------------------------------------

/**
 * Filtert die einschlaegigen Regeln fuer eine Eingabe.
 *
 * Die Rangfolge spiegelt bewusst den DB-Trigger:
 *   exaktes Bundesland vor bundesweit, exakte Leistungsart vor „alle",
 *   danach der juengste Gueltigkeitsbeginn.
 * Ergaenzt um das, was dem Trigger fehlt: den Angebotstyp.
 */
export function waehleRegeln(
  regeln: ObergrenzenRegel[],
  eingabe: ObergrenzenEingabe,
): ObergrenzenRegel[] {
  const typ = angebotstypVon(eingabe.leistungsart)

  const passend = regeln.filter(r => {
    if (!r.ist_aktiv) return false
    if (r.rechtsgrundlage !== eingabe.rechtsgrundlage) return false
    if (r.verguetungsart !== eingabe.verguetungsart) return false
    if (r.bundesland !== null && r.bundesland !== eingabe.bundesland) return false
    if (r.leistungsart !== null && r.leistungsart !== eingabe.leistungsart) return false
    if (r.gueltig_ab > eingabe.gueltigAb) return false
    if (r.gueltig_bis !== null && r.gueltig_bis < eingabe.gueltigAb) return false
    // Angebotstyp: ist er bekannt, muss er passen (oder die Regel gilt fuer
    // alle Typen). Ist er unbekannt, bleiben alle Typ-Regeln im Rennen —
    // die Entscheidung faellt dann weiter unten ueber die hoechste Grenze.
    if (typ !== null && r.angebotstyp !== null && r.angebotstyp !== typ) return false
    return true
  })

  return passend.sort((a, b) => {
    const landA = a.bundesland !== null ? 1 : 0
    const landB = b.bundesland !== null ? 1 : 0
    if (landA !== landB) return landB - landA
    const laA = a.leistungsart !== null ? 1 : 0
    const laB = b.leistungsart !== null ? 1 : 0
    if (laA !== laB) return laB - laA
    const typA = a.angebotstyp !== null ? 1 : 0
    const typB = b.angebotstyp !== null ? 1 : 0
    if (typA !== typB) return typB - typA
    return b.gueltig_ab.localeCompare(a.gueltig_ab)
  })
}

function euro(cent: number): string {
  return (cent / 100).toFixed(2).replace('.', ',') + ' EUR'
}

/**
 * Prueft einen Preis gegen eine bereits geladene Regelmenge.
 *
 * Reine Funktion — genau deshalb ist die Rangfolge ohne Datenbank testbar.
 */
export function pruefeGegenRegeln(
  regeln: ObergrenzenRegel[],
  eingabe: ObergrenzenEingabe,
): ObergrenzenBefund {
  const basis = {
    preisCent: eingabe.preisCent,
    obergrenzeCent: null,
    regel: null,
    angebotstypUnbestimmt: false,
  } as const

  // Privatpreise unterliegen keiner gesetzlichen Deckelung — dieselbe
  // Abgrenzung wie im DB-Trigger.
  if (eingabe.rechtsgrundlage === 'privat') {
    return { ...basis, status: 'privat_ausgenommen', meldung: null }
  }

  const passend = waehleRegeln(regeln, eingabe)
  if (passend.length === 0) {
    return { ...basis, status: 'keine_regel', meldung: null }
  }

  const typBekannt = angebotstypVon(eingabe.leistungsart) !== null
  const typRegeln = passend.filter(r => r.angebotstyp !== null)
  // Unbestimmt ist der Fall nur dann, wenn der Angebotstyp die Auswahl
  // tatsaechlich beeinflussen wuerde: also wenn die Leistungsart keinen Typ
  // liefert UND mehr als eine Typ-Regel im Rennen ist.
  const unbestimmt = !typBekannt && typRegeln.length > 1

  // Bei Unschaerfe die mildeste (hoechste) Grenze anwenden. Sonst gewinnt
  // die spezifischste Regel — erste Position der Sortierung.
  const regel = unbestimmt
    ? passend.reduce((a, b) => (b.obergrenze_cent > a.obergrenze_cent ? b : a))
    : passend[0]

  const gemeinsam = {
    preisCent: eingabe.preisCent,
    obergrenzeCent: regel.obergrenze_cent,
    regel,
    angebotstypUnbestimmt: unbestimmt,
  }

  if (eingabe.preisCent <= regel.obergrenze_cent) {
    return { ...gemeinsam, status: 'eingehalten', meldung: null }
  }

  const quelle = [regel.quelle, regel.quelle_paragraf].filter(Boolean).join(', ')
  const land = regel.bundesland ?? 'bundesweit'
  const kopf =
    `Preis ${euro(eingabe.preisCent)} liegt ueber der gesetzlichen Obergrenze `
    + `von ${euro(regel.obergrenze_cent)} (${land}, ${regel.rechtsgrundlage}, `
    + `Quelle: ${quelle}).`

  if (regel.bestaetigt) {
    return {
      ...gemeinsam,
      status: 'verstoss',
      meldung:
        `${kopf} Diese Obergrenze ist bestaetigt — die Datenbank weist das `
        + `Speichern zurueck.`,
    }
  }

  const unschaerfe = unbestimmt
    ? ` Hinweis: Fuer die Leistungsart "${eingabe.leistungsart ?? '(keine)'}" ist `
      + `der Angebotstyp nach §45a Abs. 1 S. 2 SGB XI nicht eindeutig; geprueft `
      + `wurde gegen die hoechste einschlaegige Grenze. Eine strengere Grenze `
      + `kann zutreffen.`
    : ''

  return {
    ...gemeinsam,
    status: 'warnung',
    meldung:
      `${kopf} Die Obergrenze ist noch nicht bestaetigt (Verordnungstext nicht `
      + `1:1 gegengelesen), deshalb wird der Tarif nicht blockiert — bitte vor `
      + `der Abrechnung pruefen.${unschaerfe}`,
  }
}

// ---------------------------------------------------------------------------
// Datenbank-Zugriff
// ---------------------------------------------------------------------------

const SPALTEN =
  'bundesland, rechtsgrundlage, leistungsart, angebotstyp, verguetungsart, '
  + 'obergrenze_cent, quelle, quelle_paragraf, bestaetigt, gueltig_ab, '
  + 'gueltig_bis, ist_aktiv'

/**
 * Laedt die aktiven Obergrenzen zu einer Rechtsgrundlage.
 *
 * Kein Org-Fence: die Tabelle ist bewusst mandantenuebergreifend
 * (gesetzliche Regeln gelten fuer alle) und hat keine organization_id.
 *
 * Fehler werden NICHT geworfen. Dieser Guard ist eine Zusatzpruefung; faellt
 * die Abfrage aus, darf das Anlegen eines Tarifs nicht daran scheitern. Der
 * Aufrufer erkennt den Ausfall an `null` und kann ihn getrennt melden.
 */
export async function ladeObergrenzen(
  supabase: SupabaseClient,
  rechtsgrundlage: string,
): Promise<ObergrenzenRegel[] | null> {
  const { data, error } = await supabase
    .from('billing_gesetzliche_obergrenzen')
    .select(SPALTEN)
    .eq('rechtsgrundlage', rechtsgrundlage)
    .eq('ist_aktiv', true)

  if (error) return null
  return (data ?? []) as unknown as ObergrenzenRegel[]
}

/**
 * Vollstaendige Pruefung: laedt die Regeln und wertet sie aus.
 *
 * Bei Ladefehler kommt `keine_regel` zurueck — mit einer Meldung, die den
 * Ausfall benennt. Ein stilles „alles in Ordnung" waere hier das
 * gefaehrlichere Ergebnis: die Anzeige saehe genauso aus wie bei einem
 * tatsaechlich eingehaltenen Preis.
 */
export async function pruefeObergrenze(
  supabase: SupabaseClient,
  eingabe: ObergrenzenEingabe,
): Promise<ObergrenzenBefund> {
  if (eingabe.rechtsgrundlage === 'privat') {
    return {
      status: 'privat_ausgenommen',
      meldung: null,
      preisCent: eingabe.preisCent,
      obergrenzeCent: null,
      regel: null,
      angebotstypUnbestimmt: false,
    }
  }

  const regeln = await ladeObergrenzen(supabase, eingabe.rechtsgrundlage)

  if (regeln === null) {
    return {
      status: 'keine_regel',
      meldung:
        'Gesetzliche Obergrenzen konnten nicht geladen werden — der Preis wurde '
        + 'NICHT gegen die PfluV-Saetze geprueft.',
      preisCent: eingabe.preisCent,
      obergrenzeCent: null,
      regel: null,
      angebotstypUnbestimmt: false,
    }
  }

  return pruefeGegenRegeln(regeln, eingabe)
}

/** Kurzform fuer Aufrufer, die nur die Warnungsliste brauchen. */
export function meldungenAus(befunde: ObergrenzenBefund[]): string[] {
  return befunde.map(b => b.meldung).filter((m): m is string => m !== null)
}

/**
 * Prueft mehrere Tarife auf einmal.
 *
 * Laedt die Regeln einmal je Rechtsgrundlage statt einmal je Tarif — bei
 * einer Tarifliste waere sonst jede Zeile eine eigene Abfrage.
 */
export async function pruefeObergrenzenStapel(
  supabase: SupabaseClient,
  eingaben: ObergrenzenEingabe[],
): Promise<ObergrenzenBefund[]> {
  const grundlagen = [...new Set(
    eingaben.filter(e => e.rechtsgrundlage !== 'privat').map(e => e.rechtsgrundlage),
  )]

  const regelnJeGrundlage = new Map<string, ObergrenzenRegel[] | null>()
  for (const g of grundlagen) {
    regelnJeGrundlage.set(g, await ladeObergrenzen(supabase, g))
  }

  return eingaben.map(eingabe => {
    if (eingabe.rechtsgrundlage === 'privat') {
      return {
        status: 'privat_ausgenommen' as const,
        meldung: null,
        preisCent: eingabe.preisCent,
        obergrenzeCent: null,
        regel: null,
        angebotstypUnbestimmt: false,
      }
    }
    const regeln = regelnJeGrundlage.get(eingabe.rechtsgrundlage)
    if (!regeln) {
      return {
        status: 'keine_regel' as const,
        meldung:
          'Gesetzliche Obergrenzen konnten nicht geladen werden — der Preis wurde '
          + 'NICHT gegen die PfluV-Saetze geprueft.',
        preisCent: eingabe.preisCent,
        obergrenzeCent: null,
        regel: null,
        angebotstypUnbestimmt: false,
      }
    }
    return pruefeGegenRegeln(regeln, eingabe)
  })
}
