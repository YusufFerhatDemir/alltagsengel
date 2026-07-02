'use client'
import { useMemo, useState } from 'react'

// ═══════════════════════════════════════════════════════════
// BUDGETRECHNER — Entlastungsbetrag §45b SGB XI
// ═══════════════════════════════════════════════════════════
// Interaktiver Rechner: 131 €/Monat, aufgelaufenes Restbudget,
// Übertrag aus dem Vorjahr (verfällt 30.06.), Umwandlungsanspruch.
// Design: dark theme, gold accent (#C9963C).
// ═══════════════════════════════════════════════════════════

const MONATSBETRAG = 131
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

// Umwandlungsanspruch §45a Abs. 4 SGB XI: bis zu 40 % der
// Pflegesachleistung zusätzlich für Alltagsbegleitung nutzbar (PG 2–5).
const SACHLEISTUNG: Record<number, number> = { 2: 796, 3: 1497, 4: 1859, 5: 2299 }

function euro(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

export default function BudgetRechner() {
  const now = new Date()
  const jahr = now.getFullYear()
  const aktuellerMonat = now.getMonth() // 0-basiert

  const [pflegegrad, setPflegegrad] = useState<number>(2)
  const [seitMonat, setSeitMonat] = useState<number>(-1) // -1 = Vorjahr oder früher
  const [nutzung, setNutzung] = useState<'nichts' | 'teilweise' | 'voll'>('nichts')

  const ergebnis = useMemo(() => {
    // Anspruchsmonate im laufenden Jahr (inkl. aktuellem Monat)
    const startMonat = seitMonat === -1 ? 0 : seitMonat
    const monate = Math.max(0, aktuellerMonat - startMonat + 1)
    const angespart = monate * MONATSBETRAG

    const genutztProMonat = nutzung === 'voll' ? MONATSBETRAG : nutzung === 'teilweise' ? Math.round(MONATSBETRAG / 2) : 0
    const genutzt = monate * genutztProMonat
    const verfuegbar = angespart - genutzt

    // Restpotenzial bis Jahresende
    const restMonate = 11 - aktuellerMonat
    const nochKommend = restMonate * MONATSBETRAG
    const jahresPotenzial = verfuegbar + nochKommend

    // Übertrag Vorjahr: nutzbar bis 30.06. des laufenden Jahres
    const uebertragAktiv = seitMonat === -1 && (now.getMonth() < 6 || (now.getMonth() === 5 && now.getDate() <= 30))
    const uebertragMax = 12 * MONATSBETRAG

    // Umwandlungsanspruch (nur PG 2–5)
    const umwandlung = pflegegrad >= 2 ? Math.round(SACHLEISTUNG[pflegegrad] * 0.4) : 0

    return { monate, angespart, genutzt, verfuegbar, nochKommend, jahresPotenzial, uebertragAktiv, uebertragMax, umwandlung, startMonat }
  }, [pflegegrad, seitMonat, nutzung, aktuellerMonat, now])

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '10px 14px', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    border: active ? '1px solid #C9963C' : '1px solid rgba(255,255,255,0.12)',
    background: active ? 'rgba(201,150,60,0.18)' : 'rgba(255,255,255,0.04)',
    color: active ? '#E8C87E' : '#B8B0A4', transition: 'all 0.15s',
  })

  const label: React.CSSProperties = { color: '#8A8279', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 'clamp(18px, 3vw, 28px)' }}>

      {/* Eingaben */}
      <div style={{ marginBottom: 20 }}>
        <div style={label}>Ihr Pflegegrad</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5].map(pg => (
            <button key={pg} onClick={() => setPflegegrad(pg)} style={{ ...btn(pflegegrad === pg), minWidth: 48 }} aria-pressed={pflegegrad === pg}>
              PG {pg}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={label}>Pflegegrad anerkannt seit</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setSeitMonat(-1)} style={btn(seitMonat === -1)} aria-pressed={seitMonat === -1}>
            {jahr - 1} oder früher
          </button>
          {MONATE.slice(0, aktuellerMonat + 1).map((m, i) => (
            <button key={m} onClick={() => setSeitMonat(i)} style={btn(seitMonat === i)} aria-pressed={seitMonat === i}>
              {MONATE_KURZ[i]} {jahr}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={label}>Wie viel nutzen Sie davon bisher?</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setNutzung('nichts')} style={btn(nutzung === 'nichts')} aria-pressed={nutzung === 'nichts'}>Gar nichts</button>
          <button onClick={() => setNutzung('teilweise')} style={btn(nutzung === 'teilweise')} aria-pressed={nutzung === 'teilweise'}>Etwa die Hälfte</button>
          <button onClick={() => setNutzung('voll')} style={btn(nutzung === 'voll')} aria-pressed={nutzung === 'voll'}>Alles (131 €/Monat)</button>
        </div>
      </div>

      {/* Ergebnis */}
      <div style={{ background: 'rgba(201,150,60,0.1)', border: '1px solid rgba(201,150,60,0.35)', borderRadius: 16, padding: '22px 18px', textAlign: 'center', marginBottom: 18 }}>
        <div style={{ color: '#B8B0A4', fontSize: 13, marginBottom: 4 }}>Ihr ungenutztes Budget in {jahr} — Stand heute</div>
        <div style={{ color: '#E8C87E', fontSize: 42, fontWeight: 800, lineHeight: 1.1 }} aria-live="polite">{euro(ergebnis.verfuegbar)}</div>
        <div style={{ color: '#8A8279', fontSize: 13, marginTop: 6 }}>
          {ergebnis.monate} {ergebnis.monate === 1 ? 'Monat' : 'Monate'} × 131 € = {euro(ergebnis.angespart)}
          {ergebnis.genutzt > 0 && <> − {euro(ergebnis.genutzt)} bereits genutzt</>}
        </div>
      </div>

      {/* Monats-Visualisierung */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4, marginBottom: 8 }} aria-hidden="true">
        {MONATE_KURZ.map((m, i) => {
          const angesparter = i >= ergebnis.startMonat && i <= aktuellerMonat
          const zukunft = i > aktuellerMonat
          return (
            <div key={m} style={{ textAlign: 'center' }}>
              <div style={{
                height: 34, borderRadius: 6,
                background: angesparter ? 'linear-gradient(180deg, #E8C87E, #C9963C)' : zukunft ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
                border: zukunft ? '1px dashed rgba(201,150,60,0.35)' : '1px solid transparent',
                opacity: angesparter && nutzung === 'voll' ? 0.35 : 1,
              }} />
              <div style={{ color: '#6A6259', fontSize: 9, marginTop: 3 }}>{m}</div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ color: '#8A8279', fontSize: 11 }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#C9963C', marginRight: 5, verticalAlign: 'middle' }} />angespart</span>
        <span style={{ color: '#8A8279', fontSize: 11 }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, border: '1px dashed rgba(201,150,60,0.5)', marginRight: 5, verticalAlign: 'middle' }} />kommt noch: {euro(ergebnis.nochKommend)}</span>
      </div>

      {/* Zusatz-Infos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#B8B0A4', fontSize: 13 }}>Möglich bis Jahresende {jahr}</span>
          <span style={{ color: '#F5F0E8', fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap' }}>{euro(ergebnis.jahresPotenzial)}</span>
        </div>

        {seitMonat === -1 && (
          ergebnis.uebertragAktiv ? (
            <div style={{ background: 'rgba(45,106,79,0.12)', border: '1px solid rgba(45,106,79,0.3)', borderRadius: 12, padding: '12px 14px' }}>
              <span style={{ color: '#7DBE9C', fontSize: 13, lineHeight: 1.5 }}>
                <strong>Übertrag aus {jahr - 1}:</strong> Nicht genutzte Beträge aus dem Vorjahr (bis zu {euro(ergebnis.uebertragMax)}) können Sie noch bis zum 30.06.{jahr} einsetzen — danach verfallen sie.
              </span>
            </div>
          ) : (
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '12px 14px' }}>
              <span style={{ color: '#8A8279', fontSize: 13, lineHeight: 1.5 }}>
                Ein Übertrag aus {jahr - 1} ist zum 30.06.{jahr} verfallen. Damit das {jahr} nicht wieder passiert: Budget jetzt nutzen.
              </span>
            </div>
          )
        )}

        {ergebnis.umwandlung > 0 && (
          <div style={{ background: 'rgba(201,150,60,0.06)', border: '1px solid rgba(201,150,60,0.2)', borderRadius: 12, padding: '12px 14px' }}>
            <span style={{ color: '#B8B0A4', fontSize: 13, lineHeight: 1.5 }}>
              <strong style={{ color: '#E8C87E' }}>Extra-Tipp (PG {pflegegrad}):</strong> Über den Umwandlungsanspruch (§45a Abs. 4 SGB XI) können Sie zusätzlich bis zu <strong style={{ color: '#E8C87E' }}>{euro(ergebnis.umwandlung)}/Monat</strong> aus Ihrer Pflegesachleistung für Alltagsbegleitung einsetzen — wenn Sie keinen oder nicht den vollen Pflegedienst nutzen. Wir prüfen das kostenlos für Sie.
            </span>
          </div>
        )}
      </div>

      <p style={{ color: '#6A6259', fontSize: 11, marginTop: 16, lineHeight: 1.5 }}>
        Unverbindliche Modellrechnung (Stand {jahr}, Entlastungsbetrag 131 €/Monat nach §45b SGB XI). Maßgeblich ist die Auskunft Ihrer Pflegekasse — wir übernehmen die Klärung gern für Sie.
      </p>
    </div>
  )
}
