'use client'
// ═══════════════════════════════════════════════════════════════
// Maßnahmenplan — pflege_massnahmenplaene + pflege_massnahmen
// Der Route-Parameter [id] ist entweder eine Plan-ID (Detailansicht)
// oder eine Client-ID (Planliste des Kunden). Die Seite löst das auf,
// indem sie zuerst den Plan lädt und bei 404 auf die Liste ausweicht.
// ═══════════════════════════════════════════════════════════════
import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import {
  PFLEGE_MASSNAHME_KATEGORIE, PFLEGE_MASSNAHME_STATUS, PFLEGE_PLAN_STATUS,
  PFLEGE_PLAN_TYP, PFLEGE_PRIORITAET, formatDate, statusMeta,
} from '@/lib/admin/ops'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'
import {
  AuswahlFeld, FeldRaster, Karte, TextBereich, TextFeld,
  pflegeMiniBtn, pflegePrimaryBtn, pflegeSecondaryBtn,
} from '@/components/admin/PflegeUI'
import {
  MASSNAHME_STATUS_WERTE,
  type PflegeMassnahme, type PflegeMassnahmenplan,
} from '@/lib/pflege/types'

const MASSNAHME_LEER = {
  kategorie: 'koerperpflege', titel: '', beschreibung: '', ziel: '',
  haeufigkeit: '', verantwortlich: '', prioritaet: 'normal',
  beginnDatum: '', endeDatum: '', sortierung: '0',
}

export default function AdminMassnahmenplanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [plan, setPlan] = useState<PflegeMassnahmenplan | null>(null)
  const [massnahmen, setMassnahmen] = useState<PflegeMassnahme[]>([])
  const [planListe, setPlanListe] = useState<PflegeMassnahmenplan[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hinweis, setHinweis] = useState('')
  const [zeigeMassnahmeForm, setZeigeMassnahmeForm] = useState(false)
  const [massnahmeForm, setMassnahmeForm] = useState(MASSNAHME_LEER)
  const [planForm, setPlanForm] = useState({ titel: '', planTyp: 'versorgungsplan', gueltigVon: '', gueltigBis: '', betreuungsziele: '', pflegeziele: '' })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/pflege/massnahmenplaene/${id}`)
      const body = await res.json()
      if (res.ok && body.plan) {
        setPlan(body.plan)
        setMassnahmen(body.massnahmen || [])
        setPlanForm({
          titel: body.plan.titel,
          planTyp: body.plan.plan_typ,
          gueltigVon: body.plan.gueltig_von ?? '',
          gueltigBis: body.plan.gueltig_bis ?? '',
          betreuungsziele: body.plan.betreuungsziele ?? '',
          pflegeziele: body.plan.pflegeziele ?? '',
        })
        setPlanListe(null)
        return
      }
      // Kein Plan mit dieser ID → als Client-ID interpretieren
      const listRes = await fetch(`/api/pflege/massnahmenplaene?clientId=${id}`)
      const listBody = await listRes.json()
      if (!listRes.ok) { setError(listBody.error || 'Laden fehlgeschlagen.'); return }
      setPlan(null)
      setPlanListe(listBody.plaene || [])
    } catch {
      setError('Laden fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const gesperrt = plan?.gesperrt === true

  async function planSpeichern() {
    if (!plan) return
    setBusy(true); setError(''); setHinweis('')
    try {
      const res = await fetch(`/api/pflege/massnahmenplaene/${plan.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...planForm, gueltigBis: planForm.gueltigBis || null }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Speichern fehlgeschlagen.'); return }
      setPlan(body.plan)
      setHinweis('Gespeichert.')
    } finally { setBusy(false) }
  }

  async function freigeben() {
    if (!plan) return
    setBusy(true); setError(''); setHinweis('')
    try {
      const res = await fetch(`/api/pflege/massnahmenplaene/${plan.id}/freigeben`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Freigabe fehlgeschlagen.'); return }
      setPlan(body.plan)
      setHinweis('Plan freigegeben — er ist jetzt aktiv.')
    } finally { setBusy(false) }
  }

  async function sperreUmschalten() {
    if (!plan) return
    setBusy(true); setError(''); setHinweis('')
    try {
      const res = await fetch(`/api/pflege/massnahmenplaene/${plan.id}/sperren`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gesperrt: !plan.gesperrt }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Aktion fehlgeschlagen.'); return }
      setPlan(body.plan)
      setHinweis(body.plan.gesperrt ? 'Plan gesperrt.' : 'Sperre aufgehoben.')
    } finally { setBusy(false) }
  }

  async function neueVersion() {
    if (!plan) return
    setBusy(true); setError(''); setHinweis('')
    try {
      const res = await fetch('/api/pflege/massnahmenplaene', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vorgaengerId: plan.id }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Neue Version fehlgeschlagen.'); return }
      window.location.href = `/admin/pflegedoku/massnahmenplan/${body.plan.id}`
    } finally { setBusy(false) }
  }

  async function massnahmeAnlegen() {
    if (!plan) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/pflege/massnahmen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id, ...massnahmeForm,
          beginnDatum: massnahmeForm.beginnDatum || null,
          endeDatum: massnahmeForm.endeDatum || null,
          sortierung: Number(massnahmeForm.sortierung) || 0,
        }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Anlegen fehlgeschlagen.'); return }
      setMassnahmeForm(MASSNAHME_LEER)
      setZeigeMassnahmeForm(false)
      await load()
    } finally { setBusy(false) }
  }

  async function massnahmeStatus(massnahmeId: string, status: string) {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/pflege/massnahmen/${massnahmeId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Aktion fehlgeschlagen.'); return }
      setMassnahmen(ms => ms.map(m => (m.id === massnahmeId ? body.massnahme : m)))
    } finally { setBusy(false) }
  }

  async function planAnlegen() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/pflege/massnahmenplaene', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: id,
          titel: planForm.titel || 'Versorgungsplan',
          planTyp: planForm.planTyp,
          gueltigVon: planForm.gueltigVon || undefined,
          gueltigBis: planForm.gueltigBis || null,
        }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Anlegen fehlgeschlagen.'); return }
      window.location.href = `/admin/pflegedoku/massnahmenplan/${body.plan.id}`
    } finally { setBusy(false) }
  }

  if (loading) return <div className="admin-page"><p style={{ color: 'var(--muted)' }}>Laden…</p></div>

  // ── Planliste eines Kunden ─────────────────────────────────────
  if (planListe) {
    return (
      <div className="admin-page">
        <div className="admin-page-header">
          <div>
            <h1>Maßnahmenpläne</h1>
            <p className="admin-subtitle">{planListe.length} Pläne für diesen Kunden</p>
          </div>
          <Link href="/admin/pflegedoku" style={pflegeSecondaryBtn}>← Übersicht</Link>
        </div>

        {error && <Banner tone="danger">{error}</Banner>}

        <Karte titel="Neuen Plan anlegen">
          <FeldRaster>
            <TextFeld label="Titel" value={planForm.titel} onChange={v => setPlanForm(f => ({ ...f, titel: v }))} placeholder="Versorgungsplan" />
            <AuswahlFeld label="Plantyp" value={planForm.planTyp} onChange={v => setPlanForm(f => ({ ...f, planTyp: v }))} optionen={PFLEGE_PLAN_TYP} />
            <TextFeld label="Gültig von" type="date" value={planForm.gueltigVon} onChange={v => setPlanForm(f => ({ ...f, gueltigVon: v }))} />
            <TextFeld label="Gültig bis" type="date" value={planForm.gueltigBis} onChange={v => setPlanForm(f => ({ ...f, gueltigBis: v }))} />
          </FeldRaster>
          <div style={{ marginTop: 12 }}>
            <button onClick={planAnlegen} disabled={busy} style={pflegePrimaryBtn}>Plan anlegen</button>
          </div>
        </Karte>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Titel</th><th>Typ</th><th>Version</th><th>Status</th><th>Gültig von</th><th>Gültig bis</th><th></th></tr></thead>
            <tbody>
              {planListe.length === 0
                ? <EmptyRow colSpan={7}>Noch kein Plan angelegt</EmptyRow>
                : planListe.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.titel}{p.gesperrt && ' 🔒'}</td>
                    <td><StatusBadge label={statusMeta(PFLEGE_PLAN_TYP, p.plan_typ).label} color={statusMeta(PFLEGE_PLAN_TYP, p.plan_typ).color} /></td>
                    <td style={{ fontSize: 13 }}>v{p.version}</td>
                    <td><StatusBadge label={statusMeta(PFLEGE_PLAN_STATUS, p.status).label} color={statusMeta(PFLEGE_PLAN_STATUS, p.status).color} /></td>
                    <td style={{ fontSize: 13 }}>{formatDate(p.gueltig_von)}</td>
                    <td style={{ fontSize: 13 }}>{formatDate(p.gueltig_bis)}</td>
                    <td><Link href={`/admin/pflegedoku/massnahmenplan/${p.id}`} style={pflegeSecondaryBtn}>Öffnen</Link></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (!plan) return <div className="admin-page"><Banner tone="danger">{error || 'Maßnahmenplan nicht gefunden.'}</Banner></div>

  // ── Plandetail ────────────────────────────────────────────────
  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>{plan.titel}</h1>
          <p className="admin-subtitle">
            Version {plan.version} · gültig ab {formatDate(plan.gueltig_von)}
            {plan.gueltig_bis && ` bis ${formatDate(plan.gueltig_bis)}`}
            {plan.freigegeben_am && ` · freigegeben am ${formatDate(plan.freigegeben_am)}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StatusBadge label={statusMeta(PFLEGE_PLAN_STATUS, plan.status).label} color={statusMeta(PFLEGE_PLAN_STATUS, plan.status).color} />
          <Link href={`/admin/pflegedoku/massnahmenplan/${plan.client_id}`} style={pflegeSecondaryBtn}>Alle Pläne</Link>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {hinweis && <Banner tone="success">{hinweis}</Banner>}
      {gesperrt && <Banner tone="info">Dieser Plan ist gesperrt — Plan und Maßnahmen sind unveränderlich.</Banner>}

      <Karte titel="Plandaten">
        <FeldRaster>
          <TextFeld label="Titel" value={planForm.titel} onChange={v => setPlanForm(f => ({ ...f, titel: v }))} disabled={gesperrt} />
          <AuswahlFeld label="Plantyp" value={planForm.planTyp} onChange={v => setPlanForm(f => ({ ...f, planTyp: v }))} optionen={PFLEGE_PLAN_TYP} disabled={gesperrt} />
          <TextFeld label="Gültig von" type="date" value={planForm.gueltigVon} onChange={v => setPlanForm(f => ({ ...f, gueltigVon: v }))} disabled={gesperrt} />
          <TextFeld label="Gültig bis" type="date" value={planForm.gueltigBis} onChange={v => setPlanForm(f => ({ ...f, gueltigBis: v }))} disabled={gesperrt} />
        </FeldRaster>
        <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          <TextBereich label="Betreuungsziele" value={planForm.betreuungsziele} onChange={v => setPlanForm(f => ({ ...f, betreuungsziele: v }))} disabled={gesperrt} />
          <TextBereich label="Pflegeziele" value={planForm.pflegeziele} onChange={v => setPlanForm(f => ({ ...f, pflegeziele: v }))} disabled={gesperrt} />
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!gesperrt && <button onClick={planSpeichern} disabled={busy} style={pflegePrimaryBtn}>Speichern</button>}
          {plan.status === 'entwurf' && !gesperrt && (
            <button onClick={freigeben} disabled={busy} style={pflegePrimaryBtn}>Plan freigeben</button>
          )}
          {plan.status === 'aktiv' && (
            <button onClick={neueVersion} disabled={busy} style={pflegeSecondaryBtn}>Neue Version erstellen</button>
          )}
          <button onClick={sperreUmschalten} disabled={busy} style={pflegeSecondaryBtn}>
            {plan.gesperrt ? 'Sperre aufheben' : 'Plan sperren'}
          </button>
        </div>
      </Karte>

      <Karte
        titel={`Maßnahmen (${massnahmen.length})`}
        aktion={!gesperrt ? <button onClick={() => setZeigeMassnahmeForm(v => !v)} style={pflegePrimaryBtn}>+ Maßnahme</button> : undefined}
      >
        {zeigeMassnahmeForm && (
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <FeldRaster>
              <AuswahlFeld label="Kategorie" value={massnahmeForm.kategorie} onChange={v => setMassnahmeForm(f => ({ ...f, kategorie: v }))} optionen={PFLEGE_MASSNAHME_KATEGORIE} />
              <TextFeld label="Titel *" value={massnahmeForm.titel} onChange={v => setMassnahmeForm(f => ({ ...f, titel: v }))} />
              <AuswahlFeld label="Priorität" value={massnahmeForm.prioritaet} onChange={v => setMassnahmeForm(f => ({ ...f, prioritaet: v }))} optionen={PFLEGE_PRIORITAET} />
              <TextFeld label="Häufigkeit" value={massnahmeForm.haeufigkeit} onChange={v => setMassnahmeForm(f => ({ ...f, haeufigkeit: v }))} placeholder="z. B. 2× wöchentlich" />
              <TextFeld label="Verantwortlich" value={massnahmeForm.verantwortlich} onChange={v => setMassnahmeForm(f => ({ ...f, verantwortlich: v }))} />
              <TextFeld label="Beginn" type="date" value={massnahmeForm.beginnDatum} onChange={v => setMassnahmeForm(f => ({ ...f, beginnDatum: v }))} />
              <TextFeld label="Ende" type="date" value={massnahmeForm.endeDatum} onChange={v => setMassnahmeForm(f => ({ ...f, endeDatum: v }))} />
              <TextFeld label="Sortierung" type="number" value={massnahmeForm.sortierung} onChange={v => setMassnahmeForm(f => ({ ...f, sortierung: v }))} />
            </FeldRaster>
            <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
              <TextBereich label="Beschreibung" value={massnahmeForm.beschreibung} onChange={v => setMassnahmeForm(f => ({ ...f, beschreibung: v }))} rows={2} />
              <TextBereich label="Ziel" value={massnahmeForm.ziel} onChange={v => setMassnahmeForm(f => ({ ...f, ziel: v }))} rows={2} />
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button onClick={massnahmeAnlegen} disabled={busy || !massnahmeForm.titel} style={pflegePrimaryBtn}>Speichern</button>
              <button onClick={() => setZeigeMassnahmeForm(false)} style={pflegeSecondaryBtn}>Abbrechen</button>
            </div>
          </div>
        )}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>#</th><th>Titel</th><th>Kategorie</th><th>Häufigkeit</th><th>Priorität</th><th>Status</th><th>Aktionen</th></tr>
            </thead>
            <tbody>
              {massnahmen.length === 0
                ? <EmptyRow colSpan={7}>Noch keine Maßnahmen — ein Plan ohne Maßnahmen kann nicht freigegeben werden</EmptyRow>
                : massnahmen.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontSize: 13, color: 'var(--ink4)' }}>{m.sortierung}</td>
                    <td style={{ fontWeight: 600 }}>{m.titel}{m.ziel && <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink4)' }}>{m.ziel}</div>}</td>
                    <td><StatusBadge label={statusMeta(PFLEGE_MASSNAHME_KATEGORIE, m.kategorie).label} color={statusMeta(PFLEGE_MASSNAHME_KATEGORIE, m.kategorie).color} /></td>
                    <td style={{ fontSize: 13 }}>{m.haeufigkeit || '—'}</td>
                    <td><StatusBadge label={statusMeta(PFLEGE_PRIORITAET, m.prioritaet).label} color={statusMeta(PFLEGE_PRIORITAET, m.prioritaet).color} /></td>
                    <td><StatusBadge label={statusMeta(PFLEGE_MASSNAHME_STATUS, m.status).label} color={statusMeta(PFLEGE_MASSNAHME_STATUS, m.status).color} /></td>
                    <td>
                      {!gesperrt && (
                        <select
                          value={m.status}
                          onChange={e => massnahmeStatus(m.id, e.target.value)}
                          disabled={busy}
                          style={{ ...pflegeMiniBtn, padding: '4px 6px' }}
                        >
                          {MASSNAHME_STATUS_WERTE.map(s => (
                            <option key={s} value={s}>{statusMeta(PFLEGE_MASSNAHME_STATUS, s).label}</option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Karte>

      <div style={{ display: 'flex', gap: 8 }}>
        <Link href={`/admin/pflegedoku/verlauf/${plan.client_id}`} style={pflegeSecondaryBtn}>Verlaufsdokumentation →</Link>
        <Link href="/admin/pflegedoku" style={pflegeSecondaryBtn}>← Übersicht</Link>
      </div>
    </div>
  )
}
