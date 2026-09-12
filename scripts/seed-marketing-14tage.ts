#!/usr/bin/env tsx
/**
 * 14 Tage Redaktionsplan als echte Einträge in `marketing_content_status`.
 *
 * ── STATUS-DECKEL ─────────────────────────────────────────────────────
 * Jeder Eintrag entsteht in der feinen Stufe **`freigegeben`** — das ist
 * READY_TO_SEND. Der DB-Status ist damit `geplant`. **Nichts wird
 * veröffentlicht:** die Stufe `veroeffentlicht` verlangt einen Zeitstempel
 * (DB-CHECK `marketing_content_status_beleg_check`) und wird hier nie
 * gesetzt. Das Veröffentlichen bleibt eine Handlung eines Menschen.
 *
 * ── IDEMPOTENT ────────────────────────────────────────────────────────
 * `legeStueckAn` schreibt mit `ignoreDuplicates` auf
 * (organization_id, content_id). Ein zweiter Lauf ändert nichts — und
 * stempelt insbesondere keinen bereits fortgeschrittenen Stand zurück.
 *
 * ── INHALTLICHE SCHRANKEN, die in jedem Text gelten ───────────────────
 *   · § 45a: „im Anerkennungsverfahren", NIE „anerkannt"
 *   · kein „kostenlos" / „0 € Eigenanteil" für Alltagsbegleitung
 *   · Entlastungsbetrag 131 €/Monat — der einzige Betrag, der vorkommt,
 *     weil er im Gesetz steht und nicht unser Preis ist
 *   · KEINE Stundensätze: die Vergütungsaussagen widersprechen sich noch
 *     (siehe lib/pricing/quelle.ts, VERGUETUNG_ABWEICHUNGEN)
 *   · Absender immer „Alltagsengel", nie ein persönlicher Name
 */

import { createClient } from '@supabase/supabase-js'
import { legeStueckAn, ladeStuecke, zaehleStufen } from '@/lib/marketing/engine-db'
import { utmFuer, zielUrlMitUtm, type MarketingStueck } from '@/lib/marketing/engine'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Supabase-Zugang fehlt'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })

const KAMPAGNE = 'KW38-39-2026'

/** Die sechs beauftragten Zielgruppen. */
type Zielgruppe =
  | 'Kunden' | 'Angehörige' | 'Bewerber' | 'PflegeCoach' | 'Investoren' | 'Regionale Partner'

interface Plan {
  tag: number
  datum: string
  plattform: string
  zielgruppe: Zielgruppe
  region: string
  format: string
  hook: string
  caption: string
  cta: string
  asset: string
  zielUrl: string
}

const PLAN: readonly Plan[] = [
  {
    tag: 1, datum: '2026-09-15', plattform: 'Instagram', zielgruppe: 'Angehörige',
    region: 'Frankfurt', format: 'Karussell 4 Bilder',
    hook: 'Fünf Zeichen, dass Ihre Mutter Entlastung braucht',
    caption: 'Sie merken es an kleinen Dingen: Post bleibt liegen, der Kühlschrank ist leerer als früher, Termine werden verschoben. Fünf Zeichen, die Angehörige oft zu lange übersehen — und was ein erster Schritt sein kann.',
    cta: 'Unverbindlich vormerken', asset: 'Karussell, Ortsaufnahmen Frankfurt', zielUrl: 'https://alltagsengel.care/warteliste',
  },
  {
    tag: 2, datum: '2026-09-16', plattform: 'Instagram', zielgruppe: 'Kunden',
    region: 'Offenbach', format: 'Einzelbild',
    hook: '131 € im Monat, die vielen entgehen',
    caption: 'Ab Pflegegrad 1 stehen Ihnen 131 € monatlich als Entlastungsbetrag nach § 45b SGB XI zu. Viele wissen es nicht — und der Betrag verfällt. Wir erklären, wofür er gedacht ist und wie man ihn abruft.',
    cta: 'Mehr erfahren', asset: 'Einzelbild mit Zahl', zielUrl: 'https://alltagsengel.care/entlastungsbetrag',
  },
  {
    tag: 3, datum: '2026-09-17', plattform: 'Instagram', zielgruppe: 'Bewerber',
    region: 'Frankfurt', format: 'Reel 20 s',
    hook: 'Drei Dinge, die ein Alltagsbegleiter NICHT macht',
    caption: 'Keine Medikamente, keine Körperpflege, keine medizinische Pflege. Was wir tun: begleiten, zuhören, im Alltag da sein. Wer das kann, braucht keine Pflegeausbildung.',
    cta: 'Jetzt bewerben', asset: 'Reel, Szene Einkauf', zielUrl: 'https://alltagsengel.care/engel-werden',
  },
  {
    tag: 4, datum: '2026-09-18', plattform: 'Facebook', zielgruppe: 'Angehörige',
    region: 'Hanau', format: 'Textbeitrag mit Bild',
    hook: 'Verhinderungspflege — der Topf, den kaum jemand nutzt',
    caption: 'Wenn die Person, die sonst pflegt, selbst einmal ausfällt: Dafür gibt es die Verhinderungspflege nach § 39 SGB XI. Sie besteht unabhängig vom Entlastungsbetrag und verfällt jährlich.',
    cta: 'Zur Erklärseite', asset: 'Bild Wohnzimmer', zielUrl: 'https://alltagsengel.care/verhinderungspflege',
  },
  {
    tag: 5, datum: '2026-09-19', plattform: 'LinkedIn', zielgruppe: 'Regionale Partner',
    region: 'Rhein-Main', format: 'Beitrag',
    hook: 'Was Pflegedienste an uns abgeben können — und was nicht',
    caption: 'Alltagsbegleitung ist keine Pflege. Genau deshalb ergänzen wir Pflegedienste statt mit ihnen zu konkurrieren: Begleitung zu Terminen, Einkauf, Gesellschaft. Wir sind im Anerkennungsverfahren nach § 45a SGB XI.',
    cta: 'Kooperation anfragen', asset: 'Grafik Abgrenzung', zielUrl: 'https://alltagsengel.care/kontakt',
  },
  {
    tag: 6, datum: '2026-09-20', plattform: 'Instagram', zielgruppe: 'Kunden',
    region: 'Darmstadt', format: 'Reel 15 s',
    hook: 'Arztbegleitung — wie ein Termin abläuft',
    caption: 'Abholen, hinfahren, im Wartezimmer bleiben, mitschreiben, zurückbringen. Für viele ist der zweite Teil der wichtigste: dass jemand mitgehört hat.',
    cta: 'Termin anfragen', asset: 'Reel, Szene Arztpraxis', zielUrl: 'https://alltagsengel.care/termin',
  },
  {
    tag: 7, datum: '2026-09-21', plattform: 'Instagram', zielgruppe: 'Bewerber',
    region: 'Aschaffenburg', format: 'Story-Serie',
    hook: 'Quereinsteiger: was Sie wirklich brauchen',
    caption: 'Geduld, Zuverlässigkeit, ein freundliches Wesen. Kein Examen, keine Vorerfahrung. Die Qualifizierung machen wir gemeinsam.',
    cta: 'Bewerben', asset: 'Story-Serie 4 Folien', zielUrl: 'https://alltagsengel.care/engel-werden',
  },
  {
    tag: 8, datum: '2026-09-22', plattform: 'Instagram', zielgruppe: 'Angehörige',
    region: 'Frankfurt', format: 'Einzelbild',
    hook: 'Weltalzheimertag: Demenz beginnt leise',
    caption: 'Nicht mit dem Vergessen von Namen, sondern mit dem Vermeiden von Situationen. Woran Angehörige es früh merken — und warum Begleitung im vertrauten Zuhause hilft.',
    cta: 'Zum Ratgeber', asset: 'Einzelbild, ruhige Farben', zielUrl: 'https://alltagsengel.care/blog/demenzbetreuung-zu-hause',
  },
  {
    tag: 9, datum: '2026-09-23', plattform: 'Instagram', zielgruppe: 'PflegeCoach',
    region: 'Rhein-Main', format: 'Karussell 3 Bilder',
    hook: 'Pflegegrad beantragen — der Ablauf in drei Schritten',
    caption: 'Antrag bei der Kasse, Termin mit dem Gutachter, Bescheid. Was in welchem Schritt zählt und welche Unterlagen vorher bereitliegen sollten.',
    cta: 'Pflegegrad-Check starten', asset: 'Karussell Ablaufgrafik', zielUrl: 'https://alltagsengel.care/pflegegrad-check',
  },
  {
    tag: 10, datum: '2026-09-24', plattform: 'Facebook', zielgruppe: 'Kunden',
    region: 'Wiesbaden', format: 'Textbeitrag',
    hook: 'Haushaltshilfe: was dazugehört und was nicht',
    caption: 'Reinigung, Wäsche, Einkauf, Kochen — durch geschulte Kräfte. Nicht dazu gehören Handwerk, Garten und medizinische Leistungen. Der Entlastungsbetrag von 131 €/Monat nach § 45b SGB XI kann dafür infrage kommen.',
    cta: 'Vormerken', asset: 'Bild Haushalt', zielUrl: 'https://alltagsengel.care/haushaltshilfe',
  },
  {
    tag: 11, datum: '2026-09-25', plattform: 'LinkedIn', zielgruppe: 'Investoren',
    region: 'Rhein-Main', format: 'Beitrag',
    hook: 'Warum wir Alltagsbegleitung als Software bauen',
    caption: 'Der Engpass in der Entlastung ist nicht die Nachfrage, sondern die Koordination: Einsatzplanung, Nachweise, Abrechnung. Wir bauen beides — den Dienst und das System darunter.',
    cta: 'Unterlagen anfragen', asset: 'Grafik Plattformlogik', zielUrl: 'https://alltagsengel.care/kontakt',
  },
  {
    tag: 12, datum: '2026-09-26', plattform: 'Instagram', zielgruppe: 'Bewerber',
    region: 'Maintal', format: 'Reel 20 s',
    hook: 'Ein Tag mit einer Alltagsbegleiterin',
    caption: 'Vormittags Einkauf in Dörnigheim, mittags ein Arzttermin, nachmittags eine Stunde Gespräch. Drei Einsätze, drei Menschen, kein Tag wie der andere.',
    cta: 'Mitmachen', asset: 'Reel, Tagesverlauf', zielUrl: 'https://alltagsengel.care/engel-werden/maintal',
  },
  {
    tag: 13, datum: '2026-09-27', plattform: 'Instagram', zielgruppe: 'Angehörige',
    region: 'Bad Homburg', format: 'Einzelbild',
    hook: 'Liebe pflegende Angehörige: Ihr seid nicht allein',
    caption: 'Über vier Millionen Menschen in Deutschland pflegen zu Hause. Die meisten tun es neben Beruf und Familie, und die meisten reden nicht darüber. Entlastung ist kein Aufgeben.',
    cta: 'Beratung anfragen', asset: 'Einzelbild, warme Farben', zielUrl: 'https://alltagsengel.care/kontakt',
  },
  {
    tag: 14, datum: '2026-09-28', plattform: 'Instagram', zielgruppe: 'Regionale Partner',
    region: 'Offenbach', format: 'Karussell 3 Bilder',
    hook: 'Unser Einzugsgebiet — wo wir heute begleiten',
    caption: 'Frankfurt, Offenbach, Hanau, Maintal, Bad Homburg, Darmstadt, Wiesbaden und weitere Orte im Rhein-Main-Gebiet. Wer uns in seiner Nachbarschaft vermissen würde, schreibt uns.',
    cta: 'Alle Einsatzorte ansehen', asset: 'Kartengrafik', zielUrl: 'https://alltagsengel.care/einzugsgebiet',
  },
] as const

function contentId(p: Plan): string {
  return `ENG14_${KAMPAGNE}_T${String(p.tag).padStart(2, '0')}_${p.zielgruppe.slice(0, 4).toUpperCase()}`
}

function stueckAus(p: Plan): MarketingStueck {
  return {
    // READY_TO_SEND — höher geht dieses Skript nicht.
    stufe: 'freigegeben',
    projekt: 'Alltagsengel',
    plattform: p.plattform,
    kampagne: KAMPAGNE,
    zielgruppe: p.zielgruppe,
    format: p.format,
    hook: p.hook,
    caption: p.caption,
    cta: p.cta,
    asset: p.asset,
    zielUrl: zielUrlMitUtm(p.zielUrl, { plattform: p.plattform, kampagne: KAMPAGNE }),
    utm: utmFuer({ plattform: p.plattform, kampagne: KAMPAGNE }),
    datum: p.datum,
  }
}

async function main(): Promise<void> {
  let angelegt = 0
  const fehler: string[] = []
  for (const p of PLAN) {
    const id = contentId(p)
    const r = await legeStueckAn(sb, DEFAULT_ORG_ID, id, stueckAus(p), p.plattform.toLowerCase())
    if (r.ok) angelegt++
    else fehler.push(`${id}: ${r.fehler}`)
  }
  console.log(`angelegt/bestätigt: ${angelegt} von ${PLAN.length}`)
  for (const f of fehler) console.log('  FEHLER', f)

  const { stuecke, fehler: leseFehler } = await ladeStuecke(sb, DEFAULT_ORG_ID)
  if (leseFehler) { console.error(leseFehler); process.exit(1) }
  const z = zaehleStufen(stuecke)
  console.log(`\nBestand jetzt: ${stuecke.length} Stücke`)
  for (const [stufe, n] of Object.entries(z)) if (n > 0) console.log(`   ${stufe.padEnd(18)} ${n}`)
  const veroeffentlicht = stuecke.filter(s => s.stueck.stufe === 'veroeffentlicht').length
  console.log(`\nVeröffentlicht: ${veroeffentlicht} — muss 0 sein (dieses Skript publiziert nicht).`)
  if (veroeffentlicht > 0) process.exit(1)
}

main()
