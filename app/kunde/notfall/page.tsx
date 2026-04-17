'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
// Tesseract wird dynamisch geladen (siehe handlePhotoScan) — spart ~2.3 MB First-Load-JS

interface Medication {
  id: string
  user_id: string
  medikament_name: string
  wirkstoff?: string
  dosierung: number
  einheit: string
  einnahme_morgens: boolean
  einnahme_mittags: boolean
  einnahme_abends: boolean
  einnahme_nachts: boolean
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

// ─── Styles ───
const s = {
  input: {
    width: '100%',
    backgroundColor: '#1A1612',
    border: '1px solid rgba(201,150,60,0.15)',
    color: '#F5F0E8',
    borderRadius: '12px',
    padding: '14px 16px',
    fontSize: '15px',
    boxSizing: 'border-box' as const,
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
  label: {
    fontSize: '13px',
    color: 'rgba(245,240,232,0.55)',
    marginBottom: '8px',
    display: 'block' as const,
    fontWeight: '500' as const,
  },
  card: {
    backgroundColor: '#252118',
    borderRadius: '14px',
    padding: '20px',
    marginBottom: '16px',
    border: '1px solid rgba(201,150,60,0.08)',
  },
  goldBtn: {
    backgroundColor: '#C9963C',
    color: '#1A1612',
    border: 'none',
    padding: '14px',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: '600' as const,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: '100%',
  },
  outlineBtn: {
    backgroundColor: 'transparent',
    color: '#C9963C',
    border: '1px solid rgba(201,150,60,0.3)',
    padding: '14px',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: '500' as const,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: '100%',
  },
  tag: {
    backgroundColor: 'rgba(201,150,60,0.15)',
    color: '#DBA84A',
    padding: '5px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '500' as const,
  },
  tagActive: {
    backgroundColor: '#C9963C',
    color: '#1A1612',
    padding: '5px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600' as const,
  },
}

export default function NotfallPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Scan states
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [scanSuccess, setScanSuccess] = useState(false)

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
    notizen: '',
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
    notfall_pin: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUser(user)

    const [medsRes, notfallRes] = await Promise.all([
      supabase.from('medikamentenplan').select('*').eq('user_id', user.id).eq('aktiv', true).order('medikament_name'),
      supabase.from('notfall_info').select('*').eq('user_id', user.id).single()
    ])

    if (medsRes.data) setMedications(medsRes.data)
    if (notfallRes.data) {
      setNotfallInfo(notfallRes.data)
      setNotfallForm({
        blutgruppe: notfallRes.data.blutgruppe || '',
        allergien: notfallRes.data.allergien || '',
        vorerkrankungen: notfallRes.data.vorerkrankungen || '',
        notfallkontakt_name: notfallRes.data.notfallkontakt_name || '',
        notfallkontakt_telefon: notfallRes.data.notfallkontakt_telefon || '',
        notfallkontakt_beziehung: notfallRes.data.notfallkontakt_beziehung || '',
        versicherung: notfallRes.data.versicherung || '',
        versicherungsnummer: notfallRes.data.versicherungsnummer || '',
        hausarzt_name: notfallRes.data.hausarzt_name || '',
        hausarzt_telefon: notfallRes.data.hausarzt_telefon || '',
        notfall_pin: notfallRes.data.notfall_pin || '',
      })
    }
    setLoading(false)
  }

  function resetMedForm() {
    setMedForm({
      medikament_name: '', wirkstoff: '', dosierung: '', einheit: 'mg',
      einnahmezeiten: { morgens: false, mittags: false, abends: false, nachts: false },
      einnahme_hinweis: '', verordnet_von: '', dauermedikation: true,
      beginn_datum: '', end_datum: '', notizen: '',
    })
    setEditingMed(null)
    setScanError('')
    setScanSuccess(false)
  }

  function openMedModal(med?: Medication) {
    if (med) {
      setEditingMed(med)
      setMedForm({
        medikament_name: med.medikament_name,
        wirkstoff: med.wirkstoff || '',
        dosierung: String(med.dosierung),
        einheit: med.einheit,
        einnahmezeiten: {
          morgens: med.einnahme_morgens,
          mittags: med.einnahme_mittags,
          abends: med.einnahme_abends,
          nachts: med.einnahme_nachts,
        },
        einnahme_hinweis: med.einnahme_hinweis || '',
        verordnet_von: med.verordnet_von || '',
        dauermedikation: med.dauermedikation,
        beginn_datum: med.beginn_datum || '',
        end_datum: med.end_datum || '',
        notizen: med.notizen || '',
      })
    } else {
      resetMedForm()
    }
    setShowMedModal(true)
  }

  async function saveMedication() {
    if (!user || !medForm.medikament_name || !medForm.dosierung) return

    const payload = {
      user_id: user.id,
      medikament_name: medForm.medikament_name,
      wirkstoff: medForm.wirkstoff || null,
      dosierung: parseFloat(medForm.dosierung),
      einheit: medForm.einheit,
      einnahme_morgens: medForm.einnahmezeiten.morgens,
      einnahme_mittags: medForm.einnahmezeiten.mittags,
      einnahme_abends: medForm.einnahmezeiten.abends,
      einnahme_nachts: medForm.einnahmezeiten.nachts,
      einnahme_hinweis: medForm.einnahme_hinweis || null,
      verordnet_von: medForm.verordnet_von || null,
      dauermedikation: medForm.dauermedikation,
      beginn_datum: medForm.beginn_datum || null,
      end_datum: medForm.end_datum || null,
      notizen: medForm.notizen || null,
      aktiv: true,
    }

    if (editingMed) {
      await supabase.from('medikamentenplan').update(payload).eq('id', editingMed.id)
    } else {
      await supabase.from('medikamentenplan').insert(payload)
    }

    setShowMedModal(false)
    resetMedForm()
    loadData()
  }

  async function deleteMedication(id: string) {
    await supabase.from('medikamentenplan').update({ aktiv: false }).eq('id', id)
    setShowDeleteDialog(false)
    setDeleteTarget(null)
    loadData()
  }

  async function saveNotfallInfo() {
    if (!user) return

    const payload = { user_id: user.id, ...notfallForm }

    if (notfallInfo) {
      await supabase.from('notfall_info').update(payload).eq('user_id', user.id)
    } else {
      await supabase.from('notfall_info').insert(payload)
    }

    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
    loadData()
  }

  // ─── Photo Scan (Tesseract.js — runs fully in browser) ───
  const [scanProgress, setScanProgress] = useState(0)

  function parseMedicationText(text: string) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const fullText = lines.join(' ')

    let medikament_name = ''
    let wirkstoff = ''
    let dosierung = ''
    let einheit = 'mg'
    let einnahme_hinweis = ''

    // 1) Find dosage pattern: number + unit (e.g. "400 mg", "500mg", "20 ml")
    const dosMatch = fullText.match(/(\d+[\.,]?\d*)\s*(mg|ml|µg|mcg|IE|g)\b/i)
    if (dosMatch) {
      dosierung = dosMatch[1].replace(',', '.')
      const rawUnit = dosMatch[2].toLowerCase()
      einheit = rawUnit === 'mcg' ? 'µg' : rawUnit === 'g' ? 'mg' : rawUnit
    }

    // 2) Known medication names (common German medications)
    const knownMeds = [
      'Ibuprofen', 'Paracetamol', 'Aspirin', 'Metformin', 'Ramipril', 'Bisoprolol',
      'Amlodipin', 'Omeprazol', 'Pantoprazol', 'Simvastatin', 'Atorvastatin',
      'Metoprolol', 'Levothyroxin', 'L-Thyroxin', 'Torasemid', 'Furosemid',
      'Candesartan', 'Valsartan', 'Losartan', 'Enalapril', 'Lisinopril',
      'Clopidogrel', 'Marcumar', 'Eliquis', 'Xarelto', 'Pradaxa',
      'Diclofenac', 'Naproxen', 'Tramadol', 'Tilidin', 'Novaminsulfon',
      'Pregabalin', 'Gabapentin', 'Duloxetin', 'Sertralin', 'Citalopram',
      'Mirtazapin', 'Amitriptylin', 'Quetiapin', 'Risperidon', 'Insulin',
      'Jardiance', 'Forxiga', 'Ozempic', 'Trulicity', 'Victoza',
      'Salbutamol', 'Budesonid', 'Tiotropium', 'Formoterol',
      'Tamsulosin', 'Finasterid', 'Sildenafil', 'Tadalafil',
      'Prednisolon', 'Dexamethason', 'Cortison',
      'Amoxicillin', 'Ciprofloxacin', 'Azithromycin', 'Doxycyclin',
      'Novalgin', 'Voltaren', 'Thomapyrin', 'Grippostad', 'ACC',
      'MCP', 'Vomex', 'Loperamid', 'Lactulose', 'Movicol',
    ]

    const upperText = fullText.toUpperCase()
    for (const med of knownMeds) {
      if (upperText.includes(med.toUpperCase())) {
        medikament_name = med
        // Try to build full name with dosage
        const nameWithDose = fullText.match(new RegExp(`${med}[®]?\\s*\\d+`, 'i'))
        if (nameWithDose && dosMatch) {
          medikament_name = `${med} ${dosierung} ${einheit}`
        }
        break
      }
    }

    // 3) If no known med found, take first line that looks like a name (capitalized, not too long)
    if (!medikament_name) {
      for (const line of lines) {
        // Skip very short or very long lines, lines that are just numbers
        if (line.length >= 3 && line.length <= 50 && /[A-ZÄÖÜ]/.test(line[0]) && !/^\d+$/.test(line)) {
          medikament_name = line.replace(/[®™©]/g, '').trim()
          break
        }
      }
    }

    // 4) Look for "Wirkstoff:" pattern
    const wirkstoffMatch = fullText.match(/Wirkstoff[:\s]+([A-Za-zäöüÄÖÜß\s-]+)/i)
    if (wirkstoffMatch) {
      wirkstoff = wirkstoffMatch[1].trim()
    }

    // 5) Look for Einnahme hints
    const hinweisPatterns = [
      /(?:vor|nach|zu|mit|zwischen)\s+(?:dem\s+)?(?:Essen|Mahlzeit|Wasser|Milch)/gi,
      /(?:nüchtern|unzerkaut|auflösen)/gi,
      /(?:morgens|mittags|abends|nachts|täglich)\s*(?:einnehmen|nehmen)?/gi,
    ]
    const hints: string[] = []
    for (const pattern of hinweisPatterns) {
      const match = fullText.match(pattern)
      if (match) hints.push(...match)
    }
    if (hints.length > 0) {
      einnahme_hinweis = hints.map(h => h.charAt(0).toUpperCase() + h.slice(1).toLowerCase()).join(', ')
    }

    return { medikament_name, wirkstoff, dosierung, einheit, einnahme_hinweis }
  }

  async function handlePhotoScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setScanning(true)
    setScanError('')
    setScanSuccess(false)
    setScanProgress(0)

    try {
      // Dynamic Import: Tesseract (~2.3 MB WASM) erst laden, wenn Nutzer wirklich scannt
      const { default: Tesseract } = await import('tesseract.js')
      const result = await Tesseract.recognize(file, 'deu', {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') {
            setScanProgress(Math.round(m.progress * 100))
          }
        }
      })

      const text = result.data.text
      if (!text || text.trim().length < 5) {
        setScanError('Kein Text erkannt. Bitte das Foto nochmal versuchen — gute Beleuchtung hilft!')
        return
      }

      const parsed = parseMedicationText(text)

      if (parsed.medikament_name || parsed.dosierung) {
        setMedForm(prev => ({
          ...prev,
          medikament_name: parsed.medikament_name || prev.medikament_name,
          wirkstoff: parsed.wirkstoff || prev.wirkstoff,
          dosierung: parsed.dosierung || prev.dosierung,
          einheit: parsed.einheit || prev.einheit,
          einnahme_hinweis: parsed.einnahme_hinweis || prev.einnahme_hinweis,
        }))
        setScanSuccess(true)
        setTimeout(() => setScanSuccess(false), 5000)
      } else {
        setScanError('Medikament konnte nicht erkannt werden. Bitte manuell eingeben oder nochmal fotografieren.')
      }
    } catch {
      setScanError('Fehler bei der Erkennung. Bitte versuche es erneut.')
    } finally {
      setScanning(false)
      setScanProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <div className="phone">
        <div className="screen" style={{ backgroundColor: '#1A1612', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: '#C9963C', fontSize: '14px' }}>Laden...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="phone">
      <div className="screen" style={{ backgroundColor: '#1A1612', minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', gap: '14px' }}>
          <button
            onClick={() => router.push('/kunde/home')}
            style={{ background: 'none', border: 'none', color: '#C9963C', fontSize: '22px', cursor: 'pointer', padding: '4px' }}
          >
            ←
          </button>
          <h1 style={{ margin: 0, color: '#F5F0E8', fontSize: '18px', fontWeight: '600' }}>
            Gesundheit
          </h1>
        </div>

        {/* Tab Bar */}
        <div style={{ display: 'flex', margin: '0 20px', backgroundColor: '#252118', borderRadius: '12px', padding: '4px' }}>
          {(['medikamente', 'notfall'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '12px',
                background: activeTab === tab ? '#C9963C' : 'none',
                border: 'none',
                color: activeTab === tab ? '#1A1612' : 'rgba(245,240,232,0.5)',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: activeTab === tab ? '600' : '400',
                borderRadius: '10px',
                transition: 'all 0.25s ease',
              }}
            >
              {tab === 'medikamente' ? '💊 Medikamente' : '🏥 Notfall-Info'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', paddingBottom: '100px' }}>

          {/* ═══════════════ MEDIKAMENTE TAB ═══════════════ */}
          {activeTab === 'medikamente' && (
            <div>
              {medications.length === 0 ? (
                <div style={{ textAlign: 'center', paddingTop: '60px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.4 }}>💊</div>
                  <p style={{ color: 'rgba(245,240,232,0.4)', fontSize: '15px', margin: '0 0 8px 0' }}>
                    Noch keine Medikamente
                  </p>
                  <p style={{ color: 'rgba(245,240,232,0.25)', fontSize: '13px', margin: 0 }}>
                    Tippe auf + um ein Medikament hinzuzufügen
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {medications.map(med => (
                    <div key={med.id} style={{ ...s.card, padding: '16px' }}>
                      {/* Top Row: Name + Actions */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: '0 0 2px 0', color: '#F5F0E8', fontWeight: '600', fontSize: '15px' }}>
                            {med.medikament_name}
                          </p>
                          {med.wirkstoff && (
                            <p style={{ margin: 0, color: 'rgba(245,240,232,0.4)', fontSize: '12px' }}>
                              {med.wirkstoff}
                            </p>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => openMedModal(med)}
                            style={{ background: 'none', border: 'none', color: 'rgba(245,240,232,0.4)', cursor: 'pointer', fontSize: '18px', padding: '4px' }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => { setDeleteTarget(med.id); setShowDeleteDialog(true) }}
                            style={{ background: 'none', border: 'none', color: 'rgba(245,240,232,0.3)', cursor: 'pointer', fontSize: '18px', padding: '4px' }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      {/* Dosierung */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <span style={{ color: '#C9963C', fontWeight: '700', fontSize: '18px' }}>
                          {med.dosierung}
                        </span>
                        <span style={{ color: 'rgba(245,240,232,0.5)', fontSize: '14px' }}>
                          {med.einheit}
                        </span>
                      </div>

                      {/* Einnahmezeiten */}
                      {(med.einnahme_morgens || med.einnahme_mittags || med.einnahme_abends || med.einnahme_nachts) && (
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                          {[
                            { active: med.einnahme_morgens, label: '☀️ Morgens', icon: '' },
                            { active: med.einnahme_mittags, label: '🌤️ Mittags', icon: '' },
                            { active: med.einnahme_abends, label: '🌅 Abends', icon: '' },
                            { active: med.einnahme_nachts, label: '🌙 Nachts', icon: '' },
                          ].filter(z => z.active).map(z => (
                            <span key={z.label} style={s.tagActive}>{z.label}</span>
                          ))}
                        </div>
                      )}

                      {/* Hinweis */}
                      {med.einnahme_hinweis && (
                        <p style={{ margin: '0 0 8px 0', color: 'rgba(245,240,232,0.5)', fontSize: '12px', fontStyle: 'italic' }}>
                          💡 {med.einnahme_hinweis}
                        </p>
                      )}

                      {/* Footer */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid rgba(201,150,60,0.08)' }}>
                        {med.verordnet_von ? (
                          <span style={{ color: 'rgba(245,240,232,0.35)', fontSize: '11px' }}>
                            👨‍⚕️ {med.verordnet_von}
                          </span>
                        ) : <span />}
                        <span style={med.dauermedikation ? s.tag : { ...s.tag, backgroundColor: 'rgba(219,168,74,0.12)', color: '#DBA84A' }}>
                          {med.dauermedikation ? 'Dauermedikation' : med.end_datum ? `bis ${med.end_datum}` : 'Befristet'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ NOTFALL-INFO TAB ═══════════════ */}
          {activeTab === 'notfall' && (
            <div>
              {/* Gesundheitsdaten */}
              <div style={s.card}>
                <h3 style={{ margin: '0 0 16px 0', color: '#C9963C', fontSize: '14px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  Gesundheitsdaten
                </h3>
                <div style={{ marginBottom: '14px' }}>
                  <label style={s.label}>Blutgruppe</label>
                  <select
                    value={notfallForm.blutgruppe}
                    onChange={(e) => setNotfallForm({ ...notfallForm, blutgruppe: e.target.value })}
                    style={s.input}
                  >
                    <option value="">Wählen</option>
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-'].map(bg => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={s.label}>Allergien</label>
                  <textarea
                    value={notfallForm.allergien}
                    onChange={(e) => setNotfallForm({ ...notfallForm, allergien: e.target.value })}
                    style={{ ...s.input, minHeight: '80px', fontFamily: 'inherit', resize: 'vertical' as const }}
                    placeholder="z.B. Penicillin, Nüsse, Latex"
                  />
                </div>
                <div>
                  <label style={s.label}>Vorerkrankungen</label>
                  <textarea
                    value={notfallForm.vorerkrankungen}
                    onChange={(e) => setNotfallForm({ ...notfallForm, vorerkrankungen: e.target.value })}
                    style={{ ...s.input, minHeight: '80px', fontFamily: 'inherit', resize: 'vertical' as const }}
                    placeholder="z.B. Diabetes, Bluthochdruck"
                  />
                </div>
              </div>

              {/* Notfallkontakt */}
              <div style={s.card}>
                <h3 style={{ margin: '0 0 16px 0', color: '#C9963C', fontSize: '14px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  Notfallkontakt
                </h3>
                <div style={{ marginBottom: '14px' }}>
                  <label style={s.label}>Name</label>
                  <input type="text" value={notfallForm.notfallkontakt_name}
                    onChange={(e) => setNotfallForm({ ...notfallForm, notfallkontakt_name: e.target.value })}
                    style={s.input} placeholder="Vor- und Nachname" />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={s.label}>Telefon</label>
                  <input type="tel" value={notfallForm.notfallkontakt_telefon}
                    onChange={(e) => setNotfallForm({ ...notfallForm, notfallkontakt_telefon: e.target.value })}
                    style={s.input} placeholder="+49 ..." />
                </div>
                <div>
                  <label style={s.label}>Beziehung</label>
                  <select value={notfallForm.notfallkontakt_beziehung}
                    onChange={(e) => setNotfallForm({ ...notfallForm, notfallkontakt_beziehung: e.target.value })}
                    style={s.input}>
                    <option value="">Wählen</option>
                    {['Ehepartner', 'Kind', 'Elternteil', 'Geschwister', 'Freund/in', 'Sonstige'].map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Versicherung */}
              <div style={s.card}>
                <h3 style={{ margin: '0 0 16px 0', color: '#C9963C', fontSize: '14px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  Versicherung
                </h3>
                <div style={{ marginBottom: '14px' }}>
                  <label style={s.label}>Krankenkasse</label>
                  <input type="text" value={notfallForm.versicherung}
                    onChange={(e) => setNotfallForm({ ...notfallForm, versicherung: e.target.value })}
                    style={s.input} placeholder="z.B. AOK, TK, Barmer" />
                </div>
                <div>
                  <label style={s.label}>Versicherungsnummer</label>
                  <input type="text" value={notfallForm.versicherungsnummer}
                    onChange={(e) => setNotfallForm({ ...notfallForm, versicherungsnummer: e.target.value })}
                    style={s.input} />
                </div>
              </div>

              {/* Hausarzt */}
              <div style={s.card}>
                <h3 style={{ margin: '0 0 16px 0', color: '#C9963C', fontSize: '14px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  Hausarzt
                </h3>
                <div style={{ marginBottom: '14px' }}>
                  <label style={s.label}>Name</label>
                  <input type="text" value={notfallForm.hausarzt_name}
                    onChange={(e) => setNotfallForm({ ...notfallForm, hausarzt_name: e.target.value })}
                    style={s.input} placeholder="Dr. ..." />
                </div>
                <div>
                  <label style={s.label}>Telefon</label>
                  <input type="tel" value={notfallForm.hausarzt_telefon}
                    onChange={(e) => setNotfallForm({ ...notfallForm, hausarzt_telefon: e.target.value })}
                    style={s.input} />
                </div>
              </div>

              {/* Notfall-PIN */}
              <div style={s.card}>
                <h3 style={{ margin: '0 0 16px 0', color: '#C9963C', fontSize: '14px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  Notfall-PIN
                </h3>
                <p style={{ margin: '0 0 14px 0', color: 'rgba(245,240,232,0.4)', fontSize: '12px', lineHeight: '1.5' }}>
                  Mit dieser PIN kann der Rettungsdienst auf deine Notfalldaten zugreifen.
                </p>
                <input
                  type="text"
                  maxLength={4}
                  value={notfallForm.notfall_pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 4)
                    setNotfallForm({ ...notfallForm, notfall_pin: val })
                  }}
                  style={{ ...s.input, textAlign: 'center', letterSpacing: '12px', fontSize: '28px', fontWeight: 'bold' }}
                  placeholder="• • • •"
                />
                {user && (
                  <p style={{ margin: '12px 0 0 0', color: 'rgba(245,240,232,0.3)', fontSize: '11px', textAlign: 'center' }}>
                    Notfall-URL: <span style={{ color: '#C9963C' }}>alltagsengel.care/notfall/{user.id}</span>
                  </p>
                )}
              </div>

              {/* Save */}
              <button onClick={saveNotfallInfo} style={s.goldBtn}>
                Speichern
              </button>

              {saveSuccess && (
                <div style={{
                  marginTop: '12px',
                  backgroundColor: 'rgba(201,150,60,0.1)',
                  border: '1px solid rgba(201,150,60,0.2)',
                  color: '#C9963C',
                  padding: '12px',
                  borderRadius: '12px',
                  textAlign: 'center',
                  fontSize: '14px',
                }}>
                  ✓ Erfolgreich gespeichert
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══════════════ FAB ═══════════════ */}
        {activeTab === 'medikamente' && (
          <button
            onClick={() => openMedModal()}
            style={{
              position: 'absolute',
              bottom: '24px',
              right: '20px',
              zIndex: 10,
              width: '60px',
              height: '60px',
              borderRadius: '16px',
              backgroundColor: '#C9963C',
              color: '#1A1612',
              border: 'none',
              fontSize: '30px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(201,150,60,0.3)',
              transition: 'all 0.2s ease',
            }}
          >
            +
          </button>
        )}

        {/* ═══════════════ MEDICATION MODAL ═══════════════ */}
        {showMedModal && (
          <div style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 1000,
            animation: 'fadeIn 0.2s ease',
          }}>
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              backgroundColor: '#1A1612',
              borderRadius: '24px 24px 0 0',
              maxHeight: '92vh',
              overflowY: 'auto',
              animation: 'slideUp 0.3s ease',
            }}>
              {/* Modal Header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '20px 24px 16px',
                borderBottom: '1px solid rgba(201,150,60,0.1)',
                position: 'sticky', top: 0,
                backgroundColor: '#1A1612',
                zIndex: 1,
              }}>
                <h2 style={{ margin: 0, color: '#F5F0E8', fontSize: '18px', fontWeight: '600' }}>
                  {editingMed ? 'Medikament bearbeiten' : 'Neues Medikament'}
                </h2>
                <button
                  onClick={() => { setShowMedModal(false); resetMedForm() }}
                  style={{ background: 'none', border: 'none', color: 'rgba(245,240,232,0.4)', fontSize: '28px', cursor: 'pointer', lineHeight: 1 }}
                >
                  ×
                </button>
              </div>

              <div style={{ padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* ╔═══ FOTO SCAN SECTION ═══╗ */}
                {!editingMed && (
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(201,150,60,0.08) 0%, rgba(201,150,60,0.02) 100%)',
                    border: '1px dashed rgba(201,150,60,0.25)',
                    borderRadius: '16px',
                    padding: '24px',
                    textAlign: 'center',
                  }}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoScan}
                      style={{ display: 'none' }}
                    />

                    <div style={{ fontSize: '36px', marginBottom: '12px' }}>
                      {scanning ? '⏳' : '📸'}
                    </div>

                    <p style={{ color: '#F5F0E8', fontSize: '15px', fontWeight: '500', margin: '0 0 6px 0' }}>
                      {scanning ? 'Wird erkannt...' : 'Medikament scannen'}
                    </p>
                    <p style={{ color: 'rgba(245,240,232,0.35)', fontSize: '12px', margin: '0 0 16px 0', lineHeight: '1.5' }}>
                      Fotografiere die Packung — Name, Wirkstoff und Dosierung werden automatisch erkannt
                    </p>

                    {scanning && (
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{
                          width: '100%', height: '6px',
                          backgroundColor: 'rgba(201,150,60,0.1)',
                          borderRadius: '3px', overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${scanProgress}%`,
                            height: '100%',
                            backgroundColor: '#C9963C',
                            borderRadius: '3px',
                            transition: 'width 0.3s ease',
                          }} />
                        </div>
                        <p style={{ margin: '8px 0 0 0', color: 'rgba(245,240,232,0.4)', fontSize: '11px' }}>
                          {scanProgress < 30 ? 'Bild wird geladen...' : scanProgress < 80 ? 'Text wird erkannt...' : 'Medikament wird analysiert...'}
                        </p>
                      </div>
                    )}

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={scanning}
                      style={{
                        ...s.outlineBtn,
                        opacity: scanning ? 0.5 : 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        width: 'auto',
                        padding: '12px 28px',
                      }}
                    >
                      {scanning ? (
                        <>⏳ {scanProgress}% — Bitte warten...</>
                      ) : (
                        <>📷 Foto aufnehmen</>
                      )}
                    </button>

                    {scanSuccess && (
                      <div style={{
                        marginTop: '14px',
                        backgroundColor: 'rgba(74,222,128,0.1)',
                        border: '1px solid rgba(74,222,128,0.2)',
                        color: '#4ade80',
                        padding: '10px 16px',
                        borderRadius: '10px',
                        fontSize: '13px',
                      }}>
                        ✓ Medikament erkannt! Bitte Daten prüfen.
                      </div>
                    )}

                    {scanError && (
                      <div style={{
                        marginTop: '14px',
                        backgroundColor: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        color: '#ef4444',
                        padding: '10px 16px',
                        borderRadius: '10px',
                        fontSize: '13px',
                      }}>
                        {scanError}
                      </div>
                    )}
                  </div>
                )}

                {/* Divider */}
                {!editingMed && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(201,150,60,0.1)' }} />
                    <span style={{ color: 'rgba(245,240,232,0.25)', fontSize: '12px' }}>oder manuell eingeben</span>
                    <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(201,150,60,0.1)' }} />
                  </div>
                )}

                {/* Medikament Name */}
                <div>
                  <label style={s.label}>Medikament *</label>
                  <input type="text" value={medForm.medikament_name}
                    onChange={(e) => setMedForm({ ...medForm, medikament_name: e.target.value })}
                    style={s.input} placeholder="z.B. Ibuprofen 400" />
                </div>

                {/* Wirkstoff */}
                <div>
                  <label style={s.label}>Wirkstoff</label>
                  <input type="text" value={medForm.wirkstoff}
                    onChange={(e) => setMedForm({ ...medForm, wirkstoff: e.target.value })}
                    style={s.input} placeholder="z.B. Ibuprofen" />
                </div>

                {/* Dosierung + Einheit */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 2 }}>
                    <label style={s.label}>Dosierung *</label>
                    <input type="number" value={medForm.dosierung}
                      onChange={(e) => setMedForm({ ...medForm, dosierung: e.target.value })}
                      style={s.input} placeholder="400" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={s.label}>Einheit *</label>
                    <select value={medForm.einheit}
                      onChange={(e) => setMedForm({ ...medForm, einheit: e.target.value })}
                      style={s.input}>
                      {['mg', 'ml', 'Tabletten', 'Tropfen', 'IE', 'µg'].map(e => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Einnahmezeiten */}
                <div>
                  <label style={s.label}>Einnahmezeiten</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {[
                      { key: 'morgens', label: '☀️ Morgens' },
                      { key: 'mittags', label: '🌤️ Mittags' },
                      { key: 'abends', label: '🌅 Abends' },
                      { key: 'nachts', label: '🌙 Nachts' },
                    ].map(z => {
                      const active = medForm.einnahmezeiten[z.key as keyof typeof medForm.einnahmezeiten]
                      return (
                        <button
                          key={z.key}
                          type="button"
                          onClick={() => setMedForm({
                            ...medForm,
                            einnahmezeiten: { ...medForm.einnahmezeiten, [z.key]: !active }
                          })}
                          style={{
                            padding: '12px',
                            borderRadius: '12px',
                            border: active ? '1px solid #C9963C' : '1px solid rgba(201,150,60,0.15)',
                            backgroundColor: active ? 'rgba(201,150,60,0.15)' : 'transparent',
                            color: active ? '#DBA84A' : 'rgba(245,240,232,0.4)',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: active ? '600' : '400',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {z.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Einnahmehinweis */}
                <div>
                  <label style={s.label}>Einnahmehinweis</label>
                  <input type="text" value={medForm.einnahme_hinweis}
                    onChange={(e) => setMedForm({ ...medForm, einnahme_hinweis: e.target.value })}
                    style={s.input} placeholder="z.B. Mit Wasser, nach dem Essen" />
                </div>

                {/* Verordnet von */}
                <div>
                  <label style={s.label}>Verordnet von</label>
                  <input type="text" value={medForm.verordnet_von}
                    onChange={(e) => setMedForm({ ...medForm, verordnet_von: e.target.value })}
                    style={s.input} placeholder="z.B. Dr. Müller" />
                </div>

                {/* Dauermedikation Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setMedForm({ ...medForm, dauermedikation: !medForm.dauermedikation })}
                    style={{
                      width: '48px', height: '28px',
                      borderRadius: '14px',
                      border: 'none',
                      backgroundColor: medForm.dauermedikation ? '#C9963C' : 'rgba(245,240,232,0.15)',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'background-color 0.2s ease',
                      padding: 0,
                      flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: '22px', height: '22px',
                      borderRadius: '50%',
                      backgroundColor: '#fff',
                      position: 'absolute',
                      top: '3px',
                      left: medForm.dauermedikation ? '23px' : '3px',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }} />
                  </button>
                  <span style={{ color: '#F5F0E8', fontSize: '14px' }}>Dauermedikation</span>
                </div>

                {/* Zeitraum (wenn nicht Dauer) */}
                {!medForm.dauermedikation && (
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={s.label}>Beginn</label>
                      <input type="date" value={medForm.beginn_datum}
                        onChange={(e) => setMedForm({ ...medForm, beginn_datum: e.target.value })}
                        style={s.input} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={s.label}>Ende</label>
                      <input type="date" value={medForm.end_datum}
                        onChange={(e) => setMedForm({ ...medForm, end_datum: e.target.value })}
                        style={s.input} />
                    </div>
                  </div>
                )}

                {/* Notizen */}
                <div>
                  <label style={s.label}>Notizen</label>
                  <textarea value={medForm.notizen}
                    onChange={(e) => setMedForm({ ...medForm, notizen: e.target.value })}
                    style={{ ...s.input, minHeight: '70px', fontFamily: 'inherit', resize: 'vertical' as const }}
                    placeholder="Weitere Hinweise..." />
                </div>

                {/* Save Button */}
                <button onClick={saveMedication} style={{ ...s.goldBtn, marginTop: '8px' }}>
                  {editingMed ? 'Änderungen speichern' : '💊 Medikament hinzufügen'}
                </button>
              </div>
            </div>

            <style>{`
              @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
              @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
            `}</style>
          </div>
        )}

        {/* ═══════════════ DELETE DIALOG ═══════════════ */}
        {showDeleteDialog && deleteTarget && (
          <div style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1100,
          }}>
            <div style={{
              backgroundColor: '#252118',
              padding: '28px',
              borderRadius: '20px',
              maxWidth: '320px',
              width: '90%',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🗑️</div>
              <p style={{ color: '#F5F0E8', margin: '0 0 24px 0', fontSize: '15px', lineHeight: '1.5' }}>
                Möchtest du dieses Medikament wirklich löschen?
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => { setShowDeleteDialog(false); setDeleteTarget(null) }}
                  style={s.outlineBtn}
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => deleteMedication(deleteTarget)}
                  style={{ ...s.goldBtn, backgroundColor: '#ef4444', color: '#fff' }}
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
