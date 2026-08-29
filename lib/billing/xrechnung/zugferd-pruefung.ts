// ═══════════════════════════════════════════════════════════════════════
// ZUGFeRD/Factur-X — Konformitätsprüfung über die erzeugten PDF-Bytes
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND I-7 der Completion-Matrix (docs/PFLEGE_SOFTWARE_COMPLETION.md):
// „3 Testfälle für einen PDF/A-3-Generator, und keine Konformitätsprüfung
// (weder veraPDF noch ein EN-16931-Validator). Eine Rechnung, die der
// Empfänger nicht einlesen kann, fällt erst beim Empfänger auf."
//
// ── WAS DIESE PRÜFUNG IST — UND WAS SIE NICHT IST ─────────────────────
//
// Sie ist KEIN veraPDF-Ersatz. veraPDF prüft die vollständige ISO-19005-3-
// Konformität samt Farbräumen, Transparenz und Schriftprogrammen; das
// braucht eine Java-Laufzeit und ist hier nicht zu haben.
//
// Sie prüft die STRUKTURELLEN Zusicherungen, die beim Empfänger darüber
// entscheiden, ob seine Software die Rechnung überhaupt findet und liest.
// Jeder Befund nennt seinen Grund, damit ein „bestanden" nicht mehr sagt,
// als gemessen wurde. Was ausdrücklich nicht geprüft wird, steht in
// `NICHT_GEPRUEFT` — eine Prüfliste ohne ihre Grenzen wird für vollständig
// gehalten.
//
// ── WARUM ÜBER DEN OBJEKTGRAPHEN UND NICHT ÜBER DIE BYTES ─────────────
// Der erste Entwurf dieser Prüfung suchte `/AF`, `/EmbeddedFiles` und
// `/AFRelationship` als Zeichenketten in den PDF-Bytes. Gegen die Ausgabe
// dieses Generators meldete sie alle drei als FEHLEND — obwohl der
// Generator sie nachweislich setzt. Der Grund: pdf-lib schreibt beim
// Speichern Objektströme (`useObjectStreams`), und darin liegt die
// Katalogsyntax komprimiert. Eine Textsuche findet sie deshalb nicht.
//
// Das ist die teure Sorte Fehlbefund: sie meldet ROT, wo alles stimmt, und
// wer ihr glaubt, „repariert" einen funktionierenden Generator. Geprüft
// wird deshalb der geladene Objektgraph.
//
// ── QUELLENLAGE ───────────────────────────────────────────────────────
// Dateiname und AFRelationship nach der ZUGFeRD-/Factur-X-Beschreibung von
// PDFlib (pdflib.com/pdf-knowledge-base/zugferd-and-factur-x/, abgerufen
// 29.08.2026): Dateiname `factur-x.xml` ab ZUGFeRD 2.1 und Factur-X (2.0
// hiess `zugferd-invoice.xml`); AFRelationship `Alternative`, mit einer
// einzigen Ausnahme — `Source`, wenn der Empfänger ausserhalb Deutschlands
// sitzt UND das PDF aus den XML-Daten erzeugt wurde. `Data` gilt nur für
// MINIMUM und BASIC WL, also nicht für das Profil, das die XMP-Angabe
// dieses Generators nennt (EN 16931). Ebenfalls von dort: benutzereigene
// XMP-Eigenschaften wie die des `fx:`-Namensraums brauchen eine
// Erweiterungsschema-Beschreibung.

import { PDFDocument, PDFName, PDFDict, PDFArray, PDFStream, PDFRawStream, decodePDFRawStream } from 'pdf-lib'

/** Schwere eines Befundes. */
export type BefundArt = 'fehler' | 'warnung'

export interface Befund {
  /** Stabiler Schlüssel — Tests hängen daran, nicht am Text. */
  code: string
  art: BefundArt
  text: string
}

/** Was diese Prüfung ausdrücklich NICHT beantwortet. */
export const NICHT_GEPRUEFT: readonly string[] = [
  'Farbräume und Transparenzgruppen (ISO 19005-3)',
  'Schriftprogramme im Detail — geprüft wird nur, ob eine verwendete Schrift ohne Einbettung auftaucht',
  'Inhaltliche Gültigkeit des CII-XML gegen das EN-16931-Schema',
  'Digitale Signaturen',
]

/** Dateiname, den ZUGFeRD 2.1 und Factur-X verlangen. */
export const ERWARTETER_XML_NAME = 'factur-x.xml'

/** Zulässige AFRelationship-Werte für die Profile ab BASIC. */
export const ZULAESSIGE_AF_BEZIEHUNGEN = ['Alternative', 'Source'] as const

/** Inhalt eines XMP-Elements, oder null. */
function xmpWert(xmp: string, element: string): string | null {
  const treffer = xmp.match(new RegExp(`<${element}>([^<]*)</${element}>`))
  return treffer ? treffer[1].trim() : null
}

/** Rohbytes eines Stroms, auch wenn er gefiltert ist. */
function stromBytes(strom: PDFStream): Uint8Array | null {
  try {
    if (strom instanceof PDFRawStream) return decodePDFRawStream(strom).decode()
    return strom.getContents()
  } catch {
    return null
  }
}

/**
 * Prüft die erzeugten PDF-Bytes auf die strukturellen Zusicherungen von
 * PDF/A-3 und ZUGFeRD/Factur-X. Leere Liste heisst: alles Geprüfte hält.
 */
export async function pruefeZugferdPdf(bytes: Uint8Array): Promise<Befund[]> {
  const befunde: Befund[] = []
  const fehler = (code: string, t: string) => befunde.push({ code, art: 'fehler', text: t })
  const warnung = (code: string, t: string) => befunde.push({ code, art: 'warnung', text: t })

  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (e) {
    fehler('NICHT_LESBAR', `Die Daten liessen sich nicht als PDF laden: ${(e as Error).message}`)
    return befunde
  }

  const katalog = doc.catalog

  if (doc.isEncrypted) {
    fehler('VERSCHLUESSELT', 'PDF/A verbietet Verschlüsselung; die Datei ist verschlüsselt.')
  }

  // ── XMP-Kennzeichnung ──────────────────────────────────────────────
  const metaEintrag = katalog.lookup(PDFName.of('Metadata'))
  const metaBytes = metaEintrag instanceof PDFStream ? stromBytes(metaEintrag) : null
  const xmp = metaBytes ? new TextDecoder('utf-8').decode(metaBytes) : null

  if (!xmp || !xmp.includes('<x:xmpmeta')) {
    fehler('XMP_FEHLT', 'Es ist kein XMP-Metadatenblock am Katalog vorhanden — ohne ihn ist die Datei kein PDF/A.')
  } else {
    const teil = xmpWert(xmp, 'pdfaid:part')
    if (teil !== '3') {
      fehler('PDFA_TEIL', `XMP nennt pdfaid:part = ${teil ?? '(fehlt)'}; ZUGFeRD verlangt Teil 3.`)
    }
    const stufe = xmpWert(xmp, 'pdfaid:conformance')
    if (!stufe || !['A', 'B', 'U'].includes(stufe)) {
      fehler('PDFA_STUFE', `XMP nennt pdfaid:conformance = ${stufe ?? '(fehlt)'}; erlaubt sind A, B oder U.`)
    }

    const genannt = xmpWert(xmp, 'fx:DocumentFileName')
    if (!genannt) {
      fehler('XMP_DATEINAME_FEHLT', 'XMP nennt keinen fx:DocumentFileName.')
    } else if (genannt !== ERWARTETER_XML_NAME) {
      fehler(
        'XMP_DATEINAME',
        `XMP nennt "${genannt}"; ZUGFeRD 2.1 und Factur-X verlangen "${ERWARTETER_XML_NAME}".`,
      )
    }

    // Benutzereigene XMP-Eigenschaften brauchen eine Beschreibung ihres
    // Schemas. Ohne sie meldet ein PDF/A-Prüfer „Eigenschaft nicht im
    // Erweiterungsschema definiert" — und zwar für JEDE fx:-Angabe.
    if (xmp.includes('xmlns:fx=') && !xmp.includes('pdfaExtension:schemas')) {
      fehler(
        'XMP_ERWEITERUNGSSCHEMA',
        'Die fx:-Eigenschaften stehen ohne pdfaExtension:schemas da; '
        + 'ein PDF/A-Prüfer wertet jede davon als undefiniert.',
      )
    }
  }

  // ── Der eingebettete Rechnungsdatensatz ────────────────────────────
  const namen = katalog.lookup(PDFName.of('Names'))
  const eingebettete = namen instanceof PDFDict
    ? namen.lookup(PDFName.of('EmbeddedFiles'))
    : undefined
  const namensListe = eingebettete instanceof PDFDict
    ? eingebettete.lookup(PDFName.of('Names'))
    : undefined

  if (!(namensListe instanceof PDFArray) || namensListe.size() === 0) {
    fehler(
      'EMBEDDEDFILES_FEHLT',
      'Es gibt keinen /Names-Eintrag /EmbeddedFiles mit Inhalt; Programme ohne Unterstützung '
      + 'für zugeordnete Dateien finden den Datensatz dann gar nicht.',
    )
  }

  const af = katalog.lookup(PDFName.of('AF'))
  if (!(af instanceof PDFArray) || af.size() === 0) {
    fehler('AF_FEHLT', 'Der Katalog trägt kein befülltes /AF-Feld; die Zuordnung XML↔Dokument fehlt damit.')
  } else {
    const spec = af.lookup(0)
    if (!(spec instanceof PDFDict)) {
      fehler('AF_UNBRAUCHBAR', 'Der erste /AF-Eintrag ist kein Dateiverweis-Wörterbuch.')
    } else {
      const beziehung = spec.lookup(PDFName.of('AFRelationship'))
      const wert = beziehung instanceof PDFName ? beziehung.asString().replace(/^\//, '') : null
      if (!wert) {
        fehler('AF_BEZIEHUNG_FEHLT', 'Die eingebettete Datei trägt kein /AFRelationship.')
      } else if (!(ZULAESSIGE_AF_BEZIEHUNGEN as readonly string[]).includes(wert)) {
        fehler(
          'AF_BEZIEHUNG',
          `/AFRelationship ist "${wert}"; ab dem Profil BASIC verlangt ZUGFeRD "Alternative" `
          + '(oder "Source", wenn der Empfänger ausserhalb Deutschlands sitzt und das PDF aus '
          + 'den XML-Daten erzeugt wurde). "Data" gilt nur für MINIMUM und BASIC WL.',
        )
      }

      // Der Datensatz muss auch wirklich drinstehen und CII sein.
      const ef = spec.lookup(PDFName.of('EF'))
      const datei = ef instanceof PDFDict ? ef.lookup(PDFName.of('F')) : undefined
      const inhalt = datei instanceof PDFStream ? stromBytes(datei) : null
      if (!inhalt || inhalt.length === 0) {
        fehler('XML_LEER', 'Die eingebettete Datei hat keinen lesbaren Inhalt.')
      } else {
        const xml = new TextDecoder('utf-8').decode(inhalt)
        if (!xml.includes('CrossIndustryInvoice')) {
          fehler(
            'XML_KEIN_CII',
            'Der eingebettete Datensatz ist keine CrossIndustryInvoice; ZUGFeRD verlangt CII.',
          )
        }
      }
    }
  }

  // ── Ausgabebedingung ───────────────────────────────────────────────
  const ausgabe = katalog.lookup(PDFName.of('OutputIntents'))
  if (!(ausgabe instanceof PDFArray) || ausgabe.size() === 0) {
    fehler(
      'OUTPUTINTENT_FEHLT',
      'Es ist keine Ausgabebedingung (/OutputIntents mit eingebettetem ICC-Profil) gesetzt. '
      + '„Output intent missing" ist einer der häufigsten Gründe, aus denen ein PDF/A-Prüfer ablehnt.',
    )
  } else {
    const erste = ausgabe.lookup(0)
    const profil = erste instanceof PDFDict ? erste.lookup(PDFName.of('DestOutputProfile')) : undefined
    if (!(profil instanceof PDFStream)) {
      fehler(
        'ICC_FEHLT',
        'Die Ausgabebedingung verweist auf kein eingebettetes ICC-Profil (/DestOutputProfile).',
      )
    }
  }

  // ── Strukturbaum ───────────────────────────────────────────────────
  // PDF/A-3b verlangt KEINE Auszeichnung. Ein /MarkInfo /Marked true ohne
  // /StructTreeRoot behauptet trotzdem eine, die es nicht gibt.
  const markInfo = katalog.lookup(PDFName.of('MarkInfo'))
  const markiert = markInfo instanceof PDFDict
    && String(markInfo.lookup(PDFName.of('Marked'))) === 'true'
  if (markiert && !(katalog.lookup(PDFName.of('StructTreeRoot')) instanceof PDFDict)) {
    warnung(
      'MARKED_OHNE_STRUKTUR',
      'Das Dokument meldet /MarkInfo /Marked true, führt aber keinen /StructTreeRoot. '
      + 'Stufe B verlangt keine Auszeichnung — die Angabe behauptet eine, die nicht vorhanden ist.',
    )
  }

  // ── Schriften ──────────────────────────────────────────────────────
  // Eine Schrift ohne FontFile/FontFile2/FontFile3 ist nicht eingebettet.
  // Die Standard-14 (Helvetica & Co.) treten genau so auf.
  const ohneEinbettung: string[] = []
  for (const seite of doc.getPages()) {
    const res = seite.node.Resources()
    const schriften = res?.lookup(PDFName.of('Font'))
    if (!(schriften instanceof PDFDict)) continue
    for (const schluessel of schriften.keys()) {
      const schrift = schriften.lookup(schluessel)
      if (!(schrift instanceof PDFDict)) continue
      if (schriftEingebettet(schrift)) continue
      const basis = schrift.lookup(PDFName.of('BaseFont'))
      ohneEinbettung.push(basis ? String(basis).replace(/^\//, '') : String(schluessel))
    }
  }
  if (ohneEinbettung.length > 0) {
    fehler(
      'SCHRIFT_NICHT_EINGEBETTET',
      `Nicht eingebettete Schrift(en): ${[...new Set(ohneEinbettung)].join(', ')}. `
      + 'PDF/A verlangt, dass jede verwendete Schrift eingebettet ist.',
    )
  }

  return befunde
}

/** Trägt das Schrift-Wörterbuch (oder ein Nachfahre davon) ein Schriftprogramm? */
function schriftEingebettet(schrift: PDFDict): boolean {
  const deskriptor = schrift.lookup(PDFName.of('FontDescriptor'))
  if (deskriptor instanceof PDFDict && hatFontFile(deskriptor)) return true

  // Type0 reicht die Einbettung an den Nachfahren durch.
  const nachfahren = schrift.lookup(PDFName.of('DescendantFonts'))
  if (nachfahren instanceof PDFArray) {
    for (let i = 0; i < nachfahren.size(); i++) {
      const kind = nachfahren.lookup(i)
      if (!(kind instanceof PDFDict)) continue
      const kd = kind.lookup(PDFName.of('FontDescriptor'))
      if (kd instanceof PDFDict && hatFontFile(kd)) return true
    }
  }
  return false
}

function hatFontFile(deskriptor: PDFDict): boolean {
  return ['FontFile', 'FontFile2', 'FontFile3']
    .some(n => deskriptor.lookup(PDFName.of(n)) !== undefined)
}

/** Kurzform: hält alles Geprüfte? */
export async function istZugferdKonform(bytes: Uint8Array): Promise<boolean> {
  return (await pruefeZugferdPdf(bytes)).every(b => b.art !== 'fehler')
}
