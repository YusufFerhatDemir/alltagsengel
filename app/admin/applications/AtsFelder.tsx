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
import { setApplicationAtsFelder } from './actions'

const feldStil: React.CSSProperties = {
  width: '100%', background: 'var(--coal2)', border: '1px solid var(--coal4)',
  borderRadius: 6, color: 'var(--ink1)', padding: '5px 7px', fontSize: 13,
}
const labelStil: React.CSSProperties = { fontSize: 11, color: 'var(--ink5)', display: 'block', marginBottom: 3 }

export function AtsPanel({
  applicationId, roh, onGespeichert,
}: {
  applicationId: string
  roh: unknown
  onGespeichert: (neu: Record<string, unknown>) => void
}) {
  const [felder, setFelder] = useState<AtsFelder>(() => atsFelderAus(roh))
  const [busy, setBusy] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [gespeichert, setGespeichert] = useState<string | null>(null)

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
