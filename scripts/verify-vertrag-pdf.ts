#!/usr/bin/env tsx
/**
 * verify-vertrag-pdf.ts
 * ---------------------
 * Beweist am fertigen Dokument, was ein Typecheck nicht beweisen kann.
 *
 * ── WARUM DIESE PRUEFUNG ──────────────────────────────────────────
 * Der Rueckfall auf Helvetica ist in diesem Projekt zweimal passiert
 * (siehe Kopf von lib/pdf/schrift-css.ts) und beide Male still: ein
 * CSS-Name ohne @font-face, eine vergessene fontkit-Registrierung. Beides
 * faellt weder beim Typecheck noch im Test auf, sondern erst auf dem
 * gedruckten Blatt — an Umlauten und tuerkischen Zeichen, die zu
 * Kaestchen werden.
 *
 * Ein Regex ueber die PDF-Bytes genuegt dafuer nicht: pdf-lib legt die
 * Objekte in komprimierten Streams ab, und `subset: true` benennt die
 * Schrift in "ABCDEF+DejaVuSans" um. Diese Pruefung LAEDT das erzeugte
 * PDF deshalb wieder und liest die BaseFont-Eintraege aus den
 * Seitenressourcen — die Frage „welche Schrift steckt wirklich drin"
 * wird am Dokument beantwortet, nicht am Quelltext.
 *
 * Geprueft wird ausserdem:
 *   · das Entwurfs-Gate (ohne Freigabe traegt das Blatt den Vermerk),
 *   · die Fail-closed-Regel bei fehlender Verguetung,
 *   · dass der Kassen-Vertrag § 45a als „im Anerkennungsverfahren"
 *     fuehrt und den Entlastungsbetrag mit 131 € nennt.
 *
 * Es wird NICHTS gespeichert und nichts versendet — die PDFs entstehen
 * nur im Arbeitsspeicher.
 *
 * Aufruf:  npm run verify:vertrag-pdf
 */
import { readFileSync, existsSync } from 'node:fs'
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib'
import { createClient } from '@supabase/supabase-js'
import { baueVertragPdf } from '../lib/vertraege/vertrag-pdf'
import { vertragsBausteine, ENTWURF_VERMERK, vorlageFreigegeben } from '../lib/vertraege/vorlagen'
import { vertragsStundensatz } from '../lib/vertraege/stundensatz'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const BASIS = {
  auftraggeber: 'Frau Gülşah Öztürk-Weiß',
  auftraggeberAnschrift: 'Musterweg 12\n60311 Frankfurt am Main',
  vertragsnummer: 'AE-PRUEF-0001',
  vertragsbeginn: '2026-10-01',
  vertragsende: null,
  kuendigungsfristTage: 14,
  autoVerlaengerung: false,
  stundensatzEuro: 40,
  verguetungsQuelle: 'Prueflauf — keine echte Preisquelle',
}

let fehler = 0
function pruefe(id: string, frage: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  ✓ ${id}  ${frage}`)
  } else {
    fehler++
    console.log(`  ✗ ${id}  ${frage}`)
    if (detail) console.log(`        ${detail}`)
  }
}

/** BaseFont-Namen aller Seiten — die Frage am fertigen Dokument. */
async function schriften(bytes: Uint8Array): Promise<{ seiten: number; fonts: string[] }> {
  const doc = await PDFDocument.load(bytes)
  const fonts = new Set<string>()
  for (const page of doc.getPages()) {
    const fontDict = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict)
    if (!fontDict) continue
    for (const key of fontDict.keys()) {
      const base = fontDict.lookupMaybe(key, PDFDict)?.get(PDFName.of('BaseFont'))
      if (base) fonts.add(String(base).replace(/^\//, ''))
    }
  }
  return { seiten: doc.getPageCount(), fonts: [...fonts] }
}

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(' VERTRAGS-PDF — Beweis am fertigen Dokument')
  console.log(` ${new Date().toISOString()}`)
  console.log('═══════════════════════════════════════════════════════════════════\n')

  console.log('SCHRIFT (der Helvetica-Rueckfall)')
  const entwurf = await baueVertragPdf({ ...BASIS, typ: 'dienstleistungsvertrag', freigegeben: false })
  const { seiten, fonts } = await schriften(entwurf)
  pruefe('V1', `Dokument hat Seiten (${seiten})`, seiten >= 1)
  pruefe('V2', `DejaVu ist eingebettet — ${fonts.join(', ') || 'keine'}`,
    fonts.length > 0 && fonts.every(f => /DejaVu/i.test(f)),
    `gefunden: ${fonts.join(', ')}`)
  pruefe('V3', 'keine Helvetica/Arial im Dokument',
    !fonts.some(f => /Helvetica|Arial|Times/i.test(f)), `gefunden: ${fonts.join(', ')}`)

  console.log('\nFREIGABE-GATE')
  pruefe('V4', 'ohne VERTRAGSVORLAGE_FREIGEGEBEN=1 gilt die Vorlage als Entwurf',
    vorlageFreigegeben({}) === false)
  pruefe('V5', 'ein beliebiger anderer Wert gilt NICHT als Freigabe',
    vorlageFreigegeben({ VERTRAGSVORLAGE_FREIGEGEBEN: 'true' }) === false)
  pruefe('V6', 'nur die ausdrueckliche 1 gibt frei',
    vorlageFreigegeben({ VERTRAGSVORLAGE_FREIGEGEBEN: '1' }) === true)
  const frei = await baueVertragPdf({ ...BASIS, typ: 'dienstleistungsvertrag', freigegeben: true })
  pruefe('V7', 'das Entwurfs-Blatt ist groesser als das freigegebene (Vermerk steht drauf)',
    entwurf.length > frei.length,
    `Entwurf ${entwurf.length} B, freigegeben ${frei.length} B`)
  pruefe('V8', 'der Entwurfs-Vermerk benennt den Grund',
    /nicht zur Verwendung/i.test(ENTWURF_VERMERK) && /geprüft|geprueft/i.test(ENTWURF_VERMERK))

  console.log('\nFAIL-CLOSED: kein Dokument ohne Verguetung')
  for (const [id, name, patch] of [
    ['V9',  'Stundensatz 0',        { stundensatzEuro: 0 }],
    ['V10', 'negativer Stundensatz', { stundensatzEuro: -5 }],
    ['V11', 'Stundensatz NaN',      { stundensatzEuro: Number.NaN }],
    ['V12', 'kein Auftraggeber',    { auftraggeber: '   ' }],
  ] as const) {
    let warf = false
    try {
      await baueVertragPdf({ ...BASIS, ...patch, typ: 'dienstleistungsvertrag', freigegeben: true })
    } catch { warf = true }
    pruefe(id, `${name} erzeugt KEIN Dokument`, warf)
  }

  console.log('\nFACHLICHE AUSSAGEN')
  const kasse = vertragsBausteine('betreuungsvertrag', { ...BASIS })
  const kasseText = kasse.flatMap(b => b.absaetze).join(' ')
  pruefe('V13', '§ 45a wird als „im Anerkennungsverfahren" gefuehrt',
    /im Anerkennungsverfahren/.test(kasseText))
  pruefe('V14', '§ 45a wird NICHT als anerkannt dargestellt',
    !/\bist anerkannt\b|\banerkanntes Angebot\b/i.test(kasseText))
  pruefe('V15', 'der Entlastungsbetrag steht mit 131 €',
    /131\s*€/.test(kasseText), kasseText.match(/\d+\s*€/g)?.join(', ') ?? '')
  pruefe('V16', 'nirgends 125 € als Entlastungsbetrag',
    !/125\s*€/.test(kasseText))

  const privat = vertragsBausteine('dienstleistungsvertrag', { ...BASIS })
  const privatText = privat.flatMap(b => b.absaetze).join(' ')
  pruefe('V17', 'der Privatvertrag verspricht keine Kassenerstattung',
    !/Pflegekasse/.test(privatText.replace(/als Privatleistung[^.]*\./g, '')))
  pruefe('V18', 'der vereinbarte Stundensatz steht im Vertrag',
    /40,00\s*€/.test(privatText))
  pruefe('V19', 'die Unterschriftspflicht des Leistungsnachweises ist benannt',
    /Unterschrift ist Voraussetzung für die Abrechnung/.test(privatText))

  console.log('\nKUNDENKOMMUNIKATION')
  const alleTexte = [...kasse, ...privat].flatMap(b => [b.titel, ...b.absaetze]).join(' ')
  pruefe('V20', 'kein persoenlicher Name im Vertragstext (nur „Alltagsengel")',
    !/Yusuf|Demir|Abdullah/i.test(alleTexte))

  // ── Live gegen service_pricing ──────────────────────────────────
  // Ohne Zugangsdaten uebersprungen statt rot: die Pruefungen oben
  // stehen fuer sich, und ein fehlender Schluessel ist kein Befund.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.log('\nLIVE (service_pricing)\n  … uebersprungen (keine Zugangsdaten)')
  } else {
    console.log('\nLIVE (service_pricing)')
    const sb = createClient(url, key)
    const ORG = '00000000-0000-4000-8000-000460629986'
    for (const [id, typ, topf] of [
      ['V21', 'dienstleistungsvertrag', 'private'],
      ['V22', 'betreuungsvertrag', 'entlastung'],
    ] as const) {
      try {
        const satz = await vertragsStundensatz(sb, { vertragstyp: typ, organizationId: ORG })
        const pdf = await baueVertragPdf({
          ...BASIS, typ, stundensatzEuro: satz.euro,
          verguetungsQuelle: satz.quelle, freigegeben: true,
        })
        const seiten = (await PDFDocument.load(pdf)).getPageCount()
        pruefe(id, `${typ} (${topf}): ${satz.euro.toFixed(2)} €/Std, PDF ${seiten} S.`,
          satz.euro > 0 && seiten >= 1)
      } catch (err) {
        pruefe(id, `${typ}: Stundensatz aus service_pricing lesbar`, false,
          String((err as Error).message).slice(0, 160))
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════')
  if (fehler === 0) {
    console.log(' ✅ Vertrags-PDF: alle Pruefungen bestanden')
  } else {
    console.log(` ❌ Vertrags-PDF: ${fehler} Pruefung(en) fehlgeschlagen`)
  }
  console.log('═══════════════════════════════════════════════════════════════════')
  process.exit(fehler === 0 ? 0 : 1)
}

main().catch(err => { console.error(err); process.exit(1) })
