'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Medication {
  id: string
  user_id: string
  medikament_name: string
  wirkstoff?: string
  dosierung: number
  einheit: string
  einnahmezeiten: string[]
  einnahme_hinweis?: string
  verordnet_von?: string
  dauermedikation: boolean
  beginn_datum?: string
  end_datum?: string
  notizen?: string
  aktiv: boolean
}

interface NotfallInfo {
  user_id: string
  blutgruppe?: string
  allergien?: string
  vorerkrankungen?: string
  notfallkontakt_name?: string
  notfallkontakt_telefon?: string
  notfallkontakt_beziehung?: string
  versicherung?: string
  versicherungsnummer?: string
  hausarzt_name?: string
  hausarzt_telefon?: string
  notfall_pin?: string
}

export default function NotfallPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [activeTab, setActiveTab] = useState<'medikamente' | 'notfall'>('medikamente')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [medications, setMedications] = useState<Medication[]>([])
  const [notfallInfo, setNotfallInfo] = useState<NotfallInfo | null>(null)
  
  // Modal states
  const [showMedModal, setShowMedModal] = useState(false)
  const [editingMed, setEditingMed] = useState<Medication | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  
  // Form states
  const [medForm, setMedForm] = useState({
    medikament_name: '',
    wirkstoff: '',
    dosierung: '',
    einheit: 'mg',
    einnahmezeiten: { morgens: false, mittags: false, abends: false, nachts: false },
    einnahme_hinweis: '',
    verordnet_von: '',
    dauermedikation: true,
    beginn_datum: '',
    end_datum: '',
    notizen: ''
  })

  const [notfallForm, setNotfallForm] = useState({
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
    notfall_pin: ''
  })

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        
        if (!currentUser) {
          router.push('/login')
          return
        }
        
        setUser(currentUser)

        // Load medications
        const { data: meds } = await supabase
          .from('medikamentenplan')
          .select('*')
          .eq('user_id', currentUser.id)
          .eq('aktiv', true)
        
        if (meds) {
          setMedications(meds as Medication[])
        }

        // Load notfall info
        const { data: notfall } = await supabase
          .from('notfall_info')
          .select('*')
          .eq('user_id', currentUser.id)
          .single()
        
        if (notfall) {
          setNotfallInfo(notfall)
          setNotfallForm(notfall)
        }

        setLoading(false)
      } catch (error) {
        console.error('Error loading data:', error)
        setLoading(false)
      }
    }

    loadData()
  }, [])

  // Medication handlers
  const resetMedForm = () => {
    setMedForm({
      medikament_name: '',
      wirkstoff: '',
      dosierung: '',
      einheit: 'mg',
      einnahmezeiten: { morgens: false, mittags: false, abends: false, nachts: false },
      einnahme_hinweis: '',
      verordnet_von: '',
      dauermedikation: true,
      beginn_datum: '',
      end_datum: '',
      notizen: ''
    })
    setEditingMed(null)
  }

  const openMedModal = (med?: Medication) => {
    if (med) {
      setEditingMed(med)
      setMedForm({
        medikament_name: med.medikament_name,
        wirkstoff: med.wirkstoff || '',
        dosierung: med.dosierung.toString(),
        einheit: med.einheit,
        einnahmezeiten: {
          morgens: med.einnahmezeiten.includes('morgens'),
          mittags: med.einnahmezeiten.includes('mittags'),
          abends: med.einnahmezeiten.includes('abends'),
          nachts: med.einnahmezeiten.includes('nachts')
        },
        einnahme_hinweis: med.einnahme_hinweis || '',
        verordnet_von: med.verordnet_von || '',
        dauermedikation: med.dauermedikation,
        beginn_datum: med.beginn_datum || '',
        end_datum: med.end_datum || '',
        notizen: med.notizen || ''
      })
    } else {
      resetMedForm()
    }
    setShowMedModal(true)
  }

  const saveMedication = async () => {
    if (!medForm.medikament_name || !medForm.dosierung || !user) return

    const einnahmezeiten = []
    if (medForm.einnahmezeiten.morgens) einnahmezeiten.push('morgens')
    if (medForm.einnahmezeiten.mittags) einnahmezeiten.push('mittags')
    if (medForm.einnahmezeiten.abends) einnahmezeiten.push('abends')
    if (medForm.einnahmezeiten.nachts) einnahmezeiten.push('nachts')

    const medData = {
      user_id: user.id,
      medikament_name: medForm.medikament_name,
      wirkstoff: medForm.wirkstoff || null,
      dosierung: parseFloat(medForm.dosierung),
      einheit: medForm.einheit,
      einnahmezeiten,
      einnahme_hinweis: medForm.einnahme_hinweis || null,
      verordnet_von: medForm.verordnet_von || null,
      dauermedikation: medForm.dauermedikation,
      beginn_datum: medForm.beginn_datum || null,
      end_datum: !medForm.dauermedikation ? medForm.end_datum : null,
      notizen: medForm.notizen || null,
      aktiv: true
    }

    try {
      if (editingMed) {
        const { error } = await supabase
          .from('medikamentenplan')
          .update(medData)
          .eq('id', editingMed.id)
        
        if (!error) {
          setMedications(medications.map(m => m.id === editingMed.id ? { ...m, ...medData } as Medication : m))
        }
      } else {
        const { data } = await supabase
          .from('medikamentenplan')
          .insert([medData])
          .select()
        
        if (data) {
          setMedications([...medications, ...(data as Medication[])])
        }
      }
      
      setShowMedModal(false)
      resetMedForm()
    } catch (error) {
      console.error('Error saving medication:', error)
    }
  }

  const deleteMedication = async (id: string) => {
    try {
      const { error } = await supabase
        .from('medikamentenplan')
        .update({ aktiv: false })
        .eq('id', id)
      
      if (!error) {
        setMedications(medications.filter(m => m.id !== id))
      }
      setShowDeleteDialog(false)
      setDeleteTarget(null)
    } catch (error) {
      console.error('Error deleting medication:', error)
    }
  }

  // Notfall handlers
  const saveNotfallInfo = async () => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('notfall_info')
        .upsert(
          {
            user_id: user.id,
            ...notfallForm
          },
          { onConflict: 'user_id' }
        )
      
      if (!error) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      }
    } catch (error) {
      console.error('Error saving notfall info:', error)
    }
  }

  if (loading) {
    return (
      <div className="phone">
        <div className="screen" style={{ backgroundColor: '#1A1612', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#F5F0E8' }}>Lädt...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="phone">
      <div className="screen" style={{ backgroundColor: '#1A1612', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px', borderBottom: '1px solid rgba(201,150,60,0.2)', gap: '12px' }}>
          <button
            onClick={() => router.push('/kunde/home')}
            style={{ background: 'none', border: 'none', color: '#C9963C', fontSize: '24px', cursor: 'pointer', padding: '8px' }}
          >
            ←
          </button>
          <h1 style={{ margin: 0, color: '#F5F0E8', fontSize: '18px', fontWeight: '600' }}>Notfall & Medikamente</h1>
        </div>

        {/* Tab Bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(201,150,60,0.2)', backgroundColor: '#252118' }}>
          <button
            onClick={() => setActiveTab('medikamente')}
            style={{
              flex: 1,
              padding: '16px',
              background: 'none',
              border: 'none',
              color: activeTab === 'medikamente' ? '#C9963C' : 'rgba(245,240,232,0.5)',
              borderBottom: activeTab === 'medikamente' ? '3px solid #C9963C' : 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.3s ease'
            }}
          >
            💊 Medikamente
          </button>
          <button
            onClick={() => setActiveTab('notfall')}
            style={{
              flex: 1,
              padding: '16px',
              background: 'none',
              border: 'none',
              color: activeTab === 'notfall' ? '#C9963C' : 'rgba(245,240,232,0.5)',
              borderBottom: activeTab === 'notfall' ? '3px solid #C9963C' : 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.3s ease'
            }}
          >
            🚨 Notfall-Info
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {activeTab === 'medikamente' && (
            <div>
              {medications.length === 0 ? (
                <div style={{ textAlign: 'center', paddingTop: '40px' }}>
                  <p style={{ color: 'rgba(245,240,232,0.5)' }}>Noch keine Medikamente eingetragen</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {medications.map(med => (
                    <div
                      key={med.id}
                      style={{
                        backgroundColor: '#252118',
                        borderLeft: '3px solid #C9963C',
                        padding: '12px',
                        borderRadius: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                        <div>
                          <p style={{ margin: '0 0 4px 0', color: '#C9963C', fontWeight: '600', fontSize: '14px' }}>
                            {med.medikament_name}
                          </p>
                          {med.wirkstoff && (
                            <p style={{ margin: '0', color: 'rgba(245,240,232,0.5)', fontSize: '12px' }}>
                              {med.wirkstoff}
                            </p>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => openMedModal(med)}
                            style={{ background: 'none', border: 'none', color: '#DBA84A', cursor: 'pointer', fontSize: '16px' }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => {
                              setDeleteTarget(med.id)
                              setShowDeleteDialog(true)
                            }}
                            style={{ background: 'none', border: 'none', color: '#C9963C', cursor: 'pointer', fontSize: '16px' }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      <p style={{ margin: '8px 0', color: '#F5F0E8', fontSize: '13px' }}>
                        {med.dosierung} {med.einheit}
                      </p>

                      {med.einnahmezeiten.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                          {med.einnahmezeiten.map(zeit => (
                            <span
                              key={zeit}
                              style={{
                                backgroundColor: '#C9963C',
                                color: '#1A1612',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '12px',
                                fontWeight: '500'
                              }}
                            >
                              {zeit.charAt(0).toUpperCase() + zeit.slice(1)}
                            </span>
                          ))}
                        </div>
                      )}

                      {med.einnahme_hinweis && (
                        <p style={{ margin: '8px 0', color: 'rgba(245,240,232,0.7)', fontSize: '12px', fontStyle: 'italic' }}>
                          {med.einnahme_hinweis}
                        </p>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '12px' }}>
                        <div>
                          {med.verordnet_von && (
                            <p style={{ margin: '0', color: 'rgba(245,240,232,0.5)', fontSize: '11px' }}>
                              Von: {med.verordnet_von}
                            </p>
                          )}
                        </div>
                        <span
                          style={{
                            backgroundColor: med.dauermedikation ? 'rgba(201,150,60,0.2)' : 'rgba(219,168,74,0.2)',
                            color: med.dauermedikation ? '#C9963C' : '#DBA84A',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px'
                          }}
                        >
                          {med.dauermedikation ? 'Dauermedikation' : med.end_datum ? `bis ${med.end_datum}` : 'Befristet'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'notfall' && (
            <div>
              {/* Persönliche Gesundheitsdaten */}
              <div style={{ backgroundColor: '#252118', borderLeft: '3px solid #C9963C', padding: '16px', borderRadius: '10px', marginBottom: '16px' }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#F5F0E8', fontSize: '14px', fontWeight: '600' }}>
                  Persönliche Gesundheitsdaten
                </h3>
                
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                    Blutgruppe
                  </label>
                  <select
                    value={notfallForm.blutgruppe}
                    onChange={(e) => setNotfallForm({ ...notfallForm, blutgruppe: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#1A1612',
                      border: '1px solid rgba(201,150,60,0.2)',
                      color: '#F5F0E8',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="">Wählen</option>
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

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                    Allergien
                  </label>
                  <textarea
                    value={notfallForm.allergien}
                    onChange={(e) => setNotfallForm({ ...notfallForm, allergien: e.target.value })}
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
                      fontFamily: 'inherit'
                    }}
                    placeholder="z.B. Penicillin, Nüsse"
                  />
                </div>

                <div>
                  <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                    Vorerkrankungen
                  </label>
                  <textarea
                    value={notfallForm.vorerkrankungen}
                    onChange={(e) => setNotfallForm({ ...notfallForm, vorerkrankungen: e.target.value })}
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
                      fontFamily: 'inherit'
                    }}
                    placeholder="z.B. Diabetes, Bluthochdruck"
                  />
                </div>
              </div>

              {/* Notfallkontakt */}
              <div style={{ backgroundColor: '#252118', borderLeft: '3px solid #C9963C', padding: '16px', borderRadius: '10px', marginBottom: '16px' }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#F5F0E8', fontSize: '14px', fontWeight: '600' }}>
                  Notfallkontakt
                </h3>
                
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                    Name
                  </label>
                  <input
                    type="text"
                    value={notfallForm.notfallkontakt_name}
                    onChange={(e) => setNotfallForm({ ...notfallForm, notfallkontakt_name: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#1A1612',
                      border: '1px solid rgba(201,150,60,0.2)',
                      color: '#F5F0E8',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                    Telefon
                  </label>
                  <input
                    type="tel"
                    value={notfallForm.notfallkontakt_telefon}
                    onChange={(e) => setNotfallForm({ ...notfallForm, notfallkontakt_telefon: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#1A1612',
                      border: '1px solid rgba(201,150,60,0.2)',
                      color: '#F5F0E8',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                    Beziehung
                  </label>
                  <select
                    value={notfallForm.notfallkontakt_beziehung}
                    onChange={(e) => setNotfallForm({ ...notfallForm, notfallkontakt_beziehung: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#1A1612',
                      border: '1px solid rgba(201,150,60,0.2)',
                      color: '#F5F0E8',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="">Wählen</option>
                    <option value="Ehepartner">Ehepartner</option>
                    <option value="Kind">Kind</option>
                    <option value="Elternteil">Elternteil</option>
                    <option value="Geschwister">Geschwister</option>
                    <option value="Freund/in">Freund/in</option>
                    <option value="Sonstige">Sonstige</option>
                  </select>
                </div>
              </div>

              {/* Versicherung */}
              <div style={{ backgroundColor: '#252118', borderLeft: '3px solid #C9963C', padding: '16px', borderRadius: '10px', marginBottom: '16px' }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#F5F0E8', fontSize: '14px', fontWeight: '600' }}>
                  Versicherung
                </h3>
                
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                    Versicherung
                  </label>
                  <input
                    type="text"
                    value={notfallForm.versicherung}
                    onChange={(e) => setNotfallForm({ ...notfallForm, versicherung: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#1A1612',
                      border: '1px solid rgba(201,150,60,0.2)',
                      color: '#F5F0E8',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                    Versicherungsnummer
                  </label>
                  <input
                    type="text"
                    value={notfallForm.versicherungsnummer}
                    onChange={(e) => setNotfallForm({ ...notfallForm, versicherungsnummer: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#1A1612',
                      border: '1px solid rgba(201,150,60,0.2)',
                      color: '#F5F0E8',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Hausarzt */}
              <div style={{ backgroundColor: '#252118', borderLeft: '3px solid #C9963C', padding: '16px', borderRadius: '10px', marginBottom: '16px' }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#F5F0E8', fontSize: '14px', fontWeight: '600' }}>
                  Hausarzt
                </h3>
                
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                    Name
                  </label>
                  <input
                    type="text"
                    value={notfallForm.hausarzt_name}
                    onChange={(e) => setNotfallForm({ ...notfallForm, hausarzt_name: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#1A1612',
                      border: '1px solid rgba(201,150,60,0.2)',
                      color: '#F5F0E8',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                    Telefon
                  </label>
                  <input
                    type="tel"
                    value={notfallForm.hausarzt_telefon}
                    onChange={(e) => setNotfallForm({ ...notfallForm, hausarzt_telefon: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#1A1612',
                      border: '1px solid rgba(201,150,60,0.2)',
                      color: '#F5F0E8',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Notfall-PIN */}
              <div style={{ backgroundColor: '#252118', borderLeft: '3px solid #C9963C', padding: '16px', borderRadius: '10px', marginBottom: '16px' }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#F5F0E8', fontSize: '14px', fontWeight: '600' }}>
                  Notfall-PIN für Rettungsdienst
                </h3>
                
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '12px', display: 'block' }}>
                    4-stellige PIN
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={notfallForm.notfall_pin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4)
                      setNotfallForm({ ...notfallForm, notfall_pin: val })
                    }}
                    style={{
                      width: '100%',
                      backgroundColor: '#1A1612',
                      border: '1px solid rgba(201,150,60,0.2)',
                      color: '#F5F0E8',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '24px',
                      boxSizing: 'border-box',
                      textAlign: 'center',
                      letterSpacing: '8px',
                      fontWeight: 'bold'
                    }}
                  />
                </div>

                <p style={{ margin: '0 0 8px 0', color: 'rgba(245,240,232,0.6)', fontSize: '12px' }}>
                  Die Notfall-PIN wird benötigt, um auf deine Notfalldaten zuzugreifen.
                </p>
                {user && (
                  <p style={{ margin: '0', color: 'rgba(245,240,232,0.5)', fontSize: '12px' }}>
                    Notfall-URL: <span style={{ color: '#C9963C' }}>alltagsengel.care/notfall/{user.id}</span>
                  </p>
                )}
              </div>

              {/* Save Button */}
              <button
                onClick={saveNotfallInfo}
                style={{
                  width: '100%',
                  backgroundColor: '#C9963C',
                  color: '#1A1612',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  marginBottom: '16px',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#DBA84A'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#C9963C'}
              >
                Speichern
              </button>

              {saveSuccess && (
                <div style={{
                  backgroundColor: 'rgba(201,150,60,0.2)',
                  color: '#C9963C',
                  padding: '12px',
                  borderRadius: '10px',
                  textAlign: 'center',
                  fontSize: '13px',
                  marginBottom: '16px'
                }}>
                  Erfolgreich gespeichert!
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating Action Button for Medications */}
        {activeTab === 'medikamente' && (
          <button
            onClick={() => openMedModal()}
            style={{
              position: 'fixed',
              bottom: '80px',
              right: '16px',
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#C9963C',
              color: '#1A1612',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(201,150,60,0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#DBA84A'
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(201,150,60,0.4)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#C9963C'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(201,150,60,0.3)'
            }}
          >
            +
          </button>
        )}

        {/* Bottom Navigation */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          borderTop: '1px solid rgba(201,150,60,0.2)',
          backgroundColor: '#252118',
          padding: '8px 0',
          fontSize: '12px'
        }}>
          <button
            onClick={() => router.push('/kunde/home')}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              background: 'none',
              border: 'none',
              color: 'rgba(245,240,232,0.5)',
              cursor: 'pointer',
              padding: '8px'
            }}
          >
            <span style={{ fontSize: '20px' }}>🏠</span>
            <span>Home</span>
          </button>
          <button
            onClick={() => router.push('/kunde/notfall')}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              background: 'none',
              border: 'none',
              color: '#C9963C',
              cursor: 'pointer',
              padding: '8px'
            }}
          >
            <span style={{ fontSize: '20px' }}>🚨</span>
            <span>Notfall</span>
          </button>
          <button
            onClick={() => router.push('/kunde/buchungen')}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              background: 'none',
              border: 'none',
              color: 'rgba(245,240,232,0.5)',
              cursor: 'pointer',
              padding: '8px'
            }}
          >
            <span style={{ fontSize: '20px' }}>📋</span>
            <span>Buchungen</span>
          </button>
          <button
            onClick={() => router.push('/kunde/chat')}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              background: 'none',
              border: 'none',
              color: 'rgba(245,240,232,0.5)',
              cursor: 'pointer',
              padding: '8px'
            }}
          >
            <span style={{ fontSize: '20px' }}>💬</span>
            <span>Chat</span>
          </button>
          <button
            onClick={() => router.push('/kunde/profil')}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              background: 'none',
              border: 'none',
              color: 'rgba(245,240,232,0.5)',
              cursor: 'pointer',
              padding: '8px'
            }}
          >
            <span style={{ fontSize: '20px' }}>👤</span>
            <span>Profil</span>
          </button>
        </div>

        {/* Medication Modal */}
        {showMedModal && (
          <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            top: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            animation: 'fadeIn 0.3s ease'
          }}>
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: '#252118',
              borderRadius: '20px 20px 0 0',
              padding: '20px',
              maxHeight: '90vh',
              overflowY: 'auto',
              animation: 'slideUp 0.3s ease'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, color: '#F5F0E8', fontSize: '16px', fontWeight: '600' }}>
                  {editingMed ? 'Medikament bearbeiten' : 'Neues Medikament'}
                </h2>
                <button
                  onClick={() => {
                    setShowMedModal(false)
                    resetMedForm()
                  }}
                  style={{ background: 'none', border: 'none', color: '#C9963C', fontSize: '24px', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                    Medikament *
                  </label>
                  <input
                    type="text"
                    value={medForm.medikament_name}
                    onChange={(e) => setMedForm({ ...medForm, medikament_name: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#1A1612',
                      border: '1px solid rgba(201,150,60,0.2)',
                      color: '#F5F0E8',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                    placeholder="z.B. Ibuprofen"
                  />
                </div>

                <div>
                  <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                    Wirkstoff
                  </label>
                  <input
                    type="text"
                    value={medForm.wirkstoff}
                    onChange={(e) => setMedForm({ ...medForm, wirkstoff: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#1A1612',
                      border: '1px solid rgba(201,150,60,0.2)',
                      color: '#F5F0E8',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 2 }}>
                    <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                      Dosierung *
                    </label>
                    <input
                      type="number"
                      value={medForm.dosierung}
                      onChange={(e) => setMedForm({ ...medForm, dosierung: e.target.value })}
                      style={{
                        width: '100%',
                        backgroundColor: '#1A1612',
                        border: '1px solid rgba(201,150,60,0.2)',
                        color: '#F5F0E8',
                        borderRadius: '10px',
                        padding: '12px',
                        fontSize: '14px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                      Einheit *
                    </label>
                    <select
                      value={medForm.einheit}
                      onChange={(e) => setMedForm({ ...medForm, einheit: e.target.value })}
                      style={{
                        width: '100%',
                        backgroundColor: '#1A1612',
                        border: '1px solid rgba(201,150,60,0.2)',
                        color: '#F5F0E8',
                        borderRadius: '10px',
                        padding: '12px',
                        fontSize: '14px',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="mg">mg</option>
                      <option value="ml">ml</option>
                      <option value="Tabletten">Tabletten</option>
                      <option value="Tropfen">Tropfen</option>
                      <option value="IE">IE</option>
                      <option value="µg">µg</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '12px', display: 'block' }}>
                    Einnahmezeiten
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { key: 'morgens', label: 'Morgens' },
                      { key: 'mittags', label: 'Mittags' },
                      { key: 'abends', label: 'Abends' },
                      { key: 'nachts', label: 'Nachts' }
                    ].map(zeit => (
                      <label key={zeit.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={medForm.einnahmezeiten[zeit.key as keyof typeof medForm.einnahmezeiten]}
                          onChange={(e) => setMedForm({
                            ...medForm,
                            einnahmezeiten: {
                              ...medForm.einnahmezeiten,
                              [zeit.key]: e.target.checked
                            }
                          })}
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ color: '#F5F0E8', fontSize: '14px' }}>{zeit.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                    Einnahmehinweis
                  </label>
                  <input
                    type="text"
                    value={medForm.einnahme_hinweis}
                    onChange={(e) => setMedForm({ ...medForm, einnahme_hinweis: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#1A1612',
                      border: '1px solid rgba(201,150,60,0.2)',
                      color: '#F5F0E8',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                      placeholder="z.B. Mit Wasser, zu den Mahlzeiten"
                  />
                </div>

                <div>
                  <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                    Verordnet von
                  </label>
                  <input
                    type="text"
                    value={medForm.verordnet_von}
                    onChange={(e) => setMedForm({ ...medForm, verordnet_von: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#1A1612',
                      border: '1px solid rgba(201,150,60,0.2)',
                      color: '#F5F0E8',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                      placeholder="z.B. Dr. Müller"
                  />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={medForm.dauermedikation}
                    onChange={(e) => setMedForm({ ...medForm, dauermedikation: e.target.checked })}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ color: '#F5F0E8', fontSize: '14px' }}>Dauermedikation</span>
                </label>

                {!medForm.dauermedikation && (
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                        Beginn
                      </label>
                      <input
                        type="date"
                        value={medForm.beginn_datum}
                        onChange={(e) => setMedForm({ ...medForm, beginn_datum: e.target.value })}
                        style={{
                          width: '100%',
                          backgroundColor: '#1A1612',
                          border: '1px solid rgba(201,150,60,0.2)',
                          color: '#F5F0E8',
                          borderRadius: '10px',
                          padding: '12px',
                          fontSize: '14px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                        Ende
                      </label>
                      <input
                        type="date"
                        value={medForm.end_datum}
                        onChange={(e) => setMedForm({ ...medForm, end_datum: e.target.value })}
                        style={{
                          width: '100%',
                          backgroundColor: '#1A1612',
                          border: '1px solid rgba(201,150,60,0.2)',
                          color: '#F5F0E8',
                          borderRadius: '10px',
                          padding: '12px',
                          fontSize: '14px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ fontSize: '13px', color: 'rgba(245,240,232,0.6)', marginBottom: '6px', display: 'block' }}>
                    Notizen
                  </label>
                  <textarea
                    value={medForm.notizen}
                    onChange={(e) => setMedForm({ ...medForm, notizen: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#1A1612',
                      border: '1px solid rgba(201,150,60,0.2)',
                      color: '#F5F0E8',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      minHeight: '60px',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                <button
                  onClick={saveMedication}
                  style={{
                    backgroundColor: '#C9963C',
                    color: '#1A1612',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    marginTop: '12px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#DBA84A'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#C9963C'}
                >
                  {editingMed ? 'Speichern' : 'Hinzufügen'}
                </button>
              </div>
            </div>

            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes slideUp {
                from { transform: translateY(100%); }
                to { transform: translateY(0); }
              }
            `}</style>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {showDeleteDialog && deleteTarget && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100
          }}>
            <div style={{
              backgroundColor: '#252118',
              padding: '24px',
              borderRadius: '15px',
              maxWidth: '300px',
              textAlign: 'center'
            }}>
              <p style={{ color: '#F5F0E8', margin: '0 0 20px 0', fontSize: '14px' }}>
                Möchtest du dieses Medikament wirklich löschen?
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => {
                    setShowDeleteDialog(false)
                    setDeleteTarget(null)
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(201,150,60,0.1)',
                    color: '#C9963C',
                    border: '1px solid rgba(201,150,60,0.2)',
                    padding: '10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '500'
                  }}
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => deleteMedication(deleteTarget)}
                  style={{
                    flex: 1,
                    backgroundColor: '#C9963C',
                    color: '#1A1612',
                    border: 'none',
                    padding: '10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600'
                  }}
                >
                  Löschen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
