'use client'
import { datumBerlin } from '@/lib/utils/timezone';
import { useCallback, useEffect, useMemo, useState } from 'react'
import { statusMeta, formatTime, DIENSTPLAN_STATUS, DIENSTPLAN_TYP, WEEKDAYS } from '@/lib/admin/ops'
import { StatusBadge, EmptyRow, Banner } from '@/components/admin/OpsUI'
import type { DienstplanSchicht } from '@/lib/personal/types'
import { logger } from '@/lib/logger';
const log = logger.child('admin:dienstplan');

interface Eintrag {
  id: string
  datum: string
  caregiver_name: string
  caregiver_id: string
  start_zeit: string
  end_zeit: string
  status: string
  typ: string
  schicht_farbe: string | null
  konflikt: boolean
  kunde_name: string | null
  notizen: string | null
}

interface CreateForm {
  datum: string
  caregiverId: string
  startZeit: string
  endZeit: string
  typ: string
  notizen: string
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}

const secondaryBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--ink3)', fontWeight: 500,
  background: 'var(--coal2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatISO(d: Date): string {
  return datumBerlin(d)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export default function DienstplanPage() {
  const [eintraege, setEintraege] = useState<Eintrag[]>([])
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()))
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [form, setForm] = useState<CreateForm>({
    datum: '', caregiverId: '', startZeit: '08:00', endZeit: '16:00', typ: 'regulaer', notizen: '',
  })

  // ── Schichtvorlagen ───────────────────────────────────────────────
  // `dienstplan_schichten` und /api/personal/dienstplan/schichten waren
  // vollstaendig — Anlegen, Auflisten, Aendern — und wurden von keiner
  // Stelle aufgerufen. Die Tabelle traegt live 0 Zeilen: eine Vorlage, die
  // sich nicht anlegen laesst, wird auch nicht benutzt.
  //
  // Ohne sie wurden Beginn und Ende bei JEDEM Eintrag von Hand getippt.
  // Das ist nicht nur muehsam: die Zeiten eines Dienstes sind die
  // Grundlage der ArbZG-Pruefung (§ 3, § 4, § 5), und ein Vertipper darin
  // ist ein Verstoss, den niemand als Vertipper erkennt.
  const [schichten, setSchichten] = useState<DienstplanSchicht[]>([])
  const [zeigeSchichten, setZeigeSchichten] = useState(false)
  const [schichtForm, setSchichtForm] = useState({
    bezeichnung: '', kuerzel: '', startZeit: '06:00', endZeit: '14:00', pauseMinuten: '30',
  })
  const [schichtFehler, setSchichtFehler] = useState<string | null>(null)
  const [schichtBusy, setSchichtBusy] = useState(false)

  const weekEnd = addDays(weekStart, 6)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const von = formatISO(weekStart)
        const bis = formatISO(weekEnd)
        const res = await fetch(`/api/personal/dienstplan/eintraege?datumVon=${von}&datumBis=${bis}`)
        if (!res.ok) { log.error('Dienstplan laden fehlgeschlagen'); setLoading(false); return }
        const data = await res.json()
        setEintraege((data.eintraege || data || []).map((r: any) => ({
          id: r.id,
          datum: r.datum || r.date,
          caregiver_name: r.caregiver_name || r.mitarbeiter || '—',
          caregiver_id: r.caregiver_id,
          start_zeit: r.start_zeit || '',
          end_zeit: r.end_zeit || '',
          status: r.status || 'geplant',
          typ: r.typ || r.type || 'regulaer',
          schicht_farbe: r.schicht_farbe || r.shift_color || null,
          konflikt: r.konflikt ?? r.conflict ?? false,
          kunde_name: r.kunde_name || r.client_name || null,
          notizen: r.notizen || null,
        })))
      } catch (err) {
        log.errorWithException('Dienstplan laden fehlgeschlagen', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [weekStart])

  const ladeSchichten = useCallback(async () => {
    try {
      // `nurAktive=false`: die Verwaltung soll auch die stillgelegten sehen —
      // sonst laesst sich eine versehentlich deaktivierte Vorlage nicht
      // wiederfinden und schon gar nicht wieder einschalten.
      const res = await fetch('/api/personal/dienstplan/schichten?nurAktive=false')
      if (!res.ok) return
      const data = await res.json()
      setSchichten(Array.isArray(data) ? data : (data.schichten ?? []))
    } catch {
      /* Der Wochenplan bleibt nutzbar */
    }
  }, [])

  useEffect(() => { ladeSchichten() }, [ladeSchichten])

  async function schichtAnlegen() {
    setSchichtBusy(true)
    setSchichtFehler(null)
    try {
      const res = await fetch('/api/personal/dienstplan/schichten', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bezeichnung: schichtForm.bezeichnung,
          // Leer heisst „kein Kuerzel", nicht „leeres Kuerzel": die Spalte
          // ist nullable, und ein leerer String saehe im Plan aus wie eine
          // Vorlage ohne Namen.
          kuerzel: schichtForm.kuerzel.trim() || null,
          startZeit: schichtForm.startZeit,
          endZeit: schichtForm.endZeit,
          pauseMinuten: Number(schichtForm.pauseMinuten) || 0,
        }),
      })
      const body = await res.json()
      if (!res.ok) { setSchichtFehler(body.error || 'Vorlage konnte nicht angelegt werden.'); return }
      setSchichtForm({ bezeichnung: '', kuerzel: '', startZeit: '06:00', endZeit: '14:00', pauseMinuten: '30' })
      await ladeSchichten()
    } catch {
      setSchichtFehler('Vorlage konnte nicht angelegt werden.')
    } finally { setSchichtBusy(false) }
  }

  async function schichtUmschalten(schicht: DienstplanSchicht) {
    setSchichtFehler(null)
    try {
      // Stilllegen statt loeschen: eine Vorlage kann in bereits geplanten
      // Diensten stecken, und ein Loeschen wuerde deren Herkunft entfernen.
      const res = await fetch(`/api/personal/dienstplan/schichten/${schicht.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktiv: !schicht.aktiv }),
      })
      const body = await res.json()
      if (!res.ok) { setSchichtFehler(body.error || 'Änderung fehlgeschlagen.'); return }
      await ladeSchichten()
    } catch {
      setSchichtFehler('Änderung fehlgeschlagen.')
    }
  }

  /** Vorlage in das Anlageformular uebernehmen — Beginn und Ende aus einer Hand. */
  function vorlageUebernehmen(id: string) {
    const s = schichten.find(x => x.id === id)
    if (!s) return
    // `slice(0, 5)`: die Datenbank liefert `HH:MM:SS`, ein `<input type=time>`
    // erwartet `HH:MM` und zeigt sonst gar nichts an.
    setForm(f => ({ ...f, startZeit: s.start_zeit.slice(0, 5), endZeit: s.end_zeit.slice(0, 5) }))
  }

  // Group entries by date
  const days = useMemo(() => {
    const map = new Map<string, Eintrag[]>()
    for (let i = 0; i < 7; i++) {
      const d = formatISO(addDays(weekStart, i))
      map.set(d, [])
    }
    for (const e of eintraege) {
      const existing = map.get(e.datum)
      if (existing) existing.push(e)
    }
    return map
  }, [eintraege, weekStart])

  const conflicts = eintraege.filter(e => e.konflikt)

  async function createEintrag() {
    if (!form.datum || !form.startZeit || !form.endZeit) return
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/personal/dienstplan/eintraege', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setShowCreate(false)
        setForm({ datum: '', caregiverId: '', startZeit: '08:00', endZeit: '16:00', typ: 'regulaer', notizen: '' })
        // Reload
        const von = formatISO(weekStart)
        const bis = formatISO(weekEnd)
        const reload = await fetch(`/api/personal/dienstplan/eintraege?datumVon=${von}&datumBis=${bis}`)
        if (reload.ok) {
          const data = await reload.json()
          setEintraege((data.eintraege || data || []).map((r: any) => ({
            id: r.id, datum: r.datum || r.date,
            caregiver_name: r.caregiver_name || r.mitarbeiter || '—',
            caregiver_id: r.caregiver_id,
            start_zeit: r.start_zeit || '',
            end_zeit: r.end_zeit || '',
            status: r.status || 'geplant', typ: r.typ || r.type || 'regulaer',
            schicht_farbe: r.schicht_farbe || r.shift_color || null,
            konflikt: r.konflikt ?? r.conflict ?? false,
            kunde_name: r.kunde_name || r.client_name || null,
            notizen: r.notizen || null,
          })))
        }
      } else {
        // Bisher wurde ein Fehler (z.B. Doppelbelegung, Cross-Tenant-Sperre,
        // fehlende Einsatzfreigabe) hier still verschluckt — Nutzer sah keine
        // Rückmeldung. Jetzt wird die Fehlermeldung der API angezeigt.
        let message = 'Eintrag konnte nicht gespeichert werden.'
        try {
          const body = await res.json()
          if (body?.error) message = body.error
        } catch { /* Antwort ohne JSON-Body */ }
        setCreateError(message)
      }
    } catch (err) {
      log.errorWithException('Eintrag erstellen fehlgeschlagen', err)
      setCreateError('Eintrag konnte nicht gespeichert werden (Netzwerkfehler).')
    } finally {
      setCreating(false)
    }
  }

  const weekLabel = `${weekStart.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })} – ${weekEnd.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })}`

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>Dienstplan</h1>
          <p className="admin-subtitle">Wochenansicht — {eintraege.length} Eintr&auml;ge</p>
        </div>
        <button style={primaryBtn} onClick={() => setShowCreate(!showCreate)}>
          + Neuer Eintrag
        </button>
      </div>

      {conflicts.length > 0 && (
        <Banner tone="danger">
          <strong>{conflicts.length} Konflikte</strong> in dieser Woche erkannt.
        </Banner>
      )}

      {/* Week navigation */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
      }}>
        <button style={secondaryBtn} onClick={() => setWeekStart(addDays(weekStart, -7))}>
          &larr; Vorherige
        </button>
        <span style={{ fontWeight: 600, fontSize: 15, minWidth: 200, textAlign: 'center' }}>
          KW {getISOWeek(weekStart)} — {weekLabel}
        </span>
        <button style={secondaryBtn} onClick={() => setWeekStart(addDays(weekStart, 7))}>
          N&auml;chste &rarr;
        </button>
        <button style={{ ...secondaryBtn, marginLeft: 8 }} onClick={() => setWeekStart(getMondayOfWeek(new Date()))}>
          Heute
        </button>
      </div>

      {/* ── Schichtvorlagen ─────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <button style={secondaryBtn} onClick={() => setZeigeSchichten(v => !v)}>
          Schichtvorlagen ({schichten.filter(s => s.aktiv).length} aktiv)
        </button>
      </div>

      {zeigeSchichten && (
        <div style={{
          background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 16, marginBottom: 16,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>Schichtvorlagen</h3>
          <p style={{ fontSize: 12, color: 'var(--ink4)', margin: '0 0 12px' }}>
            Beginn, Ende und Pause einmal festlegen statt bei jedem Eintrag zu tippen.
            Eine Vorlage wird stillgelegt, nicht gelöscht — sie kann in bereits geplanten
            Diensten stecken.
          </p>
          {schichtFehler && <div style={{ marginBottom: 12 }}><Banner tone="danger">{schichtFehler}</Banner></div>}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 16 }}>
            <label style={{ fontSize: 13 }}>
              Bezeichnung<br />
              <input
                type="text" value={schichtForm.bezeichnung}
                onChange={e => setSchichtForm(f => ({ ...f, bezeichnung: e.target.value }))}
                placeholder="z. B. Frühdienst" style={inputStyle}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              Kürzel<br />
              <input
                type="text" value={schichtForm.kuerzel}
                onChange={e => setSchichtForm(f => ({ ...f, kuerzel: e.target.value }))}
                placeholder="F" style={{ ...inputStyle, width: 80 }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              Beginn<br />
              <input
                type="time" value={schichtForm.startZeit}
                onChange={e => setSchichtForm(f => ({ ...f, startZeit: e.target.value }))}
                style={inputStyle}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              Ende<br />
              <input
                type="time" value={schichtForm.endZeit}
                onChange={e => setSchichtForm(f => ({ ...f, endZeit: e.target.value }))}
                style={inputStyle}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              Pause (Min.)<br />
              <input
                type="number" value={schichtForm.pauseMinuten}
                onChange={e => setSchichtForm(f => ({ ...f, pauseMinuten: e.target.value }))}
                style={{ ...inputStyle, width: 100 }}
              />
            </label>
            <button
              style={primaryBtn}
              onClick={schichtAnlegen}
              disabled={schichtBusy || !schichtForm.bezeichnung.trim()}
            >
              Vorlage anlegen
            </button>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Bezeichnung</th><th>Kürzel</th><th>Zeit</th><th>Pause</th><th>Status</th><th>Aktion</th></tr>
              </thead>
              <tbody>
                {schichten.length === 0
                  ? <EmptyRow colSpan={6}>Noch keine Vorlage angelegt</EmptyRow>
                  : schichten.map(sch => (
                    <tr key={sch.id} style={{ opacity: sch.aktiv ? 1 : 0.55 }}>
                      <td style={{ fontWeight: 600 }}>{sch.bezeichnung}</td>
                      <td style={{ fontSize: 13 }}>{sch.kuerzel || '—'}</td>
                      <td style={{ fontSize: 13 }}>{sch.start_zeit.slice(0, 5)}–{sch.end_zeit.slice(0, 5)}</td>
                      <td style={{ fontSize: 13 }}>{sch.pause_minuten} Min.</td>
                      <td>
                        <StatusBadge
                          label={sch.aktiv ? 'Aktiv' : 'Stillgelegt'}
                          color={sch.aktiv ? '#5CB882' : '#999'}
                        />
                      </td>
                      <td>
                        <button style={secondaryBtn} onClick={() => schichtUmschalten(sch)}>
                          {sch.aktiv ? 'Stilllegen' : 'Wieder aktivieren'}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div style={{
          background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 16, marginBottom: 16,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Neuer Dienstplan-Eintrag</h3>
          {createError && (
            <div style={{ marginBottom: 12 }}>
              <Banner tone="danger">{createError}</Banner>
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={{ fontSize: 13 }}>
              Datum<br />
              <input type="date" value={form.datum} onChange={e => setForm({ ...form, datum: e.target.value })}
                style={inputStyle} />
            </label>
            <label style={{ fontSize: 13 }}>
              Mitarbeiter-ID<br />
              <input type="text" value={form.caregiverId} onChange={e => setForm({ ...form, caregiverId: e.target.value })}
                placeholder="UUID" style={inputStyle} />
            </label>
            {schichten.some(s => s.aktiv) && (
              <label style={{ fontSize: 13 }}>
                Schichtvorlage<br />
                {/* Setzt nur Beginn und Ende und ist danach wieder leer:
                    die Vorlage ist eine Eingabehilfe, keine Bindung. Der
                    Eintrag speichert die ZEITEN, nicht die Vorlage — wer
                    sie hinterher ändert, ändert keinen geplanten Dienst. */}
                <select
                  value=""
                  onChange={e => { vorlageUebernehmen(e.target.value); e.target.value = '' }}
                  style={inputStyle}
                >
                  <option value="">— übernehmen —</option>
                  {schichten.filter(s => s.aktiv).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.kuerzel ? `${s.kuerzel} · ` : ''}{s.bezeichnung} ({s.start_zeit.slice(0, 5)}–{s.end_zeit.slice(0, 5)})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label style={{ fontSize: 13 }}>
              Beginn<br />
              <input type="time" value={form.startZeit} onChange={e => setForm({ ...form, startZeit: e.target.value })}
                style={inputStyle} />
            </label>
            <label style={{ fontSize: 13 }}>
              Ende<br />
              <input type="time" value={form.endZeit} onChange={e => setForm({ ...form, endZeit: e.target.value })}
                style={inputStyle} />
            </label>
            <label style={{ fontSize: 13 }}>
              Typ<br />
              <select value={form.typ} onChange={e => setForm({ ...form, typ: e.target.value })} style={inputStyle}>
                {Object.entries(DIENSTPLAN_TYP).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              Bemerkung<br />
              <input type="text" value={form.notizen} onChange={e => setForm({ ...form, notizen: e.target.value })}
                placeholder="Optional" style={inputStyle} />
            </label>
            <button style={primaryBtn} onClick={createEintrag} disabled={creating}>
              {creating ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        </div>
      )}

      {/* 7-column grid */}
      {loading ? <p>Laden...</p> : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8,
          minHeight: 400,
        }}>
          {Array.from(days.entries()).map(([date, entries], i) => {
            const wd = WEEKDAYS[i]
            const isToday = date === formatISO(new Date())
            return (
              <div key={date} style={{
                background: isToday ? 'rgba(201,150,60,.08)' : 'var(--coal2)',
                border: isToday ? '2px solid var(--gold)' : '1px solid var(--border)',
                borderRadius: 12, padding: 8, minHeight: 120,
              }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.05em', color: isToday ? 'var(--gold)' : 'var(--ink4)',
                  marginBottom: 8, textAlign: 'center',
                }}>
                  {wd.short} {new Date(date + 'T12:00').toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })}
                </div>
                {entries.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--ink4)', textAlign: 'center', padding: 8 }}>—</div>
                ) : entries.map(e => {
                  const sm = statusMeta(DIENSTPLAN_STATUS, e.status)
                  return (
                    <div key={e.id} style={{
                      background: e.konflikt
                        ? 'rgba(208,75,59,.12)'
                        : e.schicht_farbe
                          ? `${e.schicht_farbe}22`
                          : 'var(--coal3)',
                      border: e.konflikt ? '1px solid rgba(208,75,59,.4)' : '1px solid transparent',
                      borderRadius: 8, padding: '6px 8px', marginBottom: 6, fontSize: 12,
                      borderLeft: e.schicht_farbe ? `3px solid ${e.schicht_farbe}` : undefined,
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{e.caregiver_name}</div>
                      <div style={{ color: 'var(--ink4)' }}>
                        {formatTime(e.start_zeit)} – {formatTime(e.end_zeit)}
                      </div>
                      {e.kunde_name && (
                        <div style={{ color: 'var(--ink4)', fontSize: 11 }}>{e.kunde_name}</div>
                      )}
                      <div style={{ marginTop: 4 }}>
                        <StatusBadge label={sm.label} color={sm.color} />
                      </div>
                      {e.konflikt && (
                        <div style={{ color: '#D04B3B', fontSize: 11, fontWeight: 600, marginTop: 2 }}>
                          Konflikt
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--coal3)', color: 'var(--ink)', fontSize: 14,
  fontFamily: "'Jost',sans-serif", marginTop: 4,
}

function getISOWeek(d: Date): number {
  const date = new Date(d.getTime())
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7))
  const week1 = new Date(date.getFullYear(), 0, 4)
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}
