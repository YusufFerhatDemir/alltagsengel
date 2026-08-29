'use client'
import { datumBerlin } from '@/lib/utils/timezone';
import { useCallback, useEffect, useMemo, useState } from 'react'
import { statusMeta, formatTime, DIENSTPLAN_STATUS, DIENSTPLAN_TYP, WEEKDAYS } from '@/lib/admin/ops'
import { StatusBadge, EmptyRow, Banner } from '@/components/admin/OpsUI'
import { DIENSTPLAN_ENDZUSTAENDE, type DienstplanSchicht } from '@/lib/personal/types'
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
  schicht_bezeichnung: string | null
  schicht_farbe: string | null
  /** Der eingeteilte Mitarbeiter ist an diesem Tag abwesend. */
  abwesend: boolean
  abwesenheit_typ: string | null
  kunde_name: string | null
  notizen: string | null
}

// ═══════════════════════════════════════════════════════════════
// WOCHENPLAN LIEST DIE SICHT, NICHT DIE TABELLE
// ═══════════════════════════════════════════════════════════════
//
// BEFUND (29.08.2026): die Seite las /api/personal/dienstplan/eintraege,
// und diese Route gibt Zeilen aus `dienstplan_eintraege` mit select('*')
// zurueck — eine Tabelle, die NUR Fremdschluessel fuehrt. Der Mapper der
// Seite griff aber nach caregiver_name, kunde_name und schicht_farbe.
// Keines dieser Felder gab es je in der Antwort: der Wochenplan zeigte an
// JEDER Stelle, an der ein Mitarbeitername stehen sollte, den Ersatzwert
// '—'. Ein Dienstplan, aus dem nicht hervorgeht, wer Dienst hat.
//
// Die Sicht `dienstplan_tagesansicht` fuehrt genau diese Felder — und
// zusaetzlich `hat_abwesenheit`: ein Dienst, der auf jemanden gebucht ist,
// der an dem Tag nicht da ist. Sie hatte bis heute keinen einzigen
// Aufrufer, weil die zugehoerige Route nur einen EINZELNEN Tag lesen
// konnte und der Wochenplan eine Woche braucht.
//
// `konflikt` ist dabei ersatzlos entfallen: das Feld wurde nie befuellt
// (die Tabelle hat es nicht, die Sicht auch nicht) und stand deshalb
// dauerhaft auf false — eine Konfliktmarkierung, die nie erschien. An
// seine Stelle tritt die Abwesenheit, die es wirklich gibt.
function zuEintrag(r: Record<string, unknown>): Eintrag {
  return {
    id: String(r.id),
    datum: String(r.datum ?? ''),
    caregiver_name: (r.caregiver_name as string) || '—',
    caregiver_id: (r.caregiver_id as string) ?? '',
    start_zeit: (r.start_zeit as string) || '',
    end_zeit: (r.end_zeit as string) || '',
    status: (r.status as string) || 'geplant',
    typ: (r.typ as string) || 'regulaer',
    schicht_bezeichnung: (r.schicht_bezeichnung as string) ?? null,
    schicht_farbe: (r.schicht_farbe as string) ?? null,
    abwesend: r.hat_abwesenheit === true,
    abwesenheit_typ: (r.abwesenheit_typ as string) ?? null,
    kunde_name: (r.client_name as string) ?? null,
    notizen: (r.notizen as string) ?? null,
  }
}

interface CreateForm {
  datum: string
  caregiverId: string
  startZeit: string
  endZeit: string
  typ: string
  notizen: string
}

/** Nur die Felder, die der Wochenplan von einer Pflegekraft braucht. */
interface Kraft {
  id: string
  first_name: string | null
  last_name: string | null
  vertragsstatus: string | null
  einsatzfreigabe: boolean | null
}

function kraftName(k: Kraft): string {
  return `${k.first_name ?? ''} ${k.last_name ?? ''}`.trim() || k.id
}

/** Die Wochenfreigabe, soweit der Wochenplan sie braucht. */
interface Freigabe {
  woche_start: string
  status: 'freigegeben' | 'zurueckgezogen'
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

  // ── Mitarbeitende zur Auswahl ─────────────────────────────────────
  // BEFUND (29.08.2026): das Anlageformular hatte an dieser Stelle ein
  // freies Textfeld mit dem Platzhalter „UUID". Wer einen Dienst plante,
  // musste die Kennung der Pflegekraft von Hand abtippen. Ein Vertipper
  // ergibt entweder einen Fehler — oder, wenn er zufaellig auf eine
  // andere gueltige Kennung faellt, einen Dienst fuer die falsche Person,
  // und DAS faellt niemandem auf, weil im Plan danach ein Name steht.
  // /api/personal/stammdaten liefert die Liste und verlangt genau das
  // Recht, das diese Seite ohnehin voraussetzt (personal.lesen).
  const [kraefte, setKraefte] = useState<Kraft[]>([])

  // ── Bearbeiten eines geplanten Dienstes ───────────────────────────
  // PATCH und DELETE auf /api/personal/dienstplan/eintraege/[id] gab es
  // seit langem; aufgerufen hat sie niemand. Ein einmal eingetragener
  // Dienst liess sich weder verschieben noch umbesetzen noch absagen —
  // und ein Dienstplan, der sich nicht aendern laesst, ist keiner: der
  // haeufigste Vorgang der Woche ist die Umplanung.
  const [bearbeitung, setBearbeitung] = useState<Eintrag | null>(null)
  const [bearbForm, setBearbForm] = useState({
    caregiverId: '', startZeit: '', endZeit: '', typ: '', status: '',
    notizen: '', aenderungGrund: '',
  })
  const [bearbFehler, setBearbFehler] = useState<string | null>(null)
  const [bearbBusy, setBearbBusy] = useState(false)

  // ── Wochenfreigabe ────────────────────────────────────────────────
  // Der Riegel aus 20260829005700 (live) sperrt in einer freigegebenen
  // Woche das Loeschen ganz und verlangt fuer jede Aenderung einen
  // eigenen Grund. Ohne diese Angabe hier kaeme die Datenbankmeldung
  // roh an der Oberflaeche an, und zwar erst NACH dem Absenden.
  const [freigabe, setFreigabe] = useState<Freigabe | null>(null)

  const weekEnd = addDays(weekStart, 6)

  const ladeWoche = useCallback(async () => {
    const von = formatISO(weekStart)
    const bis = formatISO(addDays(weekStart, 6))
    const res = await fetch(`/api/personal/dienstplan/tagesansicht?datumVon=${von}&datumBis=${bis}`)
    if (!res.ok) {
      log.error('Dienstplan laden fehlgeschlagen')
      return false
    }
    const data = await res.json()
    setEintraege((Array.isArray(data) ? data : (data.eintraege ?? [])).map(zuEintrag))
    return true
  }, [weekStart])

  useEffect(() => {
    let abgebrochen = false
    setLoading(true)
    ladeWoche()
      .catch(err => { log.errorWithException('Dienstplan laden fehlgeschlagen', err) })
      .finally(() => { if (!abgebrochen) setLoading(false) })
    return () => { abgebrochen = true }
  }, [ladeWoche])

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

  const ladeKraefte = useCallback(async () => {
    try {
      const res = await fetch('/api/personal/stammdaten')
      if (!res.ok) return
      const data = await res.json()
      setKraefte(Array.isArray(data) ? data : (data.stammdaten ?? []))
    } catch {
      /* Der Wochenplan bleibt lesbar; nur die Auswahl fehlt dann. */
    }
  }, [])

  useEffect(() => { ladeKraefte() }, [ladeKraefte])

  const ladeFreigabe = useCallback(async () => {
    try {
      const res = await fetch(`/api/personal/dienstplan/freigabe?woche=${formatISO(weekStart)}`)
      if (!res.ok) { setFreigabe(null); return }
      const data = await res.json()
      setFreigabe(data?.uebersicht?.freigabe ?? null)
    } catch {
      // Bewusst `null` und nicht „nicht freigegeben": unbekannt ist nicht
      // dasselbe wie frei. Der Riegel sitzt ohnehin in der Datenbank; die
      // Oberflaeche zeigt hier nur, was sie weiss.
      setFreigabe(null)
    }
  }, [weekStart])

  useEffect(() => { ladeFreigabe() }, [ladeFreigabe])

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

  // Dienste, die auf jemanden gebucht sind, der an dem Tag abwesend ist.
  const abwesenheiten = eintraege.filter(e => e.abwesend)

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
        // Derselbe Ladeweg wie beim Oeffnen — vorher stand der Mapper hier ein
        // zweites Mal wortgleich, und zwei Kopien eines Mappers zeigen nach der
        // ersten Aenderung an einer der beiden Stellen verschiedene Felder an.
        await ladeWoche()
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

  const wocheFreigegeben = freigabe?.status === 'freigegeben'

  function bearbeitungOeffnen(e: Eintrag) {
    setBearbFehler(null)
    setBearbeitung(e)
    setBearbForm({
      // `slice(0, 5)`: die Datenbank liefert `HH:MM:SS`, ein
      // `<input type="time">` zeigt bei Sekunden gar nichts an.
      caregiverId: e.caregiver_id ?? '',
      startZeit: (e.start_zeit ?? '').slice(0, 5),
      endZeit: (e.end_zeit ?? '').slice(0, 5),
      typ: e.typ ?? 'regulaer',
      status: e.status ?? 'geplant',
      notizen: e.notizen ?? '',
      aenderungGrund: '',
    })
  }

  /**
   * Schickt einen Patch an die Route und laedt die Woche neu.
   *
   * `felder` ist bewusst nur das, was sich WIRKLICH aendern soll — nicht
   * das ganze Formular. Wer ausschliesslich absagen will, soll nicht
   * nebenbei Zeiten mitschreiben, die er gar nicht angefasst hat.
   */
  async function dienstPatchen(felder: Record<string, unknown>, grundNoetig: boolean) {
    if (!bearbeitung) return
    if (grundNoetig && !bearbForm.aenderungGrund.trim()) {
      setBearbFehler('Die Woche ist freigegeben — jede Änderung braucht einen Grund.')
      return
    }
    setBearbBusy(true); setBearbFehler(null)
    try {
      const res = await fetch(`/api/personal/dienstplan/eintraege/${bearbeitung.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...felder,
          // Leer heisst „kein Grund angegeben". Ihn immer mitzuschicken ist
          // wichtig: der Riegel verlangt bei einer freigegebenen Woche einen
          // Grund, der sich vom vorigen UNTERSCHEIDET — ein stehen
          // gebliebener Grund deckte sonst jede weitere Aenderung mit ab.
          aenderungGrund: bearbForm.aenderungGrund.trim() || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBearbFehler(body?.error || 'Änderung konnte nicht gespeichert werden.')
        return
      }
      setBearbeitung(null)
      await ladeWoche()
    } catch (err) {
      log.errorWithException('Dienst ändern fehlgeschlagen', err)
      setBearbFehler('Änderung konnte nicht gespeichert werden (Netzwerkfehler).')
    } finally { setBearbBusy(false) }
  }

  async function dienstSpeichern() {
    await dienstPatchen({
      caregiverId: bearbForm.caregiverId || null,
      startZeit: bearbForm.startZeit,
      endZeit: bearbForm.endZeit,
      typ: bearbForm.typ,
      status: bearbForm.status,
      notizen: bearbForm.notizen,
    }, wocheFreigegeben)
  }

  /**
   * Absagen statt loeschen. Genau dieser Weg ist in einer freigegebenen
   * Woche der einzig zulaessige — der Riegel sagt es woertlich: „Statt zu
   * loeschen: den Dienst auf ausgefallen setzen." Der Dienst bleibt damit
   * im Plan sichtbar, und das ist der Punkt: ein ausgefallener Dienst ist
   * eine Luecke, die jemand fuellen muss, ein geloeschter ist unsichtbar.
   */
  async function dienstAbsagen() {
    if (!window.confirm('Diesen Dienst als ausgefallen kennzeichnen? Er bleibt im Plan sichtbar.')) return
    await dienstPatchen({ status: 'ausgefallen' }, wocheFreigegeben)
  }

  async function dienstLoeschen() {
    if (!bearbeitung) return
    if (wocheFreigegeben) {
      setBearbFehler(
        'In einer freigegebenen Woche kann ein Dienst nicht gelöscht werden — bitte auf "ausgefallen" setzen.'
      )
      return
    }
    if (!window.confirm('Diesen Dienst endgültig aus dem Plan entfernen?')) return
    setBearbBusy(true); setBearbFehler(null)
    try {
      const res = await fetch(`/api/personal/dienstplan/eintraege/${bearbeitung.id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setBearbFehler(body?.error || 'Löschen fehlgeschlagen.'); return }
      setBearbeitung(null)
      await ladeWoche()
    } catch (err) {
      log.errorWithException('Dienst löschen fehlgeschlagen', err)
      setBearbFehler('Löschen fehlgeschlagen (Netzwerkfehler).')
    } finally { setBearbBusy(false) }
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

      {/* Vorher stand hier „N Konflikte" auf einem Feld, das nie befuellt
          wurde — die Meldung konnte gar nicht erscheinen. Jetzt steht dort
          die Abwesenheit, die die Sicht wirklich liefert: ein eingeteilter
          Dienst fuer jemanden, der an dem Tag nicht da ist, ist ein
          unbesetzter Dienst. */}
      {abwesenheiten.length > 0 && (
        <Banner tone="danger">
          <strong>{abwesenheiten.length} {abwesenheiten.length === 1 ? 'Dienst' : 'Dienste'}</strong>{' '}
          in dieser Woche {abwesenheiten.length === 1 ? 'ist' : 'sind'} auf abwesende Mitarbeiter
          eingeteilt und damit unbesetzt.
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
              Mitarbeiter/in<br />
              {/* Vorher stand hier ein freies Textfeld mit dem Platzhalter
                  „UUID". Solange die Liste (noch) nicht geladen ist, bleibt
                  das Feld als Rueckfallweg bestehen — sonst waere der
                  Wochenplan bei einer fehlgeschlagenen Abfrage gar nicht
                  mehr bedienbar. */}
              {kraefte.length > 0 ? (
                <select value={form.caregiverId} onChange={e => setForm({ ...form, caregiverId: e.target.value })}
                  style={inputStyle}>
                  <option value="">— unbesetzt —</option>
                  {kraefte.map(k => (
                    <option key={k.id} value={k.id}>
                      {kraftName(k)}
                      {k.vertragsstatus && k.vertragsstatus !== 'aktiv' ? ` (${k.vertragsstatus})` : ''}
                      {k.einsatzfreigabe === false ? ' — nicht freigegeben' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input type="text" value={form.caregiverId} onChange={e => setForm({ ...form, caregiverId: e.target.value })}
                  placeholder="Kennung" style={inputStyle} />
              )}
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

      {/* ── Wochenfreigabe ────────────────────────────────────────────
          Steht ueber dem Plan und nicht darin: sie gilt fuer die ganze
          Woche und aendert, was mit JEDEM Dienst darin noch getan werden
          darf. Wer sie erst beim Absenden erfaehrt, hat den Vorgang
          bereits versucht. */}
      {wocheFreigegeben && (
        <div style={{ marginBottom: 12 }}>
          <Banner tone="warn">
            Diese Woche ist freigegeben. Änderungen sind möglich, brauchen aber
            jeweils einen eigenen Grund; gelöscht werden kann kein Dienst mehr —
            ein Ausfall wird auf „ausgefallen" gesetzt und bleibt sichtbar.
          </Banner>
        </div>
      )}

      {/* ── Dienst bearbeiten ─────────────────────────────────────── */}
      {bearbeitung && (
        <div style={{
          background: 'var(--coal2)', border: '1px solid var(--gold)',
          borderRadius: 12, padding: 16, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
            <div>
              <h3 style={{ fontSize: 15, margin: 0 }}>
                Dienst am {new Date(bearbeitung.datum + 'T12:00').toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit' })}
              </h3>
              <p className="admin-subtitle" style={{ margin: '2px 0 0' }}>
                {bearbeitung.caregiver_name}
                {bearbeitung.kunde_name ? ` · ${bearbeitung.kunde_name}` : ''}
              </p>
            </div>
            <button style={secondaryBtn} onClick={() => setBearbeitung(null)}>Schließen</button>
          </div>

          {bearbFehler && <div style={{ marginBottom: 12 }}><Banner tone="danger">{bearbFehler}</Banner></div>}

          {/* Ein abgeschlossener oder ausgefallener Dienst ist gelaufen:
              `updateEintrag` weist Kernfelder und Status mit 409 ab. Das
              hier zu zeigen statt es zu versuchen erspart eine Meldung,
              die erst nach dem Klick kommt. */}
          {DIENSTPLAN_ENDZUSTAENDE.includes(bearbeitung.status as never) ? (
            <Banner tone="info">
              Dieser Dienst steht auf „{statusMeta(DIENSTPLAN_STATUS, bearbeitung.status).label}" und ist
              abgeschlossen. Zeiten, Besetzung und Status lassen sich nicht mehr ändern.
            </Banner>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
                <label style={{ fontSize: 13 }}>
                  Mitarbeiter/in<br />
                  {kraefte.length > 0 ? (
                    <select value={bearbForm.caregiverId}
                      onChange={ev => setBearbForm({ ...bearbForm, caregiverId: ev.target.value })}
                      style={inputStyle}>
                      <option value="">— unbesetzt —</option>
                      {kraefte.map(k => (
                        <option key={k.id} value={k.id}>
                          {kraftName(k)}
                          {k.vertragsstatus && k.vertragsstatus !== 'aktiv' ? ` (${k.vertragsstatus})` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" value={bearbForm.caregiverId}
                      onChange={ev => setBearbForm({ ...bearbForm, caregiverId: ev.target.value })}
                      style={inputStyle} />
                  )}
                </label>
                <label style={{ fontSize: 13 }}>
                  Beginn<br />
                  <input type="time" value={bearbForm.startZeit}
                    onChange={ev => setBearbForm({ ...bearbForm, startZeit: ev.target.value })} style={inputStyle} />
                </label>
                <label style={{ fontSize: 13 }}>
                  Ende<br />
                  <input type="time" value={bearbForm.endZeit}
                    onChange={ev => setBearbForm({ ...bearbForm, endZeit: ev.target.value })} style={inputStyle} />
                </label>
                <label style={{ fontSize: 13 }}>
                  Typ<br />
                  <select value={bearbForm.typ} onChange={ev => setBearbForm({ ...bearbForm, typ: ev.target.value })}
                    style={inputStyle}>
                    {Object.entries(DIENSTPLAN_TYP).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: 13 }}>
                  Status<br />
                  <select value={bearbForm.status} onChange={ev => setBearbForm({ ...bearbForm, status: ev.target.value })}
                    style={inputStyle}>
                    {Object.entries(DIENSTPLAN_STATUS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: 13 }}>
                  Bemerkung<br />
                  <input type="text" value={bearbForm.notizen}
                    onChange={ev => setBearbForm({ ...bearbForm, notizen: ev.target.value })} style={inputStyle} />
                </label>
                {/* Nur bei freigegebener Woche verlangt, aber immer
                    angeboten: ein Grund schadet nie, und er landet im
                    Audit-Trail der Personalverwaltung. */}
                <label style={{ fontSize: 13 }}>
                  Änderungsgrund{wocheFreigegeben ? ' (Pflicht)' : ' (optional)'}<br />
                  <input type="text" value={bearbForm.aenderungGrund}
                    onChange={ev => setBearbForm({ ...bearbForm, aenderungGrund: ev.target.value })}
                    placeholder={wocheFreigegeben ? 'z. B. Krankmeldung' : 'Optional'} style={inputStyle} />
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                <button style={primaryBtn} onClick={dienstSpeichern} disabled={bearbBusy}>
                  {bearbBusy ? 'Speichern…' : 'Speichern'}
                </button>
                <button style={secondaryBtn} onClick={dienstAbsagen} disabled={bearbBusy}>
                  Dienst absagen
                </button>
                {/* In einer freigegebenen Woche gar nicht erst anbieten:
                    der Riegel weist das Loeschen ab, und ein Knopf, der
                    immer scheitert, ist schlimmer als keiner. */}
                {!wocheFreigegeben && (
                  <button
                    style={{ ...secondaryBtn, color: '#D04B3B', borderColor: 'rgba(208,75,59,.4)' }}
                    onClick={dienstLoeschen}
                    disabled={bearbBusy}
                  >
                    Löschen
                  </button>
                )}
              </div>
            </>
          )}
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
                  const offen = bearbeitung?.id === e.id
                  return (
                    /* Die Kachel oeffnet den Bearbeitungsbereich. Ein Dienst
                       ohne jede Handhabe war der eigentliche Mangel dieser
                       Seite: eintragen ging, umplanen nicht. */
                    <div key={e.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => bearbeitungOeffnen(e)}
                      onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); bearbeitungOeffnen(e) } }}
                      title="Dienst bearbeiten"
                      style={{
                      background: e.abwesend
                        ? 'rgba(208,75,59,.12)'
                        : e.schicht_farbe
                          ? `${e.schicht_farbe}22`
                          : 'var(--coal3)',
                      border: offen
                        ? '1px solid var(--gold)'
                        : e.abwesend ? '1px solid rgba(208,75,59,.4)' : '1px solid transparent',
                      borderRadius: 8, padding: '6px 8px', marginBottom: 6, fontSize: 12,
                      borderLeft: e.schicht_farbe ? `3px solid ${e.schicht_farbe}` : undefined,
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{e.caregiver_name}</div>
                      <div style={{ color: 'var(--ink4)' }}>
                        {formatTime(e.start_zeit)} – {formatTime(e.end_zeit)}
                      </div>
                      {e.schicht_bezeichnung && (
                        <div style={{ color: 'var(--ink4)', fontSize: 11 }}>{e.schicht_bezeichnung}</div>
                      )}
                      {e.kunde_name && (
                        <div style={{ color: 'var(--ink4)', fontSize: 11 }}>{e.kunde_name}</div>
                      )}
                      <div style={{ marginTop: 4 }}>
                        <StatusBadge label={sm.label} color={sm.color} />
                      </div>
                      {e.abwesend && (
                        <div style={{ color: '#D04B3B', fontSize: 11, fontWeight: 600, marginTop: 2 }}>
                          Abwesend{e.abwesenheit_typ ? ` (${e.abwesenheit_typ})` : ''} — unbesetzt
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
