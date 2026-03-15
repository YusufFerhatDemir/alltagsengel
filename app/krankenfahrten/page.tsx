'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import type { PricingTier, PricingSurcharge } from '@/lib/types/pricing'

export default function KrankenfahrtenPage() {
  const [tiers, setTiers] = useState<PricingTier[]>([])
  const [surcharges, setSurcharges] = useState<PricingSurcharge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/pricing/calculate')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setTiers(data.tiers || [])
          setSurcharges(data.surcharges || [])
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const minPrice = tiers.length > 0
    ? Math.min(...tiers.map(t => Number(t.min_price)))
    : 15

  const baseTier = tiers.find(t => t.slug === 'sitzend') || tiers[0]

  return (
    <div className="screen info-screen">
      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">Krankenfahrten</h1>
      </div>
      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">🚗</div>
          <h2 className="info-hero-title">Krankenfahrten-Vermittlung</h2>
          <p className="info-hero-sub">Sicher und zuverlässig zum Arzt — die Preise richten sich nach Region, Fahrtart und Hilfebedarf</p>
        </div>

        <section className="info-card">
          <h3>Was sind Krankenfahrten?</h3>
          <p>
            Krankenfahrten sind Fahrten zu medizinischen Behandlungen, die von der Krankenkasse
            genehmigt oder verordnet werden. Wir vermitteln qualifizierte Fahrer, die Sie sicher
            und pünktlich zu Ihren Arztterminen bringen.
          </p>
        </section>

        <section className="info-card">
          <h3>Unsere Leistungen</h3>
          <ul className="info-list">
            <li>Fahrten zu Ärzten, Kliniken und Therapien</li>
            <li>Begleitung für mobilitätseingeschränkte Personen</li>
            <li>Pünktliche Abholung und Rückfahrt</li>
            <li>Abrechnung über Verordnung möglich</li>
            <li>Verfügbarkeit nach Region und Partnernetz</li>
          </ul>
        </section>

        {/* Transportarten */}
        <section className="info-card">
          <h3>Transportarten &amp; Preise</h3>
          {loading ? (
            <p style={{ color: 'var(--gray)', fontSize: 13 }}>Preise werden geladen...</p>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tiers.map(tier => (
                  <div key={tier.slug} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)',
                    background: 'var(--bg)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 22 }}>{tier.icon || '🚐'}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{tier.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--gray)' }}>
                          {Number(tier.per_km_rate).toFixed(2).replace('.', ',')} €/km
                          {Number(tier.surcharge_amount) > 0 && ` · +${Number(tier.surcharge_amount).toFixed(0)}€ Zuschlag`}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--gold)' }}>
                        ab {Number(tier.min_price).toFixed(0)} €
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--gray)' }}>Grundpreis {Number(tier.base_price).toFixed(0)} €</div>
                    </div>
                  </div>
                ))}
              </div>

              {surcharges.filter(s => !['night_premium','holiday_premium'].includes(s.slug)).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--ink)' }}>Zusatzleistungen</div>
                  {surcharges.filter(s => !['night_premium','holiday_premium'].includes(s.slug)).map(sc => (
                    <div key={sc.slug} className="info-price-row">
                      <span className="info-price-label">{sc.name}</span>
                      <span className="info-price-val">
                        {sc.surcharge_type === 'fixed' ? `+${Number(sc.value).toFixed(0)} €` : `+${Number(sc.value).toFixed(0)}%`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {surcharges.filter(s => ['night_premium','holiday_premium'].includes(s.slug)).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--ink)' }}>Automatische Zuschläge</div>
                  {surcharges.filter(s => ['night_premium','holiday_premium'].includes(s.slug)).map(sc => (
                    <div key={sc.slug} className="info-price-row">
                      <span className="info-price-label">{sc.name}</span>
                      <span className="info-price-val">+{Number(sc.value).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          <p className="info-price-note">
            Die Preise richten sich nach Region, Fahrtart, Hilfebedarf, Dokumentenstatus und Partnerverfügbarkeit.
            Bei ärztlicher Verordnung übernimmt die Krankenkasse die Kosten ganz oder teilweise.
          </p>
        </section>

        <section className="info-card">
          <h3>So funktioniert&apos;s</h3>
          <div className="info-steps">
            <div className="info-step">
              <div className="info-step-num">1</div>
              <div className="info-step-text">Registrieren Sie sich als Kunde bei Alltagsengel</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-text">Buchen Sie eine Krankenfahrt mit Datum und Ziel</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">3</div>
              <div className="info-step-text">Ein Fahrer wird Ihnen zugeteilt und holt Sie ab</div>
            </div>
          </div>
        </section>

        <div className="info-cta">
          <Link href="/choose">
            <button className="btn-gold" style={{ width: '100%' }}>JETZT FAHRT BUCHEN</button>
          </Link>
        </div>

        <div className="legal-footer-nav">
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/agb">AGB</Link>
        </div>
      </div>
    </div>
  )
}
