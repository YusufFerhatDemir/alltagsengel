'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  statusMeta, fullName, VERTRAGSSTATUS, QUALIFICATION_LEVEL,
} from '@/lib/admin/ops'
import { StatusBadge, SearchInput, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { logger } from '@/lib/logger'
const log = logger.child('admin:personal')

interface Row {
  id: string
  name: string
  vertragsstatus: string
  qualifikationsstufe: string
  wochenstunden_soll: number | null
  einsatzfreigabe: boolean
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const LEER_FORM = {
  vorname: '', nachname: '', email: '', telefon: '',
  qualifikationsstufe: 'betreuungskraft_45a', vertragsstatus: 'aktiv',
  eintrittsdatum: '', wochenstundenSoll: '',
}

export default function PersonalPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [ladefehler, setLadefehler] = useState('')
  const [zeigeForm, setZeigeForm] = useState(false)
  const [form, setForm] = useState(LEER_FORM)
  const [speichert, setSpeichert] = useState(false)
  const [formFehler, setFormFehler] = useState('')
  const [erfolg, setErfolg] = useState('')

  async function load() {
    try {
      const res = await fetch('/api/personal/stammdaten')
      if (!res.ok) {
        // Ein stiller console.error sah aus wie „noch keine Mitarbeiter".
        const d = await res.json().catch(() => ({}))
        setLadefehler(d.error || `Stammdaten konnten nicht geladen werden (HTTP ${res.status}).`)
        setLoading(false)
        return
      }
      setLadefehler('')
      const data = await res.json()
      setRows((data.stammdaten || data || []).map((r: any) => ({
        id: r.id || r.caregiver_id,
        name: r.name || fullName(r),
        vertragsstatus: r.vertragsstatus || 'aktiv',
        qualifikationsstufe: r.qualifikationsstufe || r.qualification_level || '—',
        wochenstunden_soll: r.wochenstunden_soll ?? r.weekly_hours_target ?? null,
        einsatzfreigabe: r.einsatzfreigabe ?? r.deployment_cleared ?? false,
      })))
    } catch (err) {
      setLadefehler('Netzwerkfehler beim Laden der Stammdaten.')
      log.errorWithException('Personal laden fehlgeschlagen', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function anlegen() {
    if (!form.vorname.trim() || !form.nachname.trim()) {
      setFormFehler('Vor- und Nachname sind Pflichtfelder.')
      return
    }
    setSpeichert(true); setFormFehler(''); setErfolg('')
    try {
      const res = await fetch('/api/personal/stammdaten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vorname: form.vorname.trim(),
          nachname: form.nachname.trim(),
          email: form.email.trim() || null,
          telefon: form.telefon.trim() || null,
          qualifikationsstufe: form.qualifikationsstufe,
          vertragsstatus: form.vertragsstatus,
          eintrittsdatum: form.eintrittsdatum || null,
          wochenstundenSoll: form.wochenstundenSoll ? Number(form.wochenstundenSoll) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setFormFehler(data.error || 'Anlegen fehlgeschlagen.'); return }
      setErfolg(
        `${form.vorname} ${form.nachname} angelegt — noch OHNE Einsatzfreigabe. ` +
        'Die Freigabe wird unter „Einsatzfreigabe" nach Prüfung der Unterlagen erteilt.'
      )
      setForm(LEER_FORM)
      setZeigeForm(false)
      await load()
    } catch {
      setFormFehler('Netzwerkfehler beim Anlegen.')
    } finally {
      setSpeichert(false)
    }
  }

  const feldStil: React.CSSProperties = {
    padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8,
    fontSize: 14, width: '100%', background: 'var(--coal2)', color: 'var(--ink)',
    fontFamily: 'inherit',
  }
  const labelStil: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block', color: 'var(--ink4)',
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'all' && r.vertragsstatus !== filter) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q)
    })
  }, [rows, filter, search])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Personal</h1>
          <p className="admin-subtitle">{rows.length} Mitarbeiter insgesamt</p>
        </div>
        <button
          style={primaryBtn}
          onClick={() => { setZeigeForm(!zeigeForm); setFormFehler(''); setErfolg('') }}
        >
          {zeigeForm ? 'Abbrechen' : '+ Neuen Mitarbeiter anlegen'}
        </button>
      </div>

      {ladefehler && <Banner tone="danger">{ladefehler}</Banner>}
      {erfolg && <Banner tone="success">{erfolg}</Banner>}

      {zeigeForm && (
        <div style={{
          background: 'var(--coal2)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 20, marginBottom: 20,
        }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Neuen Mitarbeiter aufnehmen</h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink4)' }}>
            Der Mitarbeiter wird ohne Einsatzfreigabe angelegt. Erst nach Prüfung von
            Führungszeugnis, Erste-Hilfe-Nachweis und Qualifikation wird er unter
            „Einsatzfreigabe" freigeschaltet.
          </p>

          {formFehler && <Banner tone="danger">{formFehler}</Banner>}

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 12, marginBottom: 16,
          }}>
            <div>
              <label style={labelStil}>Vorname *</label>
              <input style={feldStil} value={form.vorname}
                onChange={e => setForm(f => ({ ...f, vorname: e.target.value }))} />
            </div>
            <div>
              <label style={labelStil}>Nachname *</label>
              <input style={feldStil} value={form.nachname}
                onChange={e => setForm(f => ({ ...f, nachname: e.target.value }))} />
            </div>
            <div>
              <label style={labelStil}>E-Mail</label>
              <input style={feldStil} type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label style={labelStil}>Telefon</label>
              <input style={feldStil} value={form.telefon}
                onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))} />
            </div>
            <div>
              <label style={labelStil}>Qualifikation</label>
              <select style={feldStil} value={form.qualifikationsstufe}
                onChange={e => setForm(f => ({ ...f, qualifikationsstufe: e.target.value }))}>
                {Object.entries(QUALIFICATION_LEVEL).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStil}>Vertragsstatus</label>
              <select style={feldStil} value={form.vertragsstatus}
                onChange={e => setForm(f => ({ ...f, vertragsstatus: e.target.value }))}>
                {Object.entries(VERTRAGSSTATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStil}>Eintrittsdatum</label>
              <input style={feldStil} type="date" value={form.eintrittsdatum}
                onChange={e => setForm(f => ({ ...f, eintrittsdatum: e.target.value }))} />
            </div>
            <div>
              <label style={labelStil}>Wochenstunden-Soll</label>
              <input style={feldStil} type="number" min="0" max="60" step="0.5"
                value={form.wochenstundenSoll}
                onChange={e => setForm(f => ({ ...f, wochenstundenSoll: e.target.value }))} />
            </div>
          </div>

          <button style={{ ...primaryBtn, opacity: speichert ? 0.6 : 1 }}
            onClick={anlegen} disabled={speichert}>
            {speichert ? 'Wird angelegt…' : 'Mitarbeiter anlegen'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Name suchen..." />
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--coal2)', color: 'var(--ink)', fontSize: 14,
            fontFamily: "'Jost',sans-serif", cursor: 'pointer',
          }}
        >
          <option value="all">Alle Vertragsstatus</option>
          {Object.entries(VERTRAGSSTATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {loading ? <p>Laden...</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Vertragsstatus</th>
                <th>Qualifikation</th>
                <th>Wochenstunden-Soll</th>
                <th>Einsatzfreigabe</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={5}>
                  {search || filter !== 'all' ? 'Keine Treffer' : 'Noch keine Mitarbeiter vorhanden'}
                </EmptyRow>
              ) : filtered.map(row => {
                const vs = statusMeta(VERTRAGSSTATUS, row.vertragsstatus)
                const qs = statusMeta(QUALIFICATION_LEVEL, row.qualifikationsstufe)
                return (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>
                      <Link href={`/admin/personal/${row.id}`} style={{ color: 'var(--gold)', textDecoration: 'none' }}>
                        {row.name}
                      </Link>
                    </td>
                    <td><StatusBadge label={vs.label} color={vs.color} /></td>
                    <td><StatusBadge label={qs.label} color={qs.color} /></td>
                    <td>{row.wochenstunden_soll != null ? `${row.wochenstunden_soll} h` : '—'}</td>
                    <td>
                      <span style={{
                        display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                        background: row.einsatzfreigabe ? '#5CB882' : '#D04B3B',
                      }} />
                      <span style={{ marginLeft: 6, fontSize: 13 }}>
                        {row.einsatzfreigabe ? 'Freigegeben' : 'Gesperrt'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
