'use client'
// ═══════════════════════════════════════════════════════════════
// SIS-Editor — ein Assessment mit Eingangsfrage, Themenfeld-Tabs
// (1-6, Feld 6 nur ambulant) und Risikomatrix.
// Der Route-Parameter [id] ist die sis_assessments.id.
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { formatDate, statusMeta } from '@/lib/admin/ops'
import { Banner, StatusBadge } from '@/components/admin/OpsUI'
import {
  AuswahlFeld, FeldRaster, Karte, SchalterFeld, Tabs, TextBereich, TextFeld,
  pflegePrimaryBtn, pflegeSecondaryBtn,
} from '@/components/admin/PflegeUI'
import type { SisAssessmentDetail, SisRisiko } from '@/lib/sis/types'
import {
  SIS_RISIKO_LABELS, SIS_RISIKO_WERTE, SIS_STATUS_META, SIS_THEMENFELDER,
  SIS_TYP_LABELS, SIS_VERSORGUNGSFORM_LABELS, relevanteThemenfelder,
} from '@/lib/sis/types'

type Tab = 'eingang' | 'tf1' | 'tf2' | 'tf3' | 'tf4' | 'tf5' | 'tf6' | 'risiken'

interface ThemenfeldForm {
  sichtKlient: string
  einschaetzungPflege: string
  handlungsbedarf: boolean
  bemerkung: string
}

interface RisikoForm {
  risikoVorhanden: string
  weitereEinschaetzung: boolean
  bemerkung: string
}

const LEERES_FELD: ThemenfeldForm = { sichtKlient: '', einschaetzungPflege: '', handlungsbedarf: false, bemerkung: '' }
const LEERES_RISIKO: RisikoForm = { risikoVorhanden: 'unklar', weitereEinschaetzung: false, bemerkung: '' }

export default function AdminSisEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [assessment, setAssessment] = useState<SisAssessmentDetail | null>(null)
  const [tab, setTab] = useState<Tab>('eingang')
  const [eingangsfrage, setEingangsfrage] = useState('')
  const [bemerkung, setBemerkung] = useState('')
  const [felder, setFelder] = useState<Record<number, ThemenfeldForm>>({})
  const [risiken, setRisiken] = useState<Record<string, RisikoForm>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hinweis, setHinweis] = useState('')

  const bearbeitbar = assessment?.status === 'entwurf' && !assessment.gesperrt

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const body = await fetch(`/api/sis/assessments/${id}`).then(r => r.json())
      if (body.error) { setError(body.error); return }
      uebernehme(body.assessment)
    } catch {
      setError('Laden fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }

  function uebernehme(a: SisAssessmentDetail) {
    setAssessment(a)
    setEingangsfrage(a.eingangsfrage ?? '')
    setBemerkung(a.bemerkung ?? '')
    const f: Record<number, ThemenfeldForm> = {}
    for (const t of a.themenfelder) {
      f[t.feld_nr] = {
        sichtKlient: t.sicht_klient ?? '',
        einschaetzungPflege: t.einschaetzung_pflege ?? '',
        handlungsbedarf: t.handlungsbedarf ?? false,
        bemerkung: t.bemerkung ?? '',
      }
    }
    setFelder(f)
    const r: Record<string, RisikoForm> = {}
    for (const z of a.risikomatrix) {
      r[z.risiko] = {
        risikoVorhanden: z.risiko_vorhanden,
        weitereEinschaetzung: z.weitere_einschaetzung,
        bemerkung: z.bemerkung ?? '',
      }
    }
    setRisiken(r)
  }

  async function api(pfad: string, methode: string, payload?: unknown): Promise<boolean> {
    setBusy(true)
    setError('')
    setHinweis('')
    try {
      const res = await fetch(pfad, {
        method: methode,
        headers: { 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      })
      const body = await res.json()
      if (body.error) { setError(body.error); return false }
      return true
    } catch {
      setError('Speichern fehlgeschlagen.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function speichereKopf() {
    if (await api(`/api/sis/assessments/${id}`, 'PATCH', { eingangsfrage, bemerkung })) {
      setHinweis('Gespeichert.')
      await load()
    }
  }

  async function speichereFeld(feldNr: number) {
    const f = felder[feldNr] ?? LEERES_FELD
    if (await api(`/api/sis/assessments/${id}/themenfelder`, 'PUT', {
      feldNr,
      sichtKlient: f.sichtKlient,
      einschaetzungPflege: f.einschaetzungPflege,
      handlungsbedarf: f.handlungsbedarf,
      bemerkung: f.bemerkung,
    })) {
      setHinweis(`Themenfeld ${feldNr} gespeichert.`)
      await load()
    }
  }

  async function speichereRisiko(risiko: SisRisiko) {
    const r = risiken[risiko] ?? LEERES_RISIKO
    if (await api(`/api/sis/assessments/${id}/risikomatrix`, 'PUT', {
      risiko,
      risikoVorhanden: r.risikoVorhanden,
      weitereEinschaetzung: r.weitereEinschaetzung,
      bemerkung: r.bemerkung,
    })) {
      setHinweis(`Risiko „${SIS_RISIKO_LABELS[risiko]}" gespeichert.`)
      await load()
    }
  }

  async function abschliessen() {
    if (await api(`/api/sis/assessments/${id}/abschliessen`, 'POST', {})) {
      setHinweis('SIS abgeschlossen.')
      await load()
    }
  }

  async function wiedereroeffnen() {
    if (await api(`/api/sis/assessments/${id}/abschliessen`, 'POST', { wiedereroeffnen: true })) {
      setHinweis('SIS wieder als Entwurf geöffnet.')
      await load()
    }
  }

  async function sperren() {
    if (!window.confirm('SIS endgültig sperren? Eine gesperrte Informationssammlung kann nicht mehr geändert werden.')) return
    if (await api(`/api/sis/assessments/${id}/sperren`, 'POST', {})) {
      setHinweis('SIS gesperrt.')
      await load()
    }
  }

  if (loading) return <div className="admin-page"><p>Lade…</p></div>
  if (!assessment) {
    return (
      <div className="admin-page">
        {error && <Banner tone="danger">{error}</Banner>}
        <Link href="/admin/sis">← Zur SIS-Übersicht</Link>
      </div>
    )
  }

  const relevante = relevanteThemenfelder(assessment.versorgungsform)
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'eingang', label: 'Eingang' },
    ...relevante.map(nr => ({ key: `tf${nr}` as Tab, label: `${nr}. ${SIS_THEMENFELDER[nr - 1].titel}` })),
    { key: 'risiken', label: 'Risikomatrix' },
  ]
  const meta = statusMeta(SIS_STATUS_META, assessment.status)
  const aktivesFeldNr = tab.startsWith('tf') ? Number(tab.slice(2)) : null

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Strukturierte Informationssammlung</h1>
          <p className="admin-subtitle">
            {formatDate(assessment.assessment_datum)} · {SIS_TYP_LABELS[assessment.assessment_typ]} · {SIS_VERSORGUNGSFORM_LABELS[assessment.versorgungsform]}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StatusBadge label={meta.label} color={meta.color} />
          <Link href="/admin/sis" style={{ textDecoration: 'none' }}>← Übersicht</Link>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {hinweis && <Banner tone="success">{hinweis}</Banner>}
      {!bearbeitbar && (
        <Banner tone="info">
          {assessment.gesperrt
            ? 'Diese SIS ist gesperrt und kann nicht mehr geändert werden.'
            : 'Diese SIS ist abgeschlossen. Zum Bearbeiten zuerst wiedereröffnen.'}
        </Banner>
      )}

      <Tabs tabs={tabs} aktiv={tab} onChange={setTab} />

      {tab === 'eingang' && (
        <Karte titel="Eingang — Sicht der pflegebedürftigen Person">
          <TextBereich
            label="Was bewegt Sie im Augenblick? Was brauchen Sie?"
            value={eingangsfrage}
            onChange={setEingangsfrage}
            disabled={!bearbeitbar}
            rows={5}
            placeholder="Wörtliche oder sinngemäße Aussage der Person…"
          />
          <TextBereich
            label="Bemerkung"
            value={bemerkung}
            onChange={setBemerkung}
            disabled={!bearbeitbar}
            rows={3}
          />
          {bearbeitbar && (
            <button style={pflegePrimaryBtn} onClick={speichereKopf} disabled={busy}>Speichern</button>
          )}
        </Karte>
      )}

      {aktivesFeldNr !== null && (
        <Karte titel={`Themenfeld ${aktivesFeldNr}: ${SIS_THEMENFELDER[aktivesFeldNr - 1].titel}`}>
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>{SIS_THEMENFELDER[aktivesFeldNr - 1].leitfrage}</p>
          <TextBereich
            label="Sicht der pflegebedürftigen Person"
            value={(felder[aktivesFeldNr] ?? LEERES_FELD).sichtKlient}
            onChange={v => setFelder(s => ({ ...s, [aktivesFeldNr]: { ...(s[aktivesFeldNr] ?? LEERES_FELD), sichtKlient: v } }))}
            disabled={!bearbeitbar}
            rows={4}
          />
          <TextBereich
            label="Fachliche Einschätzung der Pflegefachkraft"
            value={(felder[aktivesFeldNr] ?? LEERES_FELD).einschaetzungPflege}
            onChange={v => setFelder(s => ({ ...s, [aktivesFeldNr]: { ...(s[aktivesFeldNr] ?? LEERES_FELD), einschaetzungPflege: v } }))}
            disabled={!bearbeitbar}
            rows={4}
          />
          <FeldRaster>
            <SchalterFeld
              label="Handlungsbedarf"
              value={(felder[aktivesFeldNr] ?? LEERES_FELD).handlungsbedarf}
              onChange={v => setFelder(s => ({ ...s, [aktivesFeldNr]: { ...(s[aktivesFeldNr] ?? LEERES_FELD), handlungsbedarf: v } }))}
              disabled={!bearbeitbar}
            />
            <TextFeld
              label="Bemerkung"
              value={(felder[aktivesFeldNr] ?? LEERES_FELD).bemerkung}
              onChange={v => setFelder(s => ({ ...s, [aktivesFeldNr]: { ...(s[aktivesFeldNr] ?? LEERES_FELD), bemerkung: v } }))}
              disabled={!bearbeitbar}
              breit
            />
          </FeldRaster>
          {bearbeitbar && (
            <button style={pflegePrimaryBtn} onClick={() => speichereFeld(aktivesFeldNr)} disabled={busy}>
              Themenfeld speichern
            </button>
          )}
        </Karte>
      )}

      {tab === 'risiken' && (
        <Karte titel="Risikomatrix — pflegesensitive Risiken">
          {SIS_RISIKO_WERTE.map(risiko => {
            const r = risiken[risiko] ?? LEERES_RISIKO
            return (
              <div key={risiko} style={{ borderBottom: '1px solid var(--border, #333)', padding: '12px 0' }}>
                <strong>{SIS_RISIKO_LABELS[risiko]}</strong>
                <FeldRaster>
                  <AuswahlFeld
                    label="Risiko vorhanden?"
                    value={r.risikoVorhanden}
                    onChange={v => setRisiken(s => ({ ...s, [risiko]: { ...(s[risiko] ?? LEERES_RISIKO), risikoVorhanden: v } }))}
                    optionen={[
                      ['unklar', 'Noch unklar'],
                      ['ja', 'Ja'],
                      ['nein', 'Nein'],
                    ] as Array<[string, string]>}
                    disabled={!bearbeitbar}
                  />
                  <SchalterFeld
                    label="Weitere Einschätzung notwendig"
                    value={r.weitereEinschaetzung}
                    onChange={v => setRisiken(s => ({ ...s, [risiko]: { ...(s[risiko] ?? LEERES_RISIKO), weitereEinschaetzung: v } }))}
                    disabled={!bearbeitbar}
                  />
                  <TextFeld
                    label="Bemerkung"
                    value={r.bemerkung}
                    onChange={v => setRisiken(s => ({ ...s, [risiko]: { ...(s[risiko] ?? LEERES_RISIKO), bemerkung: v } }))}
                    disabled={!bearbeitbar}
                  />
                </FeldRaster>
                {bearbeitbar && (
                  <button style={pflegeSecondaryBtn} onClick={() => speichereRisiko(risiko)} disabled={busy}>
                    Speichern
                  </button>
                )}
              </div>
            )
          })}
        </Karte>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        {assessment.status === 'entwurf' && (
          <button style={pflegePrimaryBtn} onClick={abschliessen} disabled={busy}>SIS abschließen</button>
        )}
        {assessment.status === 'abgeschlossen' && !assessment.gesperrt && (
          <>
            <button style={pflegeSecondaryBtn} onClick={wiedereroeffnen} disabled={busy}>Wiedereröffnen</button>
            <button style={pflegePrimaryBtn} onClick={sperren} disabled={busy}>Endgültig sperren</button>
          </>
        )}
      </div>
    </div>
  )
}
