'use client'
// ═══════════════════════════════════════════════════════════════════════
// Kontrollzentrum — Block 28
//
// Die Seite hiess „Echtzeit-Übersicht aller Geschäftskennzahlen" und
// zeigte als Umsatz `Anzahl Buchungen × 35 €`. Sie mischte Gemessenes und
// Angenommenes in identisch aussehenden Karten: neben der echten
// Nutzerzahl standen ein fest verdrahtetes TAM, „95 % API-Verfügbarkeit"
// und eine Aktivitätenliste, in der seit jeher „Pitch Deck v2
// hochgeladen — vor 2 Stunden" stand.
//
// Jetzt gilt: was gemessen ist, kommt org-gefenced aus
// /api/mis/kennzahlen. Was eine Annahme ist, steht unter „Planannahmen"
// und sagt das auch.
// ═══════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback } from 'react'
import { BRAND, FINANCIAL_PROJECTIONS, UNIT_ECONOMICS } from '@/lib/mis/constants'
import type { MisKennzahlen } from '@/lib/mis/kennzahlen'
import { useMis } from '@/lib/mis/MisContext'
import { useRouter } from 'next/navigation'
import { KpiCard, SectionHeader, Card, MiniBarChart, ProgressBar, StatRow, MisButton, DataTable } from '@/components/mis/MisComponents'
import { MIcon } from '@/components/mis/MisIcons'
import { logger } from '@/lib/logger'
const log = logger.child('mis')

const euro = (n: number) => `€${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function DashboardPage() {
  const router = useRouter()
  const [daten, setDaten] = useState<MisKennzahlen | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const { isMobile } = useMis()

  const ladeKennzahlen = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/mis/kennzahlen', { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Die Kennzahlen konnten nicht geladen werden (HTTP ${res.status}).`)
      }
      setDaten(await res.json())
      setFehler(null)
    } catch (e) {
      // Der alte Stand fing den Fehler ab, schrieb ihn ins Log und liess
      // die Karten auf 0 stehen — eine gescheiterte Abfrage sah aus wie
      // ein leerer Betrieb. Ab hier verschwindet der Fehler nicht mehr:
      // die Zahlen werden verworfen und die Störung angezeigt.
      log.errorWithException('Kennzahlen konnten nicht geladen werden', e)
      setDaten(null)
      setFehler(e instanceof Error ? e.message : 'Die Kennzahlen konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void ladeKennzahlen() }, [ladeKennzahlen])

  const spalten = (min: number) => ({
    display: 'grid',
    gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`,
    gap: isMobile ? 10 : 16,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SectionHeader
        title="Kontrollzentrum"
        subtitle={daten
          ? `Betriebszahlen, Stand ${new Date(daten.stand).toLocaleString('de-DE')}`
          : 'Betriebszahlen aus Klienten, Kräften, Einsätzen und Rechnungen'}
        icon="gauge"
        actions={
          <MisButton icon={loading ? 'clock' : 'refresh'} variant="secondary" onClick={() => void ladeKennzahlen()} disabled={loading}>
            {loading ? 'Lädt...' : 'Aktualisieren'}
          </MisButton>
        }
      />

      {fehler && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 16px', borderRadius: 12,
          border: `1px solid ${BRAND.error}`, background: '#FDF2F2', color: BRAND.text, fontSize: 14,
        }}>
          <span style={{ color: BRAND.error, flexShrink: 0 }}><MIcon name="shield" size={18} /></span>
          <div>
            <strong style={{ display: 'block', marginBottom: 2 }}>Kennzahlen nicht verfügbar</strong>
            {fehler} — die Karten bleiben leer, damit keine Null als Betriebszahl missverstanden wird.
          </div>
        </div>
      )}

      {/* ── Gemessen ──────────────────────────────────────────────── */}
      {daten && (
        <>
          <div style={spalten(220)}>
            <KpiCard
              title="Umsatz (festgeschrieben)"
              value={euro(daten.umsatz.summeEuro)}
              icon="banknote"
              color={BRAND.gold}
              onClick={() => router.push('/mis/finance')}
            />
            <KpiCard
              title="Offene Posten"
              value={euro(daten.offenePosten.summeEuro)}
              icon="clock"
              color={daten.offenePosten.ueberfaelligAnzahl > 0 ? BRAND.error : undefined}
              onClick={() => router.push('/admin/sgb-v/zahlungen')}
            />
            <KpiCard
              title="Umsatz pro Kraft"
              value={daten.umsatzProKraft == null ? '—' : euro(daten.umsatzProKraft)}
              icon="pieChart"
              onClick={() => router.push('/mis/finance')}
            />
            <KpiCard
              title="Aktive Klienten"
              value={daten.betrieb.aktiveKlienten}
              target={daten.betrieb.klienten}
              icon="users"
              onClick={() => router.push('/admin/clients')}
            />
            <KpiCard
              title="Einsatzbereite Kräfte"
              value={daten.betrieb.einsatzbereiteKraefte}
              target={daten.betrieb.kraefte}
              icon="wings"
              color={daten.betrieb.einsatzbereiteKraefte === 0 ? BRAND.error : BRAND.success}
              onClick={() => router.push('/admin/personal')}
            />
          </div>

          {/* Was die Zahlen NICHT enthalten — sichtbar statt verschwiegen. */}
          {(daten.umsatz.nichtFestgeschrieben > 0 || daten.offenePosten.ueberfaelligAnzahl > 0 || daten.betrieb.einsatzbereiteKraefte === 0) && (
            <Card title="Was diese Zahlen nicht enthalten" icon="shield">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: BRAND.text }}>
                {daten.umsatz.nichtFestgeschrieben > 0 && (
                  <div>
                    <strong>{daten.umsatz.nichtFestgeschrieben} Rechnung(en) sind nicht festgeschrieben</strong> und
                    zählen deshalb nicht als Umsatz. Ohne <code>frozen_at</code> ist eine Rechnung nicht
                    rechtswirksam ausgestellt — dieselbe Bedingung trägt die Liste der offenen Posten.
                  </div>
                )}
                {daten.umsatz.nichtGezaehlt > 0 && (
                  <div><strong>{daten.umsatz.nichtGezaehlt} Rechnung(en)</strong> zählen wegen ihres Status nicht (storniert, abgelehnt, Entwurf oder abgeschrieben).</div>
                )}
                {daten.offenePosten.ueberfaelligAnzahl > 0 && (
                  <div><strong>{euro(daten.offenePosten.ueberfaelligEuro)} sind überfällig</strong> ({daten.offenePosten.ueberfaelligAnzahl} Rechnung(en) über dem Zahlungsziel).</div>
                )}
                {daten.betrieb.einsatzbereiteKraefte === 0 && daten.betrieb.kraefte > 0 && (
                  <div>
                    <strong>Keine der {daten.betrieb.kraefte} Kräfte hat eine Einsatzfreigabe.</strong> Damit
                    steht die Leistungskette am Anfang still — ohne freigegebene Kraft entsteht kein Einsatz,
                    kein Nachweis und keine Rechnung.
                  </div>
                )}
              </div>
            </Card>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: isMobile ? 14 : 20 }}>
            <Card title="Betriebslage" icon="activity">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <ProgressBar
                  value={daten.betrieb.kraefte > 0 ? Math.round((daten.betrieb.einsatzbereiteKraefte / daten.betrieb.kraefte) * 100) : 0}
                  label="Einsatzbereitschaft der Kräfte"
                  color={daten.betrieb.einsatzbereiteKraefte === 0 ? BRAND.error : BRAND.success}
                />
                <ProgressBar
                  value={daten.nachweise.gesamt > 0 ? Math.round((daten.nachweise.belegt / daten.nachweise.gesamt) * 100) : 0}
                  label="Leistungsnachweise mit Unterschriftsbeleg"
                  color={BRAND.info}
                />
                <ProgressBar
                  value={daten.auslastung.quoteProzent ?? 0}
                  label="Auslastung (Kräfte im Einsatz)"
                  color={BRAND.gold}
                />
              </div>
            </Card>

            <Card title="Leistungsnachweise" icon="files">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <StatRow label="Erfasst" value={String(daten.nachweise.gesamt)} />
                <StatRow label="Mit Unterschriftsbeleg" value={String(daten.nachweise.belegt)} />
                <StatRow label="Ohne Beleg — nicht abrechenbar" value={String(daten.nachweise.ohneBeleg)} />
                <StatRow label="Bereits abgerechnet" value={String(daten.nachweise.abgerechnet)} />
                <StatRow label="Aktive Einsätze" value={String(daten.betrieb.aktiveEinsaetze)} />
              </div>
            </Card>
          </div>

          <Card title="Marktkennzahlen (gepflegt in mis_kpis)" icon="globe" noPad>
            <DataTable
              columns={[
                { key: 'name', label: 'Kennzahl' },
                { key: 'wert', label: 'Wert', render: (r: Record<string, unknown>) => `${Number(r.wert).toLocaleString('de-DE')} ${r.einheit ?? ''}`.trim() },
                { key: 'ziel', label: 'Ziel', render: (r: Record<string, unknown>) => r.ziel == null ? '—' : `${Number(r.ziel).toLocaleString('de-DE')} ${r.einheit ?? ''}`.trim() },
                { key: 'periode', label: 'Periode', render: (r: Record<string, unknown>) => String(r.periode ?? '—') },
              ]}
              data={daten.markt as unknown as Record<string, unknown>[]}
              emptyMessage="Für diese Organisation sind keine Marktkennzahlen hinterlegt."
            />
          </Card>
        </>
      )}

      {/* ── Angenommen ────────────────────────────────────────────── */}
      <SectionHeader
        title="Planannahmen"
        subtitle="Modellrechnung für die Seed-Runde — keine gemessenen Betriebszahlen"
        icon="target"
      />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: isMobile ? 14 : 20 }}>
        <Card title="5-Jahres-Umsatzprognose (Plan)" icon="chart">
          <MiniBarChart data={FINANCIAL_PROJECTIONS.revenue} labels={FINANCIAL_PROJECTIONS.years} height={160} />
          <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
            <StatRow label="Break-Even" value="~Monat 10-12" />
            <StatRow label="Jahr-5 Umsatz" value="€58,5M" />
            <StatRow label="Bruttomarge" value="~50%" />
          </div>
        </Card>

        <Card title="Einheitsökonomie (Plan)" icon="pieChart">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <StatRow label="Abrechnungssatz" value={`€${UNIT_ECONOMICS.billingRatePerHour}/Std.`} subValue="§45a im Anerkennungsverfahren" />
            <StatRow label="Engel-Vergütung" value={`€${UNIT_ECONOMICS.helperPayPerHour}/Std.`} />
            <StatRow label="Bruttomarge" value={`${(UNIT_ECONOMICS.marginPercent * 100).toFixed(0)}%`} />
            <StatRow label="Marge/Kunde/Mon." value={`€${UNIT_ECONOMICS.marginPerCustomerMonth}`} />
            <StatRow label="CAC" value={`€${UNIT_ECONOMICS.cac}`} />
            <StatRow label="LTV" value={`€${UNIT_ECONOMICS.ltv}`} />
            <StatRow label="LTV/CAC" value={`${UNIT_ECONOMICS.ltvCacRatio}x`} />
            <StatRow label="Payback" value={`${UNIT_ECONOMICS.paybackMonths} Mon.`} />
            <StatRow label="Entlastungsbetrag" value={`€${UNIT_ECONOMICS.entlastungsbetrag}/Mon.`} />
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: isMobile ? 14 : 20 }}>
        <Card title="Nutzerwachstum (Plan, 5 Jahre)" icon="trending">
          <MiniBarChart data={FINANCIAL_PROJECTIONS.users} labels={FINANCIAL_PROJECTIONS.years} color={BRAND.info} height={140} />
        </Card>
        <Card title="Buchungen (Plan, 5 Jahre)" icon="calendar">
          <MiniBarChart data={FINANCIAL_PROJECTIONS.bookings} labels={FINANCIAL_PROJECTIONS.years} color={BRAND.success} height={140} />
        </Card>
      </div>

      <Card title="Schnellaktionen" icon="zap">
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 8 }}>
          {[
            { icon: 'upload', label: 'Dokument hochladen', href: '/mis/documents' },
            { icon: 'chart', label: 'Finanzbericht erstellen', href: '/mis/finance' },
            { icon: 'shield', label: 'Audit planen', href: '/mis/quality' },
            { icon: 'users', label: 'Teammitglied hinzufügen', href: '/mis/team' },
            { icon: 'sparkles', label: 'KI-Analyse starten', href: '/mis/ai-assistant' },
          ].map((action, i) => (
            <a key={i} href={action.href} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              borderRadius: 8, textDecoration: 'none', color: BRAND.text,
              border: `1px solid ${BRAND.border}`, fontSize: 13, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = BRAND.light; e.currentTarget.style.borderColor = BRAND.gold }}
            onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = BRAND.border }}
            >
              <span style={{ color: BRAND.gold }}><MIcon name={action.icon} size={16} /></span>
              {action.label}
            </a>
          ))}
        </div>
      </Card>

      <Card style={{ background: `linear-gradient(135deg, ${BRAND.coal}, #2D2820)`, border: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <h3 style={{ fontSize: 22, fontWeight: 700, color: BRAND.cream, fontFamily: 'var(--font-cormorant), serif', margin: '0 0 6px' }}>
              Seed-Runde: €500.000
            </h3>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
              Pre-Money Bewertung: €2,5M — Ziel: Marktvalidierung, Teamaufbau, Skalierung
            </p>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            {[['40%', 'Produkt'], ['30%', 'Marketing'], ['20%', 'Team'], ['10%', 'Reserve']].map(([wert, label]) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: BRAND.gold, fontFamily: 'var(--font-cormorant), serif' }}>{wert}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
