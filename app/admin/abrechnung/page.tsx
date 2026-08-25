'use client'
// ═══════════════════════════════════════════════════════════════
// Abrechnung (EDIFACT) — eigenes Abrechnungssystem nach § 105 SGB XI
// Ersetzt Dakota: erzeugt PLGA/PLAA-Nutzdatendateien + Auftragsdatei
// je Kostenträger/Datenannahmestelle direkt aus Verordnungen und
// Leistungsnachweisen.
//
// Ablauf: Monat wählen → Prüflauf → Vorschau → Export (Download der
// Nutzdatendatei + .AUF-Begleitdatei) → Status-Tracking je Kasse.
//
// Hinweis: Vor dem echten Versand muss die Nutzdatendatei nach der
// SECON-Spezifikation (PKCS#7, ITSG-Trust-Center-Zertifikat) ver-
// schlüsselt werden — s. lib/abrechnung/edifact-generator.ts (Phase 2).
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getOrgIK } from '@/lib/config/org-config'
import { euro } from '@/lib/admin/ops'
import { euroZuCent, centRunden, rundeAufStellen } from '@/lib/geld'
import { StatusBadge, EmptyRow, Banner } from '@/components/admin/OpsUI'
import {
  generateEDIFACT, ALLTAGSENGEL_NAME,
  type AbrechnungsFall, type AbrechnungsLeistung, type EdifactDatei,
} from '@/lib/abrechnung/edifact-generator'
import { validateEDIFACT, validateIK, type ValidationIssue } from '@/lib/abrechnung/edifact-validator'
import { generateAuftragsdatei, auftragsdateiName } from '@/lib/abrechnung/auftragsdatei'
import { LEISTUNGSART_SCHLUESSEL, findeDatenannahmestelle } from '@/lib/abrechnung/schluesselverzeichnis'
import { speichereLauf, setzeLaufStatusAction } from './actions'

// ── Typen ───────────────────────────────────────────────────────
interface ClientRow {
  id: string
  first_name: string | null
  last_name: string | null
  versichertennummer: string | null
  geburtsdatum: string | null
  date_of_birth: string | null
  pflegegrad: number | null
  care_level: number | null
  pflegekasse_name: string | null
  pflegekasse_ik: string | null
  address: string | null
  zip_code: string | null
  city: string | null
}

interface VerordnungRow {
  id: string
  client_id: string
  genehmigung_status: string
  genehmigung_aktenzeichen: string | null
  kostentraeger_name: string | null
  kostentraeger_ik_nummer: string | null
  gueltig_von: string | null
  gueltig_bis: string | null
}

interface RecordRow {
  id: string
  client_id: string
  verordnung_id: string | null
  date: string
  start_time: string | null
  duration_minutes: number | null
  service_type: string | null
  amount: number | null
  status: string
  caregiver_initials: string | null
}

interface LaufRow {
  id: string
  abrechnungsmonat: string
  kostentraeger_ik: string
  kostentraeger_name: string | null
  status: string
  anzahl_faelle: number | null
  gesamtbetrag_cent: number | null
  rechnungsnummer: string | null
  datenannahmestelle_name: string | null
  logischer_dateiname: string | null
  erstellt_am: string
  uebermittelt_am: string | null
}

interface KassenGruppe {
  kostentraeger_ik: string
  kostentraeger_name: string
  faelle: AbrechnungsFall[]
  datenprobleme: string[]
}

interface PruefErgebnis {
  datei: EdifactDatei | null
  fehler: ValidationIssue[]
  warnungen: ValidationIssue[]
  datenprobleme: string[]
}

const LAUF_STATUS: Record<string, { label: string; color: string }> = {
  erstellt: { label: 'Erstellt', color: '#999' },
  geprueft: { label: 'Geprüft', color: '#2196F3' },
  exportiert: { label: 'Exportiert', color: '#5C6BC0' },
  uebermittelt: { label: 'Übermittelt', color: '#E8A000' },
  akzeptiert: { label: 'Akzeptiert', color: '#5CB882' },
  teilweise_abgelehnt: { label: 'Teilw. abgelehnt', color: '#FF7043' },
  abgelehnt: { label: 'Abgelehnt', color: '#D04B3B' },
  bezahlt: { label: 'Bezahlt', color: '#C9963C' },
}

// abrechenbare Leistungsnachweis-Status
const ABRECHENBARE_STATUS = ['complete', 'signed', 'invoiced']

// ── Styles (Dark Gold Theme, wie übrige Betriebssystem-Seiten) ──
const cardStyle: CSSProperties = {
  background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12,
}

const primaryBtn: CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const miniBtn: CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--ink)',
  background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit',
}

const miniGoldBtn: CSSProperties = {
  ...miniBtn, color: 'var(--coal)', border: 'none',
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))',
}

// ── Hilfen ──────────────────────────────────────────────────────
function monatsOptionen(): { value: string; label: string }[] {
  const namen = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
  const heute = new Date()
  const optionen: { value: string; label: string }[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(heute.getFullYear(), heute.getMonth() - i, 1)
    const value = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
    optionen.push({ value, label: `${namen[d.getMonth()]} ${d.getFullYear()}` })
  }
  return optionen
}

function download(dateiname: string, inhalt: string) {
  const blob = new Blob([inhalt], { type: 'text/plain;charset=iso-8859-1' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = dateiname
  a.click()
  URL.revokeObjectURL(url)
}

// ── Seite ───────────────────────────────────────────────────────
export default function AbrechnungPage() {
  const optionen = useMemo(monatsOptionen, [])
  const [monat, setMonat] = useState(optionen[1]?.value || optionen[0].value) // Default: Vormonat
  const [laden, setLaden] = useState(true)
  const [gruppen, setGruppen] = useState<KassenGruppe[]>([])
  const [laeufe, setLaeufe] = useState<LaufRow[]>([])
  const [pruefung, setPruefung] = useState<Record<string, PruefErgebnis>>({})
  const [vorschauIK, setVorschauIK] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [orgIk, setOrgIk] = useState('')

  // ── Absender-IK laden (organizations-Tabelle bzw. ALLTAGSENGEL_IK-Env) ──
  useEffect(() => {
    getOrgIK(createClient())
      .then(setOrgIk)
      .catch(e => setMeldung(`Absender-IK konnte nicht geladen werden: ${e instanceof Error ? e.message : String(e)}`))
  }, [])

  // ── Daten laden und zu Abrechnungsfällen aufbereiten ──────────
  const ladeDaten = useCallback(async () => {
    setLaden(true)
    setPruefung({})
    setVorschauIK(null)
    const supabase = createClient()
    const jahr = monat.slice(0, 4), mm = monat.slice(4, 6)
    const von = `${jahr}-${mm}-01`
    const bisDatum = new Date(Number(jahr), Number(mm), 0).getDate()
    const bis = `${jahr}-${mm}-${String(bisDatum).padStart(2, '0')}`

    const [recRes, verRes, cliRes, laufRes] = await Promise.all([
      supabase.from('service_records')
        .select('id, client_id, verordnung_id, date, start_time, duration_minutes, service_type, amount, status, caregiver_initials')
        .gte('date', von).lte('date', bis),
      supabase.from('verordnungen')
        .select('id, client_id, genehmigung_status, genehmigung_aktenzeichen, kostentraeger_name, kostentraeger_ik_nummer, gueltig_von, gueltig_bis')
        .is('deleted_at', null),
      supabase.from('clients')
        .select('id, first_name, last_name, versichertennummer, geburtsdatum, date_of_birth, pflegegrad, care_level, pflegekasse_name, pflegekasse_ik, address, zip_code, city'),
      supabase.from('abrechnungslaeufe').select('*').eq('abrechnungsmonat', monat).order('erstellt_am', { ascending: false }),
    ])

    const records = (recRes.data || []) as RecordRow[]
    const verordnungen = (verRes.data || []) as VerordnungRow[]
    const clients = (cliRes.data || []) as ClientRow[]
    setLaeufe((laufRes.data || []) as LaufRow[])

    const clientMap = new Map(clients.map(c => [c.id, c]))
    const verordnungMap = new Map(verordnungen.map(v => [v.id, v]))

    // Abrechnungsfall = 1 Versicherter je Kalendermonat (TA1 4.4.2).
    // Gruppierung: Kostenträger-IK → Client → Leistungen.
    const kassen = new Map<string, KassenGruppe>()

    // Records je Client sammeln (nur abrechenbare Status)
    const recordsProClient = new Map<string, RecordRow[]>()
    for (const r of records) {
      if (!ABRECHENBARE_STATUS.includes(r.status)) continue
      if (!recordsProClient.has(r.client_id)) recordsProClient.set(r.client_id, [])
      recordsProClient.get(r.client_id)!.push(r)
    }

    for (const [clientId, clientRecords] of recordsProClient) {
      const client = clientMap.get(clientId)
      const probleme: string[] = []
      if (!client) continue

      // Zuständige Verordnung: bevorzugt die der Records, sonst genehmigte des Clients
      const verordnung =
        clientRecords.map(r => r.verordnung_id && verordnungMap.get(r.verordnung_id)).find(Boolean) as VerordnungRow | undefined
        || verordnungen.find(v => v.client_id === clientId && v.genehmigung_status === 'genehmigt')

      const kostentraegerIK = verordnung?.kostentraeger_ik_nummer || client.pflegekasse_ik || ''
      const kostentraegerName = verordnung?.kostentraeger_name || client.pflegekasse_name || 'Unbekannte Kasse'
      const name = `${client.last_name || '?'}, ${client.first_name || '?'}`

      if (!kostentraegerIK) probleme.push(`${name}: kein Kostenträger-IK (weder Verordnung noch Klient) — Fall wird übersprungen`)
      if (!client.versichertennummer) probleme.push(`${name}: Versichertennummer fehlt (Ersatzverfahren erfordert vollständige Anschrift)`)
      const pflegegrad = client.pflegegrad ?? client.care_level ?? 0
      if (!pflegegrad || pflegegrad < 1 || pflegegrad > 5) probleme.push(`${name}: Pflegegrad fehlt oder ungültig (${pflegegrad})`)
      const geburtsdatum = client.geburtsdatum || client.date_of_birth
      if (!geburtsdatum) probleme.push(`${name}: Geburtsdatum fehlt`)
      if (!verordnung) probleme.push(`${name}: keine genehmigte Verordnung/Bewilligung gefunden`)
      else if (verordnung.genehmigung_status !== 'genehmigt') probleme.push(`${name}: Verordnung nicht genehmigt (Status: ${verordnung.genehmigung_status})`)

      const leistungen: AbrechnungsLeistung[] = []
      for (const r of clientRecords) {
        const artKey = r.service_type && LEISTUNGSART_SCHLUESSEL[r.service_type] ? r.service_type : 'sonstige'
        if (artKey === 'sonstige' && r.service_type) {
          probleme.push(`${name}, ${r.date}: Leistungsart "${r.service_type}" hat keinen EDIFACT-Schlüssel — als "sonstige" (99) übermittelt`)
        }
        if (!r.amount || r.amount <= 0) {
          probleme.push(`${name}, ${r.date}: kein Betrag am Leistungsnachweis — Leistung übersprungen`)
          continue
        }
        const schluessel = LEISTUNGSART_SCHLUESSEL[artKey]
        const stunden = (r.duration_minutes || 60) / 60
        // Zeitvergütung: Menge = Stunden, Einzelpreis = Stundensatz.
        // Sonst: Menge 1, Einzelpreis = Gesamtbetrag des Einsatzes.
        const menge = schluessel.zeitbasiert ? rundeAufStellen(stunden, 2) : 1
        // euroZuCent statt Math.round(r.amount * 100): service_records.amount
        // ist eine EURO-Spalte, und der Halb-Cent (1,005 €) fiel dort um
        // einen Cent nach unten, bevor der Betrag in die Kassendatei ging.
        const gesamtCent = euroZuCent(r.amount)
        const einzelpreisCent = menge > 0 ? centRunden(gesamtCent / menge) : gesamtCent
        leistungen.push({
          datum: r.date,
          leistungsart: artKey,
          menge,
          einzelpreis_cent: einzelpreisCent,
          uhrzeit: r.start_time || undefined,
          dauer_minuten: r.duration_minutes || undefined,
          pflegekraft_name: r.caregiver_initials || '—',
        })
      }

      if (!kostentraegerIK || leistungen.length === 0) {
        // ohne IK/Leistungen kein Fall — Probleme trotzdem anzeigen
        if (probleme.length > 0) {
          const key = kostentraegerIK || 'ohne-ik'
          if (!kassen.has(key)) {
            kassen.set(key, { kostentraeger_ik: kostentraegerIK, kostentraeger_name: kostentraegerName, faelle: [], datenprobleme: [] })
          }
          kassen.get(key)!.datenprobleme.push(...probleme)
        }
        continue
      }

      const [nachname, vorname] = [client.last_name || 'Unbekannt', client.first_name || 'Unbekannt']
      const fall: AbrechnungsFall = {
        verordnung_id: verordnung?.id || '',
        client: {
          versichertennummer: client.versichertennummer || '',
          geburtsdatum: geburtsdatum || '1900-01-01',
          nachname, vorname,
          pflegegrad: pflegegrad || 1,
          strasse: client.address || undefined,
          plz: client.zip_code || undefined,
          ort: client.city || undefined,
        },
        kostentraeger: {
          ik_nummer: kostentraegerIK,
          pflegekasse_ik: kostentraegerIK.startsWith('18') ? kostentraegerIK : undefined,
          name: kostentraegerName,
        },
        leistungen,
        genehmigung_aktenzeichen: verordnung?.genehmigung_aktenzeichen || undefined,
        abrechnungsmonat: monat,
      }

      if (!kassen.has(kostentraegerIK)) {
        kassen.set(kostentraegerIK, { kostentraeger_ik: kostentraegerIK, kostentraeger_name: kostentraegerName, faelle: [], datenprobleme: [] })
      }
      const gruppe = kassen.get(kostentraegerIK)!
      gruppe.faelle.push(fall)
      gruppe.datenprobleme.push(...probleme)
    }

    setGruppen([...kassen.values()].sort((a, b) => a.kostentraeger_name.localeCompare(b.kostentraeger_name)))
    setLaden(false)
  }, [monat])

  useEffect(() => { ladeDaten() }, [ladeDaten])

  // ── Prüflauf: EDIFACT generieren + validieren (ohne Speichern) ─
  function pruefeAlle() {
    if (!orgIk) { setMeldung('Absender-IK wird noch geladen — bitte kurz warten und erneut versuchen.'); return }
    const ergebnisse: Record<string, PruefErgebnis> = {}
    let lfd = 1
    for (const gruppe of gruppen) {
      if (gruppe.faelle.length === 0) {
        ergebnisse[gruppe.kostentraeger_ik || 'ohne-ik'] = { datei: null, fehler: [], warnungen: [], datenprobleme: gruppe.datenprobleme }
        continue
      }
      try {
        const datei = generateEDIFACT(gruppe.faelle, orgIk, {
          absender_name: ALLTAGSENGEL_NAME,
          laufende_nummer: lfd,
          rechnungsnummer_praefix: `AE-${monat}`,
        })
        const validierung = validateEDIFACT(datei.inhalt)
        ergebnisse[gruppe.kostentraeger_ik] = {
          datei,
          fehler: validierung.fehler,
          warnungen: [
            ...validierung.warnungen,
            ...datei.warnungen.map(w => ({ ebene: 'warnung' as const, meldung: w })),
          ],
          datenprobleme: gruppe.datenprobleme,
        }
        lfd++
      } catch (e) {
        ergebnisse[gruppe.kostentraeger_ik] = {
          datei: null,
          fehler: [{ ebene: 'fehler', meldung: `Generator-Fehler: ${e instanceof Error ? e.message : String(e)}` }],
          warnungen: [],
          datenprobleme: gruppe.datenprobleme,
        }
      }
    }
    setPruefung(ergebnisse)
    setMeldung('Prüflauf abgeschlossen.')
  }

  // ── Export: Dateien herunterladen + Abrechnungslauf speichern ─
  async function exportiere(gruppe: KassenGruppe) {
    const ergebnis = pruefung[gruppe.kostentraeger_ik]
    if (!ergebnis?.datei) { setMeldung('Bitte zuerst den Prüflauf ausführen.'); return }
    if (ergebnis.fehler.length > 0 && !confirm(`${ergebnis.fehler.length} Fehler vorhanden — trotzdem exportieren?`)) return

    const datei = ergebnis.datei
    // 1) Nutzdatendatei
    download(datei.physikalischer_dateiname, datei.inhalt)
    // 2) Auftragsdatei (Begleitzettel, 348 Byte fix)
    const auf = generateAuftragsdatei({
      absender_ik: orgIk,
      datenannahmestelle_ik: datei.datenannahmestelle.ik,
      dateiname: datei.logischer_dateiname,
      dateigroesse_nutzdaten: new Blob([datei.inhalt]).size,
      leistungsart: datei.rechnungen[0]?.leistungsart || '01',
    })
    download(auftragsdateiName(datei.physikalischer_dateiname), auf)

    // 3) Lauf in DB festhalten (upsert je Monat + Kostenträger)
    try {
      await speichereLauf({
        abrechnungsmonat: monat,
        kostentraeger_ik: gruppe.kostentraeger_ik,
        kostentraeger_name: gruppe.kostentraeger_name,
        status: 'exportiert',
        anzahl_faelle: gruppe.faelle.length,
        gesamtbetrag_cent: datei.gesamtbetrag_cent,
        rechnungsnummer: datei.rechnungen.map(r => r.rechnungsnummer).join(', '),
        datenannahmestelle_ik: datei.datenannahmestelle.ik,
        datenannahmestelle_name: datei.datenannahmestelle.name,
        logischer_dateiname: datei.logischer_dateiname,
        fehlerprotokoll: [...ergebnis.fehler, ...ergebnis.warnungen].map(i => `${i.ebene.toUpperCase()}: ${i.meldung}`).join('\n') || null,
      })
      setMeldung(`Export für ${gruppe.kostentraeger_name} abgeschlossen (${datei.physikalischer_dateiname} + .AUF). Nächster Schritt: SECON-Verschlüsselung + Versand an ${datei.datenannahmestelle.name}.`)
    } catch (e: any) {
      setMeldung(`Export ok, aber Speichern des Laufs fehlgeschlagen: ${e.message}`)
    }
    ladeDaten()
  }

  async function setzeLaufStatus(lauf: LaufRow, status: string) {
    try {
      await setzeLaufStatusAction(lauf.id, status)
      ladeDaten()
    } catch (e: any) {
      setMeldung(`Status-Update fehlgeschlagen: ${e.message}`)
    }
  }

  const gesamtSumme = useMemo(
    () => Object.values(pruefung).reduce((s, p) => s + (p.datei?.gesamtbetrag_cent || 0), 0),
    [pruefung],
  )

  // ── Rendering ─────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Abrechnung (EDIFACT § 105 SGB XI)</h1>
        <select
          value={monat}
          onChange={e => setMonat(e.target.value)}
          style={{
            padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10,
            background: 'var(--coal2)', color: 'var(--ink)', fontSize: 14, fontFamily: 'inherit',
          }}
        >
          {optionen.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button style={{ ...primaryBtn, opacity: laden || gruppen.length === 0 ? 0.5 : 1 }} onClick={pruefeAlle} disabled={laden || gruppen.length === 0}>
          Abrechnung prüfen
        </button>
        {gesamtSumme > 0 && (
          <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--gold2)' }}>
            Gesamt: {euro(gesamtSumme / 100)}
          </span>
        )}
      </div>

      <Banner tone="info">
        Absender-IK Alltagsengel: <strong>{orgIk || '…'}</strong> — je Kostenträger wird eine eigene
        Nutzdatendatei (PLGA + PLAA) plus Auftragsdatei (.AUF) erzeugt. Vor dem Versand ist die
        SECON-Verschlüsselung (ITSG-Zertifikat) erforderlich.
      </Banner>

      {meldung && <Banner tone="info">{meldung}</Banner>}
      {laden && <p style={{ color: 'var(--muted)' }}>Lade Abrechnungsdaten…</p>}
      {!laden && gruppen.length === 0 && (
        <Banner tone="warn">Keine abrechenbaren Leistungsnachweise (Status vollständig/unterschrieben/abgerechnet) im gewählten Monat.</Banner>
      )}

      {/* ── Übersicht je Kostenträger ── */}
      {gruppen.map(gruppe => {
        const ergebnis = pruefung[gruppe.kostentraeger_ik || 'ohne-ik']
        const stelle = gruppe.faelle.length > 0 ? findeDatenannahmestelle(gruppe.kostentraeger_name) : null
        const summe = ergebnis?.datei?.gesamtbetrag_cent
          ?? gruppe.faelle.reduce((s, fall) => s + fall.leistungen.reduce((x, l) => x + centRunden(l.einzelpreis_cent * l.menge), 0), 0)
        const anzahlFehler = (ergebnis?.fehler.length || 0)
        const anzahlWarnungen = (ergebnis?.warnungen.length || 0) + gruppe.datenprobleme.length
        const ampelFarbe = !ergebnis ? '#999' : anzahlFehler > 0 ? '#D04B3B' : anzahlWarnungen > 0 ? '#E8A000' : '#5CB882'

        return (
          <div key={gruppe.kostentraeger_ik || 'ohne-ik'} style={{ ...cardStyle, marginBottom: 16, padding: 20, borderLeft: `4px solid ${ampelFarbe}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{gruppe.kostentraeger_name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink4)' }}>
                  IK {gruppe.kostentraeger_ik || '— fehlt —'}
                  {stelle && <> · Annahmestelle: {stelle.name} (IK {stelle.ik})</>}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                <StatusBadge label={`${gruppe.faelle.length} Fälle`} color="#5C6BC0" />
                <StatusBadge label={euro(summe / 100)} color="#C9963C" />
                {ergebnis && anzahlFehler > 0 && <StatusBadge label={`${anzahlFehler} Fehler`} color="#D04B3B" />}
                {ergebnis && anzahlFehler === 0 && anzahlWarnungen > 0 && <StatusBadge label={`${anzahlWarnungen} Warnungen`} color="#E8A000" />}
                {ergebnis && anzahlFehler === 0 && anzahlWarnungen === 0 && <StatusBadge label="OK" color="#5CB882" />}
                {ergebnis?.datei && (
                  <>
                    <button style={miniBtn} onClick={() => setVorschauIK(vorschauIK === gruppe.kostentraeger_ik ? null : gruppe.kostentraeger_ik)}>
                      {vorschauIK === gruppe.kostentraeger_ik ? 'Vorschau schließen' : 'Vorschau'}
                    </button>
                    <button style={miniGoldBtn} onClick={() => exportiere(gruppe)}>
                      EDIFACT exportieren
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Fälle */}
            {gruppe.faelle.length > 0 && (
              <table className="admin-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>Versicherter</th><th>Vers.-Nr.</th><th>PG</th><th>Leistungen</th><th style={{ textAlign: 'right' }}>Betrag</th>
                  </tr>
                </thead>
                <tbody>
                  {gruppe.faelle.map((fall, i) => {
                    const brutto = fall.leistungen.reduce((s, l) => s + centRunden(l.einzelpreis_cent * l.menge), 0)
                    return (
                      <tr key={i}>
                        <td>{fall.client.nachname}, {fall.client.vorname}</td>
                        <td style={{ fontFamily: 'monospace' }}>{fall.client.versichertennummer || <span style={{ color: '#D04B3B' }}>fehlt</span>}</td>
                        <td>{fall.client.pflegegrad}</td>
                        <td>{fall.leistungen.length} Einsätze</td>
                        <td style={{ textAlign: 'right' }}>{euro(brutto / 100)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {/* Fehler / Warnungen / Datenprobleme */}
            {ergebnis && (
              <div style={{ marginTop: 10 }}>
                {ergebnis.fehler.map((issue, i) => (
                  <div key={`f${i}`} style={{ color: '#D04B3B', fontSize: 13, padding: '2px 0' }}>
                    ✕ {issue.segment ? `[${issue.segment}] ` : ''}{issue.meldung}
                  </div>
                ))}
                {ergebnis.warnungen.map((issue, i) => (
                  <div key={`w${i}`} style={{ color: '#E8A000', fontSize: 13, padding: '2px 0' }}>
                    ⚠ {issue.segment ? `[${issue.segment}] ` : ''}{issue.meldung}
                  </div>
                ))}
                {ergebnis.datenprobleme.map((p, i) => (
                  <div key={`d${i}`} style={{ color: '#E8A000', fontSize: 13, padding: '2px 0' }}>⚠ {p}</div>
                ))}
                {ergebnis.fehler.length === 0 && ergebnis.warnungen.length === 0 && ergebnis.datenprobleme.length === 0 && (
                  <div style={{ color: '#5CB882', fontSize: 13 }}>✓ Alle Prüfungen bestanden — bereit für den Export.</div>
                )}
              </div>
            )}
            {!ergebnis && gruppe.datenprobleme.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {gruppe.datenprobleme.map((p, i) => (
                  <div key={i} style={{ color: '#E8A000', fontSize: 13, padding: '2px 0' }}>⚠ {p}</div>
                ))}
              </div>
            )}

            {/* Vorschau */}
            {vorschauIK === gruppe.kostentraeger_ik && ergebnis?.datei && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--ink4)', marginBottom: 6 }}>
                  Nutzdatendatei <strong>{ergebnis.datei.physikalischer_dateiname}</strong> · logischer Name{' '}
                  <strong>{ergebnis.datei.logischer_dateiname}</strong> · {ergebnis.datei.anzahl_nachrichten} Nachrichten (PLGA/PLAA)
                </div>
                <pre style={{
                  background: 'var(--coal3)', border: '1px solid var(--border)', borderRadius: 10,
                  padding: 14, fontSize: 12, lineHeight: 1.7, overflowX: 'auto', maxHeight: 420,
                  color: 'var(--ink)', whiteSpace: 'pre',
                }}>
                  {ergebnis.datei.inhalt}
                </pre>
              </div>
            )}
          </div>
        )
      })}

      {/* ── Status-Tracking der Läufe ── */}
      <h2 style={{ marginTop: 32 }}>Abrechnungsläufe {optionen.find(o => o.value === monat)?.label}</h2>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Kostenträger</th><th>Rechnungs-Nr.</th><th>Fälle</th><th style={{ textAlign: 'right' }}>Betrag</th>
            <th>Annahmestelle</th><th>Datei</th><th>Status</th><th>Aktion</th>
          </tr>
        </thead>
        <tbody>
          {laeufe.length === 0 && <EmptyRow colSpan={8}>Noch kein Abrechnungslauf für diesen Monat.</EmptyRow>}
          {laeufe.map(lauf => {
            const meta = LAUF_STATUS[lauf.status] || { label: lauf.status, color: '#999' }
            return (
              <tr key={lauf.id}>
                <td>
                  {lauf.kostentraeger_name}
                  <div style={{ fontSize: 11, color: 'var(--ink4)', fontFamily: 'monospace' }}>
                    IK {lauf.kostentraeger_ik}{!validateIK(lauf.kostentraeger_ik) && <span style={{ color: '#D04B3B' }}> (Prüfziffer!)</span>}
                  </div>
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{lauf.rechnungsnummer || '—'}</td>
                <td>{lauf.anzahl_faelle ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>{lauf.gesamtbetrag_cent != null ? euro(lauf.gesamtbetrag_cent / 100) : '—'}</td>
                <td style={{ fontSize: 12 }}>{lauf.datenannahmestelle_name || '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{lauf.logischer_dateiname || '—'}</td>
                <td><StatusBadge label={meta.label} color={meta.color} /></td>
                <td>
                  <select
                    value={lauf.status}
                    onChange={e => setzeLaufStatus(lauf, e.target.value)}
                    style={{
                      padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8,
                      background: 'var(--coal2)', color: 'var(--ink)', fontSize: 12, fontFamily: 'inherit',
                    }}
                  >
                    {Object.entries(LAUF_STATUS).map(([wert, m]) => (
                      <option key={wert} value={wert}>{m.label}</option>
                    ))}
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
