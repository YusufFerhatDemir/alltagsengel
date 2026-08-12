// ═══════════════════════════════════════════════════════════════
// EDIFACT-Validator — Prüfung vor Versand an die Datenannahmestelle
//
// Bildet die Prüfstufen 1–3 des Fehlerverfahrens (TA1 Abschnitt 5) nach:
//   Stufe 1: Datei-/Dateistruktur (UNB..UNZ, Reihenfolge, Zähler)
//   Stufe 2: Syntax (Segmentreihenfolge, Feldtypen/-längen)
//   Stufe 3: Formale Inhalte (Datum, IK-Prüfziffer, Schlüsselwerte,
//            Summenabgleich GES ↔ IAF ↔ ELS)
// ═══════════════════════════════════════════════════════════════

import { ART_DER_LEISTUNG, VERGUETUNGSART, QUALIFIKATION } from './schluesselverzeichnis'

export interface ValidationIssue {
  ebene: 'fehler' | 'warnung'
  segment?: string
  meldung: string
}

export interface ValidationResult {
  ok: boolean
  fehler: ValidationIssue[]
  warnungen: ValidationIssue[]
}

// ── Basis-Prüfungen ─────────────────────────────────────────────

/**
 * IK-Prüfziffer nach § 293 SGB V (ARGE IK): Luhn-Verfahren über die
 * Stellen 3–8 (Regions-/Seriennummer), beginnend mit Faktor 2;
 * Einerstelle der Quersumme = 9. Stelle.
 * Beispiel Alltagsengel: 460629986 → Prüfziffer 6 ✓
 */
export function validateIK(ik: string): boolean {
  if (!/^\d{9}$/.test(ik)) return false
  const ziffern = ik.slice(2, 8).split('').map(Number)
  let summe = 0
  for (let i = 0; i < 6; i++) {
    let produkt = ziffern[i] * (i % 2 === 0 ? 2 : 1)
    if (produkt > 9) produkt -= 9 // Quersumme zweistelliger Produkte
    summe += produkt
  }
  return summe % 10 === Number(ik[8])
}

/**
 * Krankenversichertennummer (KVNR): 1 Großbuchstabe + 9 Ziffern.
 * (Die 10. Stelle ist eine Prüfziffer über Buchstabe→2-stellige Zahl
 * + Ziffern mit Gewichten 1/2 alternierend.)
 */
export function validateVersichertennummer(kvnr: string): boolean {
  if (!/^[A-Z]\d{9}$/.test(kvnr)) return false
  // Prüfziffernberechnung: Buchstabe → Position im Alphabet, 2-stellig
  const buchstabe = kvnr.charCodeAt(0) - 64 // A=1
  const ziffernkette = String(buchstabe).padStart(2, '0') + kvnr.slice(1, 9)
  let summe = 0
  for (let i = 0; i < 10; i++) {
    let produkt = Number(ziffernkette[i]) * (i % 2 === 0 ? 1 : 2)
    if (produkt > 9) produkt -= 9
    summe += produkt
  }
  return summe % 10 === Number(kvnr[9])
}

/** Datum JJJJMMTT plausibel? */
function validesDatum(d: string): boolean {
  if (!/^\d{8}$/.test(d)) return false
  const jahr = Number(d.slice(0, 4)), monat = Number(d.slice(4, 6)), tag = Number(d.slice(6, 8))
  if (jahr < 1900 || jahr > 2100 || monat < 1 || monat > 12 || tag < 1 || tag > 31) return false
  return true
}

/** Betragsfeld "9999999999,99" → Cent (oder null wenn ungültig). */
function parseBetrag(s: string): number | null {
  const m = s.match(/^(-?)(\d{1,10}),(\d{2})$/)
  if (!m) return null
  const cent = Number(m[2]) * 100 + Number(m[3])
  return m[1] === '-' ? -cent : cent
}

// ── EDIFACT-Parser (berücksichtigt Freigabezeichen "?") ─────────

/** Zerlegt den Dateiinhalt in Segmente (Terminator "'", "?" maskiert). */
export function parseSegmente(edifact: string): string[][] {
  const inhalt = edifact.replace(/\r?\n/g, '')
  const segmente: string[][] = []
  let aktuellesSegment: string[] = []
  let feld = ''
  let i = 0
  // UNA-Segment hat feste Länge 9 und keine normale Syntax
  if (inhalt.startsWith('UNA')) i = 9
  while (i < inhalt.length) {
    const zeichen = inhalt[i]
    if (zeichen === '?') {
      feld += inhalt[i + 1] ?? ''
      i += 2
      continue
    }
    if (zeichen === '+') {
      aktuellesSegment.push(feld)
      feld = ''
    } else if (zeichen === "'") {
      aktuellesSegment.push(feld)
      feld = ''
      if (aktuellesSegment.length > 0 && aktuellesSegment[0] !== '') segmente.push(aktuellesSegment)
      aktuellesSegment = []
    } else {
      feld += zeichen
    }
    i++
  }
  return segmente
}

// ── Hauptprüfung ────────────────────────────────────────────────

export function validateEDIFACT(edifact: string): ValidationResult {
  const fehler: ValidationIssue[] = []
  const warnungen: ValidationIssue[] = []
  const f = (meldung: string, segment?: string) => fehler.push({ ebene: 'fehler', meldung, segment })
  const w = (meldung: string, segment?: string) => warnungen.push({ ebene: 'warnung', meldung, segment })

  const segmente = parseSegmente(edifact)
  if (segmente.length === 0) {
    f('Datei ist leer oder nicht parsebar')
    return { ok: false, fehler, warnungen }
  }

  // ═══ Prüfstufe 1: Dateistruktur ═══
  if (segmente[0][0] !== 'UNB') f('Datei muss mit UNB beginnen (nach optionalem UNA)', 'UNB')
  if (segmente[segmente.length - 1][0] !== 'UNZ') f('Datei muss mit UNZ enden', 'UNZ')

  const unb = segmente.find(s => s[0] === 'UNB')
  const unz = segmente.find(s => s[0] === 'UNZ')
  const unhListe = segmente.filter(s => s[0] === 'UNH')
  const untListe = segmente.filter(s => s[0] === 'UNT')

  if (unb) {
    const [, syntax, absender, empfaenger, datumZeit, dar, , anwendungsref, indikator] = unb
    if (syntax !== 'UNOC:3') f(`UNB: Syntax-Kennung "${syntax}" — erwartet "UNOC:3"`, 'UNB')
    if (!validateIK(absender || '')) f(`UNB: Absender-IK "${absender}" ungültig (9 Stellen + Prüfziffer)`, 'UNB')
    if (!validateIK(empfaenger || '')) f(`UNB: Empfänger-IK "${empfaenger}" ungültig`, 'UNB')
    const [datum] = (datumZeit || '').split(':')
    if (!validesDatum(datum)) f(`UNB: Erstelldatum "${datumZeit}" nicht im Format JJJJMMTT:hhmm`, 'UNB')
    if (!dar || !/^\d{1,5}$/.test(dar)) f(`UNB: Datenaustauschreferenz "${dar}" ungültig (max. 5 Ziffern)`, 'UNB')
    if (!anwendungsref || anwendungsref.length !== 11) {
      f(`UNB: Anwendungsreferenz "${anwendungsref}" muss 11 Stellen haben (logischer Dateiname)`, 'UNB')
    }
    if (!['0', '1', '2'].includes(indikator || '')) f(`UNB: Dateiindikator "${indikator}" ungültig (0/1/2)`, 'UNB')
    if (indikator === '0') w('Dateiindikator 0 = TESTDATEI — nicht für Echtabrechnung', 'UNB')
  }

  if (unz) {
    if (Number(unz[1]) !== unhListe.length) {
      f(`UNZ: Anzahl Nachrichten ${unz[1]} ≠ tatsächliche UNH-Anzahl ${unhListe.length}`, 'UNZ')
    }
    if (unb && unz[2] !== unb[5]) f(`UNZ: Datenaustauschreferenz "${unz[2]}" ≠ UNB "${unb[5]}"`, 'UNZ')
  }
  if (unhListe.length !== untListe.length) {
    f(`Anzahl UNH (${unhListe.length}) ≠ Anzahl UNT (${untListe.length})`)
  }
  if (unhListe.length === 0) f('Keine Nachrichten (UNH) in der Datei')

  // ═══ Prüfstufe 2+3: je Nachricht ═══
  // Nachrichten extrahieren (UNH .. UNT)
  interface Nachricht { typ: string; referenz: string; segmente: string[][] }
  const nachrichten: Nachricht[] = []
  let aktuelle: Nachricht | null = null
  for (const seg of segmente) {
    if (seg[0] === 'UNH') {
      const [typ] = (seg[2] || '').split(':')
      aktuelle = { typ, referenz: seg[1], segmente: [seg] }
    } else if (seg[0] === 'UNT') {
      if (aktuelle) {
        aktuelle.segmente.push(seg)
        nachrichten.push(aktuelle)
        // Segmentzähler prüfen (inkl. UNH + UNT)
        if (Number(seg[1]) !== aktuelle.segmente.length) {
          f(`UNT (${aktuelle.typ} #${aktuelle.referenz}): Segmentanzahl ${seg[1]} ≠ tatsächlich ${aktuelle.segmente.length}`, 'UNT')
        }
        if (seg[2] !== aktuelle.referenz) {
          f(`UNT: Referenz "${seg[2]}" ≠ UNH-Referenz "${aktuelle.referenz}"`, 'UNT')
        }
        aktuelle = null
      }
    } else if (aktuelle) {
      aktuelle.segmente.push(seg)
    }
  }

  // Paar-Regel: nach jeder PLGA (außer Sammelrechnung) muss eine PLAA folgen
  for (let i = 0; i < nachrichten.length; i++) {
    const n = nachrichten[i]
    if (!['PLGA', 'PLAA'].includes(n.typ)) {
      f(`Unbekannter Nachrichtentyp "${n.typ}" — zulässig sind PLGA und PLAA`)
      continue
    }
    if (n.typ === 'PLGA') {
      const fkt = n.segmente.find(s => s[0] === 'FKT')
      const istSammelrechnung = fkt?.[2] === 'J'
      if (!istSammelrechnung && nachrichten[i + 1]?.typ !== 'PLAA') {
        f('Nach einer PLGA-Gesamtrechnung muss eine PLAA-Nachricht folgen (TA1 4.2)')
      }
    }
  }

  let summeRechnungsbetraegeGES = 0
  let summeRechnungsbetraegeIAF = 0

  for (const n of nachrichten) {
    const kennung = `${n.typ} #${n.referenz}`
    const hat = (name: string) => n.segmente.some(s => s[0] === name)

    if (n.typ === 'PLGA') {
      // Pflichtsegmente laut TA1 4.4.1
      for (const pflicht of ['FKT', 'REC', 'SRD', 'GES', 'NAM']) {
        if (!hat(pflicht)) f(`${kennung}: Pflichtsegment ${pflicht} fehlt`, pflicht)
      }
      const fkt = n.segmente.find(s => s[0] === 'FKT')
      if (fkt) {
        for (const [idx, feldname] of [[3, 'IK Rechnungssteller'], [4, 'IK Kostenträger'], [6, 'IK Absender']] as const) {
          if (!validateIK(fkt[idx] || '')) f(`${kennung} FKT: ${feldname} "${fkt[idx]}" ungültig`, 'FKT')
        }
        if (fkt[5]) {
          if (!fkt[5].startsWith('18')) w(`${kennung} FKT: Pflegekassen-IK "${fkt[5]}" beginnt nicht mit "18"`, 'FKT')
          if (!validateIK(fkt[5])) f(`${kennung} FKT: Pflegekassen-IK "${fkt[5]}" ungültig (Prüfziffer)`, 'FKT')
        }
      }
      const ges = n.segmente.find(s => s[0] === 'GES')
      if (ges) {
        const brutto = parseBetrag(ges[1] || '')
        const rechnungsbetrag = parseBetrag(ges[4] || '')
        if (brutto === null) f(`${kennung} GES: Summe Bruttobeträge "${ges[1]}" kein gültiger Betrag (Format 999,99)`, 'GES')
        if (rechnungsbetrag === null) f(`${kennung} GES: Gesamtrechnungsbetrag "${ges[4]}" kein gültiger Betrag`, 'GES')
        if (rechnungsbetrag !== null) summeRechnungsbetraegeGES += rechnungsbetrag
      }
      const rec = n.segmente.find(s => s[0] === 'REC')
      if (rec) {
        if (!validesDatum(rec[2] || '')) f(`${kennung} REC: Rechnungsdatum "${rec[2]}" ungültig`, 'REC')
        if (!['1', '2', '3'].includes(rec[3] || '')) f(`${kennung} REC: Rechnungsart "${rec[3]}" ungültig`, 'REC')
        if (rec[4] !== 'EUR') f(`${kennung} REC: Währung "${rec[4]}" — erwartet EUR`, 'REC')
      }
      const srd = n.segmente.find(s => s[0] === 'SRD')
      if (srd) {
        const [code, tarif] = (srd[1] || '').split(':')
        if (!/^\d{2}$/.test(code || '')) f(`${kennung} SRD: Abrechnungscode "${code}" ungültig`, 'SRD')
        if (!/^[A-Z0-9]{5}$/i.test(tarif || '')) f(`${kennung} SRD: Tarifkennzeichen "${tarif}" muss 5 Stellen haben`, 'SRD')
        if (!ART_DER_LEISTUNG[srd[2] || '']) f(`${kennung} SRD: Leistungsart "${srd[2]}" nicht im Schlüsselverzeichnis 2.4`, 'SRD')
      }
    }

    if (n.typ === 'PLAA') {
      for (const pflicht of ['FKT', 'REC', 'INV', 'NAD', 'MAN', 'ESK', 'ELS', 'IAF']) {
        if (!hat(pflicht)) f(`${kennung}: Pflichtsegment ${pflicht} fehlt`, pflicht)
      }

      // Abrechnungsfälle: INV..IAF
      let fallBrutto = 0
      let fallHatLeistung = false
      let invOffen = false
      let letzteBelegnummer = ''
      const belegnummern = new Set<string>()

      for (const seg of n.segmente) {
        switch (seg[0]) {
          case 'INV': {
            if (invOffen) f(`${kennung}: INV ohne abschließendes IAF des vorherigen Falls (${letzteBelegnummer})`, 'INV')
            invOffen = true
            fallBrutto = 0
            fallHatLeistung = false
            letzteBelegnummer = seg[2] || ''
            if (seg[1] && !validateVersichertennummer(seg[1])) {
              w(`${kennung} INV: Versichertennummer "${seg[1]}" entspricht nicht dem KVNR-Format (Buchstabe + 9 Ziffern inkl. Prüfziffer)`, 'INV')
            }
            if (!seg[1]) w(`${kennung} INV (${letzteBelegnummer}): keine Versichertennummer — Ersatzverfahren erfordert vollständige Anschrift im NAD`, 'INV')
            if (!seg[2]) f(`${kennung} INV: Belegnummer fehlt`, 'INV')
            if (seg[2] && belegnummern.has(seg[2])) f(`${kennung} INV: Belegnummer "${seg[2]}" doppelt vergeben`, 'INV')
            if (seg[2]) belegnummern.add(seg[2])
            break
          }
          case 'NAD': {
            if (!seg[1] || !seg[2]) f(`${kennung} NAD (${letzteBelegnummer}): Name/Vorname fehlt`, 'NAD')
            if (!validesDatum(seg[3] || '')) f(`${kennung} NAD (${letzteBelegnummer}): Geburtsdatum "${seg[3]}" ungültig (JJJJMMTT)`, 'NAD')
            break
          }
          case 'MAN': {
            if (!/^\d{6}$/.test(seg[1] || '')) f(`${kennung} MAN (${letzteBelegnummer}): Monat "${seg[1]}" ungültig (JJJJMM)`, 'MAN')
            const pflegegrad = seg[4] || ''
            if (!/^[1-5]$/.test(pflegegrad)) f(`${kennung} MAN (${letzteBelegnummer}): Pflegegrad "${pflegegrad}" ungültig (1–5)`, 'MAN')
            break
          }
          case 'ESK': {
            const tag = seg[1] || ''
            if (!(tag === '99' || (/^\d{2}$/.test(tag) && Number(tag) >= 1 && Number(tag) <= 31))) {
              f(`${kennung} ESK (${letzteBelegnummer}): Kalendertag "${tag}" ungültig (01–31 oder 99)`, 'ESK')
            }
            if (seg[2] && !/^\d{4}$/.test(seg[2])) f(`${kennung} ESK (${letzteBelegnummer}): Uhrzeit "${seg[2]}" ungültig (hhmm)`, 'ESK')
            break
          }
          case 'ELS': {
            fallHatLeistung = true
            const [art, verguetung, quali, leistung] = (seg[1] || '').split(':')
            if (!ART_DER_LEISTUNG[art || '']) f(`${kennung} ELS (${letzteBelegnummer}): Art der Leistung "${art}" nicht im Schlüsselverzeichnis 2.4`, 'ELS')
            if (!VERGUETUNGSART[verguetung || '']) f(`${kennung} ELS (${letzteBelegnummer}): Vergütungsart "${verguetung}" nicht im Schlüsselverzeichnis 2.5`, 'ELS')
            if (!QUALIFIKATION[quali || '']) f(`${kennung} ELS (${letzteBelegnummer}): Qualifikation "${quali}" nicht im Schlüsselverzeichnis 2.6`, 'ELS')
            if (!leistung) f(`${kennung} ELS (${letzteBelegnummer}): Leistungsschlüssel (2.7) fehlt`, 'ELS')
            const preis = parseBetrag(seg[2] || '')
            if (preis === null) f(`${kennung} ELS (${letzteBelegnummer}): Einzelpreis "${seg[2]}" kein gültiger Betrag`, 'ELS')
            const anzahl = parseBetrag(seg[6] || '')
            if (anzahl === null) f(`${kennung} ELS (${letzteBelegnummer}): Anzahl "${seg[6]}" ungültig (Format 9999,99)`, 'ELS')
            if (preis !== null && anzahl !== null) {
              // anzahl ist in "Cent"-Auflösung geparst (×100) → zurückrechnen
              fallBrutto += Math.round((preis * anzahl) / 100)
            }
            // Beschäftigtennummer (Pflicht ambulant seit PLAA 6)
            if (art === '01' || art === '10' || art === '07') {
              if (!seg[7]) {
                w(`${kennung} ELS (${letzteBelegnummer}): Beschäftigtennummer fehlt (Pflicht für ambulante Dienste, ggf. Ersatzwert 99999999x)`, 'ELS')
              } else if (!/^\d{9}$/.test(seg[7])) {
                f(`${kennung} ELS (${letzteBelegnummer}): Beschäftigtennummer "${seg[7]}" muss 9-stellig numerisch sein`, 'ELS')
              }
            }
            break
          }
          case 'IAF': {
            if (!invOffen) f(`${kennung}: IAF ohne vorheriges INV`, 'IAF')
            invOffen = false
            if (!fallHatLeistung) f(`${kennung} Fall ${letzteBelegnummer}: keine einzige Leistung (ELS) im Abrechnungsfall`, 'IAF')
            const brutto = parseBetrag(seg[1] || '')
            const rechnungsbetrag = parseBetrag(seg[4] || '')
            if (brutto === null) f(`${kennung} IAF (${letzteBelegnummer}): Gesamtbruttobetrag "${seg[1]}" ungültig`, 'IAF')
            if (rechnungsbetrag === null) f(`${kennung} IAF (${letzteBelegnummer}): Rechnungsbetrag "${seg[4]}" ungültig`, 'IAF')
            // Summenprüfung: Σ(ELS Einzelpreis × Anzahl) = IAF Brutto
            if (brutto !== null && Math.abs(brutto - fallBrutto) > 1) {
              f(`${kennung} IAF (${letzteBelegnummer}): Bruttobetrag ${(brutto / 100).toFixed(2)} € ≠ Summe der Einzelleistungen ${(fallBrutto / 100).toFixed(2)} €`, 'IAF')
            }
            if (rechnungsbetrag !== null) summeRechnungsbetraegeIAF += rechnungsbetrag
            break
          }
        }
      }
      if (invOffen) f(`${kennung}: letzter Abrechnungsfall (${letzteBelegnummer}) ohne IAF-Endesegment`, 'IAF')
    }
  }

  // ═══ Summenabgleich Datei: Σ GES-Rechnungsbeträge = Σ IAF-Rechnungsbeträge ═══
  if (Math.abs(summeRechnungsbetraegeGES - summeRechnungsbetraegeIAF) > 1) {
    fehler.push({
      ebene: 'fehler',
      segment: 'GES',
      meldung: `Summenabgleich: Σ GES-Gesamtrechnungsbeträge ${(summeRechnungsbetraegeGES / 100).toFixed(2)} € ≠ Σ IAF-Rechnungsbeträge ${(summeRechnungsbetraegeIAF / 100).toFixed(2)} €`,
    })
  }

  return { ok: fehler.length === 0, fehler, warnungen }
}
