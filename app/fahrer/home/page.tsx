'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Icon3D from '@/components/Icon3D'

export default function FahrerHomePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [provider, setProvider] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/auth/login')
        return
      }

      setUser(user)

      // Load profile
      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (profileData) setProfile(profileData)

      // Load provider data if exists
      const { data: providerData } = await supabase.from('krankenfahrt_providers').select('*').eq('user_id', user.id).single()
      if (providerData) setProvider(providerData)

      setLoading(false)
    }

    loadData()
  }, [router])

  if (loading) {
    return (
      <div className="phone">
        <div className="screen" style={{ backgroundColor: '#1A1612', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: '#F5F0E8', fontSize: 16 }}>Wird geladen...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="phone">
      <div className="screen" style={{ backgroundColor: '#1A1612' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 20px 8px',
        }}>
          <button
            onClick={() => router.push('/choose')}
            type="button"
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: '#252118',
              border: '1.5px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 20,
              color: '#C4B8A8',
            }}
          >
            ‹
          </button>
          <div style={{
            flex: 1,
            fontSize: 16,
            fontWeight: 600,
            color: '#F5F0E8',
          }}>
            Fahrer Dashboard
          </div>
        </div>

        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 20px 80px',
        }}>
          {/* Welcome Card */}
          <div style={{
            textAlign: 'center',
            marginBottom: 32,
            paddingTop: 20,
          }}>
            <div style={{ marginBottom: 16 }}><Icon3D size={64} /></div>
            <div style={{
              fontSize: 24,
              fontWeight: 700,
              color: '#F5F0E8',
              marginBottom: 8,
            }}>
              Willkommen, {profile?.first_name || 'Fahrer'}!
            </div>
            <div style={{
              fontSize: 14,
              color: 'rgba(245, 240, 232, 0.4)',
              lineHeight: 1.6,
            }}>
              Ihre Registrierung wird überprüft
            </div>
          </div>

          {/* Status Card */}
          <div style={{
            background: '#252118',
            border: '1px solid rgba(201, 150, 60, 0.15)',
            borderRadius: 16,
            padding: 16,
            marginBottom: 16,
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#C9963C',
              marginBottom: 12,
            }}>
              Status
            </div>
            <div style={{
              fontSize: 13,
              color: '#F5F0E8',
              marginBottom: 8,
            }}>
              Dienstleister: <strong>{provider?.company_name || 'N/A'}</strong>
            </div>
            <div style={{
              fontSize: 13,
              color: '#F5F0E8',
              marginBottom: 8,
            }}>
              Lizenz: <strong>{provider?.license_number || 'N/A'}</strong>
            </div>
            <div style={{
              fontSize: 13,
              color: '#F5F0E8',
              padding: '8px 12px',
              background: 'rgba(201, 150, 60, 0.1)',
              borderRadius: 8,
              marginTop: 12,
            }}>
              {provider?.is_verified ? '✓ Verifiziert' : '⏳ Überprüfung läuft'}
            </div>
          </div>

          {/* Info Card */}
          <div style={{
            background: 'rgba(201, 150, 60, 0.08)',
            border: '1px solid rgba(201, 150, 60, 0.15)',
            borderRadius: 12,
            padding: 12,
          }}>
            <div style={{
              fontSize: 12,
              color: 'rgba(245, 240, 232, 0.6)',
              lineHeight: 1.6,
            }}>
              Ihre Registrierung wird von unserem Team überprüft. Sie werden per E-Mail benachrichtigt, sobald alles bestätigt ist.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
