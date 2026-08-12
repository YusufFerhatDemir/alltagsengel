'use client'
// ═══════════════════════════════════════════════════════════════
// Wunddokumentation — Übersicht aller Wunden (/admin/wunddokumentation)
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Banner, EmptyRow, SearchInput } from '@/components/admin/OpsUI'
import {
  AuswahlFeld, FeldRaster, Karte, TextBereich, TextFeld, pflegePrimaryBtn,
} from '@/components/admin/PflegeUI'
import {
  KOERPERSTELLEN, WUND_STATUS_LABELS, WUND_TYP_LABELS,
  type WoundMitKunde, type WundStatus, type WundTyp,
} from '@/lib/wunden/types'

type Zusammenfassung = {
  gesamt: number
  offen: number
  in_abheilung: number
  verschlechtert: number
  dekubitus: number
}

type KundenOption = { client_id: string; first_name: string; last_name: string }

const STATUS_FARBEN: Record<WundStatus, string> = {
  aktiv: '#b45309',
  in_abheilung: '#15803d',
  stagnierend: '#6b7280',
  verschlechtert: '#b91c1c',
  abgeheilt: '#1d4ed8',
}

function kundenName(w: WoundMitKunde): string {
  return [w.clients?.first_name, w.clients?.last_name].filter(Boolean).join(' ') || '—'
}

export default function WunddokumentationPage() {
  const [wunden, setWunden] = useState<WoundMitKunde[]>([])
  const [zusammenfassung, setZusammenfassung] = useState<Zusammenfassung | null>(null)
  const [kunden, setKunden] = useState<KundenOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'alle' | 'offen' | WundStatus>('offen')

  // Formular "Neue Wunde"
  const [zeigeFormular, setZeigeFormular] = useState(false)
  const [speichert, setSpeichert] = useState(false)
  const [neuClientId, setNeuClientId] = useState('')
  const [neuTyp, setNeuTyp] = useState<WundTyp>('dekubitus')
  const [neuGrad, setNeuGrad] = useState('')
  const [neuStelle, setNeuStelle] = useState('kreuzbein')
  const [neuSeite, setNeuSeite] = useState('mittig')
  const [neuLokalisation, setNeuLokalisation] = useState('')
  const [neuEntstanden, setNeuEntstanden] = useState('')
  const [neuBemerkung, setNeuBemerkung] = useState('')

  function ladeWunden() {
    fetch('/api/wounds')
      .then(r => r.json())
      .then(body => {
        if (body.error) { setError(body.error); return }
        setWunden(body.wunden || [])
        setZusammenfassung(body.zusammenfassung || null)
      })
      .catch(() => setError('Laden fehlgeschlagen.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    ladeWunden()
    fetch('/api/pflege/uebersicht')
      .then(r => r.json())
      .then(body => setKunden(body.uebersicht || []))
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const gefiltert = useMemo(() => {
    const suche = search.trim().toLowerCase()
    return wunden.filter(w => {
      if (suche && !`${kundenName(w)} ${w.lokalisation}`.toLowerCase().includes(suche)) return false
      if (statusFilter === 'alle') return true
      if (statusFilter === 'offen') return w.status !== 'abgeheilt'
      return w.status === statusFilter
    })
  }, [wunden, search, statusFilter])

  async function erstelleWunde() {
    if (!neuClientId) { setError('Bitte einen Kunden auswählen.'); return }
    if (!neuLokalisation.trim()) { setError('Bitte die Lokalisation beschreiben.'); return }
    setSpeichert(true)
    setError('')
    try {
      const res = await fetch('/api/wounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: neuClientId,
          wundTyp: neuTyp,
          dekubitusGrad: neuTyp === 'dekubitus' && neuGrad ? Number(neuGrad) : null,
          lokalisation: neuLokalisation,
          koerperstelleCode: neuStelle,
          koerperseite: neuSeite,
          entstandenAm: neuEntstanden || null,
          bemerkung: neuBemerkung || null,
        }),
      })
      const body = await res.json()
      if (body.error) { setError(body.error); return }
      setZeigeFormular(false)
      setNeuLokalisation(''); setNeuBemerkung(''); setNeuEntstanden(''); setNeuGrad('')
      ladeWunden()
    } catch {
      setError('Speichern fehlgeschlagen.')
    } finally {
      setSpeichert(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Wunddokumentation</h1>
          <p className="admin-subtitle">
            {zusammenfassung ? `${zusammenfassung.offen} offene Wunden` : '…'} · Assessment, Verlauf, Versorgung und Fotodokumentation
          </p>
        </div>
        <button style={pflegePrimaryBtn} onClick={() => setZeigeFormular(v => !v)}>
          {zeigeFormular ? 'Abbrechen' : '+ Neue Wunde'}
        </button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {zusammenfassung && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          <Stat label="Offene Wunden" value={zusammenfassung.offen} farbe="#b45309" active={statusFilter === 'offen'} onClick={() => setStatusFilter('offen')} />
          <Stat label="In Abheilung" value={zusammenfassung.in_abheilung} farbe="#15803d" active={statusFilter === 'in_abheilung'} onClick={() => setStatusFilter('in_abheilung')} />
          <Stat label="Verschlechtert" value={zusammenfassung.verschlechtert} farbe="#b91c1c" active={statusFilter === 'verschlechtert'} onClick={() => setStatusFilter('verschlechtert')} />
          <Stat label="Dekubitus (offen)" value={zusammenfassung.dekubitus} farbe="#7c3aed" active={false} onClick={() => setStatusFilter('offen')} />
          <Stat label="Gesamt" value={zusammenfassung.gesamt} farbe="#374151" active={statusFilter === 'alle'} onClick={() => setStatusFilter('alle')} />
        </div>
      )}

      {zeigeFormular && (
        <div style={{ marginBottom: 20 }}>
          <Karte titel="Neue Wunde anlegen">
            <FeldRaster>
              <AuswahlFeld
                label="Kunde *"
                value={neuClientId}
                onChange={setNeuClientId}
                optionen={[['', '— bitte wählen —'] as [string, string]].concat(
                  kunden.map(k => [k.client_id, `${k.first_name ?? ''} ${k.last_name ?? ''}`.trim()] as [string, string])
                )}
              />
              <AuswahlFeld
                label="Wundtyp *"
                value={neuTyp}
                onChange={v => setNeuTyp(v as WundTyp)}
                optionen={Object.entries(WUND_TYP_LABELS)}
              />
              {neuTyp === 'dekubitus' && (
                <AuswahlFeld
                  label="Dekubitus-Grad (EPUAP)"
                  value={neuGrad}
                  onChange={setNeuGrad}
                  optionen={[['', '— offen —'], ['1', 'Grad I — Rötung, nicht wegdrückbar'], ['2', 'Grad II — Teilverlust der Haut'], ['3', 'Grad III — Verlust aller Hautschichten'], ['4', 'Grad IV — vollständiger Gewebeverlust']]}
                />
              )}
              <AuswahlFeld
                label="Körperstelle (Schema)"
                value={neuStelle}
                onChange={setNeuStelle}
                optionen={KOERPERSTELLEN.map(k => [k.code, k.label] as [string, string])}
              />
              <AuswahlFeld
                label="Körperseite"
                value={neuSeite}
                onChange={setNeuSeite}
                optionen={[['links', 'Links'], ['rechts', 'Rechts'], ['mittig', 'Mittig']]}
              />
              <TextFeld label="Lokalisation (genau) *" value={neuLokalisation} onChange={setNeuLokalisation} placeholder="z. B. Ferse links, lateral" breit />
              <TextFeld label="Entstanden am" type="date" value={neuEntstanden} onChange={setNeuEntstanden} />
            </FeldRaster>
            <TextBereich label="Bemerkung" value={neuBemerkung} onChange={setNeuBemerkung} rows={2} />
            <div style={{ marginTop: 12 }}>
              <button style={pflegePrimaryBtn} disabled={speichert} onClick={erstelleWunde}>
                {speichert ? 'Speichert…' : 'Wunde anlegen'}
              </button>
            </div>
          </Karte>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Kundenname oder Lokalisation…" />
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Kunde</th><th>Wundtyp</th><th>Lokalisation</th><th>Status</th><th>Erstdoku</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <EmptyRow colSpan={6}>Lädt…</EmptyRow>}
            {!loading && gefiltert.length === 0 && <EmptyRow colSpan={6}>Keine Wunden gefunden.</EmptyRow>}
            {gefiltert.map(w => (
              <tr key={w.id}>
                <td>{kundenName(w)}</td>
                <td>
                  {WUND_TYP_LABELS[w.wund_typ]}
                  {w.wund_typ === 'dekubitus' && w.dekubitus_grad ? ` (Grad ${['I', 'II', 'III', 'IV'][w.dekubitus_grad - 1]})` : ''}
                </td>
                <td>{w.lokalisation}{w.koerperseite ? ` · ${w.koerperseite}` : ''}</td>
                <td>
                  <span style={{ color: STATUS_FARBEN[w.status], fontWeight: 600 }}>
                    {WUND_STATUS_LABELS[w.status]}
                  </span>
                </td>
                <td>{new Date(w.erstdokumentation_am).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}</td>
                <td>
                  <Link href={`/admin/wunddokumentation/${w.id}`} style={{ fontWeight: 600 }}>Öffnen →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value, farbe, active, onClick }: {
  label: string
  value: number
  farbe: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
        border: active ? `2px solid ${farbe}` : '1px solid var(--line, #e5e7eb)',
        background: 'var(--bg2, #fff)',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: farbe }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--ink4, #6b7280)' }}>{label}</div>
    </button>
  )
}
