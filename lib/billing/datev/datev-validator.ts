/**
 * DATEV-Validator — prueft einen fertigen Buchungsstapel, BEVOR er das Haus
 * verlaesst.
 *
 * ── WARUM DIESE SCHICHT UEBERHAUPT EXISTIERT ───────────────────────────────
 * Der Generator (buchungssatz-generator.ts) und der Formatierer
 * (datev-format.ts) sind beide getestet. Getestet ist damit, dass jede
 * EINZELNE Zeile richtig entsteht. Ungeprueft blieb bis hierher die Frage,
 * die der Steuerberater als erste stellt: ergibt die DATEI als Ganzes einen
 * einlesbaren, in sich stimmigen Stapel?
 *
 * Das ist keine Wiederholung der Zeilentests. Ein Stapel kann aus lauter
 * korrekten Zeilen bestehen und trotzdem unbrauchbar sein:
 *   - eine Zeile hat 11 statt 12 Felder, weil ein Wert ein Semikolon trug,
 *     das nicht in Anfuehrungszeichen stand (Spaltenversatz);
 *   - ein Konto ist weder ein Sachkonto des gewaehlten Kontenrahmens noch
 *     eine Debitorennummer aus dem vergebenen Bereich (DATEV legt beim
 *     Import stillschweigend ein neues Konto an);
 *   - Konto und Gegenkonto sind identisch (Buchung ohne Wirkung);
 *   - ein Belegdatum liegt ausserhalb des exportierten Zeitraums (die
 *     Buchung landet in der falschen Periode);
 *   - eine Belegnummer taucht mit ZWEI verschiedenen Betraegen auf
 *     derselben Buchungsart auf (Doppelbuchung).
 *
 * ── FAIL-CLOSED ────────────────────────────────────────────────────────────
 * `pruefeDatevStapel()` klassifiziert in `fehler` (Export darf nicht raus)
 * und `warnungen` (Export darf raus, jemand muss hinsehen). Der
 * Export-Service bricht bei `fehler.length > 0` ab. Ein Stapel, der nicht
 * geprueft werden konnte, gilt als fehlerhaft — nicht als geprueft.
 *
 * ── WAS HIER BEWUSST NICHT GEPRUEFT WIRD ───────────────────────────────────
 * Ob die Kontonummern die RICHTIGEN sind, kann diese Datei nicht wissen.
 * SKR03/SKR04 sind Standardkontenrahmen; welche Konten der Steuerberater
 * fuer diesen Mandanten tatsaechlich bebucht haben will, ist eine
 * Geschaeftsvorgabe (siehe `BERATER_VORGABE_ERFORDERLICH` unten). Geprueft
 * wird deshalb nur, dass jedes Konto AUS einem definierten Vorrat stammt —
 * nicht, dass der Vorrat der richtige ist.
 */

import { euroZuCent } from '@/lib/geld'
import type { DatevBuchungssatz } from './datev-format'
import type { Kontenrahmen } from './kontenrahmen'

// ---------------------------------------------------------------------------
// Ergebnistypen
// ---------------------------------------------------------------------------

export type PruefSchwere = 'fehler' | 'warnung'

export interface DatevBefund {
  /** Stabiler Schluessel, damit Tests und Oberflaeche nicht auf Text prüfen. */
  code: string
  schwere: PruefSchwere
  /** Zeilennummer in der CSV (1-basiert), oder null bei Stapel-Befunden. */
  zeile: number | null
  meldung: string
}

export interface DatevPruefErgebnis {
  ok: boolean
  fehler: DatevBefund[]
  warnungen: DatevBefund[]
  /** Kennzahlen, die auch ins Protokoll gehen. */
  kennzahlen: {
    zeilen: number
    summeSollCent: number
    summeHabenCent: number
    /** Konten, die in der Datei vorkommen — aufsteigend, ohne Dubletten. */
    konten: string[]
  }
}

/**
 * Konten, die der Standardkontenrahmen nicht kennt, aber die dieser Export
 * erzeugen darf: die Debitorennummern.
 */
const DEBITOR_MIN = 10000
const DEBITOR_MAX = 69999

/** Feldanzahl einer Buchungszeile — siehe generateDatevBeschriftung(). */
export const DATEV_FELDER = 12

/**
 * Die Beraternummer, die Mandantennummer und die Zuordnung
 * Geschaeftsvorfall→Konto sind Vorgaben des Steuerberaters. Sie stehen
 * NICHT im Code und werden hier auch nicht geraten.
 */
export const BERATER_VORGABE_ERFORDERLICH = [
  'Beraternummer (DATEV-Kanzlei)',
  'Mandantennummer (DATEV-Kanzlei)',
  'Kontenrahmen SKR03 oder SKR04 — bestaetigt durch die Kanzlei',
  'Erloeskonto fuer steuerfreie Pflegeleistungen (§ 4 Nr. 16 UStG)',
  'Sachkontenlaenge (4 oder 5)',
  'Wirtschaftsjahresbeginn',
] as const

// ---------------------------------------------------------------------------
// CSV zurueckparsen
// ---------------------------------------------------------------------------

/**
 * Zerlegt eine DATEV-CSV-Zeile in ihre Felder — nach denselben Regeln, nach
 * denen DATEV sie einliest: Semikolon trennt, Anfuehrungszeichen klammern,
 * ein verdoppeltes Anfuehrungszeichen innerhalb der Klammer ist ein
 * Literal.
 *
 * Bewusst ein eigener Parser statt `line.split(';')`: genau der Unterschied
 * zwischen beiden ist der Fehler, den diese Datei finden soll.
 */
export function zerlegeCsvZeile(zeile: string): string[] {
  const felder: string[] = []
  let aktuell = ''
  let inAnfuehrung = false

  for (let i = 0; i < zeile.length; i++) {
    const z = zeile[i]

    if (inAnfuehrung) {
      if (z === '"') {
        if (zeile[i + 1] === '"') { aktuell += '"'; i++ }
        else inAnfuehrung = false
      } else {
        aktuell += z
      }
      continue
    }

    if (z === '"') { inAnfuehrung = true; continue }
    if (z === ';') { felder.push(aktuell); aktuell = ''; continue }
    aktuell += z
  }

  felder.push(aktuell)
  return felder
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

function befund(code: string, schwere: PruefSchwere, zeile: number | null, meldung: string): DatevBefund {
  return { code, schwere, zeile, meldung }
}

/** DATEV-Betrag („1234,56") → Cent. Wirft nicht; `null` heisst „nicht lesbar". */
export function datevBetragZuCent(feld: string): number | null {
  if (!/^\d+,\d{2}$/.test(feld)) return null
  return euroZuCent(feld.replace(',', '.'))
}

/** Ein Konto ist gueltig, wenn es Sachkonto des Rahmens ODER Debitor ist. */
function kontoArt(
  konto: string,
  sachkonten: ReadonlySet<string>,
): 'sachkonto' | 'debitor' | 'unbekannt' {
  if (sachkonten.has(konto)) return 'sachkonto'
  if (/^\d+$/.test(konto)) {
    const n = Number(konto)
    if (n >= DEBITOR_MIN && n <= DEBITOR_MAX) return 'debitor'
  }
  return 'unbekannt'
}

/** TTMM → { tag, monat } oder null. */
function zerlegeTtmm(feld: string): { tag: number; monat: number } | null {
  if (!/^\d{4}$/.test(feld)) return null
  const tag = Number(feld.slice(0, 2))
  const monat = Number(feld.slice(2, 4))
  if (monat < 1 || monat > 12) return null
  if (tag < 1 || tag > 31) return null
  return { tag, monat }
}

// ---------------------------------------------------------------------------
// Stapel-Pruefung auf den Buchungssaetzen (vor dem Formatieren)
// ---------------------------------------------------------------------------

export interface StapelPruefParams {
  buchungen: readonly DatevBuchungssatz[]
  kontenrahmen: Kontenrahmen
  /** Zeitraum des Exports, YYYY-MM-DD. */
  zeitraumVon: string
  zeitraumBis: string
  /** Sachkonten des gewaehlten Rahmens — aus kontenrahmen.ts, nicht geraten. */
  sachkonten: readonly string[]
}

/**
 * Prueft die Buchungssaetze VOR dem Formatieren.
 *
 * Diese Ebene sieht Dinge, die in der fertigen CSV nicht mehr erkennbar
 * sind — etwa dass ein Umsatz mehr als zwei Nachkommastellen hatte und
 * beim Formatieren gerundet WURDE (der formatierte Wert sieht danach
 * korrekt aus, die Summe stimmt aber nicht mehr).
 */
export function pruefeBuchungssaetze(params: StapelPruefParams): DatevPruefErgebnis {
  const { buchungen, zeitraumVon, zeitraumBis } = params
  const sachkonten = new Set(params.sachkonten)
  const fehler: DatevBefund[] = []
  const warnungen: DatevBefund[] = []

  let summeSoll = 0
  let summeHaben = 0
  const konten = new Set<string>()

  const vonMonat = Number(zeitraumVon.slice(5, 7))
  const bisMonat = Number(zeitraumBis.slice(5, 7))

  /** Belegnummer → Menge unterschiedlicher (Betrag,Konto,Gegenkonto)-Tripel. */
  const belegSpuren = new Map<string, Set<string>>()

  buchungen.forEach((bs, idx) => {
    const nr = idx + 1

    // ── Betrag ──
    if (!Number.isFinite(bs.umsatz)) {
      fehler.push(befund('BETRAG_UNGUELTIG', 'fehler', nr, `Buchung ${nr}: Umsatz ist keine Zahl.`))
      return
    }
    if (bs.umsatz <= 0) {
      // DATEV traegt das Vorzeichen im Soll/Haben-Kennzeichen, nicht im
      // Betrag. Ein negativer Umsatz waere beim Import ein anderer
      // Geschaeftsvorfall als gemeint.
      fehler.push(befund('BETRAG_NICHT_POSITIV', 'fehler', nr,
        `Buchung ${nr}: Umsatz ${bs.umsatz} ist nicht positiv. DATEV traegt das Vorzeichen im Soll/Haben-Kennzeichen.`))
      return
    }
    const cent = euroZuCent(bs.umsatz)
    if (Math.abs(bs.umsatz * 100 - cent) > 1e-6) {
      // Kann nur eintreten, wenn der Umsatz mehr als zwei Nachkommastellen
      // trug. Das ist eine Warnung, kein Abbruch: die CSV traegt danach den
      // gerundeten Wert, die Buchung ist einlesbar — nur die Summe weicht
      // von der Quelle ab.
      warnungen.push(befund('BETRAG_GERUNDET', 'warnung', nr,
        `Buchung ${nr}: Umsatz ${bs.umsatz} hat mehr als zwei Nachkommastellen und wird beim Formatieren gerundet.`))
    }
    if (bs.sollHaben === 'S') summeSoll += cent
    else summeHaben += cent

    // ── Soll/Haben ──
    if (bs.sollHaben !== 'S' && bs.sollHaben !== 'H') {
      fehler.push(befund('SH_UNGUELTIG', 'fehler', nr,
        `Buchung ${nr}: Soll/Haben-Kennzeichen "${bs.sollHaben}" ist weder S noch H.`))
    }

    // ── Konten ──
    for (const [feld, wert] of [['Konto', bs.konto], ['Gegenkonto', bs.gegenkonto]] as const) {
      const roh = String(wert ?? '').trim()
      if (!roh) {
        fehler.push(befund('KONTO_LEER', 'fehler', nr, `Buchung ${nr}: ${feld} ist leer.`))
        continue
      }
      konten.add(roh)
      if (kontoArt(roh, sachkonten) === 'unbekannt') {
        // Kein Abbruch mit Ansage waere hier falsch: DATEV legt ein
        // unbekanntes Konto beim Import stillschweigend an, und der Fehler
        // faellt erst in der Bilanz auf.
        fehler.push(befund('KONTO_UNBEKANNT', 'fehler', nr,
          `Buchung ${nr}: ${feld} "${roh}" ist weder ein Sachkonto des Kontenrahmens noch eine Debitorennummer (${DEBITOR_MIN}-${DEBITOR_MAX}).`))
      }
    }
    if (bs.konto && bs.konto === bs.gegenkonto) {
      fehler.push(befund('KONTO_GLEICH_GEGENKONTO', 'fehler', nr,
        `Buchung ${nr}: Konto und Gegenkonto sind identisch ("${bs.konto}") — die Buchung haette keine Wirkung.`))
    }

    // ── Belegdatum ──
    const datum = zerlegeTtmm(bs.belegdatum)
    if (!datum) {
      fehler.push(befund('DATUM_UNGUELTIG', 'fehler', nr,
        `Buchung ${nr}: Belegdatum "${bs.belegdatum}" ist kein gueltiges TTMM.`))
    } else if (vonMonat <= bisMonat && (datum.monat < vonMonat || datum.monat > bisMonat)) {
      // Nur pruefbar, solange der Zeitraum nicht ueber den Jahreswechsel
      // laeuft — TTMM traegt kein Jahr.
      fehler.push(befund('DATUM_AUSSERHALB_ZEITRAUM', 'fehler', nr,
        `Buchung ${nr}: Belegdatum "${bs.belegdatum}" liegt ausserhalb des Exportzeitraums ${zeitraumVon}…${zeitraumBis} — die Buchung landete in der falschen Periode.`))
    }

    // ── Belegnummer ──
    const beleg = String(bs.belegnummer ?? '').trim()
    if (!beleg) {
      warnungen.push(befund('BELEGNUMMER_LEER', 'warnung', nr,
        `Buchung ${nr}: keine Belegnummer — die Buchung ist im Stapel nicht zuordenbar.`))
    } else {
      const spur = `${cent}|${bs.konto}|${bs.gegenkonto}|${bs.sollHaben}|${bs.belegdatum}`
      const menge = belegSpuren.get(beleg) ?? new Set<string>()
      menge.add(spur)
      belegSpuren.set(beleg, menge)
    }

    // ── USt-Schluessel ──
    if (bs.ustSchluessel !== undefined && ![0, 3].includes(bs.ustSchluessel)) {
      warnungen.push(befund('UST_UNBEKANNT', 'warnung', nr,
        `Buchung ${nr}: USt-Schluessel ${bs.ustSchluessel} ist im Kontenrahmen dieses Exports nicht vorgesehen (0 = steuerfrei, 3 = 19 %).`))
    }
  })

  // ── Ununterscheidbare Zeilen ──
  //
  // Zwei UNTERSCHIEDLICHE Zeilen zur selben Belegnummer sind normal
  // (Rechnung + Zahlung + Mahngebuehr tragen alle die Rechnungsnummer).
  // Unterschieden wird deshalb an der Spur — Betrag, beide Konten,
  // Soll/Haben UND Belegdatum —, nicht an der Anzahl.
  //
  // WARUM WARNUNG UND NICHT FEHLER: zwei betragsgleiche Teilzahlungen auf
  // dieselbe Rechnung am selben Tag sind ein echter, zulaessiger Vorgang
  // und von einer Doppelbuchung in der Datei nicht zu unterscheiden. Ein
  // Fehler wuerde hier einen korrekten Export blockieren. Die Warnung
  // erscheint im Protokoll und im Pilot-Dashboard; entschieden wird sie
  // von einem Menschen, nicht geraten.
  for (const [beleg, spuren] of belegSpuren) {
    const alle = buchungen.filter(b => String(b.belegnummer ?? '').trim() === beleg)
    if (alle.length > spuren.size) {
      warnungen.push(befund('ZEILEN_UNUNTERSCHEIDBAR', 'warnung', null,
        `Belegnummer "${beleg}": ${alle.length} Buchungen, davon nur ${spuren.size} unterscheidbar. `
        + `Entweder zwei betragsgleiche Vorgaenge am selben Tag oder eine Doppelbuchung — vor dem Import pruefen.`))
    }
  }

  return {
    ok: fehler.length === 0,
    fehler,
    warnungen,
    kennzahlen: {
      zeilen: buchungen.length,
      summeSollCent: summeSoll,
      summeHabenCent: summeHaben,
      konten: [...konten].sort(),
    },
  }
}

// ---------------------------------------------------------------------------
// Pruefung auf der fertigen CSV
// ---------------------------------------------------------------------------

export interface CsvPruefParams {
  csv: string
  sachkonten: readonly string[]
  /** Erwartete Anzahl Buchungszeilen (ohne Kopf- und Beschriftungszeile). */
  erwarteteBuchungen: number
}

/**
 * Prueft die fertige Datei — also genau das Artefakt, das der Steuerberater
 * bekommt.
 *
 * Der wichtigste Punkt ist die Feldanzahl: sie ist der einzige Nachweis,
 * dass kein Wert die Spaltenausrichtung verschoben hat. Alle bisherigen
 * Escaping-Tests pruefen einzelne Werte; diese Pruefung sieht die Zeile so,
 * wie DATEV sie liest.
 */
export function pruefeDatevCsv(params: CsvPruefParams): DatevPruefErgebnis {
  const { csv, erwarteteBuchungen } = params
  const sachkonten = new Set(params.sachkonten)
  const fehler: DatevBefund[] = []
  const warnungen: DatevBefund[] = []

  if (!csv.endsWith('\r\n')) {
    fehler.push(befund('ZEILENENDE', 'fehler', null,
      'Die Datei endet nicht mit CRLF. DATEV erwartet Windows-Zeilenenden.'))
  }
  if (csv.includes('\n') && /[^\r]\n/.test(csv)) {
    fehler.push(befund('ZEILENENDE_GEMISCHT', 'fehler', null,
      'Die Datei enthaelt ein LF ohne vorangehendes CR — gemischte Zeilenenden.'))
  }

  const zeilen = csv.split('\r\n').filter(z => z.length > 0)

  if (zeilen.length < 2) {
    fehler.push(befund('DATEI_UNVOLLSTAENDIG', 'fehler', null,
      'Die Datei hat weder Kopf- noch Beschriftungszeile.'))
    return { ok: false, fehler, warnungen, kennzahlen: { zeilen: 0, summeSollCent: 0, summeHabenCent: 0, konten: [] } }
  }

  if (!zeilen[0].startsWith('"EXTF";510;21;"Buchungsstapel"')) {
    fehler.push(befund('KOPFZEILE', 'fehler', 1,
      'Die Kopfzeile entspricht nicht dem Buchungsstapel-Format 510.'))
  }

  const beschriftung = zerlegeCsvZeile(zeilen[1])
  if (beschriftung.length !== DATEV_FELDER) {
    fehler.push(befund('BESCHRIFTUNG_FELDANZAHL', 'fehler', 2,
      `Die Beschriftungszeile hat ${beschriftung.length} statt ${DATEV_FELDER} Felder.`))
  }

  const buchungsZeilen = zeilen.slice(2)
  if (buchungsZeilen.length !== erwarteteBuchungen) {
    fehler.push(befund('ZEILENANZAHL', 'fehler', null,
      `Die Datei enthaelt ${buchungsZeilen.length} Buchungszeilen, erwartet waren ${erwarteteBuchungen}.`))
  }

  let summeSoll = 0
  let summeHaben = 0
  const konten = new Set<string>()

  buchungsZeilen.forEach((zeile, idx) => {
    const nr = idx + 3 // 1-basiert, nach Kopf- und Beschriftungszeile
    const felder = zerlegeCsvZeile(zeile)

    if (felder.length !== DATEV_FELDER) {
      // Der eine Befund, der alles andere entwertet: stimmt die Feldanzahl
      // nicht, steht jeder Folgewert in der falschen Spalte.
      fehler.push(befund('FELDANZAHL', 'fehler', nr,
        `Zeile ${nr}: ${felder.length} statt ${DATEV_FELDER} Felder — die Spalten sind verschoben.`))
      return
    }

    const [betrag, sh, konto, gegenkonto, , belegdatum, , buchungstext] = felder

    const cent = datevBetragZuCent(betrag)
    if (cent === null) {
      fehler.push(befund('BETRAG_FORMAT', 'fehler', nr,
        `Zeile ${nr}: Betrag "${betrag}" ist kein DATEV-Betrag (Komma, genau zwei Nachkommastellen, kein Vorzeichen).`))
    } else if (sh === 'S') summeSoll += cent
    else summeHaben += cent

    if (sh !== 'S' && sh !== 'H') {
      fehler.push(befund('SH_UNGUELTIG', 'fehler', nr,
        `Zeile ${nr}: Soll/Haben-Kennzeichen "${sh}" ist weder S noch H.`))
    }

    for (const [feld, wert] of [['Konto', konto], ['Gegenkonto', gegenkonto]] as const) {
      konten.add(wert)
      if (kontoArt(wert, sachkonten) === 'unbekannt') {
        fehler.push(befund('KONTO_UNBEKANNT', 'fehler', nr,
          `Zeile ${nr}: ${feld} "${wert}" ist weder Sachkonto noch Debitorennummer.`))
      }
    }

    if (!zerlegeTtmm(belegdatum)) {
      fehler.push(befund('DATUM_UNGUELTIG', 'fehler', nr,
        `Zeile ${nr}: Belegdatum "${belegdatum}" ist kein gueltiges TTMM.`))
    }

    // Formel-Riegel: nach dem Zerlegen ist der Wert das, was Excel in der
    // Zelle sieht. Ein fuehrendes = + - @ waere dort eine Formel; der
    // Formatierer setzt einen Apostroph davor, der hier wieder auftaucht.
    for (const [feld, wert] of [['Konto', konto], ['Gegenkonto', gegenkonto], ['Buchungstext', buchungstext]] as const) {
      if (/^[=+\-@]/.test(wert)) {
        fehler.push(befund('FORMEL_UNGESCHUETZT', 'fehler', nr,
          `Zeile ${nr}: ${feld} beginnt mit "${wert[0]}" und waere in Excel eine Formel.`))
      }
    }
  })

  return {
    ok: fehler.length === 0,
    fehler,
    warnungen,
    kennzahlen: {
      zeilen: buchungsZeilen.length,
      summeSollCent: summeSoll,
      summeHabenCent: summeHaben,
      konten: [...konten].sort(),
    },
  }
}

// ---------------------------------------------------------------------------
// Zusammenfassung fuer das Protokoll
// ---------------------------------------------------------------------------

/** Fasst mehrere Pruefergebnisse zu einem zusammen. */
export function fasseZusammen(...ergebnisse: DatevPruefErgebnis[]): DatevPruefErgebnis {
  const fehler = ergebnisse.flatMap(e => e.fehler)
  const warnungen = ergebnisse.flatMap(e => e.warnungen)
  const letzte = ergebnisse[ergebnisse.length - 1]
  return {
    ok: fehler.length === 0,
    fehler,
    warnungen,
    kennzahlen: letzte?.kennzahlen ?? { zeilen: 0, summeSollCent: 0, summeHabenCent: 0, konten: [] },
  }
}

/** Menschenlesbarer Block fuer das Export-Protokoll. */
export function formatierePruefbericht(ergebnis: DatevPruefErgebnis): string {
  const zeilen: string[] = []
  zeilen.push(`Pruefung:          ${ergebnis.ok ? 'bestanden' : 'NICHT BESTANDEN'}`)
  zeilen.push(`Buchungszeilen:    ${ergebnis.kennzahlen.zeilen}`)
  zeilen.push(`Summe Soll:        ${(ergebnis.kennzahlen.summeSollCent / 100).toFixed(2)} EUR`)
  zeilen.push(`Summe Haben:       ${(ergebnis.kennzahlen.summeHabenCent / 100).toFixed(2)} EUR`)
  zeilen.push(`Bebuchte Konten:   ${ergebnis.kennzahlen.konten.join(', ') || '—'}`)
  if (ergebnis.fehler.length) {
    zeilen.push('')
    zeilen.push('FEHLER (Export wurde NICHT erzeugt):')
    for (const f of ergebnis.fehler) zeilen.push(`  [${f.code}] ${f.meldung}`)
  }
  if (ergebnis.warnungen.length) {
    zeilen.push('')
    zeilen.push('Warnungen (Export erzeugt, bitte pruefen):')
    for (const w of ergebnis.warnungen) zeilen.push(`  [${w.code}] ${w.meldung}`)
  }
  return zeilen.join('\n')
}
