/**
 * SLGA / SLAA EDIFACT Response Parser
 *
 * Parst Antwort-Nachrichten (SLGA/SLAA) im TP6-Pflege-Format.
 * - SLGA = Gesamtaufstellung-Antwort (Rechnung akzeptiert/abgelehnt)
 * - SLAA = Einzelfall-Antwort (je Versicherter)
 *
 * Segment-Struktur:
 *   UNA + UNB (Absender=Kasse, Empfänger=Leistungserbringer)
 *   UNH SLGA: FKT + REC + SRD + GES + FHL*
 *   UNH SLAA: FKT + REC + INV + NAD + MAN + (ESK + ELS + EHK*)* + IAF + FHL*
 *   UNZ
 *
 * UNA definiert: Komponenten `:` | Element `+` | Dezimal `.` | Escape `?` | Segment `'`
 *
 * Das Ergebnis wird in RuecklaeuferImportParams konvertiert,
 * sodass importiereRuecklaeufer() direkt aufgerufen werden kann.
 */

import type { RuecklaeuferImportParams, RuecklaeuferPosition, RuecklaeuferTyp } from './ruecklaeufer'

// ── Parsed Types ────────────────────────────────────────────────

export interface EdifactServiceAdvice {
  komponenten: string   // default ':'
  element: string       // default '+'
  dezimal: string       // default '.'
  escape: string        // default '?'
  segment: string       // default "'"
}

export interface ParsedSegment {
  tag: string
  elemente: string[][]  // element[i] = [komp0, komp1, ...]
  raw: string
}

export interface ParsedFehler {
  code: string
  text: string
  schwere: 'E' | 'W' | 'I' | 'H'  // Error, Warning, Info, Hinweis
  segment?: string
  position?: number
}

export interface ParsedPosition {
  leistungsart?: string
  einzelpreisCent?: number
  betragAngefordertCent?: number
  betragAnerkanntCent?: number
  kuerzungsgrund?: string
  status: 'angenommen' | 'abgelehnt' | 'gekuerzt'
  fehler?: ParsedFehler[]
}

export interface ParsedNachricht {
  typ: 'SLGA' | 'SLAA'
  referenz: number
  verarbeitungskennzeichen: string  // FKT VKZ: 10=OK, 11=Fehler
  rechnungsnummer?: string
  einzelrechnungsnummer?: string
  kostentraegerIk?: string
  pflegekasseIk?: string
  leistungserbringerIk?: string
  versichertennummer?: string
  belegnummer?: string
  betragAngefordertCent?: number
  betragAnerkanntCent?: number
  fehler: ParsedFehler[]
  positionen: ParsedPosition[]
  segmente: ParsedSegment[]
}

export interface ParsedEdifactAntwort {
  absenderIk: string
  empfaengerIk: string
  datenaustauschreferenz: string
  erstelldatum?: string
  nachrichten: ParsedNachricht[]
  serviceAdvice: EdifactServiceAdvice
  rohtext: string
  warnungen: string[]
}

export interface SlgaParseErgebnis {
  antwort: ParsedEdifactAntwort
  importe: RuecklaeuferImportParams[]
}

// ── UNA Parser ──────────────────────────────────────────────────

function parseUNA(raw: string): EdifactServiceAdvice {
  if (raw.startsWith('UNA')) {
    const chars = raw.slice(3, 9)
    return {
      komponenten: chars[0] || ':',
      element: chars[1] || '+',
      dezimal: chars[2] || '.',
      escape: chars[3] || '?',
      segment: chars[5] || "'",
    }
  }
  return { komponenten: ':', element: '+', dezimal: '.', escape: '?', segment: "'" }
}

// ── Escape-aware split ──────────────────────────────────────────

function splitEscaped(text: string, sep: string, esc: string): string[] {
  const result: string[] = []
  let current = ''
  let i = 0
  while (i < text.length) {
    if (text[i] === esc && i + 1 < text.length) {
      current += text[i + 1]
      i += 2
    } else if (text[i] === sep) {
      result.push(current)
      current = ''
      i++
    } else {
      current += text[i]
      i++
    }
  }
  result.push(current)
  return result
}

// ── Segment tokenizer ───────────────────────────────────────────

function tokenizeSegments(raw: string, sa: EdifactServiceAdvice): ParsedSegment[] {
  // Normalize: remove line breaks within segments
  const cleaned = raw.replace(/\r?\n/g, '')

  // Split by segment terminator (escape-aware)
  const segRaws = splitEscaped(cleaned, sa.segment, sa.escape)

  const segments: ParsedSegment[] = []
  for (const segRaw of segRaws) {
    const trimmed = segRaw.trim()
    if (!trimmed || trimmed.startsWith('UNA')) continue

    const elemente = splitEscaped(trimmed, sa.element, sa.escape)
    const tag = elemente[0]?.trim() || ''
    if (!tag) continue

    const parsed: string[][] = elemente.map(el =>
      splitEscaped(el, sa.komponenten, sa.escape),
    )

    segments.push({ tag, elemente: parsed, raw: trimmed })
  }

  return segments
}

// ── Betrag parser (EDIFACT: "123,45" → Cent) ───────────────────

function parseBetragCent(s: string | undefined): number | undefined {
  if (!s || !s.trim()) return undefined
  // EDIFACT uses comma as decimal separator
  const clean = s.trim().replace(',', '.')
  const val = parseFloat(clean)
  if (isNaN(val)) return undefined
  return Math.round(val * 100)
}

// ── Element accessor helper ─────────────────────────────────────

function el(seg: ParsedSegment, eIdx: number, kIdx: number = 0): string {
  return seg.elemente[eIdx]?.[kIdx]?.trim() ?? ''
}

// ── Parse FHL (Fehlersegment) ───────────────────────────────────

function parseFHL(seg: ParsedSegment): ParsedFehler {
  // FHL+code+text+schwere+segment+position
  const code = el(seg, 1)
  const text = el(seg, 2)
  const schwereRaw = el(seg, 3).toUpperCase()
  const schwere = (['E', 'W', 'I', 'H'].includes(schwereRaw)
    ? schwereRaw : 'E') as ParsedFehler['schwere']
  const segment = el(seg, 4) || undefined
  const posStr = el(seg, 5)
  const position = posStr ? parseInt(posStr, 10) : undefined

  return { code, text, schwere, segment, position: isNaN(position as number) ? undefined : position }
}

// ── Parse GES (Gesamtbeträge) ───────────────────────────────────

function parseGES(seg: ParsedSegment): { bruttoCent?: number; anerkanntCent?: number } {
  // GES+brutto+zuzahlung+beihilfe+rechnungsbetrag
  // In der Antwort: brutto = angefordert, rechnungsbetrag = anerkannt
  const bruttoCent = parseBetragCent(el(seg, 1))
  const anerkanntCent = parseBetragCent(el(seg, 4))
  return { bruttoCent, anerkanntCent }
}

// ── Parse IAF (Abrechnungsfall-Beträge) ─────────────────────────

function parseIAF(seg: ParsedSegment): { bruttoCent?: number; anerkanntCent?: number } {
  // IAF+brutto+zuzahlung+beihilfe+rechnungsbetrag
  const bruttoCent = parseBetragCent(el(seg, 1))
  const anerkanntCent = parseBetragCent(el(seg, 4))
  return { bruttoCent, anerkanntCent }
}

// ── Parse EHK (Ergebnis-Einzelleistung) ─────────────────────────

function parseEHK(seg: ParsedSegment): ParsedPosition {
  // EHK+leistungsart:verguetungsart:qualifikation:leistung+anerkannt_betrag+kuerzungsgrund
  const leistungsart = el(seg, 1, 0)
  const anerkanntCent = parseBetragCent(el(seg, 2))
  const kuerzungsgrund = el(seg, 3) || undefined

  // Wenn Kürzungsgrund vorhanden → gekürzt, sonst angenommen
  let status: ParsedPosition['status'] = 'angenommen'
  if (kuerzungsgrund) {
    status = anerkanntCent === 0 ? 'abgelehnt' : 'gekuerzt'
  }

  return {
    leistungsart,
    betragAnerkanntCent: anerkanntCent,
    kuerzungsgrund,
    status,
  }
}

// ── Parse Einzelnachricht ───────────────────────────────────────

function parseNachricht(
  typ: 'SLGA' | 'SLAA',
  referenz: number,
  segmente: ParsedSegment[],
): ParsedNachricht {
  const nachricht: ParsedNachricht = {
    typ,
    referenz,
    verarbeitungskennzeichen: '',
    fehler: [],
    positionen: [],
    segmente,
  }

  for (const seg of segmente) {
    switch (seg.tag) {
      case 'FKT': {
        nachricht.verarbeitungskennzeichen = el(seg, 1)
        if (typ === 'SLGA') {
          // FKT+VKZ+Sammelrechnung+LE-IK+KT-IK+PK-IK+Absender-IK
          nachricht.leistungserbringerIk = el(seg, 3)
          nachricht.kostentraegerIk = el(seg, 4)
          nachricht.pflegekasseIk = el(seg, 5)
        } else {
          // FKT+VKZ+LE-IK+KT-IK+PK-IK+Rechnungssteller-IK
          nachricht.leistungserbringerIk = el(seg, 2)
          nachricht.kostentraegerIk = el(seg, 3)
          nachricht.pflegekasseIk = el(seg, 4)
        }
        break
      }
      case 'REC': {
        // REC+rechnungsnr:einzelrechnungsnr+datum+art+währung
        nachricht.rechnungsnummer = el(seg, 1, 0)
        nachricht.einzelrechnungsnummer = el(seg, 1, 1)
        break
      }
      case 'INV': {
        nachricht.versichertennummer = el(seg, 1)
        nachricht.belegnummer = el(seg, 2)
        break
      }
      case 'GES': {
        const ges = parseGES(seg)
        nachricht.betragAngefordertCent = ges.bruttoCent
        nachricht.betragAnerkanntCent = ges.anerkanntCent
        break
      }
      case 'IAF': {
        const iaf = parseIAF(seg)
        if (nachricht.betragAngefordertCent == null) {
          nachricht.betragAngefordertCent = iaf.bruttoCent
        }
        if (nachricht.betragAnerkanntCent == null) {
          nachricht.betragAnerkanntCent = iaf.anerkanntCent
        }
        break
      }
      case 'FHL': {
        nachricht.fehler.push(parseFHL(seg))
        break
      }
      case 'EHK': {
        nachricht.positionen.push(parseEHK(seg))
        break
      }
      // ELS segments from the response contain the original request data;
      // we pair them with EHK for the result. If no EHK follows, the
      // position was accepted as-is.
      case 'ELS': {
        // ELS in response context: the original request line
        // We store the angefordert-Betrag from ELS for enrichment
        const betragAngefordert = parseBetragCent(el(seg, 2))
        const leistungsart = el(seg, 1, 0)
        // Push a preliminary position — will be merged with EHK if present
        nachricht.positionen.push({
          leistungsart,
          betragAngefordertCent: betragAngefordert,
          status: 'angenommen', // default — EHK may override
        })
        break
      }
    }
  }

  return nachricht
}

// ── Main Parser ─────────────────────────────────────────────────

export function parseEdifactAntwort(rohtext: string): ParsedEdifactAntwort {
  const warnungen: string[] = []
  const sa = parseUNA(rohtext)
  const alleSegmente = tokenizeSegments(rohtext, sa)

  // UNB extrahieren
  const unbSeg = alleSegmente.find(s => s.tag === 'UNB')
  let absenderIk = ''
  let empfaengerIk = ''
  let datenaustauschreferenz = ''
  let erstelldatum: string | undefined

  if (unbSeg) {
    absenderIk = el(unbSeg, 2)
    empfaengerIk = el(unbSeg, 3)
    erstelldatum = el(unbSeg, 4, 0)  // JJJJMMTT
    datenaustauschreferenz = el(unbSeg, 5)
  } else {
    warnungen.push('UNB-Segment nicht gefunden — Absender/Empfänger unbekannt.')
  }

  // Nachrichten splitten (UNH ... UNT)
  const nachrichten: ParsedNachricht[] = []
  let aktuelleSegmente: ParsedSegment[] = []
  let inNachricht = false
  let aktuellerTyp: 'SLGA' | 'SLAA' = 'SLGA'
  let aktuelleReferenz = 0

  for (const seg of alleSegmente) {
    if (seg.tag === 'UNH') {
      inNachricht = true
      aktuelleSegmente = []
      aktuelleReferenz = parseInt(el(seg, 1), 10) || 0
      const typRaw = el(seg, 2, 0)?.toUpperCase()
      if (typRaw === 'SLAA') {
        aktuellerTyp = 'SLAA'
      } else {
        aktuellerTyp = 'SLGA'
      }
      continue
    }

    if (seg.tag === 'UNT') {
      if (inNachricht) {
        nachrichten.push(parseNachricht(aktuellerTyp, aktuelleReferenz, aktuelleSegmente))
      }
      inNachricht = false
      continue
    }

    if (inNachricht) {
      aktuelleSegmente.push(seg)
    }
  }

  // Falls UNT fehlt aber wir haben Segmente
  if (inNachricht && aktuelleSegmente.length > 0) {
    warnungen.push('UNT-Segment fehlt — Nachricht wurde trotzdem verarbeitet.')
    nachrichten.push(parseNachricht(aktuellerTyp, aktuelleReferenz, aktuelleSegmente))
  }

  if (nachrichten.length === 0) {
    warnungen.push('Keine SLGA/SLAA-Nachrichten in der Datei gefunden.')
  }

  return {
    absenderIk,
    empfaengerIk,
    datenaustauschreferenz,
    erstelldatum,
    nachrichten,
    serviceAdvice: sa,
    rohtext,
    warnungen,
  }
}

// ── Typ-Erkennung ───────────────────────────────────────────────

function erkennteRuecklaeuferTyp(nachricht: ParsedNachricht): RuecklaeuferTyp {
  const vkz = nachricht.verarbeitungskennzeichen

  // VKZ 11 = Fehlermeldung
  if (vkz === '11') return 'fehlermeldung'

  // VKZ 10 = Kostenträgermeldung (kann Annahme oder Ergebnis sein)
  if (nachricht.fehler.length > 0) {
    const hatErrors = nachricht.fehler.some(f => f.schwere === 'E')
    if (hatErrors) return 'fehlermeldung'
  }

  // Wenn Beträge vorhanden → Abrechnungsergebnis
  if (nachricht.betragAnerkanntCent != null) {
    // Zahlungsavis wenn angefordert == anerkannt und keine Fehler
    if (
      nachricht.betragAngefordertCent != null &&
      nachricht.betragAngefordertCent === nachricht.betragAnerkanntCent &&
      nachricht.fehler.length === 0
    ) {
      return 'zahlungsavis'
    }
    return 'abrechnungsergebnis'
  }

  // VKZ 10 ohne Beträge → Quittung / Annahmebestätigung
  if (vkz === '10') return 'annahmebestaetigung'

  return 'sonstige'
}

// ── Fehler-Klassifizierung ──────────────────────────────────────

function klassifiziereFehler(
  fehler: ParsedFehler[],
): { fehlerCode?: string; fehlerText?: string; istTechnisch: boolean } {
  if (fehler.length === 0) return { istTechnisch: false }

  // Erster Error-Level-Fehler hat Vorrang
  const ersterFehler = fehler.find(f => f.schwere === 'E') || fehler[0]

  // Technische Fehler haben typischerweise Codes die mit T beginnen,
  // oder Segment-Referenzen auf UNB/UNH/UNT/UNZ
  const technischeSegmente = ['UNB', 'UNH', 'UNT', 'UNZ', 'UNA']
  const istTechnisch = ersterFehler.code?.startsWith('T') ||
    (ersterFehler.segment != null && technischeSegmente.includes(ersterFehler.segment))

  const fehlerTexte = fehler
    .filter(f => f.schwere === 'E' || f.schwere === 'W')
    .map(f => `[${f.code}] ${f.text}`)
    .slice(0, 5)

  return {
    fehlerCode: ersterFehler.code || undefined,
    fehlerText: fehlerTexte.join('; ') || ersterFehler.text || undefined,
    istTechnisch,
  }
}

// ── Konvertierung zu Import-Params ──────────────────────────────

export function konvertiereZuImportParams(
  antwort: ParsedEdifactAntwort,
  organizationId: string,
  actorId: string,
  quelldateiName?: string,
  quelldateiUrl?: string,
  laufId?: string,
): RuecklaeuferImportParams[] {
  const importe: RuecklaeuferImportParams[] = []

  for (const nachricht of antwort.nachrichten) {
    const ruecklaeuferTyp = erkennteRuecklaeuferTyp(nachricht)
    const fehlerInfo = klassifiziereFehler(nachricht.fehler)

    // Positionen konvertieren
    const positionen: RuecklaeuferPosition[] = nachricht.positionen.map((p, i) => ({
      positionNummer: i + 1,
      leistungsart: p.leistungsart,
      betragAngefordertCent: p.betragAngefordertCent,
      betragAnerkannt_cent: p.betragAnerkanntCent,
      fehlerCode: p.fehler?.[0]?.code,
      fehlerText: p.fehler?.[0]?.text,
      ablehnungsgrund: p.kuerzungsgrund,
      status: p.status,
    }))

    // Hinweise und Ablehnungsgründe
    const hinweise = nachricht.fehler
      .filter(f => f.schwere === 'I' || f.schwere === 'H' || f.schwere === 'W')
      .map(f => `[${f.code}] ${f.text}`)
    const ablehnungsgruende = nachricht.fehler
      .filter(f => f.schwere === 'E')
      .map(f => `[${f.code}] ${f.text}`)

    importe.push({
      organizationId,
      laufId: laufId || undefined,
      kostentraegerIk: nachricht.kostentraegerIk || antwort.absenderIk || undefined,
      ruecklaeuferTyp,
      originalMeldung: antwort.rohtext,
      quelldateiName,
      quelldateiUrl,
      positionen: positionen.length > 0 ? positionen : undefined,
      betragAngefordertCent: nachricht.betragAngefordertCent,
      betragAnerkannt_cent: nachricht.betragAnerkanntCent,
      fehlerCode: fehlerInfo.istTechnisch
        ? `T${fehlerInfo.fehlerCode || '000'}`
        : fehlerInfo.fehlerCode,
      fehlerText: fehlerInfo.fehlerText,
      hinweise: hinweise.length > 0 ? hinweise : undefined,
      ablehnungsgruende: ablehnungsgruende.length > 0 ? ablehnungsgruende : undefined,
      actorId,
    })
  }

  return importe
}

// ── Convenience: Parse + Konvertiere in einem Schritt ───────────

export function parseSlgaDatei(
  rohtext: string,
  organizationId: string,
  actorId: string,
  quelldateiName?: string,
  quelldateiUrl?: string,
  laufId?: string,
): SlgaParseErgebnis {
  const antwort = parseEdifactAntwort(rohtext)
  const importe = konvertiereZuImportParams(
    antwort, organizationId, actorId,
    quelldateiName, quelldateiUrl, laufId,
  )
  return { antwort, importe }
}
