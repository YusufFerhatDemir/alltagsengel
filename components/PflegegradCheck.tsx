'use client'
import { useMemo, useState } from 'react'
import LeadForm from '@/components/LeadForm'

// ═══════════════════════════════════════════════════════════
// PFLEGEGRAD-CHECK — Selbsteinschätzung nach NBA-Systematik
// ═══════════════════════════════════════════════════════════
// 6 Module mit offizieller Gewichtung (Begutachtungsinstrument):
//   M1 Mobilität 10% · M2/M3 Kognition/Verhalten 15% (höherer Wert)
//   M4 Selbstversorgung 40% · M5 Therapie 20% · M6 Alltagsleben 15%
// Schwellen: 12,5 / 27 / 47,5 / 70 / 90 Punkte → PG 1–5.
// Unverbindliche Ersteinschätzung, ersetzt keine MD-Begutachtung.
// ═══════════════════════════════════════════════════════════

const ANTWORTEN_HILFE = ['Selbstständig', 'Mit etwas Hilfe', 'Mit viel Hilfe', 'Nur mit voller Hilfe']
const ANTWORTEN_OFT = ['Nie', 'Selten', 'Häufig', '(Fast) täglich']

interface Modul {
  titel: string
  icon: string
  intro: string
  antworten: string[]
  fragen: string[]
}

const MODULE: Modul[] = [
  {
    titel: 'Mobilität',
    icon: '🚶',
    intro: 'Wie selbstständig bewegt sich die Person?',
    antworten: ANTWORTEN_HILFE,
    fragen: [
      'Innerhalb der Wohnung von Raum zu Raum gehen',
      'Aufstehen aus Bett oder Sessel und Umsetzen',
      'Treppensteigen',
    ],
  },
  {
    titel: 'Geistige Fähigkeiten',
    icon: '🧠',
    intro: 'Wie gut gelingen Orientierung und Verständigung?',
    antworten: ['Ohne Probleme', 'Leicht eingeschränkt', 'Stark eingeschränkt', 'Kaum / gar nicht möglich'],
    fragen: [
      'Zeitliche und örtliche Orientierung (Tag, Datum, Ort)',
      'Gespräche führen und Bedürfnisse mitteilen',
      'Erinnern an wichtige Ereignisse und Absprachen',
    ],
  },
  {
    titel: 'Verhalten & Unruhe',
    icon: '🌙',
    intro: 'Wie oft treten diese Situationen auf?',
    antworten: ANTWORTEN_OFT,
    fragen: [
      'Nächtliche Unruhe oder umgekehrter Tag-Nacht-Rhythmus',
      'Ängste, Niedergeschlagenheit oder Reizbarkeit',
      'Abwehr von Hilfe oder Pflege',
    ],
  },
  {
    titel: 'Selbstversorgung',
    icon: '🛁',
    intro: 'Wie selbstständig gelingt die tägliche Versorgung?',
    antworten: ANTWORTEN_HILFE,
    fragen: [
      'Waschen und Duschen',
      'An- und Auskleiden',
      'Essen und Trinken',
      'Toilettengang',
    ],
  },
  {
    titel: 'Umgang mit Krankheit & Therapie',
    icon: '💊',
    intro: 'Wie viel Unterstützung ist medizinisch nötig?',
    antworten: ANTWORTEN_OFT,
    fragen: [
      'Hilfe bei Medikamenten-Einnahme',
      'Begleitung zu Arztbesuchen oder Therapien',
      'Hilfe bei Messungen, Verbänden oder Injektionen',
    ],
  },
  {
    titel: 'Alltag & soziale Kontakte',
    icon: '☕',
    intro: 'Wie selbstständig wird der Alltag gestaltet?',
    antworten: ANTWORTEN_HILFE,
    fragen: [
      'Den Tagesablauf selbst planen und gestalten',
      'Sich selbst beschäftigen (Hobbys, Lesen, Fernsehen)',
      'Kontakte zu Familie und Freunden pflegen',
    ],
  },
]

// Offizielle Modul-Gewichtung; M2/M3 teilen sich 15 % (höherer Wert zählt)
const GEWICHTE = [10, 15, 15, 40, 20, 15]

const PFLEGEGELD: Record<number, number> = { 2: 347, 3: 599, 4: 800, 5: 990 }

function berechnePunkte(antworten: number[][]): number {
  const modulWerte = MODULE.map((m, i) => {
    const werte = antworten[i]
    const max = m.fragen.length * 3
    return werte.reduce((s, v) => s + v, 0) / max // 0..1
  })
  // M2/M3: nur der höhere Wert fließt ein (wie im echten Verfahren)
  const kognitionVerhalten = Math.max(modulWerte[1], modulWerte[2])
  const score =
    modulWerte[0] * GEWICHTE[0] +
    kognitionVerhalten * 15 +
    modulWerte[3] * GEWICHTE[3] +
    modulWerte[4] * GEWICHTE[4] +
    modulWerte[5] * GEWICHTE[5]
  return Math.round(score * 10) / 10
}

function punkteZuPflegegrad(punkte: number): number {
  if (punkte >= 90) return 5
  if (punkte >= 70) return 4
  if (punkte >= 47.5) return 3
  if (punkte >= 27) return 2
  if (punkte >= 12.5) return 1
  return 0
}

export default function PflegegradCheck() {
  const [schritt, setSchritt] = useState(0) // 0..5 Module, 6 = Ergebnis
  const [antworten, setAntworten] = useState<number[][]>(MODULE.map(m => m.fragen.map(() => -1)))

  const modulKomplett = schritt < 6 && antworten[schritt].every(v => v >= 0)
  const punkte = useMemo(() => berechnePunkte(antworten.map(a => a.map(v => Math.max(0, v)))), [antworten])
  const pg = punkteZuPflegegrad(punkte)

  function setAntwort(frage: number, wert: number) {
    setAntworten(prev => prev.map((a, i) => (i === schritt ? a.map((v, j) => (j === frage ? wert : v)) : a)))
  }

  const card: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 'clamp(18px, 3vw, 28px)' }

  // ── Ergebnis-Screen ──
  if (schritt === 6) {
    return (
      <div style={card}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ color: '#8A8279', fontSize: 13, marginBottom: 6 }}>Ihre unverbindliche Ersteinschätzung</div>
          {pg > 0 ? (
            <>
              <div style={{ color: '#E8C87E', fontSize: 40, fontWeight: 800 }}>Pflegegrad {pg}</div>
              <div style={{ color: '#B8B0A4', fontSize: 14, marginTop: 4 }}>≈ {punkte.toFixed(1).replace('.', ',')} von 100 Punkten</div>
            </>
          ) : (
            <>
              <div style={{ color: '#F5F0E8', fontSize: 26, fontWeight: 800 }}>Voraussichtlich noch kein Pflegegrad</div>
              <div style={{ color: '#B8B0A4', fontSize: 14, marginTop: 4 }}>≈ {punkte.toFixed(1).replace('.', ',')} von 100 Punkten (ab 12,5 beginnt Pflegegrad 1)</div>
            </>
          )}
        </div>

        {pg > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            <div style={{ background: 'rgba(201,150,60,0.1)', border: '1px solid rgba(201,150,60,0.3)', borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ color: '#B8B0A4', fontSize: 13 }}>Entlastungsbetrag (§45b) — z.&nbsp;B. für Alltagsengel</span>
              <span style={{ color: '#E8C87E', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>131 €/Monat</span>
            </div>
            {pg >= 2 && (
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ color: '#B8B0A4', fontSize: 13 }}>Pflegegeld bei häuslicher Pflege</span>
                <span style={{ color: '#F5F0E8', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>{PFLEGEGELD[pg]} €/Monat</span>
              </div>
            )}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ color: '#B8B0A4', fontSize: 13 }}>Pflegehilfsmittel (§40) — z.&nbsp;B. unsere Pflege-Box</span>
              <span style={{ color: '#F5F0E8', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>42 €/Monat</span>
            </div>
          </div>
        )}

        <p style={{ color: '#8A8279', fontSize: 12, lineHeight: 1.6, marginBottom: 20 }}>
          Dies ist eine Orientierung auf Basis Ihrer Angaben — den Pflegegrad legt der Medizinische
          Dienst nach einer Begutachtung fest. {pg === 0 ? 'Auch wenn es knapp ist: Ein Antrag lohnt sich oft, wir beraten Sie gern.' : 'Wir helfen Ihnen kostenlos beim Antrag und bei der Vorbereitung auf die Begutachtung.'}
        </p>

        <LeadForm defaultService="Allgemein" source="pflegegrad-check" />

        <button
          onClick={() => { setSchritt(0); setAntworten(MODULE.map(m => m.fragen.map(() => -1))) }}
          style={{ width: '100%', marginTop: 14, padding: '12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#8A8279', fontSize: 14, cursor: 'pointer' }}
        >
          Check neu starten
        </button>
      </div>
    )
  }

  // ── Frage-Screens ──
  const modul = MODULE[schritt]
  return (
    <div style={card}>
      {/* Fortschritt */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18 }} aria-hidden="true">
        {MODULE.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < schritt ? '#C9963C' : i === schritt ? 'rgba(201,150,60,0.5)' : 'rgba(255,255,255,0.08)' }} />
        ))}
      </div>
      <div style={{ color: '#8A8279', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        Schritt {schritt + 1} von 6
      </div>
      <h3 style={{ color: '#F5F0E8', fontSize: 20, fontWeight: 700, marginBottom: 2 }}>{modul.icon} {modul.titel}</h3>
      <p style={{ color: '#8A8279', fontSize: 13, marginBottom: 18 }}>{modul.intro}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {modul.fragen.map((frage, fi) => (
          <div key={frage}>
            <div style={{ color: '#B8B0A4', fontSize: 14, marginBottom: 8, lineHeight: 1.4 }}>{frage}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {modul.antworten.map((a, ai) => {
                const aktiv = antworten[schritt][fi] === ai
                return (
                  <button
                    key={a}
                    onClick={() => setAntwort(fi, ai)}
                    aria-pressed={aktiv}
                    style={{
                      padding: '9px 10px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center',
                      border: aktiv ? '1px solid #C9963C' : '1px solid rgba(255,255,255,0.1)',
                      background: aktiv ? 'rgba(201,150,60,0.18)' : 'rgba(255,255,255,0.03)',
                      color: aktiv ? '#E8C87E' : '#B8B0A4', transition: 'all 0.15s',
                    }}
                  >
                    {a}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        {schritt > 0 && (
          <button
            onClick={() => setSchritt(s => s - 1)}
            style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#B8B0A4', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
          >
            Zurück
          </button>
        )}
        <button
          onClick={() => modulKomplett && setSchritt(s => s + 1)}
          disabled={!modulKomplett}
          style={{
            flex: 2, padding: '13px', borderRadius: 12, border: 'none',
            background: modulKomplett ? '#C9963C' : 'rgba(255,255,255,0.06)',
            color: modulKomplett ? '#1A1612' : '#6A6259',
            fontSize: 15, fontWeight: 700, cursor: modulKomplett ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
          }}
        >
          {schritt === 5 ? 'Ergebnis anzeigen' : 'Weiter'}
        </button>
      </div>
      {!modulKomplett && <p style={{ color: '#6A6259', fontSize: 11, textAlign: 'center', marginTop: 8 }}>Bitte beantworten Sie alle Fragen dieses Schritts.</p>}
    </div>
  )
}
