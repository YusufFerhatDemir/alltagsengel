'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TopBar from '@/components/TopBar'
import { IconCheck, IconBox, IconShieldPlain, IconDroplet, IconTruck } from '@/components/Icons'
import type { CareboxCatalogItem, CareboxCartItem } from '@/lib/types'
import { trackPflegeboxOrder } from '@/lib/tracking'

const BUDGET_MAX = 42

const statusLabels: Record<string, string> = {
  draft: 'Entwurf',
  submitted: 'Eingereicht',
  sent: 'An Partner gesendet',
  accepted: 'Genehmigt',
  rejected: 'Abgelehnt',
  shipped: 'Versendet',
  delivered: 'Geliefert',
  cancelled: 'Storniert',
}

export default function PflegeboxPage() {
  const router = useRouter()
  const [step, setStep] = useState<'check' | 'catalog' | 'checkout' | 'done'>('check')
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  // Eligibility
  const [pflegegrad, setPflegegrad] = useState<number>(0)
  const [homeCare, setHomeCare] = useState(true)
  const [insuranceType, setInsuranceType] = useState<'public' | 'private' | 'unknown'>('unknown')
  const [eligible, setEligible] = useState<boolean | null>(null)

  // Catalog
  const [catalogItems, setCatalogItems] = useState<CareboxCatalogItem[]>([])
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({})

  // Checkout
  const [deliveryName, setDeliveryName] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryPhone, setDeliveryPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [orderError, setOrderError] = useState('')

  // Existing order
  const [existingOrder, setExistingOrder] = useState<any>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserId(user.id)

      // Load profile for delivery defaults
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (profile) {
        setDeliveryName(`${profile.first_name} ${profile.last_name}`.trim())
        setDeliveryAddress(profile.location || '')
        setDeliveryPhone(profile.phone || '')
      }

      // Load existing eligibility
      const { data: elig } = await supabase.from('care_eligibility').select('*').eq('user_id', user.id).single()
      if (elig) {
        setPflegegrad(elig.pflegegrad)
        setHomeCare(elig.home_care)
        setInsuranceType(elig.insurance_type)
        if (elig.pflegegrad >= 1 && elig.home_care) {
          setEligible(true)
          setStep('catalog')
        }
      }

      // Load catalog
      const { data: items } = await supabase
        .from('carebox_catalog_items')
        .select('*')
        .eq('active', true)
        .order('sort_order')
      setCatalogItems(items || [])

      // Check for existing order this month
      const currentMonth = new Date().toISOString().slice(0, 7)
      const { data: orders } = await supabase
        .from('carebox_order_requests')
        .select('*, carebox_cart(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
      if (orders && orders.length > 0 && orders[0].status !== 'cancelled') {
        setExistingOrder(orders[0])
      }

      setLoading(false)
    }
    load()
  }, [router])

  // Demo catalog fallback
  const displayItems: CareboxCatalogItem[] = catalogItems.length > 0 ? catalogItems : [
    { id: 'demo-1', name: 'Einmalhandschuhe (Nitril)', category: 'hygiene', description: '100 Stück, puderfrei, latexfrei', unit_type: 'Box', default_price_estimate: 8.50, max_qty: 2, active: true, sort_order: 1 },
    { id: 'demo-2', name: 'Händedesinfektionsmittel', category: 'desinfektion', description: '500 ml Flasche', unit_type: 'Flasche', default_price_estimate: 5.90, max_qty: 2, active: true, sort_order: 2 },
    { id: 'demo-3', name: 'Flächendesinfektionstücher', category: 'desinfektion', description: '80 Tücher pro Packung', unit_type: 'Packung', default_price_estimate: 6.50, max_qty: 2, active: true, sort_order: 3 },
    { id: 'demo-4', name: 'Mundschutz (OP-Masken)', category: 'hygiene', description: '50 Stück, 3-lagig', unit_type: 'Box', default_price_estimate: 4.90, max_qty: 2, active: true, sort_order: 4 },
    { id: 'demo-5', name: 'Schutzschürzen (Einweg)', category: 'hygiene', description: '100 Stück, PE-Folie', unit_type: 'Box', default_price_estimate: 7.90, max_qty: 1, active: true, sort_order: 5 },
    { id: 'demo-6', name: 'Bettschutzeinlagen (Einweg)', category: 'hygiene', description: '25 Stück, 60×90 cm, saugstark', unit_type: 'Packung', default_price_estimate: 9.90, max_qty: 2, active: true, sort_order: 6 },
    { id: 'demo-7', name: 'Fingerlinge', category: 'hygiene', description: '100 Stück, Latex', unit_type: 'Box', default_price_estimate: 3.50, max_qty: 1, active: true, sort_order: 7 },
    { id: 'demo-8', name: 'FFP2-Masken', category: 'hygiene', description: '10 Stück, einzelverpackt', unit_type: 'Box', default_price_estimate: 6.90, max_qty: 1, active: true, sort_order: 8 },
  ]

  const estimatedTotal = Object.entries(selectedItems).reduce((sum, [itemId, qty]) => {
    const item = displayItems.find(i => i.id === itemId)
    return sum + (item?.default_price_estimate || 0) * qty
  }, 0)

  const budgetPct = Math.min((estimatedTotal / BUDGET_MAX) * 100, 100)
  const overBudget = estimatedTotal > BUDGET_MAX

  function toggleItem(itemId: string) {
    setSelectedItems(prev => {
      const copy = { ...prev }
      if (copy[itemId]) {
        delete copy[itemId]
      } else {
        copy[itemId] = 1
      }
      return copy
    })
  }

  function setQty(itemId: string, qty: number) {
    const item = displayItems.find(i => i.id === itemId)
    if (!item) return
    if (qty < 1) {
      setSelectedItems(prev => { const c = { ...prev }; delete c[itemId]; return c })
    } else if (qty <= item.max_qty) {
      setSelectedItems(prev => ({ ...prev, [itemId]: qty }))
    }
  }

  async function handleCheckEligibility() {
    const isEligible = pflegegrad >= 1 && homeCare
    setEligible(isEligible)

    if (userId) {
      const supabase = createClient()
      await supabase.from('care_eligibility').upsert({
        user_id: userId,
        pflegegrad,
        home_care: homeCare,
        insurance_type: insuranceType,
        pflegehilfsmittel_interest: true,
      })
    }

    if (isEligible) {
      setTimeout(() => setStep('catalog'), 600)
    }
  }

  async function handleSubmitOrder() {
    if (!consent) { setOrderError('Bitte stimmen Sie der Datenübermittlung zu.'); return }
    if (!deliveryName.trim() || !deliveryAddress.trim()) { setOrderError('Bitte füllen Sie Name und Adresse aus.'); return }
    if (Object.keys(selectedItems).length === 0) { setOrderError('Bitte wählen Sie mindestens ein Produkt.'); return }

    setSubmitting(true)
    setOrderError('')

    try {
      const supabase = createClient()
      const currentMonth = new Date().toISOString().slice(0, 7)
      const cartItems: CareboxCartItem[] = Object.entries(selectedItems).map(([item_id, qty]) => ({ item_id, qty }))

      // Create cart
      const { data: cart, error: cartError } = await supabase.from('carebox_cart').insert({
        user_id: userId,
        month: currentMonth,
        items: cartItems,
        estimated_total: estimatedTotal,
        status: 'submitted',
      }).select().single()

      if (cartError) throw cartError

      // Create order request
      const { data: order, error: orderErr } = await supabase.from('carebox_order_requests').insert({
        user_id: userId,
        cart_id: cart.id,
        delivery_name: deliveryName,
        delivery_address: deliveryAddress,
        delivery_phone: deliveryPhone,
        consent_share_data: consent,
        status: 'submitted',
        audit_log: [{ action: 'submitted', timestamp: new Date().toISOString(), note: 'Vom Kunden eingereicht' }],
      }).select().single()

      if (orderErr) throw orderErr

      // Conversion-Tracking für Google Ads
      trackPflegeboxOrder(estimatedTotal > 30 ? 'komfort' : 'basis')

      setExistingOrder(order)
      setStep('done')
    } catch (err: any) {
      setOrderError(err?.message || 'Fehler beim Senden. Bitte versuchen Sie es erneut.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="screen" id="pflegebox">
        <TopBar title="Pflegebox" backHref="/kunde" dark />
        <div className="pb-body" style={{ textAlign: 'center', paddingTop: 60, color: 'var(--ink4)' }}>Laden...</div>
      </div>
    )
  }

  // Show existing order status
  if (existingOrder && step !== 'done') {
    return (
      <div className="screen" id="pflegebox">
        <TopBar title="Pflegebox" backHref="/kunde" dark />
        <div className="pb-body">
          <div className="pb-elig-card">
            <div className="pb-elig-title">Ihre aktuelle Bestellung</div>
            <div className="pb-elig-sub">Sie haben bereits eine Pflegebox für diesen Monat bestellt.</div>

            <div style={{ marginBottom: 12 }}>
              <span className={`pb-status ${existingOrder.status}`}>
                {statusLabels[existingOrder.status] || existingOrder.status}
              </span>
            </div>

            <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.6 }}>
              <div><strong>Name:</strong> {existingOrder.delivery_name}</div>
              <div><strong>Adresse:</strong> {existingOrder.delivery_address}</div>
              <div><strong>Erstellt:</strong> {new Date(existingOrder.created_at).toLocaleDateString('de-DE')}</div>
            </div>
          </div>

          <div className="pb-info">
            <div className="pb-info-text">
              Ihre Bestellung wird bearbeitet. Sie erhalten eine Benachrichtigung, sobald sich der Status ändert. Bei Fragen kontaktieren Sie uns über den Chat.
            </div>
          </div>

          <button
            className="btn-gold"
            style={{ width: '100%' }}
            onClick={() => { setExistingOrder(null); setStep('catalog') }}
          >
            NEUE BESTELLUNG AUFGEBEN
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen" id="pflegebox">
      <TopBar title="Pflegebox" backHref="/kunde" dark />
      <div className="pb-body">

        {/* ── STEP 1: Anspruchsprüfung ── */}
        {step === 'check' && (
          <>
            <div className="pb-elig-card">
              <div className="pb-elig-title">Anspruch prüfen</div>
              <div className="pb-elig-sub">
                Pflegehilfsmittel zum Verbrauch (z.B. Handschuhe, Desinfektion, Masken, Bettschutzeinlagen) können – bei Pflegegrad 1–5 und häuslicher Pflege – bis zu 42 € pro Monat übernommen werden.
              </div>

              {/* Pflegegrad */}
              <div className="reg-section">
                <div className="reg-section-title">Ihr Pflegegrad</div>
                <div className="reg-toggle-row">
                  {[0, 1, 2, 3, 4, 5].map(g => (
                    <button
                      key={g}
                      type="button"
                      className={`reg-toggle-btn${pflegegrad === g ? ' active' : ''}`}
                      onClick={() => setPflegegrad(g)}
                    >
                      {g === 0 ? 'Kein' : `${g}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Häusliche Pflege */}
              <div className="reg-section">
                <div className="reg-section-title">Pflege findet zu Hause statt?</div>
                <div className="reg-switch-row" onClick={() => setHomeCare(!homeCare)}>
                  <span className="reg-switch-label">{homeCare ? 'Ja, häusliche Pflege' : 'Nein'}</span>
                  <div className={`reg-switch${homeCare ? ' on' : ''}`}>
                    <div className="reg-switch-knob" />
                  </div>
                </div>
              </div>

              {/* Versicherungstyp */}
              <div className="reg-section">
                <div className="reg-section-title">Versicherung (optional)</div>
                <div className="reg-toggle-row">
                  {[
                    { val: 'public' as const, label: 'Gesetzlich' },
                    { val: 'private' as const, label: 'Privat' },
                    { val: 'unknown' as const, label: 'Unsicher' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      type="button"
                      className={`reg-toggle-btn${insuranceType === opt.val ? ' active' : ''}`}
                      onClick={() => setInsuranceType(opt.val)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="btn-gold"
                style={{ width: '100%', marginTop: 18 }}
                onClick={handleCheckEligibility}
              >
                ANSPRUCH PRÜFEN
              </button>
            </div>

            {/* Result */}
            {eligible !== null && (
              eligible ? (
                <div className="pb-result eligible">
                  <div className="pb-result-icon"><IconCheck size={20} /></div>
                  <div className="pb-result-text">
                    Anspruch wahrscheinlich gegeben! Bei Pflegegrad {pflegegrad} und häuslicher Pflege können bis zu 42 € pro Monat übernommen werden.
                  </div>
                </div>
              ) : (
                <div className="pb-result not-eligible">
                  <div className="pb-result-icon">!</div>
                  <div className="pb-result-text">
                    {pflegegrad === 0
                      ? 'Ohne Pflegegrad ist eine Kostenübernahme leider nicht möglich. Sie können Produkte als Selbstzahler bestellen.'
                      : 'Bei nicht-häuslicher Pflege ist die Kostenübernahme eingeschränkt. Sie können Produkte als Selbstzahler bestellen.'
                    }
                  </div>
                </div>
              )
            )}

            {eligible === false && (
              <button
                className="btn-ghost"
                style={{ width: '100%', marginTop: 8 }}
                onClick={() => setStep('catalog')}
              >
                PRIVAT BESTELLEN (SELBSTZAHLER)
              </button>
            )}

            <div className="pb-info" style={{ marginTop: 16 }}>
              <div className="pb-info-text">
                <strong>§40 Abs. 2 SGB XI:</strong> Pflegehilfsmittel zum Verbrauch – bis zu 42 € pro Monat (seit 01.01.2025), bei häuslicher Pflege und Pflegegrad 1–5. Die Abwicklung kann je Pflegekasse unterschiedlich sein. Wir helfen beim Antrag und leiten an unsere Partner weiter.
              </div>
            </div>
          </>
        )}

        {/* ── STEP 2: Produktkatalog ── */}
        {step === 'catalog' && (
          <>
            <div className="pb-elig-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                <IconBox size={18} color="var(--green)" />
                <div className="pb-elig-title" style={{ fontSize: 18, marginBottom: 0 }}>Produkte auswählen</div>
              </div>
              <div className="pb-elig-sub" style={{ marginBottom: 0 }}>
                Wählen Sie die Pflegehilfsmittel aus, die Sie monatlich benötigen.
              </div>
            </div>

            {/* Budget Bar */}
            <div className="pb-budget">
              <div className="pb-budget-title">Monatliches Budget</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div className="pb-budget-amount" style={overBudget ? { color: 'var(--red-w)' } : {}}>
                  {estimatedTotal.toFixed(2)} €
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink4)' }}>von {BUDGET_MAX},00 €</div>
              </div>
              <div className="pb-budget-bar">
                <div className={`pb-budget-fill${overBudget ? ' over' : ''}`} style={{ width: `${budgetPct}%` }} />
              </div>
              <div className="pb-budget-labels">
                <span>0 €</span>
                <span>{BUDGET_MAX} €</span>
              </div>
              {overBudget && (
                <div style={{ fontSize: 11, color: 'var(--red-w)', marginTop: 6 }}>
                  Hinweis: Der geschätzte Betrag übersteigt die monatliche Pauschale. Differenz ggf. als Selbstzahler.
                </div>
              )}
            </div>

            {/* Catalog List */}
            <div className="pb-catalog">
              {displayItems.map(item => {
                const isSelected = !!selectedItems[item.id]
                const qty = selectedItems[item.id] || 0
                return (
                  <div key={item.id} className={`pb-item${isSelected ? ' selected' : ''}`} onClick={() => !isSelected && toggleItem(item.id)}>
                    <div className="pb-item-check" onClick={(e) => { e.stopPropagation(); toggleItem(item.id) }}>
                      {isSelected && <IconCheck size={14} color="white" />}
                    </div>
                    <div className="pb-item-info">
                      <div className="pb-item-name">{item.name}</div>
                      <div className="pb-item-desc">{item.description}</div>
                      {isSelected && (
                        <div className="pb-qty">
                          <button className="pb-qty-btn" type="button" onClick={(e) => { e.stopPropagation(); setQty(item.id, qty - 1) }}>−</button>
                          <span className="pb-qty-val">{qty}</span>
                          <button className="pb-qty-btn" type="button" onClick={(e) => { e.stopPropagation(); setQty(item.id, qty + 1) }}>+</button>
                          <span style={{ fontSize: 10, color: 'var(--ink4)' }}>max {item.max_qty}</span>
                        </div>
                      )}
                    </div>
                    <div className="pb-item-right">
                      <div className="pb-item-price">~{(item.default_price_estimate || 0).toFixed(2)} €</div>
                      <div className="pb-item-unit">/ {item.unit_type}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="pb-sticky">
              <button
                className="btn-gold"
                style={{ width: '100%' }}
                disabled={Object.keys(selectedItems).length === 0}
                onClick={() => setStep('checkout')}
              >
                WEITER ZUR BESTELLUNG ({Object.keys(selectedItems).length} Produkte)
              </button>
              <button
                className="btn-ghost"
                style={{ width: '100%', marginTop: 8 }}
                onClick={() => setStep('check')}
              >
                ZURÜCK
              </button>
            </div>
          </>
        )}

        {/* ── STEP 3: Checkout ── */}
        {step === 'checkout' && (
          <>
            <div className="pb-checkout">
              <div className="pb-checkout-title">Bestellung abschließen</div>

              {/* Summary */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', marginBottom: 8 }}>Ihre Auswahl</div>
                {Object.entries(selectedItems).map(([itemId, qty]) => {
                  const item = displayItems.find(i => i.id === itemId)
                  if (!item) return null
                  return (
                    <div key={itemId} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 13, color: 'var(--ink2)' }}>{qty}× {item.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold2)' }}>~{((item.default_price_estimate || 0) * qty).toFixed(2)} €</span>
                    </div>
                  )
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Gesamt (geschätzt)</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: eligible ? 'var(--green)' : 'var(--gold2)' }}>{estimatedTotal.toFixed(2)} €</span>
                </div>
                {eligible && (
                  <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>
                    Kostenübernahme durch Pflegekasse möglich (bis 42 €/Monat)
                  </div>
                )}
              </div>

              {/* Delivery Info */}
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', marginBottom: 8 }}>Lieferadresse</div>
              <input
                className="auth-input"
                type="text"
                placeholder="Vor- und Nachname"
                value={deliveryName}
                onChange={e => setDeliveryName(e.target.value)}
                required
              />
              <input
                className="auth-input"
                type="text"
                placeholder="Straße, Hausnummer, PLZ, Stadt"
                value={deliveryAddress}
                onChange={e => setDeliveryAddress(e.target.value)}
                required
              />
              <input
                className="auth-input"
                type="tel"
                placeholder="Telefon (optional)"
                value={deliveryPhone}
                onChange={e => setDeliveryPhone(e.target.value)}
              />
            </div>

            {/* DSGVO Consent */}
            <div className={`pb-consent${consent ? ' checked' : ''}`} onClick={() => setConsent(!consent)}>
              <div className="pb-consent-box">
                {consent && <IconCheck size={12} color="white" />}
              </div>
              <div className="pb-consent-text">
                Ich willige ein, dass meine Kontaktdaten und Auswahl an den Versand-/Kooperationspartner übermittelt werden, um die Pflegebox zu beantragen und zu liefern. Meine Daten werden gemäß DSGVO verarbeitet. Ich kann meine Einwilligung jederzeit widerrufen.
              </div>
            </div>

            {orderError && (
              <div style={{ fontSize: 12, color: 'var(--red-w)', padding: '8px 0' }}>{orderError}</div>
            )}

            <div className="pb-info" style={{ marginBottom: 16 }}>
              <div className="pb-info-text">
                <strong>Wie geht es weiter?</strong><br />
                Wir leiten Ihre Auswahl an unseren Partner weiter. Dieser kümmert sich um Antrag, Genehmigung und Versand. Sie erhalten Statusupdates in der App.
              </div>
            </div>

            <div className="pb-sticky">
              <button
                className="btn-gold"
                style={{ width: '100%' }}
                disabled={submitting || !consent}
                onClick={handleSubmitOrder}
              >
                {submitting ? 'WIRD GESENDET...' : 'JETZT BESTELLEN'}
              </button>
              <button
                className="btn-ghost"
                style={{ width: '100%', marginTop: 8 }}
                onClick={() => setStep('catalog')}
              >
                ZURÜCK ZUR AUSWAHL
              </button>
            </div>
          </>
        )}

        {/* ── STEP 4: Done ── */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(92,184,130,.12)', border: '1px solid rgba(92,184,130,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <IconCheck size={28} color="var(--green)" />
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
              Bestellung eingereicht!
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.6, marginBottom: 24, padding: '0 20px' }}>
              Ihre Pflegebox-Bestellung wurde erfolgreich eingereicht. Wir leiten sie an unseren Partner weiter.
            </div>

            <div className="pb-info">
              <div className="pb-info-text">
                <strong>Nächste Schritte:</strong><br />
                1. Partner prüft Ihre Angaben<br />
                2. Antrag bei Pflegekasse (falls nötig)<br />
                3. Versand direkt zu Ihnen nach Hause<br />
                4. Monatliche Lieferung
              </div>
            </div>

            <button
              className="btn-gold"
              style={{ width: '100%', marginTop: 20 }}
              onClick={() => router.push('/kunde/home')}
            >
              ZURÜCK ZUR STARTSEITE
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
