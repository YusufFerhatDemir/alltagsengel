// ═══════════════════════════════════════════════════════════════
// EDIFACT-Generator für die Abrechnung nach § 105 Abs. 2 SGB XI
// (Ersatz für Dakota & Co. — eigenes Abrechnungssystem Alltagsengel)
//
// Erzeugt aus genehmigten Verordnungen + erbrachten Leistungsnachweisen
// eine Nutzdatendatei (UNB..UNZ) je Datenannahmestelle/Kassenart.
// Je Kostenträger/Pflegekasse entsteht ein Nachrichtenpaar:
//   PLGA (Gesamtaufstellung/Rechnung) + PLAA (Abrechnungsdaten je Fall)
//
// Aufbau laut Technischer Anlage 1 Version 6.5.1, Rechnungsart 1
// (Selbstabrechner, Zahlung an IK des Leistungserbringers):
//
//   UNB
//     UNH → PLGA: FKT REC SRD UST GES NAM → UNT
//     UNH → PLAA: FKT REC (INV NAD MAN (ESK ELS…)… IAF)… → UNT
//   UNZ
//
// Hinweis Verschlüsselung: Vor dem Versand muss die Nutzdatendatei nach
// der SECON-Spezifikation (Anlage 16 Security-Schnittstelle, PKCS#7 mit
// ITSG-Trust-Center-Zertifikat) verschlüsselt und signiert werden —
// Referenzimplementierung: github.com/DieTechniker/secon-tool (Java)
// bzw. secon-keygen. Das erfordert ein Zertifikat des ITSG Trust Centers
// auf das IK 460629986 und ist ein separater Schritt (Phase 2).
// ═══════════════════════════════════════════════════════════════

import { centRunden } from '@/lib/geld'
import {
  UNA, UNB, UNZ, UNH, UNT,
  FKT_PLGA, FKT_PLAA, REC, SRD, UST, GES, NAM,
  INV, NAD, MAN, ESK, ELS, IAF,
} from './edifact-segments'
import {
  LEISTUNGSART_SCHLUESSEL,
  ABRECHNUNGSCODE_ALLTAGSENGEL,
  tarifkennzeichenFuerBundesland,
  ERSATZ_BESCHAEFTIGTENNUMMER,
  findeDatenannahmestelle,
  type Datenannahmestelle,
  type Kassenart,
} from './schluesselverzeichnis'

// IK-Nummer ist NICHT mehr hier hartcodiert (P0-5) — Aufrufer holen sie via
// getOrgIK() aus lib/config/org-config.ts und übergeben sie explizit an
// generateEDIFACT()/generateAlleDateien() (kein Default-Parameter mehr,
// damit ein Vergessen des Werts sofort zu einem Typfehler statt zu einer
// falschen Absender-IK führt).
export const ALLTAGSENGEL_NAME = 'Alltagsengel UG'

// ── Eingabedaten ────────────────────────────────────────────────

export interface AbrechnungsLeistung {
  /** Leistungsdatum ISO "YYYY-MM-DD" */
  datum: string
  /** interner Leistungsart-Schlüssel (s. LEISTUNGSART_SCHLUESSEL) */
  leistungsart: string
  /** optionale Leistungskomplex-Nr. (überschreibt den 2.7-Schlüssel) */
  leistungskomplex?: string
  /** Menge (bei Zeitvergütung: Stunden, z. B. 1.5) */
  menge: number
  /** Vertragspreis je Einheit in Cent */
  einzelpreis_cent: number
  /** Uhrzeit Beginn "HH:MM" — Pflicht bei Zeitvergütung */
  uhrzeit?: string
  /** Dauer in Minuten — Pflicht bei Zeitvergütung (Zusatzinfo mmmm) */
  dauer_minuten?: number
  /** Name der Pflege-/Betreuungskraft (nur Doku; abgerechnet wird die Nummer) */
  pflegekraft_name: string
  /** Beschäftigtennummer nach § 293 Abs. 8 SGB V, sonst Ersatzwert */
  beschaeftigtennummer?: string
}

export interface AbrechnungsFall {
  verordnung_id: string
  client: {
    versichertennummer: string
    geburtsdatum: string // ISO "YYYY-MM-DD"
    nachname: string
    vorname: string
    pflegegrad: number
    strasse?: string
    hausnummer?: string
    plz?: string
    ort?: string
  }
  kostentraeger: {
    /** IK des Kostenträgers (Institution, die die Rechnung begleicht) */
    ik_nummer: string
    /** IK der Pflegekasse (beginnt mit "18") — falls leer wird das
     *  Kostenträger-IK verwendet bzw. "18" + Rest abgeleitet */
    pflegekasse_ik?: string
    name: string
  }
  leistungen: AbrechnungsLeistung[]
  genehmigung_aktenzeichen?: string
  /** Abrechnungsmonat "YYYYMM" */
  abrechnungsmonat: string
}

export interface GeneratorOptionen {
  /** ungenutzt — die IK wird als Pflichtparameter an generateEDIFACT()/
   *  generateAlleDateien() übergeben, nicht über die Optionen. */
  absender_ik?: string
  /** Firmenname für das NAM-Segment */
  absender_name?: string
  /** Rechnungsdatum (Default: heute) */
  rechnungsdatum?: Date
  /** fortlaufende Nummer der Lieferung an diese Annahmestelle (UNB) */
  datenaustauschreferenz?: number
  /** laufende Datei-Nr. je Kalenderjahr für den logischen Dateinamen */
  laufende_nummer?: number
  /** 0=Testdatei, 1=Erprobung, 2=Echtdatei. Ohne Angabe: '0' (fail-closed). */
  dateiindikator?: '0' | '1' | '2'
  /** Präfix der Rechnungsnummern (eindeutig je Erstellungsjahr!) */
  rechnungsnummer_praefix?: string
  /**
   * Bundesland-Katalogcode ('hessen', 'bayern', …) des Leistungsorts.
   * Bestimmt Tarifbereich und AOK-Datenannahmestelle. Pflicht, sofern kein
   * `tarifkennzeichen` explizit gesetzt ist — ein stiller Hessen-Default
   * würde in anderen Bundesländern eine falsche Abrechnung erzeugen.
   */
  bundesland?: string
  /** Tarifkennzeichen — überschreibt die Ableitung aus `bundesland`. */
  tarifkennzeichen?: string
  /** Abrechnungscode (Default "36" privat gewerblich) */
  abrechnungscode?: string
}

// ── Ergebnis ────────────────────────────────────────────────────

export interface FallErgebnis {
  verordnung_id: string
  belegnummer: string
  versichertennummer: string
  name: string
  brutto_cent: number
}

export interface RechnungsErgebnis {
  kostentraeger_ik: string
  pflegekasse_ik: string
  kostentraeger_name: string
  rechnungsnummer: string
  leistungsart: string
  gesamtbetrag_cent: number
  faelle: FallErgebnis[]
}

export interface EdifactDatei {
  /** kompletter Dateiinhalt (UNA + UNB..UNZ), Segmente durch \n getrennt */
  inhalt: string
  /** logischer Dateiname (Anwendungsreferenz, 11 Stellen) */
  logischer_dateiname: string
  /** physikalischer Dateiname (z. B. "EPFL0001") */
  physikalischer_dateiname: string
  datenannahmestelle: Datenannahmestelle
  anzahl_nachrichten: number
  gesamtbetrag_cent: number
  rechnungen: RechnungsErgebnis[]
  warnungen: string[]
}

// ── Hilfsfunktionen ─────────────────────────────────────────────

/** "HH:MM" → "HHMM" */
function uhrzeitHHMM(u?: string): string | undefined {
  if (!u) return undefined
  const m = u.match(/^(\d{1,2}):?(\d{2})/)
  if (!m) return undefined
  return `${m[1].padStart(2, '0')}${m[2]}`
}

/**
 * Logischer Dateiname (Anwendungsreferenz, Anhang 3 Abschnitt 2.2.1):
 * Stellen 1-2  "PL" (Pflege-Leistungserbringer)
 * Stellen 3-5  Abrechnungszeitraum "MMJ" (Monat + letzte Jahresstelle)
 * Stelle  6    Art der Lieferung (0=Regeldaten, 1-9=Korrekturlieferung)
 * Stellen 7-8  laufende Nummer je Kalenderjahr und Datenannahmestelle
 * Stelle  9    "S" Selbstabrechner / "A" Abrechnungszentrum
 * Stellen 10-11 Kassenarten-Kennung (AO, BK, BN, EK, IK, LK, SE)
 */
export function logischerDateiname(
  abrechnungsmonat: string, // "YYYYMM"
  kassenart: Kassenart,
  laufendeNummer: number = 1,
  korrekturlieferung: number = 0,
): string {
  const monat = abrechnungsmonat.slice(4, 6)
  const jahr = abrechnungsmonat.slice(3, 4) // letzte Stelle des Jahres
  return `PL${monat}${jahr}${korrekturlieferung}${String(laufendeNummer).padStart(2, '0')}S${kassenart}`
}

/** Physikalischer Dateiname: E/T + "PFL" + Verfahrensversion 0 + lfd. Nr. */
export function physikalischerDateiname(laufendeNummer: number, test: boolean = false): string {
  return `${test ? 'T' : 'E'}PFL0${String(laufendeNummer).padStart(3, '0')}`
}

/**
 * Betrag einer Einzelleistung: Einzelpreis × Menge, kaufmännisch gerundet.
 *
 * Exportiert, damit die Rundung ohne einen vollstaendigen Abrechnungsfall
 * (Kostenträger, Datenannahmestelle, Versichertendaten) pruefbar ist —
 * siehe lib/__tests__/geld-rundung-track2.test.ts.
 */
export function leistungsBetragCent(l: AbrechnungsLeistung): number {
  return centRunden(l.einzelpreis_cent * l.menge)
}

/** Gruppiert Fälle nach Kostenträger-IK (jede Kasse eigenes PLGA/PLAA-Paar). */
export function gruppiereNachKostentraeger(faelle: AbrechnungsFall[]): Map<string, AbrechnungsFall[]> {
  const gruppen = new Map<string, AbrechnungsFall[]>()
  for (const fall of faelle) {
    const ik = fall.kostentraeger.ik_nummer
    if (!gruppen.has(ik)) gruppen.set(ik, [])
    gruppen.get(ik)!.push(fall)
  }
  return gruppen
}

// ── Hauptfunktion ───────────────────────────────────────────────

/**
 * Generiert eine §105-konforme EDIFACT-Nutzdatendatei für eine Menge von
 * Abrechnungsfällen. Alle Fälle müssen zur SELBEN Datenannahmestelle
 * gehören (eine Nutzdatendatei je Annahmestelle/Kassenart!) — für den
 * kompletten Lauf über mehrere Kassenarten `generateAlleDateien` nutzen.
 */
export function generateEDIFACT(
  faelle: AbrechnungsFall[],
  absender_ik: string,
  optionen: GeneratorOptionen = {},
): EdifactDatei {
  if (faelle.length === 0) throw new Error('Keine Abrechnungsfälle übergeben')

  const warnungen: string[] = []
  const jetzt = optionen.rechnungsdatum ?? new Date()
  const monat = faelle[0].abrechnungsmonat
  const annahmestelle = findeDatenannahmestelle(faelle[0].kostentraeger.name, optionen.bundesland)
  if (!annahmestelle) {
    throw new Error(
      `Keine Datenannahmestelle für Kostenträger "${faelle[0].kostentraeger.name}" `
      + `im Bundesland "${optionen.bundesland}" hinterlegt. Bitte in `
      + `lib/abrechnung/schluesselverzeichnis.ts ergänzen — eine Lieferung an die `
      + `falsche Annahmestelle wäre ein Abrechnungsfehler.`
    )
  }
  const lfdNr = optionen.laufende_nummer ?? 1
  const dar = optionen.datenaustauschreferenz ?? 1
  // FAIL-CLOSED: ohne ausdrücklichen Wert gilt Testdatei ('0'), nicht Echtdatei.
  // Bis 19.08.2026 stand hier '2'. Der einzige Produktivaufrufer
  // (kassenabrechnung-engine.ts) setzt den Wert zwar immer aus
  // `dateiindikatorFuer()` — aber ein Default, der im Vergessensfall eine
  // Forderung bei der Kasse auslöst, ist die falsche Richtung. Wer eine
  // Echtdatei will, muss '2' hinschreiben.
  const indikator = optionen.dateiindikator ?? '0'
  const abrechnungscode = optionen.abrechnungscode ?? ABRECHNUNGSCODE_ALLTAGSENGEL
  // Kein stiller Hessen-Default mehr: entweder explizit gesetzt oder aus dem
  // Bundesland abgeleitet. Fehlt beides, bricht die Erzeugung ab.
  const tarifkennzeichen = optionen.tarifkennzeichen
    ?? (optionen.bundesland
      ? tarifkennzeichenFuerBundesland(optionen.bundesland)
      : (() => {
        throw new Error(
          'Tarifkennzeichen fehlt: bitte GeneratorOptionen.bundesland setzen '
          + '(oder tarifkennzeichen explizit angeben). Ein Default würde jede '
          + 'Abrechnung außerhalb Hessens mit dem falschen Tarifbereich versehen.'
        )
      })())
  const praefix = optionen.rechnungsnummer_praefix ?? `AE-${monat}`
  const anwendungsreferenz = logischerDateiname(monat, annahmestelle.kassenart, lfdNr)

  const segmente: string[] = []
  const rechnungen: RechnungsErgebnis[] = []
  let unhZaehler = 0
  let gesamtbetragDatei = 0

  segmente.push(UNA())
  segmente.push(UNB(absender_ik, annahmestelle.ik, jetzt, dar, anwendungsreferenz, indikator))

  const gruppen = gruppiereNachKostentraeger(faelle)
  let rechnungsIndex = 0

  for (const [kostentraegerIK, gruppenFaelle] of gruppen) {
    rechnungsIndex++
    const erster = gruppenFaelle[0]
    const pflegekasseIK = erster.kostentraeger.pflegekasse_ik || kostentraegerIK
    if (!pflegekasseIK.startsWith('18')) {
      warnungen.push(
        `Kostenträger ${erster.kostentraeger.name}: Pflegekassen-IK "${pflegekasseIK}" beginnt nicht mit "18" — bitte IK der Pflegekasse (nicht der Krankenkasse) prüfen.`,
      )
    }

    // Rechnungsnummer: eindeutig je Erstellungsjahr, nur A-Z/0-9/"-"/"/"
    const rechnungsnummer = `${praefix}-${String(rechnungsIndex).padStart(2, '0')}`.replace(/[^A-Za-z0-9/-]/g, '')

    // Je PLGA nur EINE Leistungsart (TA1 4.4) → dominante Art der Gruppe
    const artZaehler = new Map<string, number>()
    for (const fall of gruppenFaelle) {
      for (const l of fall.leistungen) {
        const s = LEISTUNGSART_SCHLUESSEL[l.leistungsart]
        if (s) artZaehler.set(s.art, (artZaehler.get(s.art) || 0) + 1)
      }
    }
    const leistungsartPLGA = [...artZaehler.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '01'
    if (artZaehler.size > 1) {
      warnungen.push(
        `Rechnung ${rechnungsnummer}: mehrere Leistungsarten (${[...artZaehler.keys()].join(', ')}) in einer Nachricht — laut TA1 je PLGA nur eine Leistungsart zulässig. Fälle ggf. auf getrennte Läufe aufteilen.`,
      )
    }

    // ═══ PLAA zuerst berechnen (liefert die Summen für PLGA) ═══
    const plaaSegmente: string[] = []
    const fallErgebnisse: FallErgebnis[] = []
    let summeBrutto = 0

    plaaSegmente.push(FKT_PLAA('01', absender_ik, kostentraegerIK, pflegekasseIK, absender_ik))
    plaaSegmente.push(REC(rechnungsnummer, '0', jetzt, '1'))

    let belegZaehler = 0
    for (const fall of gruppenFaelle) {
      belegZaehler++
      const belegnummer = `${monat}-${String(belegZaehler).padStart(3, '0')}`
      plaaSegmente.push(INV(fall.client.versichertennummer, belegnummer))
      plaaSegmente.push(NAD(
        fall.client.nachname, fall.client.vorname, fall.client.geburtsdatum,
        fall.client.strasse, fall.client.hausnummer, fall.client.plz, fall.client.ort,
      ))
      plaaSegmente.push(MAN(fall.abrechnungsmonat, fall.client.pflegegrad))

      // Einsätze chronologisch aufsteigend (Kalendertag, Uhrzeit) — TA1-Pflicht
      const sortiert = [...fall.leistungen].sort((a, b) =>
        (a.datum + (a.uhrzeit || '')) < (b.datum + (b.uhrzeit || '')) ? -1 : 1,
      )

      let fallBrutto = 0
      for (const l of sortiert) {
        const schluessel = LEISTUNGSART_SCHLUESSEL[l.leistungsart]
        if (!schluessel) {
          warnungen.push(`Fall ${belegnummer}: unbekannte Leistungsart "${l.leistungsart}" — Leistung übersprungen!`)
          continue
        }
        const kalendertag = l.datum.slice(8, 10)
        const uhrzeit = uhrzeitHHMM(l.uhrzeit)
        // Uhrzeit ist Pflicht bei Vergütungsart 01/02/03/06
        if (['01', '02', '03', '06'].includes(schluessel.verguetungsart) && !uhrzeit) {
          warnungen.push(`Fall ${belegnummer}, ${l.datum}: Uhrzeit fehlt (Pflicht bei Vergütungsart ${schluessel.verguetungsart}).`)
        }
        plaaSegmente.push(ESK(kalendertag, uhrzeit))

        // Zusatzinfo: bei Zeitvergütung (02) die Dauer in Minuten "mmmm", sonst "00"
        const zusatzinfo = schluessel.zeitbasiert
          ? String(l.dauer_minuten ?? Math.round(l.menge * 60)).padStart(4, '0')
          : '00'

        plaaSegmente.push(ELS({
          leistungsart: schluessel.art,
          verguetungsart: schluessel.verguetungsart,
          qualifikation: schluessel.qualifikation,
          // Bei vereinbarten Leistungskomplexen (Vergütungsart 01) die LK-Nummer
          leistung: l.leistungskomplex || schluessel.leistung,
          einzelpreisCent: l.einzelpreis_cent,
          zusatzinfo,
          anzahl: l.menge,
          beschaeftigtennummer: l.beschaeftigtennummer || ERSATZ_BESCHAEFTIGTENNUMMER.FEHLT_SONSTIGER_GRUND,
        }))
        fallBrutto += leistungsBetragCent(l)
      }

      // IAF: ambulant ohne Zuzahlung/Beihilfe → Rechnungsbetrag = Brutto
      plaaSegmente.push(IAF(fallBrutto, fallBrutto))
      summeBrutto += fallBrutto
      fallErgebnisse.push({
        verordnung_id: fall.verordnung_id,
        belegnummer,
        versichertennummer: fall.client.versichertennummer,
        name: `${fall.client.nachname}, ${fall.client.vorname}`,
        brutto_cent: fallBrutto,
      })
    }

    // ═══ PLGA (Gesamtaufstellung) ═══
    unhZaehler++
    const plgaSegmente = [
      FKT_PLGA('01', absender_ik, kostentraegerIK, pflegekasseIK, absender_ik),
      REC(rechnungsnummer, '0', jetzt, '1'),
      SRD(abrechnungscode, tarifkennzeichen, leistungsartPLGA),
      UST(true), // Kleinunternehmer / § 4 Nr. 16 UStG befreit
      GES(summeBrutto, summeBrutto),
      NAM(optionen.absender_name ?? ALLTAGSENGEL_NAME),
    ]
    segmente.push(UNH(unhZaehler, 'PLGA'))
    segmente.push(...plgaSegmente)
    segmente.push(UNT(plgaSegmente.length + 2, unhZaehler))

    // ═══ PLAA ═══
    unhZaehler++
    segmente.push(UNH(unhZaehler, 'PLAA'))
    segmente.push(...plaaSegmente)
    segmente.push(UNT(plaaSegmente.length + 2, unhZaehler))

    gesamtbetragDatei += summeBrutto
    rechnungen.push({
      kostentraeger_ik: kostentraegerIK,
      pflegekasse_ik: pflegekasseIK,
      kostentraeger_name: erster.kostentraeger.name,
      rechnungsnummer,
      leistungsart: leistungsartPLGA,
      gesamtbetrag_cent: summeBrutto,
      faelle: fallErgebnisse,
    })
  }

  segmente.push(UNZ(unhZaehler, dar))

  return {
    inhalt: segmente.join('\n'),
    logischer_dateiname: anwendungsreferenz,
    physikalischer_dateiname: physikalischerDateiname(lfdNr, indikator === '0'),
    datenannahmestelle: annahmestelle,
    anzahl_nachrichten: unhZaehler,
    gesamtbetrag_cent: gesamtbetragDatei,
    rechnungen,
    warnungen,
  }
}

/**
 * Kompletter Abrechnungslauf: teilt die Fälle nach zuständiger
 * Datenannahmestelle auf und generiert je Annahmestelle eine
 * eigene Nutzdatendatei (TA1: "Für jede Datenannahmestelle mit
 * Entschlüsselungsbefugnis ist je Kassenart eine Nutzdatendatei
 * (UNB bis UNZ) zu erstellen.").
 */
export function generateAlleDateien(
  faelle: AbrechnungsFall[],
  absender_ik: string,
  optionen: GeneratorOptionen = {},
): EdifactDatei[] {
  const nachAnnahmestelle = new Map<string, AbrechnungsFall[]>()
  for (const fall of faelle) {
    const stelle = findeDatenannahmestelle(fall.kostentraeger.name, optionen.bundesland)
    if (!stelle) {
      throw new Error(
        `Keine Datenannahmestelle für Kostenträger "${fall.kostentraeger.name}" `
        + `im Bundesland "${optionen.bundesland}" hinterlegt.`
      )
    }
    const key = `${stelle.ik}:${stelle.kassenart}`
    if (!nachAnnahmestelle.has(key)) nachAnnahmestelle.set(key, [])
    nachAnnahmestelle.get(key)!.push(fall)
  }
  let lfd = optionen.laufende_nummer ?? 1
  // Die Datenaustauschreferenz (UNB DE0020) muss je Lieferung fortlaufend
  // sein. Bis hierher bekam JEDE Datei des Laufs dieselbe Referenz aus den
  // Optionen — gehen zwei Dateien an dieselbe Annahmestelle (etwa BITMARCK
  // fuer BKK und IKK), ist das eine doppelte Referenz und damit ein
  // Abweisungsgrund. Sie laeuft deshalb parallel zur Dateinummer weiter.
  let dar = optionen.datenaustauschreferenz ?? 1
  const dateien: EdifactDatei[] = []
  for (const gruppe of nachAnnahmestelle.values()) {
    dateien.push(generateEDIFACT(gruppe, absender_ik, {
      ...optionen,
      laufende_nummer: lfd,
      datenaustauschreferenz: dar,
    }))
    lfd++
    dar++
  }
  return dateien
}
