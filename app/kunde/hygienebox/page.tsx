'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { IconBox, IconShield, IconCheck, IconInfo, IconGloves, IconDroplet } from '@/components/Icons'

interface Product {
  id: string
  name: string
  quantity: string
  checked: boolean
}

export default function HygieneboBoxPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  // Form state
  const [products, setProducts] = useState<Product[]>([
    { id: 'gloves', name: 'Einmalhandschuhe', quantity: '100 Stk.', checked: true },
    { id: 'hand-desinf', name: 'Händedesinfektion', quantity: '500 ml', checked: true },
    { id: 'floor-desinf', name: 'Flächendesinfektion', quantity: '500 ml', checked: true },
    { id: 'mask', name: 'Mundschutz', quantity: '50 Stk.', checked: true },
    { id: 'bed-pads', name: 'Bettschutzeinlagen', quantity: '25 Stk.', checked: false },
    { id: 'apron', name: 'Schutzschürzen', quantity: '100 Stk.', checked: false },
  ])

  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [pflegegrad, setPflegegrad] = useState<number>(1)
  const [insuranceCompany, setInsuranceCompany] = useState('')
  const [insuranceNumber, setInsuranceNumber] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const insuranceOptions = ['AOK', 'TK', 'Barmer', 'DAK', 'IKK', 'KKH']

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }
      setUserId(user.id)

      // Load profile for delivery address
      const { data: profile } = await supabase
        .from('profiles')
        .select('location')
        .eq('id', user.id)
        .single()
      
      if (profile?.location) {
        setDeliveryAddress(profile.location)
      }

      setLoading(false)
    }
    load()
  }, [router])

  function toggleProduct(id: string) {
    setProducts(prev =>
      prev.map(p => p.id === id ? { ...p, checked: !p.checked } : p)
    )
  }

  async function handleSubmit() {
    setError('')

    // Validations
    if (!deliveryAddress.trim()) {
      setError('Bitte geben Sie Ihre Lieferadresse ein.')
      return
    }
    if (!insuranceCompany) {
      setError('Bitte wählen Sie Ihre Krankenkasse.')
      return
    }
    if (!insuranceNumber.trim()) {
      setError('Bitte geben Sie Ihre Versichertennummer ein.')
      return
    }
    if (!consent) {
      setError('Bitte akzeptieren Sie die Beauftragung.')
      return
    }

    const selectedProducts = products.filter(p => p.checked).map(p => p.id)
    if (selectedProducts.length === 0) {
      setError('Bitte wählen Sie mindestens ein Produkt.')
      return
    }

    setSubmitting(true)

    try {
      const supabase = createClient()
      const { error: dbError } = await supabase.from('hygienebox_orders').insert({
        user_id: userId,
        delivery_address: deliveryAddress,
        pflegegrad,
        insurance_company: insuranceCompany,
        insurance_number: insuranceNumber,
        products: selectedProducts,
        consent: consent,
        status: 'submitted',
      })

      if (dbError) throw dbError

      router.push('/kunde/home')
    } catch (err: any) {
      setError(err?.message || 'Fehler beim Senden. Bitte versuchen Sie es erneut.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="screen">
        <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--ink4)' }}>
          Laden...
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      {/* Header */}
      <div className="topbar">
        <Link href="/kunde/home" className="back-btn">←</Link>
        <div className="topbar-title">Hygienebox bestellen</div>
      </div>

      {/* Body */}
      <div className="form-body" style={{ paddingBottom: 100 }}>

        {/* Info Card */}
        <div className="form-card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flexShrink: 0, marginTop: 2 }}>
              <IconShield size={24} color="var(--gold2)" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
                Pflegehilfsmittel zum Verbrauch
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.6 }}>
                <div style={{ marginBottom: 6 }}>
                  Ab Pflegegrad 1 erhalten Sie monatlich bis zu 40 € für Pflegehilfsmittel.
                </div>
                <div style={{ color: 'var(--green)', fontWeight: 600 }}>
                  Die Kosten übernimmt Ihre Pflegekasse — 0 € Eigenanteil
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Product Selection */}
        <div className="form-card-h" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <IconBox size={20} color="var(--green)" />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
              Produkte auswählen
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {products.map(product => (
              <div
                key={product.id}
                onClick={() => toggleProduct(product.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: 10,
                  border: `1.5px solid ${product.checked ? 'var(--green)' : 'var(--border)'}`,
                  backgroundColor: product.checked ? 'rgba(92,184,130,.08)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 200ms',
                }}
              >
                {/* Checkbox */}
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    border: `1.5px solid ${product.checked ? 'var(--green)' : 'var(--border)'}`,
                    backgroundColor: product.checked ? 'var(--green)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 200ms',
                  }}
                >
                  {product.checked && <IconCheck size={12} color="white" />}
                </div>

                {/* Product Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                    {product.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 2 }}>
                    {product.quantity}
                  </div>
                </div>

                {/* Check Icon */}
                {product.checked && (
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 50,
                      backgroundColor: 'rgba(92,184,130,.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <IconCheck size={14} color="var(--green)" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Delivery Info */}
        <div className="form-card-h" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <IconBox size={20} color="var(--green)" />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
              Versand
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink4)', marginBottom: 6 }}>
              Kostenlose Lieferung
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>
              Monatlich automatisch zu Ihnen nach Hause
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 8 }}>
              Lieferadresse
            </label>
            <input
              className="input"
              type="text"
              placeholder="Straße, Hausnummer, PLZ, Stadt"
              value={deliveryAddress}
              onChange={e => setDeliveryAddress(e.target.value)}
            />
          </div>
        </div>

        {/* Pflegegrad Selection */}
        <div className="form-card-h" style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', display: 'block', marginBottom: 12 }}>
            Pflegegrad
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {[1, 2, 3, 4, 5].map(grade => (
              <button
                key={grade}
                type="button"
                onClick={() => setPflegegrad(grade)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1.5px solid ${pflegegrad === grade ? 'var(--green)' : 'var(--border)'}`,
                  backgroundColor: pflegegrad === grade ? 'var(--green)' : 'transparent',
                  color: pflegegrad === grade ? 'white' : 'var(--ink3)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 200ms',
                }}
              >
                {grade}
              </button>
            ))}
          </div>
        </div>

        {/* Insurance Info */}
        <div className="form-card-h" style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', display: 'block', marginBottom: 12 }}>
            Krankenkasse
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
            {insuranceOptions.map(company => (
              <button
                key={company}
                type="button"
                onClick={() => setInsuranceCompany(company)}
                style={{
                  padding: '12px 12px',
                  borderRadius: 8,
                  border: `1.5px solid ${insuranceCompany === company ? 'var(--green)' : 'var(--border)'}`,
                  backgroundColor: insuranceCompany === company ? 'rgba(92,184,130,.08)' : 'transparent',
                  color: insuranceCompany === company ? 'var(--green)' : 'var(--ink3)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 200ms',
                }}
              >
                {company}
              </button>
            ))}
          </div>

          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', display: 'block', marginBottom: 8 }}>
            Versichertennummer
          </label>
          <input
            className="input"
            type="text"
            placeholder="Ihre Versichertennummer"
            value={insuranceNumber}
            onChange={e => setInsuranceNumber(e.target.value)}
          />
        </div>

        {/* Price Summary */}
        <div className="form-card-h" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 16 }}>
            Kostenübersicht
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--ink3)' }}>Warenwert</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>39,90 €</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--ink3)' }}>Kassenleistung</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>-39,90 €</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--ink3)' }}>Versand</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Kostenlos</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Ihr Eigenanteil</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>0,00 €</span>
          </div>
        </div>

        {/* Consent */}
        <div
          onClick={() => setConsent(!consent)}
          style={{
            display: 'flex',
            gap: 12,
            padding: 12,
            borderRadius: 10,
            backgroundColor: consent ? 'rgba(92,184,130,.08)' : 'var(--bg)',
            border: `1.5px solid ${consent ? 'var(--green)' : 'var(--border)'}`,
            cursor: 'pointer',
            marginBottom: 24,
            transition: 'all 200ms',
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 6,
              border: `1.5px solid ${consent ? 'var(--green)' : 'var(--border)'}`,
              backgroundColor: consent ? 'var(--green)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            {consent && <IconCheck size={12} color="white" />}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.5 }}>
            Ich beauftrage Alltagsengel, die Kostenübernahme bei meiner Pflegekasse zu beantragen.
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            padding: 12,
            borderRadius: 8,
            backgroundColor: 'rgba(224,97,89,.08)',
            border: '1px solid rgba(224,97,89,.2)',
            color: 'var(--red-w)',
            fontSize: 13,
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {/* Info Message */}
        <div style={{
          padding: 12,
          borderRadius: 8,
          backgroundColor: 'rgba(92,184,130,.08)',
          border: '1px solid rgba(92,184,130,.2)',
          display: 'flex',
          gap: 10,
          marginBottom: 24,
        }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}><IconInfo size={18} /></span>
          <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.5 }}>
            Nach Ihrer Bestellung kümmern wir uns um die Antragstellung bei Ihrer Pflegekasse. Die Lieferung erfolgt direkt zu Ihnen nach Hause.
          </div>
        </div>

      </div>

      {/* Submit Button */}
      <div className="submit-bar">
        <button
          className="btn-submit"
          disabled={submitting}
          onClick={handleSubmit}
        >
          {submitting ? 'WIRD BEARBEITET...' : 'KOSTENLOS BESTELLEN'}
        </button>
      </div>
    </div>
  )
}
