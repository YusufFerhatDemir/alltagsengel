'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface NotfallData {
  blutgruppe: string
  allergien: string
  vorerkrankungen: string
  notfallkontakt_name: string
  notfallkontakt_telefon: string
  notfallkontakt_beziehung: string
  versicherung: string
  versicherungsnummer: string
  hausarzt_name: string
  hausarzt_telefon: string
  notfall_pin: string
}

export default function NotfallPage() {
  const router = useRouter()
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [formData, setFormData] = useState<NotfallData>({
    blutgruppe: '',
    allergien: '',
    vorerkrankungen: '',
    notfallkontakt_name: '',
    notfallkontakt_telefon: '',
    notfallkontakt_beziehung: '',
    versicherung: '',
    versicherungsnummer: '',
    hausarzt_name: '',
    hausarzt_telefon: '',
    notfall_pin: '',
  })

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) {
          setUserId(user.id)
          await loadNotfallData(user.id)
        } else {
          router.push('/login')
        }
      } catch (error) {
        console.error('Error fetching user:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [])

  const loadNotfallData = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('notfall_info')
        .select('*')
        .eq('user_id', uid)
        .single()

      if (data) {
        setFormData({
          blutgruppe: data.blutgruppe || '',
          allergien: data.allergien || '',
          vorerkrankungen: data.vorerkrankungen || '',
          notfallkontakt_name: data.notfallkontakt_name || '',
          notfallkontakt_telefon: data.notfallkontakt_telefon || '',
          notfallkontakt_beziehung: data.notfallkontakt_beziehung || '',
          versicherung: data.versicherung || '',
          versicherungsnummer: data.versicherungsnummer || '',
          hausarzt_name: data.hausarzt_name || '',
          hausarzt_telefon: data.hausarzt_telefon || '',
          notfall_pin: data.notfall_pin || '',
        })
      }
    } catch (error) {
      console.error('Error loading notfall data:', error)
    }
  }

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target

    if (name === 'notfall_pin') {
      if (/^\d*$/.test(value) && value.length <= 4) {
        setFormData((prev) => ({ ...prev, [name]: value }))
      }
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }))
    }
  }

  const handleSave = async () => {
    if (!userId) return

    setSaving(true)
    try {
      const { error } = await supabase.from('notfall_info').upsert(
        [
          {
            user_id: userId,
            blutgruppe: formData.blutgruppe,
            allergien: formData.allergien,
            vorerkrankungen: formData.vorerkrankungen,
            notfallkontakt_name: formData.notfallkontakt_name,
            notfallkontakt_telefon: formData.notfallkontakt_telefon,
            notfallkontakt_beziehung: formData.notfallkontakt_beziehung,
            versicherung: formData.versicherung,
            versicherungsnummer: formData.versicherungsnummer,
            hausarzt_name: formData.hausarzt_name,
            hausarzt_telefon: formData.hausarzt_telefon,
            notfall_pin: formData.notfall_pin,
          },
        ],
        { onConflict: 'user_id' }
      )

      if (error) {
        console.error('Error saving notfall data:', error)
      } else {
        setSuccessMessage('Notfall-Informationen gespeichert')
        setTimeout(() => setSuccessMessage(''), 3000)
      }
    } catch (error) {
      console.error('Error saving:', error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div
        className="phone"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          className="screen"
          style={{
            backgroundColor: '#1A1612',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <p style={{ color: '#F5F0E8' }}>Laden...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="phone">
      <div className="screen" style={{ backgroundColor: '#1A1612' }}>
        <div style={{ minHeight: '100vh', paddingBottom: '80px' }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '16px',
              borderBottom: '1px solid rgba(201,150,60,0.2)',
            }}
          >
            <Link href="/kunde/home">
              <button
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#C9963C',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                ←
              </button>
            </Link>
            <h1
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: '18px',
                fontWeight: '600',
                color: '#F5F0E8',
                margin: 0,
              }}
            >
              🚨 Notfall-Informationen
            </h1>
            <div style={{ width: '28px' }} />
          </div>

          {/* Success Message */}
          {successMessage && (
            <div
              style={{
                padding: '12px 16px',
                margin: '12px 16px',
                backgroundColor: 'rgba(201,150,60,0.2)',
                border: '1px solid #C9963C',
                borderRadius: '8px',
                color: '#C9963C',
                fontSize: '13px',
                textAlign: 'center',
              }}
            >
              {successMessage}
            </div>
          )}

          {/* Content */}
          <div style={{ padding: '16px' }}>
            {/* Section 1: Persönliche Gesundheitsdaten */}
            <div
              style={{
                backgroundColor: '#252118',
                borderLeft: '3px solid #C9963C',
                padding: '16px',
                borderRadius: '10px',
                marginBottom: '16px',
              }}
            >
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#C9963C',
                  marginBottom: '12px',
                  marginTop: 0,
                }}
              >
                Persönliche Gesundheitsdaten
              </h2>

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    fontSize: '13px',
                    color: 'rgba(245,240,232,0.6)',
                    marginBottom: '6px',
                    display: 'block',
                  }}
                >
                  Blutgruppe
                </label>
                <select
                  name="blutgruppe"
                  value={formData.blutgruppe}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    backgroundColor: '#1A1612',
                    border: '1px solid rgba(201,150,60,0.2)',
                    color: '#F5F0E8',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Bitte wählen</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="0+">0+</option>
                  <option value="0-">0-</option>
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    fontSize: '13px',
                    color: 'rgba(245,240,232,0.6)',
                    marginBottom: '6px',
                    display: 'block',
                  }}
                >
                  Allergien
                </label>
                <textarea
                  name="allergien"
                  value={formData.allergien}
                  onChange={handleInputChange}
                  placeholder="z.B. Penicillin, Nussallergie..."
                  style={{
                    width: '100%',
                    backgroundColor: '#1A1612',
                    border: '1px solid rgba(201,150,60,0.2)',
                    color: '#F5F0E8',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    minHeight: '80px',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: '13px',
                    color: 'rgba(245,240,232,0.6)',
                    marginBottom: '6px',
                    display: 'block',
                  }}
                >
                  Vorerkrankungen
                </label>
                <textarea
                  name="vorerkrankungen"
                  value={formData.vorerkrankungen}
                  onChange={handleInputChange}
                  placeholder="z.B. Diabetes, Herzkrankheit..."
                  style={{
                    width: '100%',
                    backgroundColor: '#1A1612',
                    border: '1px solid rgba(201,150,60,0.2)',
                    color: '#F5F0E8',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    minHeight: '80px',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>

            {/* Section 2: Notfallkontakt */}
            <div
              style={{
                backgroundColor: '#252118',
                borderLeft: '3px solid #C9963C',
                padding: '16px',
                borderRadius: '10px',
                marginBottom: '16px',
              }}
            >
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#C9963C',
                  marginBottom: '12px',
                  marginTop: 0,
                }}
              >
                Notfallkontakt
              </h2>

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    fontSize: '13px',
                    color: 'rgba(245,240,232,0.6)',
                    marginBottom: '6px',
                    display: 'block',
                  }}
                >
                  Name
                </label>
                <input
                  type="text"
                  name="notfallkontakt_name"
                  value={formData.notfallkontakt_name}
                  onChange={handleInputChange}
                  placeholder="Name eingeben"
                  style={{
                    width: '100%',
                    backgroundColor: '#1A1612',
                    border: '1px solid rgba(201,150,60,0.2)',
                    color: '#F5F0E8',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    fontSize: '13px',
                    color: 'rgba(245,240,232,0.6)',
                    marginBottom: '6px',
                    display: 'block',
                  }}
                >
                  Telefonnummer
                </label>
                <input
                  type="tel"
                  name="notfallkontakt_telefon"
                  value={formData.notfallkontakt_telefon}
                  onChange={handleInputChange}
                  placeholder="+49 ..."
                  style={{
                    width: '100%',
                    backgroundColor: '#1A1612',
                    border: '1px solid rgba(201,150,60,0.2)',
                    color: '#F5F0E8',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: '13px',
                    color: 'rgba(245,240,232,0.6)',
                    marginBottom: '6px',
                    display: 'block',
                  }}
                >
                  Beziehung
                </label>
                <select
                  name="notfallkontakt_beziehung"
                  value={formData.notfallkontakt_beziehung}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    backgroundColor: '#1A1612',
                    border: '1px solid rgba(201,150,60,0.2)',
                    color: '#F5F0E8',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Bitte wählen</option>
                  <option value="Ehepartner">Ehepartner</option>
                  <option value="Kind">Kind</option>
                  <option value="Elternteil">Elternteil</option>
                  <option value="Geschwister">Geschwister</option>
                  <option value="Freund/in">Freund/in</option>
                  <option value="Sonstige">Sonstige</option>
                </select>
              </div>
            </div>

            {/* Section 3: Versicherung */}
            <div
              style={{
                backgroundColor: '#252118',
                borderLeft: '3px solid #C9963C',
                padding: '16px',
                borderRadius: '10px',
                marginBottom: '16px',
              }}
            >
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#C9963C',
                  marginBottom: '12px',
                  marginTop: 0,
                }}
              >
                Versicherung
              </h2>

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    fontSize: '13px',
                    color: 'rgba(245,240,232,0.6)',
                    marginBottom: '6px',
                    display: 'block',
                  }}
                >
                  Krankenkasse
                </label>
                <input
                  type="text"
                  name="versicherung"
                  value={formData.versicherung}
                  onChange={handleInputChange}
                  placeholder="z.B. AOK, TK..."
                  style={{
                    width: '100%',
                    backgroundColor: '#1A1612',
                    border: '1px solid rgba(201,150,60,0.2)',
                    color: '#F5F0E8',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: '13px',
                    color: 'rgba(245,240,232,0.6)',
                    marginBottom: '6px',
                    display: 'block',
                  }}
                >
                  Versicherungsnummer
                </label>
                <input
                  type="text"
                  name="versicherungsnummer"
                  value={formData.versicherungsnummer}
                  onChange={handleInputChange}
                  placeholder="Versicherungsnummer"
                  style={{
                    width: '100%',
                    backgroundColor: '#1A1612',
                    border: '1px solid rgba(201,150,60,0.2)',
                    color: '#F5F0E8',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Section 4: Hausarzt */}
            <div
              style={{
                backgroundColor: '#252118',
                borderLeft: '3px solid #C9963C',
                padding: '16px',
                borderRadius: '10px',
                marginBottom: '16px',
              }}
            >
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#C9963C',
                  marginBottom: '12px',
                  marginTop: 0,
                }}
              >
                Hausarzt
              </h2>

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    fontSize: '13px',
                    color: 'rgba(245,240,232,0.6)',
                    marginBottom: '6px',
                    display: 'block',
                  }}
                >
                  Name
                </label>
                <input
                  type="text"
                  name="hausarzt_name"
                  value={formData.hausarzt_name}
                  onChange={handleInputChange}
                  placeholder="Name des Hausarztes"
                  style={{
                    width: '100%',
                    backgroundColor: '#1A1612',
                    border: '1px solid rgba(201,150,60,0.2)',
                    color: '#F5F0E8',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: '13px',
                    color: 'rgba(245,240,232,0.6)',
                    marginBottom: '6px',
                    display: 'block',
                  }}
                >
                  Telefonnummer
                </label>
                <input
                  type="tel"
                  name="hausarzt_telefon"
                  value={formData.hausarzt_telefon}
                  onChange={handleInputChange}
                  placeholder="+49 ..."
                  style={{
                    width: '100%',
                    backgroundColor: '#1A1612',
                    border: '1px solid rgba(201,150,60,0.2)',
                    color: '#F5F0E8',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Section 5: Notfall-PIN */}
            <div
              style={{
                backgroundColor: '#252118',
                borderLeft: '3px solid #C9963C',
                padding: '16px',
                borderRadius: '10px',
                marginBottom: '16px',
              }}
            >
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#C9963C',
                  marginBottom: '12px',
                  marginTop: 0,
                }}
              >
                Notfall-PIN für Rettungsdienst
              </h2>

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    fontSize: '13px',
                    color: 'rgba(245,240,232,0.6)',
                    marginBottom: '6px',
                    display: 'block',
                  }}
                >
                  4-stellige PIN
                </label>
                <input
                  type="text"
                  name="notfall_pin"
                  value={formData.notfall_pin}
                  onChange={handleInputChange}
                  placeholder="0000"
                  maxLength={4}
                  style={{
                    width: '100%',
                    backgroundColor: '#1A1612',
                    border: '1px solid rgba(201,150,60,0.2)',
                    color: '#F5F0E8',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    letterSpacing: '8px',
                    textAlign: 'center',
                  }}
                />
              </div>

              <div
                style={{
                  backgroundColor: 'rgba(201,150,60,0.1)',
                  border: '1px solid rgba(201,150,60,0.2)',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '12px',
                }}
              >
                <p
                  style={{
                    fontSize: '13px',
                    color: 'rgba(245,240,232,0.8)',
                    margin: '0 0 8px 0',
                  }}
                >
                  Mit dieser PIN kann der Rettungsdienst Ihre Medikamente und
                  Notfallinformationen einsehen.
                </p>
                <p
                  style={{
                    fontSize: '12px',
                    color: 'rgba(245,240,232,0.6)',
                    margin: '8px 0 0 0',
                  }}
                >
                  Notfall-Zugang:{' '}
                  <span style={{ color: '#C9963C', fontWeight: '500' }}>
                    alltagsengel.care/notfall/{userId || '[user-id]'}
                  </span>
                </p>
              </div>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%',
                backgroundColor: '#C9963C',
                color: '#1A1612',
                border: 'none',
                borderRadius: '10px',
                padding: '14px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: saving ? 'not-allowed' : 'pointer',
                marginBottom: '16px',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Speichert...' : 'Speichern'}
            </button>
          </div>
        </div>

        {/* Bottom Navigation */}
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            backgroundColor: '#252118',
            borderTop: '1px solid rgba(201,150,60,0.2)',
            padding: '8px 0',
          }}
        >
          <Link href="/kunde/home">
            <button
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(245,240,232,0.6)',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
              }}
            >
              🏠
            </button>
          </Link>
          <Link href="/kunde/medikamente">
            <button
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(245,240,232,0.6)',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
              }}
            >
              💊
            </button>
          </Link>
          <button
            style={{
              background: 'none',
              border: 'none',
              color: '#C9963C',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            🚨
          </button>
          <Link href="/kunde/buchungen">
            <button
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(245,240,232,0.6)',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
              }}
            >
              📋
            </button>
          </Link>
          <Link href="/kunde/profil">
            <button
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(245,240,232,0.6)',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
              }}
            >
              👤
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}
