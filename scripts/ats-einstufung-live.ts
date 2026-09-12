#!/usr/bin/env tsx
/**
 * ATS-Einstufung aus VORHANDENEN Daten — ohne zu raten.
 *
 * Liest `lead_inquiries` und stuft jede Bewerbung ein. Die Regel ist streng:
 * Was nicht in den Daten steht, wird **UNKNOWN**, nicht geschätzt. Eine
 * geratene Qualifikation ist schlimmer als eine fehlende — sie sieht
 * belastbar aus.
 *
 * ── WORAUS SICH DIE EINSTUFUNG SPEIST ─────────────────────────────────
 * Von 36 Bewerbungen trugen am 12.09.2026 nur zwei strukturierte Angaben in
 * `bewerbung_daten`. Für die übrigen 34 gibt es drei Signale:
 *   `service`   trägt die im Formular gewählte Qualifikation in Klartext
 *               („Engel-Bewerbung (Pflegehelfer/in)")
 *   `message`   der Freitext — Länge zeigt, ob überhaupt etwas gesagt wurde
 *   `plz`       Region
 * Mehr ist nicht da. Das Ergebnis ist deshalb eine Vorsortierung für das
 * erste Telefonat, keine Eignungsbeurteilung.
 *
 * SCHREIBT NICHTS. Reiner Lesevorgang, keine Kontaktaufnahme.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Supabase-Zugang fehlt')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

export type Einstufung = 'PRIO1' | 'PRIO2' | 'PRIO3' | 'NEEDS_INFO' | 'BLOCKED'

/** Qualifikationen, die für § 45a fachlich tragen. */
const TRAGENDE_QUALIFIKATION = [
  'Pflegefachkraft', 'Altenpfleger', 'Pflegehelfer', 'Betreuungskraft',
  'Sozialbetreuer', 'Alltagsbegleiter',
]

/**
 * Berufserfahrung im Freitext.
 *
 * Bewusst OHNE das Wort „Erfahrung" als Pflichtteil: Claudia Adjovi schreibt
 * „8 Jahre …" ohne dieses Wort, und ein Muster, das es verlangt, übersieht
 * genau die Bewerbung mit der längsten Erfahrung. Eine Jahreszahl plus
 * Zeiteinheit ist das verlässliche Signal; „seit 2019" fängt die zweite
 * gängige Formulierung.
 */
const ERFAHRUNG = /(\d{1,2})\s*(?:jahre?n?|j\.)\b(?![^.]{0,12}alt\b)|seit\s*(?:dem\s*)?(?:19|20)\d{2}/i
const AUSBILDUNG = /(?:examiniert|staatlich anerkannt|ausbildung als|gelernte?r?)\s/i

interface Zeile {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  plz: string | null
  service: string | null
  message: string | null
  source: string | null
  utm_source: string | null
  status: string | null
  created_at: string | null
  updated_at: string | null
  bewerbung_daten: Record<string, unknown> | null
}

export interface Befund {
  id: string
  name: string
  einstufung: Einstufung
  grund: string
  /** Wie viele der 16 Merkmale sind belegt? */
  belegt: number
  offen: string[]
  tageOffen: number
  region: string
  qualifikation: string
  kontaktwege: string
}

const MERKMALE = [
  'name', 'plz', 'telefon', 'email', 'qualifikation', 'erfahrung',
  'fuehrerschein', 'fahrzeug', 'sprachen', 'verfuegbarkeit', 'arbeitsmodell',
  'stunden', 'startdatum', 'fz', 'quelle', 'letzterKontakt',
] as const

function tage(iso: string | null, jetzt: Date): number {
  if (!iso) return 0
  return Math.floor((jetzt.getTime() - Date.parse(iso)) / 86_400_000)
}

function qualifikationAus(z: Zeile): string {
  const d = z.bewerbung_daten ?? {}
  if (typeof d.qualifikation === 'string' && d.qualifikation) return d.qualifikation
  // Fallback: der Formularwert steckt in `service` in Klartext.
  const m = (z.service ?? '').match(/Engel-Bewerbung\s*\(([^)]+)\)/)
  return m ? m[1] : 'UNKNOWN'
}

export function stufeEin(z: Zeile, jetzt: Date): Befund {
  const d = z.bewerbung_daten ?? {}
  const text = z.message ?? ''
  const qual = qualifikationAus(z)
  const hatTragende = TRAGENDE_QUALIFIKATION.some(q => qual.toLowerCase().includes(q.toLowerCase()))
  const erfahrungTreffer = ERFAHRUNG.exec(text)
  const jahre = erfahrungTreffer?.[1] ? Number(erfahrungTreffer[1]) : null
  const ausbildung = AUSBILDUNG.test(text)

  const belegtMap: Record<string, boolean> = {
    name: !!z.name?.trim(),
    plz: !!z.plz?.trim(),
    telefon: !!z.phone?.trim(),
    email: !!z.email?.trim(),
    qualifikation: qual !== 'UNKNOWN',
    erfahrung: jahre !== null || ausbildung,
    fuehrerschein: typeof d.fuehrerschein === 'string',
    fahrzeug: typeof d.fuehrerschein === 'string' && d.fuehrerschein === 'ja_mit_auto',
    sprachen: Array.isArray(d.sprachen) && d.sprachen.length > 0,
    verfuegbarkeit: Array.isArray(d.verfuegbarkeit) && d.verfuegbarkeit.length > 0,
    arbeitsmodell: typeof d.beschaeftigungsart === 'string',
    stunden: typeof d.stunden === 'string',
    startdatum: false,                       // Feld existiert nicht — siehe Bericht
    fz: false,                               // wird nicht erhoben
    quelle: !!z.utm_source || !!z.source,
    letzterKontakt: z.status !== 'new',
  }
  const belegt = MERKMALE.filter(m => belegtMap[m]).length
  const offen = MERKMALE.filter(m => !belegtMap[m])

  let einstufung: Einstufung
  let grund: string
  if (!z.phone?.trim() && !z.email?.trim()) {
    einstufung = 'BLOCKED'
    grund = 'Kein Kontaktweg hinterlegt — nicht erreichbar'
  } else if (hatTragende && (jahre ?? 0) >= 2) {
    einstufung = 'PRIO1'
    grund = `${qual}, ${jahre} Jahre im Freitext genannt`
  } else if (hatTragende) {
    einstufung = 'PRIO1'
    grund = `${qual} — fachlich tragende Qualifikation, Erfahrung UNKNOWN`
  } else if (qual !== 'UNKNOWN' && qual.toLowerCase().includes('keine erfahrung')) {
    einstufung = 'PRIO2'
    grund = 'Quereinstieg ausdrücklich angegeben'
  } else if (qual !== 'UNKNOWN') {
    einstufung = 'PRIO2'
    grund = `Angabe „${qual}" vorhanden, fachlich nicht eindeutig tragend`
  } else if (text.length >= 120) {
    einstufung = 'PRIO3'
    grund = `Keine Qualifikationsangabe, aber ${text.length} Zeichen Freitext — lesen lohnt`
  } else {
    einstufung = 'NEEDS_INFO'
    grund = 'Weder Qualifikation noch aussagekräftiger Freitext'
  }

  return {
    id: z.id,
    name: (z.name ?? '').trim() || '—',
    einstufung,
    grund,
    belegt,
    offen,
    tageOffen: tage(z.created_at, jetzt),
    region: z.plz?.trim() || 'UNKNOWN',
    qualifikation: qual,
    kontaktwege: [z.phone ? 'Telefon' : null, z.email ? 'E-Mail' : null].filter(Boolean).join(' + ') || 'keiner',
  }
}

async function main(): Promise<void> {
  const jetzt = new Date()
  const { data, error } = await sb
    .from('lead_inquiries')
    // KEIN Filter auf `art`: die Spalte trägt live nur bei 2 von 36
    // Bewerbungen den Wert 'bewerbung', die übrigen 34 stehen als 'anfrage'.
    // Ein Filter darauf verliert genau die zwei Zeilen MIT strukturierten
    // Angaben — also die einzigen, bei denen die Filter etwas finden.
    .select('id,name,email,phone,plz,service,message,source,utm_source,status,created_at,updated_at,bewerbung_daten')
  if (error) {
    // Lesefehler melden, nicht als „keine Bewerbungen" verschlucken.
    console.error('Lesefehler:', error.message)
    process.exit(1)
  }
  const bewerbungen = (data ?? []).filter(
    (z: Zeile) => z.source === 'engel-bewerbung' || (z.service ?? '').startsWith('Engel-Bewerbung'),
  ) as Zeile[]

  const befunde = bewerbungen.map(z => stufeEin(z, jetzt))
  const ordnung: Einstufung[] = ['PRIO1', 'PRIO2', 'PRIO3', 'NEEDS_INFO', 'BLOCKED']
  befunde.sort((a, b) =>
    ordnung.indexOf(a.einstufung) - ordnung.indexOf(b.einstufung) || b.tageOffen - a.tageOffen)

  console.log(`Bewerbungen: ${befunde.length}   Lauf: ${jetzt.toISOString()}`)
  console.log(`Merkmale je Bewerbung: ${MERKMALE.length}\n`)
  for (const st of ordnung) {
    const g = befunde.filter(b => b.einstufung === st)
    if (g.length === 0) continue
    console.log(`── ${st} (${g.length})`)
    for (const b of g) {
      console.log(`   ${String(b.tageOffen).padStart(3)}T  ${b.name.slice(0, 26).padEnd(26)} `
        + `belegt ${b.belegt}/${MERKMALE.length}  PLZ ${b.region.padEnd(6)} ${b.kontaktwege.padEnd(18)} ${b.grund}`)
    }
    console.log('')
  }
  const schnitt = befunde.reduce((s, b) => s + b.belegt, 0) / (befunde.length || 1)
  console.log(`Durchschnittliche Vollständigkeit: ${schnitt.toFixed(1)} von ${MERKMALE.length} Merkmalen`)
  const fehlt = new Map<string, number>()
  for (const b of befunde) for (const o of b.offen) fehlt.set(o, (fehlt.get(o) ?? 0) + 1)
  console.log('\nAm häufigsten offen:')
  for (const [m, n] of [...fehlt].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${m.padEnd(16)} ${n}/${befunde.length}`)
  }
}

main()
