#!/usr/bin/env tsx
/**
 * lint:pii — blockiert NEUE personenbezogene Dokumente im getrackten Baum.
 *
 * WARUM ES DAS BRAUCHT, OBWOHL ES .gitignore GIBT
 * `.gitignore` wirkt nur auf **ungetrackte** Dateien. Für die sechs
 * Dokumente, die am 12.09.2026 schon im Baum lagen, aendert es nichts — und
 * `git add -f` umgeht es in einer Sekunde. Dieser Lauf prüft, was
 * **tatsächlich getrackt** ist, und geht bei allem Neuen auf rot.
 *
 * DER BESTAND IST EINGEFROREN, NICHT ENTSCHULDIGT
 * Die elf bekannten Dateien stehen unten in `BESTAND` — mit Schwere und
 * Grund. Sie sind damit nicht in Ordnung, sondern aktenkundig: Wer sie
 * entfernt, nimmt den Eintrag mit; wer eine zwoelfte hinzufuegt, bekommt einen
 * roten Lauf. Das Entfernen aus der Git-HISTORIE ist ein eigener,
 * unumkehrbarer Schritt und braucht die Entscheidung des Inhabers —
 * siehe docs/reports/SECURITY_REMEDIATION_12_09_2026.md.
 *
 * KEINE INHALTE: Dieser Lauf liest nur Dateinamen. Er öffnet kein Dokument
 * und gibt nie einen Inhalt aus.
 */

import { execSync } from 'node:child_process'

interface Regel {
  name: string
  muster: RegExp
  schwere: 'KRITISCH' | 'HOCH' | 'MITTEL'
  was: string
  /**
   * Gegenmuster. Eine ERKLÄRUNG über Führungszeugnisse ist kein
   * Führungszeugnis — sie ist der Vordruck, mit dem der Arbeitgeber zusagt,
   * welche einzuholen. Ohne diese Unterscheidung meldet der Lauf vier leere
   * Vordrucke als kritischen Befund und wird dadurch unglaubwürdig.
   */
  ausnahme?: RegExp
}

/** Nur Dokumentendateien. Quelltext darf heißen, wie er will. */
const DOKUMENT = /\.(pdf|jpe?g|png|heic|tiff?|docx?|xlsx?|zip)$/i

const REGELN: readonly Regel[] = [
  { name: 'fuehrungszeugnis', muster: /f(ue|ü)hrungszeugnis/i, schwere: 'KRITISCH',
    was: 'Führungszeugnis — Auskunft aus dem Bundeszentralregister',
    ausnahme: /erkl(ae|ä)rung/i },
  { name: 'ausweis', muster: /(personal)?ausweis|reisepass|passport|f(ue|ü)hrerschein/i, schwere: 'KRITISCH',
    was: 'Ausweis- oder Führerscheindokument' },
  { name: 'bank', muster: /kontoauszug|iban|bankkarte|debitkarte|kreditkarte/i, schwere: 'KRITISCH',
    was: 'Bank- oder Kartendokument' },
  { name: 'berufserlaubnis', muster: /berufserlaubnis|urkunde/i, schwere: 'HOCH',
    was: 'Berufsurkunde mit Name und Geburtsdatum' },
  { name: 'arbeitsvertrag', muster: /(arbeits|aushilfs|dienst)vertrag/i, schwere: 'HOCH',
    was: 'Arbeitsvertrag mit Personendaten' },
  { name: 'lohn', muster: /lohnabrechnung|gehaltsabrechnung|sozialversicherungsnummer/i, schwere: 'HOCH',
    was: 'Entgelt- oder Sozialversicherungsunterlage' },
  { name: 'versicherung', muster: /versicherungsschein|versicherungspolice|haftpflicht/i, schwere: 'MITTEL',
    was: 'Versicherungsvertrag mit Vertrags- und Zahlungsdaten' },
  // Das IK-Schreiben der ARGE trägt die Bankverbindung der Gesellschaft —
  // am Dateinamen ist das nicht zu erkennen, deshalb eigene Regel.
  { name: 'ik_bankverbindung', muster: /arge[-_]?ik|ik[-_]?(nachweis|bestaetigung|best(ae|ä)tigung)/i, schwere: 'MITTEL',
    was: 'Behördenschreiben mit Bankverbindung' },
  { name: 'personenstand', muster: /geburtsurkunde|heiratsurkunde|meldebescheinigung/i, schwere: 'HOCH',
    was: 'Personenstandsurkunde' },
  { name: 'kamerascan', muster: /^(gescanntes[ _-]dokument|scanned[ _-]document|img_\d+)/i, schwere: 'HOCH',
    was: 'Kamerascan — der Name verrät nicht, was drin ist' },
]

/**
 * Der Bestand vom 12.09.2026. Jeder Eintrag ist ein bekannter Befund, kein
 * Freibrief. Wird eine Datei entfernt, ist ihr Eintrag hier ebenfalls zu
 * entfernen — sonst meldet der Lauf sie als verwaist.
 */
const BESTAND: Readonly<Record<string, string>> = {
  'anerkennung-hessen/Erweitertes-Fuehrungszeugnis-Yusuf-Ferhat-Demir-2026.pdf':
    'KRITISCH — Scan, Führungszeugnis des Geschäftsführers. Im Baum seit 10.08.2026.',
  'docs/genehmigung/06_Fuehrungszeugnis.pdf':
    'KRITISCH — Scan, zweite Ablage desselben Führungszeugnisses. Seit 09.09.2026.',
  'anerkennung-hessen/Anlage-02-Berufserlaubnis-Fachkraft-Sabrina-Martin.pdf':
    'HOCH — Scan, Berufsurkunde einer Mitarbeiterin mit Name und Geburtsdatum. Seit 10.08.2026.',
  'docs/genehmigung/17a_Berufserlaubnis_Fachkraft.pdf':
    'HOCH — Scan, zweite Ablage derselben Urkunde. Seit 09.09.2026.',
  'anerkennung-hessen/Anlage-15-Betriebshaftpflicht-Police.pdf':
    'MITTEL — Scan, 13 Seiten Versicherungsschein mit Vertrags- und Zahlungsdaten. Seit 12.09.2026.',
  'docs/genehmigung/07_Haftpflichtversicherung.pdf':
    'MITTEL — Scan, zweite Ablage derselben Police. Seit 09.09.2026.',
  'anerkennung-hessen/Anlage-03-ARGE-IK-Bestaetigung-460629986.pdf':
    'MITTEL — Scan, Behördenschreiben mit Bankverbindung der Gesellschaft. Seit 10.08.2026.',
  'docs/genehmigung/05_IK_Nachweis.pdf':
    'MITTEL — Scan, zweite Ablage desselben Schreibens. Seit 09.09.2026.',
  // Leere Vordrucke: tragen KEINE Personendaten (Namensfelder unausgefüllt,
  // am 12.09.2026 visuell geprüft). Sie stehen hier, weil ihr Dateiname die
  // Regel trifft — nicht, weil sie ein Befund wären.
  'anerkennung-hessen/Anlage-04-Arbeitsvertrag-Fachkraft-Sabrina-Martin.pdf':
    'NIEDRIG — Vordruck, Felder leer (Beginn, Stunden, Vergütung, Adresse). Name nur im Dateinamen.',
  'docs/genehmigung/17b_Arbeitsvertrag_Fachkraft.pdf':
    'NIEDRIG — derselbe Vordruck, Felder leer.',
  'docs/genehmigung/hessen/final/Anlage-04-Arbeitsvertrag-Fachkraft-Sabrina-Martin.pdf':
    'NIEDRIG — derselbe Vordruck, Felder leer.',
}

function getrackteDateien(): string[] {
  return execSync('git ls-files -z', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0').filter(Boolean)
}

function main(): void {
  const dateien = getrackteDateien()
  const neu: { datei: string; regel: Regel }[] = []
  const getroffen = new Set<string>()

  for (const datei of dateien) {
    if (!DOKUMENT.test(datei)) continue
    const basis = datei.split('/').pop() ?? datei
    for (const regel of REGELN) {
      if (!regel.muster.test(basis)) continue
      if (regel.ausnahme?.test(basis)) continue
      getroffen.add(datei)
      if (!(datei in BESTAND)) neu.push({ datei, regel })
      break
    }
  }

  const verwaist = Object.keys(BESTAND).filter(d => !getroffen.has(d))

  console.log('── Personenbezogene Dokumente im getrackten Baum ─────────────')
  console.log(`   geprüfte getrackte Dateien:   ${dateien.length}`)
  console.log(`   bekannter Bestand:            ${Object.keys(BESTAND).length}`)
  console.log(`   davon noch vorhanden:         ${Object.keys(BESTAND).length - verwaist.length}`)
  console.log(`   NEU hinzugekommen:            ${neu.length}`)
  console.log('')

  if (verwaist.length > 0) {
    console.log('ℹ Aus dem Baum entfernt — Eintrag in BESTAND bitte mitnehmen:')
    for (const d of verwaist) console.log(`   ${d}`)
    console.log('')
  }

  if (neu.length === 0) {
    console.log('✓ Kein neues personenbezogenes Dokument.')
    process.exit(0)
  }

  console.log('✗ Neue personenbezogene Dokumente im Baum:')
  for (const { datei, regel } of neu) {
    console.log(`   [${regel.schwere}] ${datei}`)
    console.log(`             ${regel.was} (Regel ${regel.name})`)
  }
  console.log('')
  console.log('   Dieses Repository ist öffentlich. Entweder die Datei aus dem')
  console.log('   Baum nehmen (git rm --cached) oder — wenn sie begründet dort')
  console.log('   gehört — mit Schwere und Grund in BESTAND aufnehmen.')
  process.exit(1)
}

main()
