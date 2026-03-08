'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function FahrerProfilPage() {
  const router = useRouter()
  const supabase = createClient()
  const [profile, setProfile] = useState<any>(null)
  const [provider, setProvider] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')

  // Editable fields
  const [phone, setPhone] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (profileData) {
      setProfile(profileData)
      setPhone(profileData.phone || '')
    }

    const { data: providerData } = await supabase.from('krankenfahrt_providers').select('*').eq('user_id', user.id).single()
    if (providerData) {
      setProvider(providerData)
      setCompanyName(providerData.company_name || '')
      setAddress(providerData.address || '')
      setCity(providerData.city || '')
      setLicenseNumber(providerData.license_number || '')
    }
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    setSuccess('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('profiles').update({ phone }).eq('id', user.id)

    if (provider) {
      await supabase.from('krankenfahrt_providers').update({
        company_name: companyName,
        address,
        city,
        license_number: licenseNumber,
      }).eq('id', provider.id)
    }

    setSaving(false)
    setSuccess('Profil gespeichert!')
    setTimeout(() => setSuccess(''), 3000)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  if (loading) return (
    <div className="phone"><div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ color: '#DBA84A' }}>Laden...</div>
    </div></div>
  )

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    background: '#252118',
    border: '1.5px solid rgba(201,150,60,0.2)',
    borderRadius: '12px',
    color: '#F5F0E8',
    fontSize: '15px',
    outline: 'none',
    fontFamily: 'inherit',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: '600',
    color: 'rgba(245,240,232,0.5)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '6px',
    display: 'block',
  }

  return (
    <div className="phone">
      <div className="screen" style={{ paddingBottom: '100px' }}>
        {/* Top Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px' }}>
          <button onClick={() => router.push('/fahrer/home')} style={{
            width: '38px', height: '38px', borderRadius: '12px',
            background: 'transparent', border: '1.5px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', fontSize: '20px',
          }}>←</button>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '22px', fontWeight: '600', color: '#F5F0E8' }}>Mein Profil</span>
        </div>

        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Avatar */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px 0' }}>
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #C9963C, #DBA84A)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '32px', fontWeight: '700', color: '#1A1612',
            }}>
              {profile?.first_name?.[0]}{profile?.last_name?.[0]}
            </div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#F5F0E8' }}>
              {profile?.first_name} {profile?.last_name}
            </div>
            <div style={{ fontSize: '13px', color: 'rgba(245,240,232,0.4)' }}>
              {profile?.email}
            </div>
          </div>

          {/* Success */}
          {success && (
            <div style={{
              background: 'rgba(76,175,80,0.15)', border: '1px solid rgba(76,175,80,0.3)',
              borderRadius: '12px', padding: '12px 16px', color: '#4CAF50',
              fontSize: '14px', textAlign: 'center',
            }}>✓ {success}</div>
          )}

          {/* Company Info */}
          <div style={{
            background: '#252118', borderRadius: '16px', padding: '20px',
            border: '1px solid rgba(201,150,60,0.12)',
          }}>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#DBA84A', marginBottom: '16px' }}>Unternehmen</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Firmenname</label>
                <input value={companyName} onChange={e => setCompanyName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Konzessionsnummer</label>
                <input value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Adresse</label>
                <input value={address} onChange={e => setAddress(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Stadt</label>
                <input value={city} onChange={e => setCity(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div style={{
            background: '#252118', borderRadius: '16px', padding: '20px',
            border: '1px solid rgba(201,150,60,0.12)',
          }}>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#DBA84A', marginBottom: '16px' }}>Kontakt</div>
            <div>
              <label style={labelStyle}>Telefon</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Save */}
          <button onClick={handleSave} disabled={saving} style={{
            width: '100%', padding: '16px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #C9963C, #DBA84A)',
            border: 'none', color: '#1A1612', fontSize: '16px',
            fontWeight: '700', cursor: 'pointer', opacity: saving ? 0.6 : 1,
          }}>
            {saving ? 'Speichern...' : 'Profil speichern'}
          </button>

          {/* Logout */}
          <button onClick={handleLogout} style={{
            width: '100%', padding: '14px', borderRadius: '14px',
            background: 'transparent', border: '1.5px solid rgba(255,80,80,0.3)',
            color: '#ff5050', fontSize: '15px', fontWeight: '500', cursor: 'pointer',
          }}>
            Abmelden
          </button>
        </div>

        {/* Bottom Nav */}
        <div style={{
          position: 'fixed', bottom: '0', left: '50%', transform: 'translateX(-50%)',
          width: '393px', maxWidth: '100%',
          background: 'linear-gradient(to top, #1A1612 60%, transparent)',
          padding: '12px 20px 28px', display: 'flex', justifyContent: 'space-around',
          zIndex: 50,
        }}>
          {[
            { icon: '🏠', label: 'Home', href: '/fahrer/home' },
            { icon: '📋', label: 'Aufträge', href: '/fahrer/auftraege' },
            { icon: '🚗', label: 'Fahrzeuge', href: '/fahrer/fahrzeuge' },
            { icon: '👤', label: 'Profil', href: '/fahrer/profil', active: true },
          ].map(item => (
            <button key={item.href} onClick={() => router.push(item.href)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              color: item.active ? '#DBA84A' : 'rgba(245,240,232,0.35)',
              fontSize: '20px', padding: '4px 12px',
            }}>
              <span>{item.icon}</span>
              <span style={{ fontSize: '10px', fontWeight: '500' }}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
