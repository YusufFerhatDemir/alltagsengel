'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { IconWingsGold, IconStarFilled, IconCheck, IconCard } from '@/components/Icons'
import Icon3D from '@/components/Icon3D'
import { UNIT_ECONOMICS } from '@/lib/mis/constants'
import { isHessenPlz, resolvePlz } from '@/lib/hessen-plz'
import { ENGEL_MATCH_RADIUS_KM, RADIUS_OPTIONEN } from '@/lib/plz-radius'

const serviceOptions: { key: string; label: string; desc: string }[] = [
  { key: 'begleitung', label: 'Begleitung', desc: 'Alltägliche Begleitung und Unterstützung' },
  { key: 'arzt', label: 'Arztbesuch', desc: 'Begleitung zum Arzt oder zur Therapie' },
  { key: 'einkauf', label: 'Einkauf', desc: 'Einkaufen gehen oder Besorgungen erledigen' },
  { key: 'haushalt', label: 'Haushalt', desc: 'Hilfe im Haushalt und bei der Ordnung' },
  { key: 'freizeit', label: 'Freizeit', desc: 'Gemeinsame Freizeitaktivitäten' },
  { key: 'apotheke', label: 'Apotheke', desc: 'Medikamente abholen oder Rezepte einlösen' },
  { key: 'spazieren', label: 'Spazieren', desc: 'Spaziergang und Bewegung an frischer Luft' },
  { key: 'aktivitaeten', label: 'Aktivitäten', desc: 'Gezielte Beschäftigung und Aktivierung' },
]

const timeSlots = [
  '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
]

const durationOptions = [1, 2, 3, 4, 5, 6]

function BuchenServiceInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialService = searchParams.get('service') || ''

  const [step, setStep] = useState(initialService ? 2 : 1)
  const [selectedService, setSelectedService] = useState(initialService)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [duration, setDuration] = useState(2)
  const [isFlexible, setIsFlexible] = useState(false)
  const [angels, setAngels] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedAngel, setSelectedAngel] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  // false = Kunde hat keine PLZ hinterlegt → Standort-Filter nicht möglich
  const [regionFiltered, setRegionFiltered] = useState(true)
  // true = Liste ist zusätzlich auf den Wunschtermin eingegrenzt
  const [zeitGefiltert, setZeitGefiltert] = useState(false)
  const [radiusKm, setRadiusKm] = useState<number>(ENGEL_MATCH_RADIUS_KM)

  // Default-Datum = morgen
  useEffect(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setSelectedDate(tomorrow.toISOString().split('T')[0])
  }, [])

  // Profil laden
  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(p)
      }
    }
    loadProfile()
  }, [])

  // Verfügbare Engel laden, wenn Step 4
  useEffect(() => {
    if (step !== 4) return
    async function loadAngels() {
      setLoading(true)
      const serviceLabel = serviceOptions.find(s => s.key === selectedService)?.label || selectedService
      // Engel über /api/engel/match laden: serverseitig nach PLZ-Nähe
      // gefiltert (Kunden sehen nur Engel in ihrer Region; Engel-PLZ
      // bleibt auf dem Server — kein PII im Browser) UND nach den
      // Zeitfenstern aus dem Verfügbarkeitskalender. Bei "zeitlich
      // flexibel" wird der Termin bewusst NICHT mitgeschickt, damit
      // die Auswahl nicht unnötig eingeschränkt wird.
      let data: any[] = []
      try {
        const query = new URLSearchParams({ radius: String(radiusKm) })
        if (!isFlexible && selectedDate && selectedTime) {
          query.set('date', selectedDate)
          query.set('time', selectedTime)
          query.set('duration', String(duration))
        }
        const res = await fetch(`/api/engel/match?${query.toString()}`)
        if (res.ok) {
          const json = await res.json()
          data = json.engel || []
          setRegionFiltered(json.filtered !== false)
          setZeitGefiltert(json.timeFiltered === true)
        }
      } catch { /* Netzwerkfehler → leere Liste, UI zeigt Empty-State */ }

      // Filtere nach Service
      const filtered = data.filter((a: any) =>
        (a.services || []).some((s: string) =>
          s.toLowerCase().includes(serviceLabel.toLowerCase()) ||
          s.toLowerCase().includes(selectedService.toLowerCase())
        )
      )
      setAngels(filtered)
      setLoading(false)
    }
    loadAngels()
  }, [step, selectedService, selectedDate, selectedTime, duration, isFlexible, radiusKm])

  const serviceLabel = serviceOptions.find(s => s.key === selectedService)?.label || selectedService
  // Kassenleistung (§45a/§45b) nur mit hessischer PLZ — außerhalb
  // Hessens (oder ohne PLZ) läuft die Buchung als Privatleistung.
  const kundenPlz = resolvePlz(profile?.postal_code, profile?.location)
  const kasseMoeglich = isHessenPlz(kundenPlz)
  const rate = 32 // Kundenpreis immer 32€/h
  const subtotal = rate * duration
  const platformFee = Math.round(subtotal * 0.085 * 100) / 100
  const total = subtotal + platformFee

  const handleBook = async () => {
    if (!selectedAngel) return
    setSubmitting(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSubmitting(false); return }

    const notes = [
      profile?.address ? `Adresse: ${profile.address}` : '',
      isFlexible ? `FLEXIBEL: Mindestdauer ${duration}h, danach 15-Min-Takt (${(rate / 4).toFixed(0)}€/15 Min)` : '',
    ].filter(Boolean).join(' | ')

    const { data, error } = await supabase.from('bookings').insert({
      customer_id: user.id,
      angel_id: selectedAngel.id,
      service: serviceLabel,
      date: selectedDate,
      time: selectedTime,
      duration_hours: duration,
      total_amount: total,
      is_flexible: isFlexible,
      status: 'pending',
      // Explizit setzen (DB-Default wäre 'kasse'): Kassenabrechnung
      // nur mit hessischer PLZ — sonst immer Privatleistung.
      payment_method: kasseMoeglich ? 'kasse' : 'privat',
      notes: notes || null,
    }).select().single()

    if (error) { setSubmitting(false); return }

    // Engel über die neue Anfrage benachrichtigen (in-app + E-Mail + Push)
    fetch('/api/bookings/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: data.id, event: 'created' }),
    }).catch(() => {})

    router.push(`/kunde/warten/${data.id}`)
  }

  const formatDate = (d: string) => {
    if (!d) return ''
    const date = new Date(d + 'T00:00:00')
    return date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' })
  }

  // Nächste 14 Tage
  const dateOptions = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i + 1)
    return d.toISOString().split('T')[0]
  })

  return (
    <div className="screen" id="buchen-service">
      <div style={{ padding: '16px 20px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => step > 1 ? setStep(step - 1) : router.back()}
          style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--ink)' }}
        >‹</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Buchung</div>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 20px 16px' }}>
        {[1,2,3,4,5].map(s => (
          <div key={s} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: s <= step ? 'var(--gold)' : 'var(--cream3)',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>

      <div style={{ padding: '0 20px', flex: 1, overflowY: 'auto', paddingBottom: 100 }}>

        {/* STEP 1 — Dienst wählen */}
        {step === 1 && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Was brauchen Sie?</div>
            <div style={{ fontSize: 14, color: 'var(--ink4)', marginBottom: 16 }}>Wählen Sie den gewünschten Service</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {serviceOptions.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => { setSelectedService(opt.key); setStep(2) }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    padding: '16px 18px', borderRadius: 14,
                    border: selectedService === opt.key ? '2px solid var(--gold)' : '1.5px solid var(--cream3)',
                    background: selectedService === opt.key ? 'var(--gold-pale)' : 'var(--white)',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{opt.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink4)', marginTop: 2 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* STEP 2 — Datum */}
        {step === 2 && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Wann soll es sein?</div>
            <div style={{ fontSize: 14, color: 'var(--ink4)', marginBottom: 16 }}>Wählen Sie Datum und Uhrzeit</div>

            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--ink3)' }}>Datum</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12 }}>
              {dateOptions.map(d => {
                const date = new Date(d + 'T00:00:00')
                const dayName = date.toLocaleDateString('de-DE', { weekday: 'short' })
                const dayNum = date.getDate()
                const month = date.toLocaleDateString('de-DE', { month: 'short' })
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDate(d)}
                    style={{
                      minWidth: 64, padding: '10px 8px', borderRadius: 12,
                      border: selectedDate === d ? '2px solid var(--gold)' : '1.5px solid var(--cream3)',
                      background: selectedDate === d ? 'var(--gold-pale)' : 'var(--white)',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--ink4)' }}>{dayName}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{dayNum}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink4)' }}>{month}</div>
                  </button>
                )
              })}
            </div>

            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, marginTop: 12, color: 'var(--ink3)' }}>Uhrzeit</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {timeSlots.map(t => (
                <button
                  key={t}
                  onClick={() => setSelectedTime(t)}
                  style={{
                    padding: '10px 16px', borderRadius: 10,
                    border: selectedTime === t ? '2px solid var(--gold)' : '1.5px solid var(--cream3)',
                    background: selectedTime === t ? 'var(--gold-pale)' : 'var(--white)',
                    cursor: 'pointer', fontSize: 15, fontWeight: 500,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            <button
              onClick={() => selectedDate && selectedTime && setStep(3)}
              disabled={!selectedDate || !selectedTime}
              style={{
                width: '100%', padding: '15px', borderRadius: 14,
                background: selectedDate && selectedTime ? 'var(--gold)' : 'var(--cream3)',
                color: selectedDate && selectedTime ? '#fff' : 'var(--ink4)',
                border: 'none', fontSize: 16, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Weiter
            </button>
          </>
        )}

        {/* STEP 3 — Dauer */}
        {step === 3 && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Wie lange brauchen Sie Hilfe?</div>
            <div style={{ fontSize: 14, color: 'var(--ink4)', marginBottom: 16 }}>
              {serviceLabel} am {formatDate(selectedDate)} um {selectedTime} Uhr
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {durationOptions.map(d => (
                <button
                  key={d}
                  onClick={() => { setDuration(d); setIsFlexible(false) }}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '16px 18px', borderRadius: 14,
                    border: duration === d && !isFlexible ? '2px solid var(--gold)' : '1.5px solid var(--cream3)',
                    background: duration === d && !isFlexible ? 'var(--gold-pale)' : 'var(--white)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
                    {d} {d === 1 ? 'Stunde' : 'Stunden'}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--ink4)' }}>
                    ab {(d * 32).toFixed(0)}€
                  </div>
                </button>
              ))}

              {/* Flexible Dauer Option */}
              <button
                onClick={() => { setIsFlexible(true); setDuration(2) }}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '16px 18px', borderRadius: 14,
                  border: isFlexible ? '2px solid var(--gold)' : '1.5px solid var(--cream3)',
                  background: isFlexible ? 'var(--gold-pale)' : 'var(--white)',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    Flexibel
                    <span style={{ fontSize: 11, fontWeight: 500, background: 'rgba(201,150,60,0.15)', color: 'var(--gold2, #C9963C)', padding: '2px 8px', borderRadius: 6 }}>NEU</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 3, textAlign: 'left' }}>
                    Mindestdauer wählen — danach im 15-Min-Takt
                  </div>
                </div>
                <div style={{ fontSize: 14, color: 'var(--ink4)' }}>
                  ab 64€
                </div>
              </button>
            </div>

            {/* Mindestdauer-Auswahl bei flexibler Buchung */}
            {isFlexible && (
              <div style={{ marginTop: 16, padding: '16px 18px', borderRadius: 14, background: 'rgba(201,150,60,0.06)', border: '1px solid rgba(201,150,60,0.15)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>
                  Mindestdauer wählen
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[2, 3, 4].map(d => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      style={{
                        padding: '10px 20px', borderRadius: 10,
                        border: duration === d ? '2px solid var(--gold)' : '1.5px solid var(--cream3)',
                        background: duration === d ? 'var(--gold-pale)' : 'var(--white)',
                        cursor: 'pointer', fontSize: 14, fontWeight: 600,
                      }}
                    >
                      {d}h
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 10, lineHeight: 1.5 }}>
                  Ideal für Arztbesuche, Krankenhaus oder Behördengänge — Sie zahlen nur die tatsächliche Zeit. Nach der Mindestdauer wird im 15-Minuten-Takt abgerechnet.
                </div>
              </div>
            )}

            <button
              onClick={() => setStep(4)}
              style={{
                width: '100%', padding: '15px', borderRadius: 14, marginTop: 20,
                background: 'var(--gold)', color: '#fff',
                border: 'none', fontSize: 16, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Engel suchen
            </button>
          </>
        )}

        {/* STEP 4 — Engel wählen */}
        {step === 4 && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Ihren Engel wählen</div>
            <div style={{ fontSize: 14, color: 'var(--ink4)', marginBottom: 16 }}>
              {serviceLabel} · {formatDate(selectedDate)} · {selectedTime} · {isFlexible ? `ab ${duration}h (flexibel)` : `${duration}h`}
            </div>

            {!loading && !regionFiltered && (
              <div style={{
                background: 'rgba(201,150,60,0.08)', border: '1px solid rgba(201,150,60,0.2)',
                borderRadius: 12, padding: '10px 14px', marginBottom: 14,
                fontSize: 13, color: 'var(--ink4)', lineHeight: 1.5,
              }}>
                Hinweis: Ohne Postleitzahl in Ihrem Profil können wir Engel nicht
                nach Nähe filtern — Sie sehen daher alle verfügbaren Engel.{' '}
                <Link href="/kunde/profil" style={{ color: 'var(--gold2)', fontWeight: 600 }}>
                  Postleitzahl ergänzen
                </Link>
              </div>
            )}

            {/* Umkreis: in dünn besetzten Regionen ist die Standard-Suche
                schnell leer — der Kunde soll selbst erweitern können. */}
            {regionFiltered && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: 'var(--ink4)', marginBottom: 8 }}>
                  Umkreis
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {RADIUS_OPTIONEN.map(km => (
                    <button
                      key={km}
                      onClick={() => setRadiusKm(km)}
                      style={{
                        padding: '8px 14px', borderRadius: 10,
                        border: radiusKm === km ? '2px solid var(--gold)' : '1.5px solid var(--cream3)',
                        background: radiusKm === km ? 'var(--gold-pale)' : 'var(--white)',
                        fontSize: 13, fontWeight: radiusKm === km ? 600 : 500,
                        cursor: 'pointer',
                      }}
                    >{km} km</button>
                  ))}
                </div>
              </div>
            )}

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink4)' }}>Suche verfügbare Engel...</div>
            ) : angels.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🙏</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
                  {zeitGefiltert ? 'Kein Engel zu diesem Termin frei' : 'Noch keine Engel in Ihrer Nähe'}
                </div>
                <div style={{ fontSize: 14, color: 'var(--ink4)', lineHeight: 1.6, marginBottom: 20 }}>
                  {zeitGefiltert ? (
                    <>
                      Im Umkreis von {radiusKm} km hat aktuell kein Engel am{' '}
                      <strong>{formatDate(selectedDate)} um {selectedTime}</strong> für{' '}
                      <strong>{duration} Stunden</strong> Zeit.
                    </>
                  ) : (
                    <>
                      Wir bitten vielmals um Entschuldigung — im Umkreis von {radiusKm} km sind
                      aktuell noch keine Alltagsengel für <strong>{serviceLabel}</strong> verfügbar.
                    </>
                  )}
                </div>
                {zeitGefiltert && (
                  <button
                    onClick={() => setStep(3)}
                    style={{
                      padding: '11px 20px', borderRadius: 12, border: '1.5px solid var(--cream3)',
                      background: 'var(--white)', fontSize: 14, fontWeight: 600,
                      cursor: 'pointer', marginBottom: 20,
                    }}
                  >Anderen Termin wählen</button>
                )}
                <div style={{
                  background: 'rgba(201,150,60,0.08)', border: '1px solid rgba(201,150,60,0.2)',
                  borderRadius: 12, padding: '16px 20px', marginBottom: 20, textAlign: 'left',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold2)', marginBottom: 6 }}>
                    ✨ Wir wachsen schnell!
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink4)', lineHeight: 1.5 }}>
                    Wir bauen unser Netzwerk kontinuierlich aus und sind bald auch in Ihrer
                    Nähe verfügbar. Wir benachrichtigen Sie, sobald ein Engel in Ihrer Region startet.
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink5)' }}>
                  Tipp: Versuchen Sie auch einen anderen Termin oder Service —
                  vielleicht ist zu einer anderen Zeit jemand verfügbar.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {angels.map((angel: any) => (
                  <button
                    key={angel.id}
                    onClick={() => { setSelectedAngel(angel); setStep(5) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 16px', borderRadius: 14,
                      border: selectedAngel?.id === angel.id ? '2px solid var(--gold)' : '1.5px solid var(--cream3)',
                      background: selectedAngel?.id === angel.id ? 'var(--gold-pale)' : 'var(--white)',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ overflow: 'visible' }}>
                      <Icon3D size={40} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>
                        {angel.profiles?.first_name} {angel.profiles?.last_name?.[0]}.
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--ink4)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <IconStarFilled size={12} /> {angel.rating} · {angel.total_jobs} Einsätze
                        {typeof angel.distance_km === 'number' && (
                          <span> · ca. {angel.distance_km} km</span>
                        )}
                        {angel.is_45b_capable && kasseMoeglich && <span style={{ color: 'var(--gold)' }}> · §45b</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
                      32€<span style={{ fontSize: 12, fontWeight: 400 }}>/h</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* STEP 5 — Zusammenfassung */}
        {step === 5 && selectedAngel && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Buchung bestätigen</div>

            <div style={{
              background: 'var(--white)', borderRadius: 16, padding: 20,
              border: '1px solid var(--cream3)', marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--cream2)' }}>
                <div style={{ overflow: 'visible' }}>
                  <Icon3D size={40} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    {selectedAngel.profiles?.first_name} {selectedAngel.profiles?.last_name?.[0]}.
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink4)' }}>
                    <IconStarFilled size={12} /> {selectedAngel.rating} · {selectedAngel.total_jobs} Einsätze
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ink4)', fontSize: 14 }}>Service</span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{serviceLabel}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ink4)', fontSize: 14 }}>Datum</span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{formatDate(selectedDate)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ink4)', fontSize: 14 }}>Uhrzeit</span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{selectedTime} Uhr</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ink4)', fontSize: 14 }}>Dauer</span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {isFlexible
                      ? `Mind. ${duration} Stunden (flexibel)`
                      : `${duration} ${duration === 1 ? 'Stunde' : 'Stunden'}`
                    }
                  </span>
                </div>
                {isFlexible && (
                  <div style={{
                    background: 'rgba(201,150,60,0.08)', borderRadius: 8, padding: '8px 12px',
                    fontSize: 12, color: 'var(--ink4)', lineHeight: 1.5,
                  }}>
                    Nach der Mindestdauer wird im 15-Minuten-Takt abgerechnet ({(rate / 4).toFixed(0)}€/15 Min). Kunde und Engel bestätigen die tatsächliche Dauer nach dem Einsatz.
                  </div>
                )}
                <div style={{ borderTop: '1px solid var(--cream2)', paddingTop: 12, marginTop: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'var(--ink4)', fontSize: 14 }}>{isFlexible ? 'Mindestens' : ''} {duration}h × {rate}€</span>
                    <span style={{ fontSize: 14 }}>{isFlexible ? 'ab ' : ''}{subtotal.toFixed(2)}€</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: 'var(--ink4)', fontSize: 14 }}>Servicegebühr (8,5%)</span>
                    <span style={{ fontSize: 14 }}>{platformFee.toFixed(2)}€</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 17 }}>
                    <span>Gesamt{isFlexible ? ' (Minimum)' : ''}</span>
                    <span>{isFlexible ? 'ab ' : ''}{total.toFixed(2)}€</span>
                  </div>
                </div>
              </div>
            </div>

            {selectedAngel.is_45b_capable && kasseMoeglich && (
              <div style={{
                background: 'var(--gold-pale)', borderRadius: 12, padding: '12px 16px',
                marginBottom: 16, fontSize: 13, color: 'var(--ink3)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <IconCard size={16} />
                <span>Dieser Engel ist §45b-berechtigt. Abrechnung über die Pflegekasse möglich.</span>
              </div>
            )}

            {!kasseMoeglich && (
              <div style={{
                background: 'var(--cream2, rgba(0,0,0,0.04))', borderRadius: 12, padding: '12px 16px',
                marginBottom: 16, fontSize: 13, color: 'var(--ink3)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <IconCard size={16} />
                <span>
                  Diese Buchung erfolgt als <strong>Privatleistung</strong>. Eine Abrechnung über
                  die Pflegekasse (§45a/§45b) ist derzeit nur in Hessen möglich.
                </span>
              </div>
            )}

            <button
              onClick={handleBook}
              disabled={submitting}
              style={{
                width: '100%', padding: '16px', borderRadius: 14,
                background: 'var(--gold)', color: '#fff',
                border: 'none', fontSize: 17, fontWeight: 700, cursor: 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? 'Wird gebucht...' : 'Jetzt buchen'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function BuchenServicePage() {
  return (
    <Suspense fallback={<div className="screen"><div style={{ padding: 20 }}>Laden...</div></div>}>
      <BuchenServiceInner />
    </Suspense>
  )
}
