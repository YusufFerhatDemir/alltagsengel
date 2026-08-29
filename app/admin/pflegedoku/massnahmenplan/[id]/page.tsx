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
  PFLEGE_EVALUATION_FOLGERUNG, PFLEGE_MASSNAHME_KATEGORIE, PFLEGE_MASSNAHME_STATUS,
  PFLEGE_PLAN_STATUS, PFLEGE_PLAN_TYP, PFLEGE_PRIORITAET, PFLEGE_ZIELERREICHUNG,
  daysUntil, formatDate, statusMeta,
} from '@/lib/admin/ops'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'
import {
  AuswahlFeld, FeldRaster, Karte, TextBereich, TextFeld,
  pflegeMiniBtn, pflegePrimaryBtn, pflegeSecondaryBtn,
} from '@/components/admin/PflegeUI'
import {
  EVALUATION_FOLGERUNG_WERTE, MASSNAHME_STATUS_WERTE, ZIELERREICHUNG_WERTE,
  type PflegeMassnahme, type PflegeMassnahmeEvaluation, type PflegeMassnahmenplan,
} from '@/lib/pflege/types'

const MASSNAHME_LEER = {
  kategorie: 'koerperpflege', titel: '', beschreibung: '', ziel: '',
  haeufigkeit: '', verantwortlich: '', prioritaet: 'normal',
  beginnDatum: '', endeDatum: '', sortierung: '0',
  // Leer heisst „keine Wiedervorlage". Kein Vorgabewert: welcher Abstand
  // fachlich richtig ist, haengt an der Massnahme, und eine erfundene Frist
  // sieht im Nachhinein wie eine getroffene Verabredung aus.
  evaluationIntervallTage: '',
}

// Die Auswahl fuer die Beurteilung. Reihenfolge wie in lib/pflege/types.ts,
// damit Oberflaeche und Datenbank dieselbe Liste zeigen.
const ZIELERREICHUNG_OPTIONEN = Object.fromEntries(
  ZIELERREICHUNG_WERTE.map(w => [w, PFLEGE_ZIELERREICHUNG[w]]),
) as Record<string, { label: string; color: string }>

const FOLGERUNG_OPTIONEN = Object.fromEntries(
  EVALUATION_FOLGERUNG_WERTE.map(w => [w, PFLEGE_EVALUATION_FOLGERUNG[w]]),
) as Record<string, { label: string; color: string }>

const EVALUATION_LEER = {
  zielerreichung: 'teilweise_erreicht',
  bewertung: '',
  folgerung: 'fortfuehren',
  evaluiertAm: '',
  naechsteEvaluation: '',
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
  // Evaluation: offene Massnahme, ihre bisherigen Beurteilungen, das Formular.
  const [evalFuer, setEvalFuer] = useState<PflegeMassnahme | null>(null)
  const [evalListe, setEvalListe] = useState<PflegeMassnahmeEvaluation[] | null>(null)
  const [evalForm, setEvalForm] = useState(EVALUATION_LEER)
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
          // Leer = keine Wiedervorlage. `Number('')` waere 0 und damit ein
          // Wert, den der CHECK (1–365) zu Recht abweist.
          evaluationIntervallTage: massnahmeForm.evaluationIntervallTage
            ? Number(massnahmeForm.evaluationIntervallTage)
            : null,
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

  // ── Evaluation (Schritt 6 des Pflegeprozesses) ───────────────────
  //
  // Die Beurteilung wird ANGELEGT, nie geaendert: `pflege_massnahmen_evaluationen`
  // ist per Trigger unveraenderlich (trg_pme_unveraenderlich_update/-delete).
  // Deshalb gibt es hier bewusst kein Bearbeiten und kein Loeschen — eine
  // Reihe von Beurteilungen, die sich nachtraeglich glaetten laesst, ist als
  // Nachweis nichts wert.
  async function evaluationOeffnen(massnahme: PflegeMassnahme) {
    setEvalFuer(massnahme)
    setEvalForm(EVALUATION_LEER)
    setEvalListe(null)
    setError('')
    try {
      const res = await fetch(`/api/pflege/evaluationen?massnahmeId=${massnahme.id}`)
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Beurteilungen konnten nicht geladen werden.'); return }
      setEvalListe(body.evaluationen || [])
    } catch {
      setError('Beurteilungen konnten nicht geladen werden.')
    }
  }

  async function evaluationSpeichern() {
    if (!evalFuer) return
    setBusy(true); setError(''); setHinweis('')
    try {
      const res = await fetch('/api/pflege/evaluationen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          massnahmeId: evalFuer.id,
          zielerreichung: evalForm.zielerreichung,
          bewertung: evalForm.bewertung,
          folgerung: evalForm.folgerung,
          // Leere Felder NICHT als leerer String senden: die API unterscheidet
          // „nicht angegeben" von „ausdruecklich gesetzt". Beim Datum vergibt
          // sie dann heute, bei der Wiedervorlage rechnet der DB-Trigger sie
          // aus dem Intervall der Massnahme — oder es gibt eben keine.
          evaluiertAm: evalForm.evaluiertAm || undefined,
          naechsteEvaluation: evalForm.naechsteEvaluation || null,
        }),
      })
      const body = await res.json()
      if (!res.ok) { setError(body.error || 'Beurteilung konnte nicht gespeichert werden.'); return }
      setEvalForm(EVALUATION_LEER)
      setHinweis('Beurteilung festgehalten.')
      // Neu laden statt anzuhaengen: der DB-Trigger schreibt die Wiedervorlage
      // an der Massnahme fort, und die steht in der Tabelle darunter.
      await load()
      const aktualisiert = await fetch(`/api/pflege/evaluationen?massnahmeId=${evalFuer.id}`)
        .then(r => r.json()).catch(() => null)
      if (aktualisiert?.evaluationen) setEvalListe(aktualisiert.evaluationen)
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
              <TextFeld
                label="Evaluation alle … Tage"
                type="number"
                value={massnahmeForm.evaluationIntervallTage}
                onChange={v => setMassnahmeForm(f => ({ ...f, evaluationIntervallTage: v }))}
                placeholder="leer = keine Wiedervorlage"
              />
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
              <tr><th>#</th><th>Titel</th><th>Kategorie</th><th>Häufigkeit</th><th>Priorität</th><th>Status</th><th>Wiedervorlage</th><th>Aktionen</th></tr>
            </thead>
            <tbody>
              {massnahmen.length === 0
                ? <EmptyRow colSpan={8}>Noch keine Maßnahmen — ein Plan ohne Maßnahmen kann nicht freigegeben werden</EmptyRow>
                : massnahmen.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontSize: 13, color: 'var(--ink4)' }}>{m.sortierung}</td>
                    <td style={{ fontWeight: 600 }}>{m.titel}{m.ziel && <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink4)' }}>{m.ziel}</div>}</td>
                    <td><StatusBadge label={statusMeta(PFLEGE_MASSNAHME_KATEGORIE, m.kategorie).label} color={statusMeta(PFLEGE_MASSNAHME_KATEGORIE, m.kategorie).color} /></td>
                    <td style={{ fontSize: 13 }}>{m.haeufigkeit || '—'}</td>
                    <td><StatusBadge label={statusMeta(PFLEGE_PRIORITAET, m.prioritaet).label} color={statusMeta(PFLEGE_PRIORITAET, m.prioritaet).color} /></td>
                    <td><StatusBadge label={statusMeta(PFLEGE_MASSNAHME_STATUS, m.status).label} color={statusMeta(PFLEGE_MASSNAHME_STATUS, m.status).color} /></td>
                    <td style={{ fontSize: 13 }}>
                      {/* Ueberfaellig wird ausgewiesen, nicht nur das Datum
                          gezeigt: „steht seit 12 Tagen an" ist die Angabe,
                          nach der bei einer Pruefung nach § 114 SGB XI
                          gefragt wird. Abgeschlossene und abgebrochene
                          Massnahmen sind nicht faellig, sondern vorbei —
                          genau wie im Teilindex der Migration. */}
                      {m.naechste_evaluation
                        ? (() => {
                            const tage = daysUntil(m.naechste_evaluation)
                            const offen = m.status === 'geplant' || m.status === 'aktiv'
                            const ueberfaellig = offen && tage !== null && tage < 0
                            return (
                              <span style={{ color: ueberfaellig ? 'var(--danger, #D04B3B)' : undefined, fontWeight: ueberfaellig ? 600 : 400 }}>
                                {formatDate(m.naechste_evaluation)}
                                {ueberfaellig && ` · ${Math.abs(tage)} Tage überfällig`}
                              </span>
                            )
                          })()
                        : <span style={{ color: 'var(--ink4)' }}>—</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
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
                        {/* Auch bei gesperrtem Plan lesbar: die Sperre gilt
                            Plan und Massnahmen, nicht der Beurteilung. Ob
                            geschrieben werden darf, entscheidet weiter unten
                            der Plan-Status — ein Entwurf hat nie gewirkt. */}
                        <button onClick={() => evaluationOeffnen(m)} style={pflegeMiniBtn}>
                          Beurteilen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Karte>

      {evalFuer && (
        <Karte
          titel={`Evaluation — ${evalFuer.titel}`}
          aktion={<button onClick={() => { setEvalFuer(null); setEvalListe(null) }} style={pflegeSecondaryBtn}>Schließen</button>}
        >
          {evalFuer.ziel
            ? <p style={{ marginTop: 0, color: 'var(--ink4)', fontSize: 13 }}>Ziel: {evalFuer.ziel}</p>
            : <Banner tone="info">Diese Maßnahme hat kein festgehaltenes Ziel — beurteilt wird dann, was tatsächlich vereinbart war.</Banner>}

          {/* Ein Plan im Entwurf hat nie gewirkt. Die API weist das mit 409 ab
              (lib/pflege/evaluation.ts) und der DB-Trigger
              pflege_evaluation_plan_in_kraft ebenso; hier steht die Fassung,
              die der Nutzer vor dem Absenden liest statt danach. */}
          {plan.status === 'entwurf' ? (
            <Banner tone="info">
              Der Plan ist noch ein Entwurf und hat nie gewirkt — er lässt sich deshalb nicht beurteilen.
              Erst freigeben, dann evaluieren. Die bisherigen Beurteilungen bleiben unten lesbar.
            </Banner>
          ) : (
            <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
              <FeldRaster>
                <AuswahlFeld
                  label="Zielerreichung *"
                  value={evalForm.zielerreichung}
                  onChange={v => setEvalForm(f => ({ ...f, zielerreichung: v }))}
                  optionen={ZIELERREICHUNG_OPTIONEN}
                />
                <AuswahlFeld
                  label="Folgerung *"
                  value={evalForm.folgerung}
                  onChange={v => setEvalForm(f => ({ ...f, folgerung: v }))}
                  optionen={FOLGERUNG_OPTIONEN}
                />
                <TextFeld
                  label="Beurteilt am"
                  type="date"
                  value={evalForm.evaluiertAm}
                  onChange={v => setEvalForm(f => ({ ...f, evaluiertAm: v }))}
                />
                <TextFeld
                  label="Nächste Beurteilung"
                  type="date"
                  value={evalForm.naechsteEvaluation}
                  onChange={v => setEvalForm(f => ({ ...f, naechsteEvaluation: v }))}
                  placeholder={evalFuer.evaluation_intervall_tage
                    ? `leer = automatisch in ${evalFuer.evaluation_intervall_tage} Tagen`
                    : 'leer = keine Wiedervorlage'}
                />
              </FeldRaster>
              <div style={{ marginTop: 12 }}>
                <TextBereich
                  label="Beurteilung im Klartext *"
                  value={evalForm.bewertung}
                  onChange={v => setEvalForm(f => ({ ...f, bewertung: v }))}
                  rows={3}
                  placeholder="Woran ist die Zielerreichung festgemacht? Ein Häkchen ist bei einer Prüfung nichts wert."
                />
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={evaluationSpeichern}
                  disabled={busy || evalForm.bewertung.trim().length < 3}
                  style={pflegePrimaryBtn}
                >
                  Beurteilung festhalten
                </button>
                <span style={{ fontSize: 12, color: 'var(--ink4)' }}>
                  Eine festgehaltene Beurteilung ist unveränderlich und lässt sich nicht löschen.
                </span>
              </div>
            </div>
          )}

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Beurteilt am</th><th>Zielerreichung</th><th>Folgerung</th><th>Beurteilung</th><th>Nächste</th></tr>
              </thead>
              <tbody>
                {evalListe === null
                  ? <EmptyRow colSpan={5}>Laden…</EmptyRow>
                  : evalListe.length === 0
                    ? <EmptyRow colSpan={5}>Noch nicht beurteilt — der Regelkreis ist an dieser Maßnahme offen</EmptyRow>
                    : evalListe.map(e => (
                      <tr key={e.id}>
                        <td style={{ fontSize: 13 }}>{formatDate(e.evaluiert_am)}</td>
                        <td><StatusBadge label={statusMeta(PFLEGE_ZIELERREICHUNG, e.zielerreichung).label} color={statusMeta(PFLEGE_ZIELERREICHUNG, e.zielerreichung).color} /></td>
                        <td><StatusBadge label={statusMeta(PFLEGE_EVALUATION_FOLGERUNG, e.folgerung).label} color={statusMeta(PFLEGE_EVALUATION_FOLGERUNG, e.folgerung).color} /></td>
                        <td style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{e.bewertung}</td>
                        <td style={{ fontSize: 13 }}>{e.naechste_evaluation ? formatDate(e.naechste_evaluation) : '—'}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </Karte>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <Link href={`/admin/pflegedoku/verlauf/${plan.client_id}`} style={pflegeSecondaryBtn}>Verlaufsdokumentation →</Link>
        <Link href="/admin/pflegedoku" style={pflegeSecondaryBtn}>← Übersicht</Link>
      </div>
    </div>
  )
}
