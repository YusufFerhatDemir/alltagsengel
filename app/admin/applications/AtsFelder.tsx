'use client'

/**
 * Arbeitsfelder einer Bewerbung — die Maske zu lib/bewerbung/ats-felder.ts.
 *
 * ── WAS DIESE MASKE ABSICHTLICH NICHT KANN ────────────────────────────
 * Sie zeigt `qualifikation`, `fuehrerschein`, `verfuegbarkeit` und
 * `sprachen` nur als **Anzeige aus dem Bewerbungsformular**, ohne Eingabe.
 * Das sind Angaben der Bewerberin; sie hier überschreibbar zu machen hiesse,
 * ihre Selbstauskunft durch eine Verwaltungsnotiz zu ersetzen — an einem
 * zweiten Ort, der dann auseinanderläuft. Die Server Action weist sie
 * zusätzlich ab (`pruefeAtsEingabe`), diese Maske ist nur die erste Hürde.
 *
 * ── EIN FELD, EIN SPEICHERVORGANG ─────────────────────────────────────
 * Gespeichert wird beim Verlassen des Feldes, und zwar **nur dieses eine
 * Feld**. Ein Teilformular, das den ganzen Satz schickt, würde Angaben
 * überschreiben, die inzwischen jemand anders gesetzt hat.
 */

import { useState } from 'react'
import {
  FZ_STATUS, MOBILITAET, PRIORITAET_MIN, PRIORITAET_MAX,
  atsFelderAus, darfAlsVerifiziertGelten, type AtsFelder,
} from '@/lib/bewerbung/ats-felder'
import {
  QUALIFIKATIONEN, FUEHRERSCHEIN, SPRACHEN, VERFUEGBARKEIT,
} from '@/lib/bewerbung/katalog'
import {
  setApplicationAtsFelder, addApplicationNotiz, ladeApplicationNotizen,
  type BewerbungsNotiz,
} from './actions'

/** Schlüssel → Anzeigetext aus einem Katalog; unbekannt bleibt der Schlüssel. */
function ausKatalog(katalog: readonly { key: string; label: string }[], wert: unknown): string {
  if (typeof wert !== 'string' || !wert) return '—'
  return katalog.find(k => k.key === wert)?.label ?? wert
}

function listeAusKatalog(katalog: readonly { key: string; label: string }[], wert: unknown): string {
  if (!Array.isArray(wert) || wert.length === 0) return '—'
  return wert.map(w => ausKatalog(katalog, w)).join(', ')
}

const feldStil: React.CSSProperties = {
  width: '100%', background: 'var(--coal2)', border: '1px solid var(--coal4)',
  borderRadius: 6, color: 'var(--ink1)', padding: '5px 7px', fontSize: 13,
}
const labelStil: React.CSSProperties = { fontSize: 11, color: 'var(--ink5)', display: 'block', marginBottom: 3 }

export function AtsPanel({
  applicationId, roh, daten, onGespeichert,
}: {
  applicationId: string
  roh: unknown
  /** Formularangaben der Bewerberin — hier nur Anzeige, nie Eingabe. */
  daten: Record<string, unknown> | null
  onGespeichert: (neu: Record<string, unknown>) => void
}) {
  const [felder, setFelder] = useState<AtsFelder>(() => atsFelderAus(roh))
  const [busy, setBusy] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [gespeichert, setGespeichert] = useState<string | null>(null)

  // ── Notizverlauf ───────────────────────────────────────────────────
  // Erst auf Klick geladen: die Liste steht in einer aufgeklappten Zeile,
  // und alle Verläufe im Voraus zu holen hiesse, für jede Bewerbung eine
  // Abfrage abzusetzen, die fast nie jemand ansieht.
  const [notizen, setNotizen] = useState<BewerbungsNotiz[] | null>(null)
  const [notizText, setNotizText] = useState('')
  const [notizBusy, setNotizBusy] = useState(false)

  async function verlaufLaden() {
    const r = await ladeApplicationNotizen(applicationId)
    if (!r.ok) { setFehler(r.error); return }
    setNotizen(r.notizen)
  }

  async function notizSpeichern() {
    if (!notizText.trim()) return
    setNotizBusy(true)
    const r = await addApplicationNotiz(applicationId, notizText)
    setNotizBusy(false)
    if (!r.ok) { setFehler(r.error); return }
    setFehler(null)
    setNotizText('')
    await verlaufLaden()
  }

  async function speichere(feld: keyof AtsFelder, wert: unknown) {
    setBusy(feld)
    setFehler(null)
    const ergebnis = await setApplicationAtsFelder(applicationId, { [feld]: wert })
    setBusy(null)
    if (!ergebnis.ok) {
      // Die Maske faellt auf den gespeicherten Stand zurueck. Ein abgelehnter
      // Wert darf nicht stehen bleiben, als waere er angekommen.
      setFelder(atsFelderAus(roh))
      setFehler(ergebnis.error)
      return
    }
    const naechste = { ...felder, [feld]: wert === '' ? undefined : wert } as AtsFelder
    setFelder(naechste)
    onGespeichert({ ...(roh && typeof roh === 'object' ? roh : {}), ats: naechste })
    setGespeichert(feld)
    setTimeout(() => setGespeichert(v => (v === feld ? null : v)), 1500)
  }

  const rand = (feld: keyof AtsFelder) =>
    busy === feld ? '1px solid var(--gold)' : gespeichert === feld ? '1px solid #4CAF50' : '1px solid var(--coal4)'

  function Text({ feld, label, typ = 'text' }: { feld: keyof AtsFelder; label: string; typ?: string }) {
    return (
      <label>
        <span style={labelStil}>{label}</span>
        <input
          type={typ}
          style={{ ...feldStil, border: rand(feld) }}
          disabled={busy !== null}
          defaultValue={(felder[feld] as string | number | undefined) ?? ''}
          onBlur={e => {
            const w = e.target.value
            const alt = (felder[feld] as string | number | undefined) ?? ''
            if (String(w) !== String(alt)) speichere(feld, typ === 'number' ? (w === '' ? '' : Number(w)) : w)
          }}
        />
      </label>
    )
  }

  function Katalog({ feld, label, katalog }: { feld: keyof AtsFelder; label: string; katalog: Record<string, string> }) {
    return (
      <label>
        <span style={labelStil}>{label}</span>
        <select
          style={{ ...feldStil, border: rand(feld) }}
          disabled={busy !== null}
          value={(felder[feld] as string | undefined) ?? ''}
          onChange={e => speichere(feld, e.target.value)}
        >
          <option value="">— nicht erhoben —</option>
          {Object.entries(katalog).map(([w, t]) => <option key={w} value={w}>{t}</option>)}
        </select>
      </label>
    )
  }

  function Liste({ feld, label, hinweis }: { feld: keyof AtsFelder; label: string; hinweis: string }) {
    const wert = (felder[feld] as string[] | undefined) ?? []
    return (
      <label>
        <span style={labelStil}>{label} <span style={{ color: 'var(--ink6)' }}>({hinweis})</span></span>
        <input
          style={{ ...feldStil, border: rand(feld) }}
          disabled={busy !== null}
          defaultValue={wert.join(', ')}
          onBlur={e => {
            const neu = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
            if (neu.join(',') !== wert.join(',')) speichere(feld, neu)
          }}
        />
      </label>
    )
  }

  return (
    <div onClick={e => e.stopPropagation()} style={{ marginTop: 12, borderTop: '1px solid var(--coal4)', paddingTop: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--ink5)', marginBottom: 8 }}>
        <strong style={{ color: 'var(--ink3)' }}>Arbeitsfelder der Verwaltung</strong>
        {' '}— Notizen aus Telefonaten, nicht die Angaben der Bewerberin. Speichert beim Verlassen des Feldes.
      </div>

      {fehler && (
        <div style={{ fontSize: 12, color: '#D04B3B', marginBottom: 8, padding: '6px 8px', background: 'rgba(208,75,59,.1)', borderRadius: 6 }}>
          {fehler}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '10px 14px' }}>
        <Text feld="startdatum" label="Ab wann einsetzbar" typ="date" />
        <Katalog feld="fzStatus" label="Führungszeugnis" katalog={FZ_STATUS} />
        <Text feld="fzDatum" label="Datum zum FZ-Stand" typ="date" />
        <Text feld="erfahrungJahre" label="Erfahrung (Jahre)" typ="number" />
        <Katalog feld="mobilitaet" label="Mobilität" katalog={MOBILITAET} />
        <Text feld="stundenProWoche" label="Stunden/Woche" typ="number" />
        <Liste feld="einsatzgebiet" label="Einsatzgebiet" hinweis="Komma-getrennt" />
        <Text feld="letzterKontakt" label="Letzter Kontakt" typ="datetime-local" />
        <Text feld="naechsteAktion" label="Nächste Aktion" />
        <label>
          <span style={labelStil}>Priorität ({PRIORITAET_MIN} = dringendst … {PRIORITAET_MAX})</span>
          <select
            style={{ ...feldStil, border: rand('prioritaet') }}
            disabled={busy !== null}
            value={felder.prioritaet ?? ''}
            onChange={e => speichere('prioritaet', e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">— nicht erhoben —</option>
            {Array.from({ length: PRIORITAET_MAX - PRIORITAET_MIN + 1 }, (_, i) => PRIORITAET_MIN + i)
              .map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>

      <label style={{ display: 'block', marginTop: 10 }}>
        <span style={labelStil}>Notizen (intern — gehört niemals in Kundenkommunikation)</span>
        <textarea
          rows={2}
          style={{ ...feldStil, border: rand('notizen'), resize: 'vertical' }}
          disabled={busy !== null}
          defaultValue={felder.notizen ?? ''}
          onBlur={e => { if (e.target.value !== (felder.notizen ?? '')) speichere('notizen', e.target.value) }}
        />
      </label>

      {/* ── Notizverlauf ─────────────────────────────────────────────
          Getrennt vom Feld „Notizen" darüber, und das mit Absicht: dort
          steht der STAND (woran hängt es gerade), hier der VERLAUF (was ist
          bisher passiert). Beides in ein Feld zu zwingen hiesse, sich für
          eines von beiden zu entscheiden, ohne es zu merken. */}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--coal4)' }}>
        <div style={{ ...labelStil, marginBottom: 6 }}>Verlauf — jede Notiz bleibt stehen</div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            style={{ ...feldStil, flex: 1 }}
            disabled={notizBusy}
            value={notizText}
            placeholder="Was ist passiert? (z. B. Telefonat, Rückmeldung)"
            onChange={e => setNotizText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); notizSpeichern() } }}
          />
          <button
            type="button"
            disabled={notizBusy || !notizText.trim()}
            onClick={notizSpeichern}
            style={{
              ...feldStil, width: 'auto', padding: '5px 12px', cursor: 'pointer',
              opacity: notizBusy || !notizText.trim() ? 0.5 : 1,
            }}
          >
            {notizBusy ? '…' : 'Eintragen'}
          </button>
        </div>

        {notizen === null ? (
          <button type="button" onClick={verlaufLaden}
            style={{ ...feldStil, width: 'auto', padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
            Verlauf anzeigen
          </button>
        ) : notizen.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--ink5)' }}>Noch kein Eintrag.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {notizen.map(n => (
              <li key={n.id} style={{ fontSize: 12.5, borderLeft: '2px solid var(--coal4)', paddingLeft: 8 }}>
                <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
                <div style={{ color: 'var(--ink5)', fontSize: 11 }}>
                  {n.von || 'Verwaltung'}
                  {n.am && ` · ${new Date(n.am).toLocaleString('de-DE')}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Die vier Felder aus dem Bewerbungsformular. Sie stehen hier, damit
          alle fuenfzehn Arbeitsfelder an EINER Stelle zu sehen sind — aber
          ohne Eingabe: das ist die Selbstauskunft der Bewerberin. Wer sie
          hier ueberschreiben koennte, erzeugte einen zweiten Ort fuer
          dieselbe Angabe, und der laeuft auseinander. */}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--coal4)' }}>
        <div style={{ ...labelStil, marginBottom: 6 }}>
          Aus dem Bewerbungsformular — Angaben der Bewerberin, hier nicht änderbar
        </div>
        {daten ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '6px 16px', fontSize: 12.5 }}>
            <div><span style={{ color: 'var(--ink5)' }}>Qualifikation:</span> {ausKatalog(QUALIFIKATIONEN, daten.qualifikation)}</div>
            <div><span style={{ color: 'var(--ink5)' }}>Führerschein:</span> {ausKatalog(FUEHRERSCHEIN, daten.fuehrerschein)}</div>
            <div><span style={{ color: 'var(--ink5)' }}>Sprachen:</span> {listeAusKatalog(SPRACHEN, daten.sprachen)}</div>
            <div><span style={{ color: 'var(--ink5)' }}>Verfügbarkeit:</span> {listeAusKatalog(VERFUEGBARKEIT, daten.verfuegbarkeit)}</div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--ink5)' }}>
            Über das frühere Kurzformular eingegangen — diese vier Angaben fehlen.
          </div>
        )}
      </div>

      {/* Der Satz steht bewusst an der Maske, nicht nur im Quelltext: die
          Stelle, an der jemand „Liegt vor" auswaehlt, ist die Stelle, an der
          der Irrtum entsteht. Siehe darfAlsVerifiziertGelten(). */}
      {felder.fzStatus === 'eingetroffen' && !darfAlsVerifiziertGelten(felder) && (
        <div style={{ fontSize: 11, color: '#E8A000', marginTop: 8 }}>
          ⚠ „Liegt vor" ist eine Notiz, kein Nachweis. Die Einsatzfreigabe verlangt weiterhin das gesichtete Dokument.
        </div>
      )}
    </div>
  )
}
