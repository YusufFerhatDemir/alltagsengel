'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function FahrzeugeManagementPage() {
  const router = useRouter()
  const [vehicles, setVehicles] = useState<any[]>([])
  const [provider, setProvider] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    kennzeichen: '',
    marke: '',
    modell: '',
    baujahr: '',
    farbe: '',
    sitze: '',
    rollstuhl_geeignet: false,
    tragestuhl_geeignet: false,
    liegend_transport: false,
    klimaanlage: false,
    tuev_bis: '',
    versicherung_bis: '',
  })

  // Load vehicles and provider data
  useEffect(() => {
    async function loadData() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }

        // Get provider ID for current user
        const { data: providerData } = await supabase
          .from('krankenfahrt_providers')
          .select('*')
          .eq('user_id', user.id)
          .single()

        if (providerData) {
          setProvider(providerData)

          // Load vehicles for this provider
          const { data: vehiclesData } = await supabase
            .from('fahrzeuge')
            .select('*')
            .eq('provider_id', providerData.id)
            .order('created_at', { ascending: false })

          setVehicles(vehiclesData || [])
        }
      } catch (err) {
        console.error('Load error:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // Handle add vehicle
  async function handleAddVehicle() {
    if (!formData.kennzeichen || !formData.marke || !formData.modell || !provider) {
      alert('Bitte füllen Sie mindestens Kennzeichen, Marke und Modell aus')
      return
    }

    setSaving(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('fahrzeuge')
        .insert([
          {
            provider_id: provider.id,
            kennzeichen: formData.kennzeichen,
            marke: formData.marke,
            modell: formData.modell,
            baujahr: formData.baujahr ? parseInt(formData.baujahr) : null,
            farbe: formData.farbe,
            sitze: formData.sitze ? parseInt(formData.sitze) : null,
            rollstuhl_geeignet: formData.rollstuhl_geeignet,
            tragestuhl_geeignet: formData.tragestuhl_geeignet,
            liegend_transport: formData.liegend_transport,
            klimaanlage: formData.klimaanlage,
            tuev_bis: formData.tuev_bis || null,
            versicherung_bis: formData.versicherung_bis || null,
            is_active: true,
          },
        ])
        .select()

      if (!error && data) {
        setVehicles((prev) => [data[0], ...prev])
        setFormData({
          kennzeichen: '',
          marke: '',
          modell: '',
          baujahr: '',
          farbe: '',
          sitze: '',
          rollstuhl_geeignet: false,
          tragestuhl_geeignet: false,
          liegend_transport: false,
          klimaanlage: false,
          tuev_bis: '',
          versicherung_bis: '',
        })
        setShowForm(false)
      }
    } catch (err) {
      console.error('Add vehicle error:', err)
      alert('Fehler beim Hinzufügen des Fahrzeugs')
    } finally {
      setSaving(false)
    }
  }

  // Handle toggle active status
  async function handleToggleActive(vehicleId: string, currentStatus: boolean) {
    try {
      const supabase = createClient()
      await supabase
        .from('fahrzeuge')
        .update({ is_active: !currentStatus })
        .eq('id', vehicleId)

      setVehicles((prev) =>
        prev.map((v) =>
          v.id === vehicleId ? { ...v, is_active: !currentStatus } : v
        )
      )
    } catch (err) {
      console.error('Toggle error:', err)
    }
  }

  // Format date for display
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nicht angegeben'
    try {
      return new Date(dateStr).toLocaleDateString('de-DE')
    } catch {
      return 'Ungültig'
    }
  }

  // Check if date is upcoming (within 3 months)
  const isUpcoming = (dateStr: string | null) => {
    if (!dateStr) return false
    const date = new Date(dateStr)
    const now = new Date()
    const threeMonthsFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
    return date <= threeMonthsFromNow && date > now
  }

  if (loading) {
    return (
      <div className="phone">
        <div className="screen" style={{ backgroundColor: '#1A1612', color: '#F5F0E8' }}>
          <div style={{ padding: '20px', textAlign: 'center' }}>Laden...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="phone">
      <div className="screen" style={{ backgroundColor: '#1A1612', color: '#F5F0E8' }}>
        {/* Header */}
        <div
          style={{
            padding: '16px',
            borderBottom: '1px solid #2a2420',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <button
            onClick={() => router.back()}
            style={{
              background: 'none',
              border: 'none',
              color: '#C9963C',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '8px',
            }}
          >
            ←
          </button>
          <div>
            <h1 style={{ margin: '0 0 2px 0', fontSize: '18px', fontWeight: '600' }}>
              Meine Fahrzeuge
            </h1>
            <div style={{ fontSize: '12px', color: '#a89976' }}>
              {vehicles.length} Fahrzeug{vehicles.length !== 1 ? 'e' : ''}
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '0 0 60px 0', overflowY: 'auto', maxHeight: 'calc(100vh - 70px)' }}>
          {/* Vehicle List */}
          {vehicles.length > 0 ? (
            <div style={{ padding: '12px' }}>
              {vehicles.map((vehicle) => (
                <div
                  key={vehicle.id}
                  style={{
                    backgroundColor: '#2a2420',
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '12px',
                    border: '1px solid #3a3430',
                  }}
                >
                  {/* License Plate */}
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '20px',
                      fontWeight: '700',
                      backgroundColor: '#F5F0E8',
                      color: '#1A1612',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      textAlign: 'center',
                      marginBottom: '12px',
                      letterSpacing: '1px',
                    }}
                  >
                    {vehicle.kennzeichen}
                  </div>

                  {/* Vehicle Info */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
                      {vehicle.marke} {vehicle.modell}
                    </div>
                    {vehicle.baujahr && (
                      <div style={{ fontSize: '13px', color: '#a89976' }}>
                        Baujahr: {vehicle.baujahr}
                      </div>
                    )}
                    {vehicle.farbe && (
                      <div style={{ fontSize: '13px', color: '#a89976' }}>
                        Farbe: {vehicle.farbe}
                      </div>
                    )}
                  </div>

                  {/* Capability Badges */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    {vehicle.rollstuhl_geeignet && (
                      <div
                        style={{
                          backgroundColor: '#3a3430',
                          border: '1px solid #C9963C',
                          color: '#DBA84A',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                        }}
                      >
                        🦽 Rollstuhl
                      </div>
                    )}
                    {vehicle.tragestuhl_geeignet && (
                      <div
                        style={{
                          backgroundColor: '#3a3430',
                          border: '1px solid #C9963C',
                          color: '#DBA84A',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                        }}
                      >
                        🪑 Tragestuhl
                      </div>
                    )}
                    {vehicle.liegend_transport && (
                      <div
                        style={{
                          backgroundColor: '#3a3430',
                          border: '1px solid #C9963C',
                          color: '#DBA84A',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                        }}
                      >
                        🛏️ Liegend
                      </div>
                    )}
                    {vehicle.klimaanlage && (
                      <div
                        style={{
                          backgroundColor: '#3a3430',
                          border: '1px solid #C9963C',
                          color: '#DBA84A',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                        }}
                      >
                        ❄️ Klima
                      </div>
                    )}
                  </div>

                  {/* Dates and Info */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', color: '#a89976', marginBottom: '6px' }}>
                      <div>
                        TÜV bis:{' '}
                        <span
                          style={{
                            color: isUpcoming(vehicle.tuev_bis) ? '#ff9999' : '#DBA84A',
                            fontWeight: '600',
                          }}
                        >
                          {formatDate(vehicle.tuev_bis)}
                        </span>
                      </div>
                      <div>
                        Versicherung bis:{' '}
                        <span
                          style={{
                            color: isUpcoming(vehicle.versicherung_bis) ? '#ff9999' : '#DBA84A',
                            fontWeight: '600',
                          }}
                        >
                          {formatDate(vehicle.versicherung_bis)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Active Toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={vehicle.is_active}
                        onChange={() => handleToggleActive(vehicle.id, vehicle.is_active)}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: 'pointer',
                          accentColor: '#C9963C',
                        }}
                      />
                      <span style={{ marginLeft: '8px' }}>
                        {vehicle.is_active ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: '#a89976',
              }}
            >
              <div style={{ fontSize: '14px', marginBottom: '16px' }}>
                Keine Fahrzeuge vorhanden
              </div>
            </div>
          )}

          {/* Add Form - Expandable */}
          {showForm && (
            <div style={{ padding: '16px' }}>
              <div
                style={{
                  backgroundColor: '#2a2420',
                  borderRadius: '12px',
                  padding: '16px',
                  border: '1px solid #3a3430',
                }}
              >
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>
                  Neues Fahrzeug
                </h3>

                {/* Form Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: '#a89976', display: 'block', marginBottom: '4px' }}>
                      Kennzeichen *
                    </label>
                    <input
                      type="text"
                      placeholder="z.B. AB-CD 123"
                      value={formData.kennzeichen}
                      onChange={(e) => setFormData({ ...formData, kennzeichen: e.target.value })}
                      style={{
                        width: '100%',
                        backgroundColor: '#1A1612',
                        border: '1px solid #3a3430',
                        color: '#F5F0E8',
                        padding: '10px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: '#a89976', display: 'block', marginBottom: '4px' }}>
                      Marke *
                    </label>
                    <input
                      type="text"
                      placeholder="z.B. Mercedes"
                      value={formData.marke}
                      onChange={(e) => setFormData({ ...formData, marke: e.target.value })}
                      style={{
                        width: '100%',
                        backgroundColor: '#1A1612',
                        border: '1px solid #3a3430',
                        color: '#F5F0E8',
                        padding: '10px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: '#a89976', display: 'block', marginBottom: '4px' }}>
                      Modell *
                    </label>
                    <input
                      type="text"
                      placeholder="z.B. Sprinter"
                      value={formData.modell}
                      onChange={(e) => setFormData({ ...formData, modell: e.target.value })}
                      style={{
                        width: '100%',
                        backgroundColor: '#1A1612',
                        border: '1px solid #3a3430',
                        color: '#F5F0E8',
                        padding: '10px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: '#a89976', display: 'block', marginBottom: '4px' }}>
                      Baujahr
                    </label>
                    <input
                      type="number"
                      placeholder="z.B. 2022"
                      value={formData.baujahr}
                      onChange={(e) => setFormData({ ...formData, baujahr: e.target.value })}
                      style={{
                        width: '100%',
                        backgroundColor: '#1A1612',
                        border: '1px solid #3a3430',
                        color: '#F5F0E8',
                        padding: '10px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: '#a89976', display: 'block', marginBottom: '4px' }}>
                      Farbe
                    </label>
                    <input
                      type="text"
                      placeholder="z.B. Weiß"
                      value={formData.farbe}
                      onChange={(e) => setFormData({ ...formData, farbe: e.target.value })}
                      style={{
                        width: '100%',
                        backgroundColor: '#1A1612',
                        border: '1px solid #3a3430',
                        color: '#F5F0E8',
                        padding: '10px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: '#a89976', display: 'block', marginBottom: '4px' }}>
                      Sitze
                    </label>
                    <input
                      type="number"
                      placeholder="z.B. 4"
                      value={formData.sitze}
                      onChange={(e) => setFormData({ ...formData, sitze: e.target.value })}
                      style={{
                        width: '100%',
                        backgroundColor: '#1A1612',
                        border: '1px solid #3a3430',
                        color: '#F5F0E8',
                        padding: '10px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                {/* Toggle Switches */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', color: '#a89976', marginBottom: '8px', fontWeight: '600' }}>
                    Ausstattung
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={formData.rollstuhl_geeignet}
                        onChange={(e) =>
                          setFormData({ ...formData, rollstuhl_geeignet: e.target.checked })
                        }
                        style={{ accentColor: '#C9963C', marginRight: '8px', cursor: 'pointer' }}
                      />
                      🦽 Rollstuhl
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={formData.tragestuhl_geeignet}
                        onChange={(e) =>
                          setFormData({ ...formData, tragestuhl_geeignet: e.target.checked })
                        }
                        style={{ accentColor: '#C9963C', marginRight: '8px', cursor: 'pointer' }}
                      />
                      🪑 Tragestuhl
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={formData.liegend_transport}
                        onChange={(e) =>
                          setFormData({ ...formData, liegend_transport: e.target.checked })
                        }
                        style={{ accentColor: '#C9963C', marginRight: '8px', cursor: 'pointer' }}
                      />
                      🛏️ Liegend
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={formData.klimaanlage}
                        onChange={(e) =>
                          setFormData({ ...formData, klimaanlage: e.target.checked })
                        }
                        style={{ accentColor: '#C9963C', marginRight: '8px', cursor: 'pointer' }}
                      />
                      ❄️ Klima
                    </label>
                  </div>
                </div>

                {/* Dates */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: '#a89976', display: 'block', marginBottom: '4px' }}>
                      TÜV bis
                    </label>
                    <input
                      type="date"
                      value={formData.tuev_bis}
                      onChange={(e) => setFormData({ ...formData, tuev_bis: e.target.value })}
                      style={{
                        width: '100%',
                        backgroundColor: '#1A1612',
                        border: '1px solid #3a3430',
                        color: '#F5F0E8',
                        padding: '10px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: '#a89976', display: 'block', marginBottom: '4px' }}>
                      Versicherung bis
                    </label>
                    <input
                      type="date"
                      value={formData.versicherung_bis}
                      onChange={(e) => setFormData({ ...formData, versicherung_bis: e.target.value })}
                      style={{
                        width: '100%',
                        backgroundColor: '#1A1612',
                        border: '1px solid #3a3430',
                        color: '#F5F0E8',
                        padding: '10px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleAddVehicle}
                    disabled={saving}
                    style={{
                      flex: 1,
                      backgroundColor: '#C9963C',
                      color: '#1A1612',
                      border: 'none',
                      padding: '12px',
                      borderRadius: '8px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    {saving ? 'Speichern...' : 'Speichern'}
                  </button>
                  <button
                    onClick={() => setShowForm(false)}
                    style={{
                      flex: 1,
                      backgroundColor: '#3a3430',
                      color: '#F5F0E8',
                      border: '1px solid #3a3430',
                      padding: '12px',
                      borderRadius: '8px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Button */}
        <div
          style={{
            position: 'fixed',
            bottom: '0',
            left: '0',
            right: '0',
            padding: '12px',
            backgroundColor: '#1A1612',
            borderTop: '1px solid #2a2420',
            display: 'flex',
            gap: '10px',
          }}
        >
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              style={{
                flex: 1,
                backgroundColor: '#C9963C',
                color: '#1A1612',
                border: 'none',
                padding: '14px',
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              + Fahrzeug hinzufügen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
