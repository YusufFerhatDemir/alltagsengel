// ═══════════════════════════════════════════════════════════════
// Leistungsnachweis — kassenkonformes Monats-Template
// ═══════════════════════════════════════════════════════════════
// Erzeugt den offiziellen Leistungsnachweis für EINE Verordnung /
// Bewilligung und EINEN Abrechnungsmonat — mit allen Pflichtfeldern,
// die die Pflegekasse zur Anerkennung verlangt:
//
//   • Name + Adresse des Pflegedienstes (Alltagsengel UG)
//   • IK-Nummer 460629986
//   • Klient: Name, Geburtsdatum, Versichertennummer
//   • Pflegegrad + Pflegekasse des Klienten
//   • Genehmigungsnummer (Aktenzeichen) der Kasse
//   • Abrechnungsmonat
//   • Einsatz-Tabelle: Datum | Uhrzeit von–bis | Leistungsart |
//     Handzeichen Pflegekraft | Handzeichen Klient
//   • Summe der Leistungen (Einsätze, Stunden, Betrag)
//   • Unterschrift Klient (bzw. gesetzlicher Betreuer)
//   • Unterschrift Pflegekraft
//   • Stempel des Pflegedienstes
//
// Ausgabe: strukturiertes A4-HTML (DejaVu Sans — türkische/deutsche
// Sonderzeichen bleiben korrekt), druckbar via window.print() bzw.
// als Blob zum Download. Wird von der Admin-Seite
// /admin/leistungsnachweis/[verordnung_id] gerendert.
// ═══════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'

import { getOrgIK } from '@/lib/config/org-config'

// ── Leistungserbringer-Stammdaten (Pflichtfeld Kasse) ───────────
// IK-Nummer wird in loadLeistungsnachweis() via getOrgIK() geladen.
// Name/Adresse kommen aus der organizations-Tabelle (Multi-Tenant).
// LEISTUNGSERBRINGER ist der Fallback fuer die Stamm-Organisation.
export const LEISTUNGSERBRINGER = {
  name: 'Alltagsengel UG (haftungsbeschränkt)',
  kurz: 'Alltagsengel',
  strasse: 'Neue Mainzer Straße 66-68',
  ort: '60311 Frankfurt am Main',
  email: 'info@alltagsengel.care',
} as const

export interface LeistungserbringerInfo {
  name: string
  kurz: string
  strasse: string
  ort: string
  email: string
}

export async function getLeistungserbringer(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<LeistungserbringerInfo> {
  try {
    const { data } = await supabase
      .from('organizations')
      .select('name, address, settings')
      .eq('id', organizationId)
      .single()
    if (data?.name) {
      const addr = (data.address as Record<string, string>) || {}
      const settings = (data.settings as Record<string, string>) || {}
      return {
        name: data.name,
        kurz: settings.kurzname || data.name.replace(/ UG.*$| GmbH.*$| e\.V\..*$/i, '').trim(),
        strasse: addr.strasse || LEISTUNGSERBRINGER.strasse,
        ort: addr.plz && addr.ort ? `${addr.plz} ${addr.ort}` : LEISTUNGSERBRINGER.ort,
        email: settings.email || LEISTUNGSERBRINGER.email,
      }
    }
  } catch { /* DB nicht verfuegbar, Fallback */ }
  return { ...LEISTUNGSERBRINGER }
}

const GOLD = '#C9963C'
const COAL = '#1A1612'

// ── Datenmodell ────────────────────────────────────────────────
export interface LnEinsatz {
  datum: string // ISO
  von: string | null
  bis: string | null
  dauer_minuten: number | null
  leistungsart: string
  betrag_euro: number
  /** Kürzel/Signatur der Pflegekraft — leer ⇒ Feld zum handschriftlichen Abzeichnen */
  handzeichen_pflegekraft: string | null
  /** true ⇒ Klient hat digital unterschrieben (Signatur liegt vor) */
  handzeichen_klient: boolean
}

export interface LeistungsnachweisData {
  monat: string // YYYY-MM
  monat_label: string
  erstellt_am: string
  leistungserbringer_ik: string
  leistungserbringer: LeistungserbringerInfo
  verordnung: {
    id: string
    typ: string
    genehmigungsnummer: string | null
    genehmigt_bis: string | null
    kostentraeger_name: string | null
    kostentraeger_ik: string | null
    leistungsart: string | null
  }
  klient: {
    name: string
    geburtsdatum: string | null
    versichertennummer: string | null
    pflegekasse: string | null
    pflegekasse_ik: string | null
    pflegegrad: string | null
    anschrift: string
  }
  pflegekraefte: string[] // Kürzel/Namen — nur intern, im PDF nur Handzeichen
  einsaetze: LnEinsatz[]
  summe: { anzahl: number; minuten: number; betrag_euro: number }
  warnungen: string[]
}

// ── Format-Helfer ──────────────────────────────────────────────
function dateDe(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}
function timeDe(t: string | null | undefined): string {
  return t ? String(t).slice(0, 5) : '—'
}
function euroDe(v: number): string {
  return v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }).replace(/ /g, ' ')
}
function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ═══════════════════════════════════════════════════════════════
// 1) Daten laden: Verordnung + Klient + Einsätze des Monats
// ═══════════════════════════════════════════════════════════════
export async function loadLeistungsnachweis(params: {
  verordnung_id: string
  monat: string // 'YYYY-MM'
  supabase: SupabaseClient
  organizationId?: string
}): Promise<LeistungsnachweisData> {
  const { verordnung_id, monat, supabase, organizationId } = params
  if (!/^\d{4}-\d{2}$/.test(monat)) throw new Error('Monat muss das Format YYYY-MM haben.')

  // 1) Verordnung inkl. Genehmigung + Kostenträger
  const { data: verordnung, error: vErr } = await supabase
    .from('verordnungen')
    .select(
      'id, client_id, verordnung_type, leistungsart, genehmigung_status, genehmigung_aktenzeichen, genehmigung_bis, kostentraeger_name, kostentraeger_ik_nummer, abtretungserklaerung_vorhanden'
    )
    .eq('id', verordnung_id)
    .single()
  if (vErr || !verordnung) throw new Error(`Verordnung nicht gefunden: ${vErr?.message || verordnung_id}`)

  // 2) Klient mit allen Pflichtfeldern der Kasse
  const { data: klient, error: kErr } = await supabase
    .from('clients')
    .select(
      'id, organization_id, first_name, last_name, date_of_birth, care_level, address, zip_code, city, insurance_name, insurance_number, versichertennummer, pflegekasse_name, pflegekasse_ik'
    )
    .eq('id', verordnung.client_id)
    .single()
  if (kErr || !klient) throw new Error(`Klient nicht gefunden: ${kErr?.message || verordnung.client_id}`)

  // Org-ID aus Klient ableiten, falls nicht explizit uebergeben
  const effectiveOrgId = organizationId || klient.organization_id

  // 3) Einsätze des Monats für diese Verordnung
  const [jahr, monatNum] = monat.split('-').map(Number)
  const periodStart = `${monat}-01`
  const lastDay = new Date(jahr, monatNum, 0).getDate()
  const periodEnd = `${monat}-${String(lastDay).padStart(2, '0')}`

  const { data: records, error: rErr } = await supabase
    .from('service_records')
    .select(
      'id, date, start_time, end_time, duration_minutes, service_type, amount, status, client_signature, caregiver_initials, verordnung_id'
    )
    .eq('verordnung_id', verordnung_id)
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .in('status', ['complete', 'signed', 'invoiced'])
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })
  if (rErr) throw new Error(`Einsätze konnten nicht geladen werden: ${rErr.message}`)

  const rows = records || []

  // 4) Digitale Unterschriften (Native-App-Pfad) dazuladen
  const recordIds = rows.map(r => r.id)
  let sigsByRecord = new Map<string, Set<string>>()
  if (recordIds.length > 0) {
    const { data: sigs } = await supabase
      .from('service_signatures')
      .select('service_record_id, signer_role')
      .in('service_record_id', recordIds)
    sigsByRecord = new Map()
    for (const s of sigs || []) {
      const set = sigsByRecord.get(s.service_record_id) || new Set<string>()
      set.add(s.signer_role)
      sigsByRecord.set(s.service_record_id, set)
    }
  }

  // 5) Zusammenbauen + Pflichtfeld-Warnungen
  const warnungen: string[] = []
  if (verordnung.genehmigung_status !== 'genehmigt') {
    warnungen.push('Genehmigung der Kasse liegt (noch) nicht vor — Nachweis wird ggf. nicht anerkannt.')
  }
  if (!verordnung.genehmigung_aktenzeichen) {
    warnungen.push('Genehmigungsnummer (Aktenzeichen der Kasse) fehlt.')
  }
  const versNr = klient.versichertennummer || klient.insurance_number || null
  if (!versNr) warnungen.push('Versichertennummer des Klienten fehlt.')
  if (!klient.date_of_birth) warnungen.push('Geburtsdatum des Klienten fehlt.')
  if (!klient.care_level) warnungen.push('Pflegegrad des Klienten fehlt.')
  if (rows.length === 0) warnungen.push('Keine erfassten Einsätze in diesem Monat.')
  if (!verordnung.abtretungserklaerung_vorhanden) {
    warnungen.push('Abtretungserklärung liegt nicht vor — Direktabrechnung mit der Kasse nicht möglich.')
  }

  const einsaetze: LnEinsatz[] = rows.map(r => {
    const digital = sigsByRecord.get(r.id) || new Set<string>()
    return {
      datum: r.date,
      von: r.start_time,
      bis: r.end_time,
      dauer_minuten: r.duration_minutes,
      leistungsart: r.service_type || verordnung.leistungsart || 'Alltagsbegleitung',
      betrag_euro: Number(r.amount) || 0,
      handzeichen_pflegekraft: r.caregiver_initials || (digital.has('caregiver') ? 'digital ✓' : null),
      handzeichen_klient: digital.has('client') || Boolean(r.client_signature),
    }
  })

  const summe = einsaetze.reduce(
    (acc, e) => ({
      anzahl: acc.anzahl + 1,
      minuten: acc.minuten + (e.dauer_minuten || 0),
      betrag_euro: acc.betrag_euro + e.betrag_euro,
    }),
    { anzahl: 0, minuten: 0, betrag_euro: 0 }
  )

  const monatLabel = new Date(jahr, monatNum - 1, 1).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', month: 'long',
    year: 'numeric', })

  const le = effectiveOrgId
    ? await getLeistungserbringer(supabase, effectiveOrgId)
    : { ...LEISTUNGSERBRINGER }

  return {
    monat,
    monat_label: monatLabel,
    erstellt_am: new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }),
    leistungserbringer_ik: await getOrgIK(supabase, effectiveOrgId),
    leistungserbringer: le,
    verordnung: {
      id: verordnung.id,
      typ: verordnung.verordnung_type,
      genehmigungsnummer: verordnung.genehmigung_aktenzeichen,
      genehmigt_bis: verordnung.genehmigung_bis,
      kostentraeger_name: verordnung.kostentraeger_name,
      kostentraeger_ik: verordnung.kostentraeger_ik_nummer,
      leistungsart: verordnung.leistungsart,
    },
    klient: {
      name: `${klient.first_name || ''} ${klient.last_name || ''}`.trim() || '—',
      geburtsdatum: klient.date_of_birth,
      versichertennummer: versNr,
      pflegekasse: klient.pflegekasse_name || klient.insurance_name || null,
      pflegekasse_ik: klient.pflegekasse_ik || null,
      pflegegrad: klient.care_level ? String(klient.care_level) : null,
      anschrift: `${klient.address || ''}${klient.zip_code ? ', ' + klient.zip_code : ''} ${klient.city || ''}`.trim() || '—',
    },
    pflegekraefte: [],
    einsaetze,
    summe,
    warnungen,
  }
}

// ═══════════════════════════════════════════════════════════════
// 2) Kassenkonformes A4-HTML (DejaVu Sans!)
// ═══════════════════════════════════════════════════════════════
export function buildLeistungsnachweisHtml(data: LeistungsnachweisData): string {
  const v = data.verordnung
  const k = data.klient

  const zeilen = data.einsaetze
    .map(
      e => `
      <tr>
        <td>${dateDe(e.datum)}</td>
        <td>${timeDe(e.von)} – ${timeDe(e.bis)}</td>
        <td>${esc(e.leistungsart)}</td>
        <td class="num">${e.dauer_minuten ? `${e.dauer_minuten} Min` : '—'}</td>
        <td class="hz">${e.handzeichen_pflegekraft ? esc(e.handzeichen_pflegekraft) : ''}</td>
        <td class="hz">${e.handzeichen_klient ? 'digital ✓' : ''}</td>
      </tr>`
    )
    .join('')

  // Leere Zusatzzeilen zum handschriftlichen Nachtragen (klassisches Kassenformular)
  const leerzeilen = Array.from({ length: Math.max(0, 4 - Math.min(data.einsaetze.length, 4)) })
    .map(() => '<tr class="blank"><td>&nbsp;</td><td></td><td></td><td></td><td class="hz"></td><td class="hz"></td></tr>')
    .join('')

  const stunden = (data.summe.minuten / 60).toLocaleString('de-DE', { maximumFractionDigits: 2 })

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>Leistungsnachweis ${esc(k.name)} — ${esc(data.monat_label)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'DejaVu Sans', 'DejaVu Sans Condensed', 'Helvetica Neue', Arial, sans-serif;
    color: ${COAL}; font-size: 10.5pt; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .kopf { display: flex; justify-content: space-between; align-items: flex-start; }
  .kopf .logo { font-size: 17pt; font-weight: 700; color: ${GOLD}; }
  .kopf .firma { text-align: center; font-size: 9pt; line-height: 1.45; }
  .kopf .firma b { font-size: 10pt; }
  .kopf .adresse { text-align: right; font-size: 8.5pt; color: #555; line-height: 1.5; }
  .goldlinie { border: 0; border-top: 2px solid ${GOLD}; margin: 8px 0 14px; }
  h1 { font-size: 14.5pt; margin: 0 0 2px; }
  .zeitraum { font-size: 10pt; color: #444; margin-bottom: 12px; }
  .stammdaten { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 9.5pt; }
  .stammdaten td { padding: 3px 8px 3px 0; vertical-align: top; }
  .stammdaten td.l { color: #666; white-space: nowrap; width: 34%; }
  .stammdaten td.w { font-weight: 600; }
  .zweispaltig { display: flex; gap: 24px; }
  .zweispaltig > div { flex: 1; }
  table.einsaetze { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 4px; }
  table.einsaetze th {
    background: #F5EEDF; color: ${COAL}; text-align: left; padding: 5px 6px;
    border: 0.5pt solid #C9B98F; font-size: 8.5pt;
  }
  table.einsaetze td { padding: 5px 6px; border: 0.5pt solid #D8CFB8; }
  table.einsaetze td.num { text-align: right; white-space: nowrap; }
  table.einsaetze td.hz { min-width: 60px; height: 18px; }
  table.einsaetze tr.blank td { height: 20px; }
  .summen { margin-top: 10px; width: 100%; border-collapse: collapse; font-size: 10pt; }
  .summen td { padding: 4px 6px; }
  .summen .total { font-weight: 700; border-top: 1.5pt solid ${GOLD}; font-size: 11pt; }
  .summen td.r { text-align: right; }
  .hinweis { font-size: 8pt; color: #666; margin-top: 10px; line-height: 1.5; }
  .unterschriften { display: flex; gap: 18px; margin-top: 34px; page-break-inside: avoid; }
  .unterschriften .feld { flex: 1; }
  .unterschriften .linie { border-top: 0.75pt solid #333; margin-top: 46px; padding-top: 4px; font-size: 8pt; color: #444; }
  .stempel {
    flex: 1; border: 0.75pt dashed #999; border-radius: 4px; height: 78px;
    display: flex; align-items: center; justify-content: center;
    font-size: 8pt; color: #999; text-align: center;
  }
  .warnbox { background: #FBEFE9; border: 0.5pt solid #D04B3B; color: #8A2E1B;
    padding: 8px 10px; font-size: 8.5pt; border-radius: 4px; margin-bottom: 12px; }
  .fuss { margin-top: 22px; padding-top: 6px; border-top: 0.5pt solid #CCC;
    font-size: 7.5pt; color: #777; line-height: 1.5; }
  @media print { .no-print, .warnbox { display: none !important; } }
</style>
</head>
<body>
  <div class="kopf">
    <div class="logo">${esc(data.leistungserbringer.kurz)}</div>
    <div class="firma">
      <b>${esc(data.leistungserbringer.name)}</b><br/>
      Alltagsbegleitung &amp; Entlastung<br/>
      <b>IK-Nummer: ${data.leistungserbringer_ik}</b>
    </div>
    <div class="adresse">
      ${esc(data.leistungserbringer.strasse)}<br/>
      ${esc(data.leistungserbringer.ort)}<br/>
      ${esc(data.leistungserbringer.email)}
    </div>
  </div>
  <hr class="goldlinie" />

  <h1>Leistungsnachweis</h1>
  <div class="zeitraum">Abrechnungsmonat: <b>${esc(data.monat_label)}</b> &nbsp;·&nbsp; erstellt am ${esc(data.erstellt_am)}</div>

  ${data.warnungen.length > 0 ? `<div class="warnbox"><b>Hinweise (werden nicht mitgedruckt):</b><br/>${data.warnungen.map(esc).join('<br/>')}</div>` : ''}

  <div class="zweispaltig">
    <div>
      <table class="stammdaten">
        <tr><td class="l">Versicherte/r:</td><td class="w">${esc(k.name)}</td></tr>
        <tr><td class="l">Geburtsdatum:</td><td>${dateDe(k.geburtsdatum)}</td></tr>
        <tr><td class="l">Anschrift:</td><td>${esc(k.anschrift)}</td></tr>
        <tr><td class="l">Versichertennummer:</td><td class="w">${esc(k.versichertennummer) || '________________'}</td></tr>
        <tr><td class="l">Pflegegrad:</td><td class="w">${k.pflegegrad ? `Pflegegrad ${esc(k.pflegegrad)}` : '____'}</td></tr>
      </table>
    </div>
    <div>
      <table class="stammdaten">
        <tr><td class="l">Pflegekasse:</td><td class="w">${esc(k.pflegekasse || v.kostentraeger_name) || '________________'}</td></tr>
        <tr><td class="l">IK der Kasse:</td><td>${esc(k.pflegekasse_ik || v.kostentraeger_ik) || '—'}</td></tr>
        <tr><td class="l">Genehmigungsnummer:</td><td class="w">${esc(v.genehmigungsnummer) || '________________'}</td></tr>
        <tr><td class="l">Genehmigt bis:</td><td>${dateDe(v.genehmigt_bis)}</td></tr>
        <tr><td class="l">Leistungsgrundlage:</td><td>${esc(v.leistungsart || v.typ)}</td></tr>
      </table>
    </div>
  </div>

  <table class="einsaetze">
    <thead>
      <tr>
        <th style="width:13%">Datum</th>
        <th style="width:16%">Uhrzeit von – bis</th>
        <th>Leistungsart</th>
        <th style="width:9%">Dauer</th>
        <th style="width:14%">Handzeichen<br/>Pflegekraft</th>
        <th style="width:14%">Handzeichen<br/>Klient</th>
      </tr>
    </thead>
    <tbody>
      ${zeilen}
      ${leerzeilen}
    </tbody>
  </table>

  <table class="summen">
    <tr>
      <td>Summe der Leistungen:</td>
      <td class="r">${data.summe.anzahl} Einsätze</td>
      <td class="r">${stunden} Stunden</td>
      <td class="r total">${euroDe(data.summe.betrag_euro)}</td>
    </tr>
  </table>

  <p class="hinweis">
    Die oben aufgeführten Leistungen wurden wie dokumentiert erbracht und durch Handzeichen je Einsatz
    bestätigt. Grundlage der Abrechnung sind die Leistungen der Alltagsbegleitung und Entlastung nach
    dem SGB XI (insb. §45a/§45b Entlastungsbetrag — 131 € monatlich — sowie §39 Verhinderungspflege)
    gemäß der oben genannten Genehmigung der Pflegekasse.
  </p>

  <div class="unterschriften">
    <div class="feld">
      <div class="linie">Datum, Unterschrift Klient/in<br/>(bzw. gesetzliche/r Betreuer/in)</div>
    </div>
    <div class="feld">
      <div class="linie">Datum, Unterschrift Pflegekraft</div>
    </div>
    <div class="stempel">Stempel<br/>Pflegedienst</div>
  </div>

  <div class="fuss">
    ${esc(data.leistungserbringer.name)} · ${esc(data.leistungserbringer.strasse)}, ${esc(data.leistungserbringer.ort)} ·
    IK ${data.leistungserbringer_ik} · ${esc(data.leistungserbringer.email)}<br/>
    Leistungsnachweis ${esc(data.monat)} · Verordnung/Bewilligung ${esc(v.genehmigungsnummer || v.id)}
  </div>
</body>
</html>`
}

// ═══════════════════════════════════════════════════════════════
// 3) Komplettpaket: laden → HTML → Blob (Download/Druck)
// ═══════════════════════════════════════════════════════════════
export async function generateLeistungsnachweis(params: {
  verordnung_id: string
  monat: string // 'YYYY-MM'
  supabase: SupabaseClient
  organizationId?: string
}): Promise<Blob> {
  const data = await loadLeistungsnachweis(params)
  const html = buildLeistungsnachweisHtml(data)
  return new Blob([html], { type: 'text/html;charset=utf-8' })
}
