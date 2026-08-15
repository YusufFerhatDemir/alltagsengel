'use client'
// ═══════════════════════════════════════════════════════════════
// Berichteblatt / Pflegebericht — strukturierte Tagesansicht
// Zeigt pflege_verlauf-Eintraege eines Tages, gruppiert nach
// SGB XI Begutachtungsmodulen. Quick-Add pro Sektion.
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { formatDate } from '@/lib/admin/ops'
import { Banner } from '@/components/admin/OpsUI'
import {
  Karte, SchalterFeld, TextBereich,
  pflegeInput, pflegeMiniBtn, pflegePrimaryBtn, pflegeSecondaryBtn,
} from '@/components/admin/PflegeUI'
import type { PflegeUebersichtZeile, PflegeVerlaufEintrag, VerlaufKategorie } from '@/lib/pflege/types'

// ── Sektionen nach SGB XI Begutachtungsmodulen ────────────────
interface Sektion {
  key: string
  label: string
  kategorien: VerlaufKategorie[]
  defaultKategorie: VerlaufKategorie
}

const SEKTIONEN: Sektion[] = [
  { key: 'mobilitaet', label: 'Mobilitaet', kategorien: ['mobilitaet'], defaultKategorie: 'mobilitaet' },
  { key: 'kognition', label: 'Kognition und Kommunikation', kategorien: ['kognition', 'kommunikation'], defaultKategorie: 'kognition' },
  { key: 'verhalten', label: 'Verhaltensweisen und psychische Problemlagen', kategorien: ['stimmung'], defaultKategorie: 'stimmung' },
  { key: 'selbstversorgung', label: 'Selbstversorgung', kategorien: ['koerperpflege', 'ernaehrung'], defaultKategorie: 'koerperpflege' },
  { key: 'krankheit', label: 'Krankheits- und therapiebedingte Anforderungen', kategorien: ['medikation', 'schmerz'], defaultKategorie: 'medikation' },
  { key: 'alltag', label: 'Gestaltung des Alltagslebens und sozialer Kontakte', kategorien: ['soziales', 'hauswirtschaft'], defaultKategorie: 'soziales' },
  { key: 'sonstiges', label: 'Sonstiges', kategorien: ['sonstiges', 'schlaf', 'allgemein'], defaultKategorie: 'allgemein' },
]

const KATEGORIE_LABELS: Record<string, string> = {
  allgemein: 'Allgemein', koerperpflege: 'Koerperpflege', ernaehrung: 'Ernaehrung',
  mobilitaet: 'Mobilitaet', kognition: 'Kognition', soziales: 'Soziales',
  medikation: 'Medikation', hauswirtschaft: 'Hauswirtschaft', kommunikation: 'Kommunikation',
  stimmung: 'Stimmung', schmerz: 'Schmerz', schlaf: 'Schlaf', sonstiges: 'Sonstiges',
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default function BerichteblattPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params)
  const [eintraege, setEintraege] = useState<PflegeVerlaufEintrag[]>([])
  const [kunde, setKunde] = useState<PflegeUebersichtZeile | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [datum, setDatum] = useState(toDateStr(new Date()))
  const [addSektion, setAddSektion] = useState<string | null>(null)
  const [addText, setAddText] = useState('')
  const [addDringend, setAddDringend] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [vRes, kRes] = await Promise.all([
        fetch(`/api/pflege/verlauf?clientId=${clientId}`).then(r => r.json()),
        fetch(`/api/pflege/uebersicht?clientId=${clientId}`).then(r => r.json()),
      ])
      if (vRes.error) { setError(vRes.error); return }
      setEintraege(vRes.eintraege || [])
      setKunde((kRes.uebersicht || [])[0] ?? null)
    } catch {
      setError('Laden fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { load() }, [load])

  // Eintraege des gewaehlten Tages
  const tagesEintraege = useMemo(() =>
    eintraege.filter(e => e.eintrag_datum.slice(0, 10) === datum),
    [eintraege, datum],
  )

  // Eintraege pro Sektion
  function eintraegeFuerSektion(sektion: Sektion): PflegeVerlaufEintrag[] {
    return tagesEintraege.filter(e => sektion.kategorien.includes(e.kategorie))
  }

  // Nicht zugeordnete Eintraege (Kategorien, die keiner Sektion zugewiesen sind)
  const zugeordneteKategorien = new Set(SEKTIONEN.flatMap(s => s.kategorien))
  const nichtZugeordnet = tagesEintraege.filter(e => !zugeordneteKategorien.has(e.kategorie))

  // Navigation
  function vortag() {
    const d = new Date(datum)
    d.setDate(d.getDate() - 1)
    setDatum(toDateStr(d))
  }
  function naechsterTag() {
    const d = new Date(datum)
    d.setDate(d.getDate() + 1)
    setDatum(toDateStr(d))
  }

  // Quick-Add
  async function quickAdd(sektion: Sektion) {
    if (!addText.trim()) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/pflege/verlauf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          eintragTyp: 'verlauf',
          kategorie: sektion.defaultKategorie,
          titel: 'Berichteblatt-Eintrag',
          inhalt: addText.trim(),
          istDringend: addDringend,
          sichtbarkeit: 'intern',
          eintragDatum: new Date(datum + 'T12:00:00').toISOString(),
        }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Anlegen fehlgeschlagen.'); return }
      setAddSektion(null)
      setAddText('')
      setAddDringend(false)
      await load()
    } finally { setBusy(false) }
  }

  // Zusammenfassung
  const autorZusammenfassung = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of tagesEintraege) {
      map.set(e.autor_name, (map.get(e.autor_name) || 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [tagesEintraege])

  if (loading && !eintraege.length) {
    return <div className="admin-page"><p style={{ color: 'var(--muted)' }}>Laden...</p></div>
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Berichteblatt</h1>
          <p className="admin-subtitle">
            {kunde ? `${kunde.first_name} ${kunde.last_name}` : 'Kunde'}
            {kunde?.pflegegrad ? ` (Pflegegrad ${kunde.pflegegrad})` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/admin/pflegedoku/verlauf/${clientId}`} style={pflegeSecondaryBtn}>Verlauf</Link>
          <Link href="/admin/pflegedoku" style={pflegeSecondaryBtn}>Pflegedoku</Link>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {/* Datums-Navigation */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
        background: 'var(--coal2)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '10px 16px',
      }}>
        <button onClick={vortag} style={pflegeSecondaryBtn}>Vortag</button>
        <input type="date" value={datum} onChange={e => setDatum(e.target.value)}
          style={{ ...pflegeInput, width: 'auto', flex: 'unset' }} />
        <button onClick={naechsterTag} style={pflegeSecondaryBtn}>Folgetag</button>
        <button onClick={() => setDatum(toDateStr(new Date()))} style={pflegeMiniBtn}>Heute</button>
        <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 600, color: 'var(--ink3)' }}>
          {new Date(datum + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* Sektionen */}
      {SEKTIONEN.map(sektion => {
        const sektionEintraege = eintraegeFuerSektion(sektion)
        const istAddOffen = addSektion === sektion.key
        return (
          <Karte
            key={sektion.key}
            titel={`${sektion.label} (${sektionEintraege.length})`}
            aktion={
              !istAddOffen ? (
                <button onClick={() => { setAddSektion(sektion.key); setAddText(''); setAddDringend(false) }}
                  style={pflegeMiniBtn}>+ Eintrag</button>
              ) : undefined
            }
          >
            {/* Quick-Add Formular */}
            {istAddOffen && (
              <div style={{
                background: 'var(--card,#fff)', borderRadius: 8, padding: 12,
                border: '1px solid rgba(0,0,0,.08)', marginBottom: 12,
              }}>
                <TextBereich label={`Neuer Eintrag (${KATEGORIE_LABELS[sektion.defaultKategorie]})`}
                  value={addText} onChange={setAddText} rows={3}
                  placeholder="Dokumentation eingeben..." />
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <SchalterFeld label="Dringend" value={addDringend} onChange={setAddDringend} />
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button onClick={() => quickAdd(sektion)} disabled={busy || !addText.trim()} style={{
                      ...pflegePrimaryBtn, opacity: (!addText.trim() || busy) ? 0.5 : 1,
                    }}>Speichern</button>
                    <button onClick={() => setAddSektion(null)} style={pflegeSecondaryBtn}>Abbrechen</button>
                  </div>
                </div>
              </div>
            )}

            {/* Eintraege */}
            {sektionEintraege.length === 0 && !istAddOffen && (
              <p style={{ fontSize: 13, color: 'var(--ink5)', margin: 0, fontStyle: 'italic' }}>
                Keine Eintraege fuer diesen Tag
              </p>
            )}
            {sektionEintraege.map(e => (
              <div key={e.id} style={{
                padding: '10px 12px', borderRadius: 8, marginBottom: 8,
                background: 'var(--card,#fff)',
                border: `1px solid ${e.ist_dringend ? 'rgba(208,75,59,.35)' : 'rgba(0,0,0,.06)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink4)' }}>
                    {KATEGORIE_LABELS[e.kategorie] || e.kategorie}
                  </span>
                  {e.ist_dringend && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#D04B3B' }}>DRINGEND</span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink5)' }}>
                    {new Date(e.eintrag_datum).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    {' '}{e.autor_name}
                  </span>
                </div>
                {e.titel && e.titel !== 'Berichteblatt-Eintrag' && (
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{e.titel}</div>
                )}
                <p style={{ fontSize: 13, color: 'var(--ink2)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>
                  {e.inhalt}
                </p>
              </div>
            ))}
          </Karte>
        )
      })}

      {/* Nicht zugeordnete Eintraege */}
      {nichtZugeordnet.length > 0 && (
        <Karte titel={`Weitere Eintraege (${nichtZugeordnet.length})`}>
          {nichtZugeordnet.map(e => (
            <div key={e.id} style={{
              padding: '10px 12px', borderRadius: 8, marginBottom: 8,
              background: 'var(--card,#fff)', border: '1px solid rgba(0,0,0,.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink4)' }}>
                  {KATEGORIE_LABELS[e.kategorie] || e.kategorie} / {e.eintrag_typ}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink5)' }}>
                  {new Date(e.eintrag_datum).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  {' '}{e.autor_name}
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--ink2)', whiteSpace: 'pre-wrap', margin: 0 }}>{e.inhalt}</p>
            </div>
          ))}
        </Karte>
      )}

      {/* Tageszusammenfassung */}
      <div style={{
        background: 'var(--coal2)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 16, marginTop: 8,
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px 0' }}>
          Tageszusammenfassung — {formatDate(datum)}
        </h3>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, color: 'var(--ink3)' }}>
          <span>Eintraege gesamt: <strong>{tagesEintraege.length}</strong></span>
          <span>Davon dringend: <strong style={{ color: tagesEintraege.filter(e => e.ist_dringend).length > 0 ? '#D04B3B' : 'inherit' }}>
            {tagesEintraege.filter(e => e.ist_dringend).length}
          </strong></span>
        </div>
        {autorZusammenfassung.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink4)' }}>
            Erfasst von: {autorZusammenfassung.map(([name, count]) => `${name} (${count})`).join(', ')}
          </div>
        )}
      </div>
    </div>
  )
}
