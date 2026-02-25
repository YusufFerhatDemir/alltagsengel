'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function WartenPage() {
  const router = useRouter()
  const params = useParams()
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setConfirmed(true)
    }, 4000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="screen" id="bwarten">
      <div className="wait-body">
        <div className="wait-pulse">
          <div className="wait-ring"></div>
          <div className="wait-ring"></div>
          <div className="wait-core">👼</div>
        </div>
        <div className="wait-title">{confirmed ? 'Buchung bestätigt!' : 'Anfrage wird gesendet...'}</div>
        <div className="wait-sub">
          {confirmed
            ? 'Anna Müller hat Ihre Anfrage angenommen. Sie können jetzt die Details einsehen.'
            : 'Wir verbinden Sie mit Anna Müller. Dies dauert in der Regel nur wenige Augenblicke.'
          }
        </div>

        <div className="wait-card">
          <div className="wait-row"><div className="wait-lbl">Engel</div><div className="wait-val">Anna Müller</div></div>
          <div className="wait-row"><div className="wait-lbl">Datum</div><div className="wait-val">01.03.2026</div></div>
          <div className="wait-row"><div className="wait-lbl">Uhrzeit</div><div className="wait-val">10:00 Uhr</div></div>
          <div className="wait-row"><div className="wait-lbl">Dauer</div><div className="wait-val">2 Stunden</div></div>
          <div className="wait-row"><div className="wait-lbl">Betrag</div><div className="wait-val">69,90€</div></div>
        </div>

        <div className="wait-bar"><div className="wait-fill"></div></div>

        {confirmed && (
          <button className="btn-done" onClick={() => router.push(`/kunde/bestaetigt/${params.id}`)} style={{ animation: 'screenIn .28s cubic-bezier(.4,0,.2,1) both' }}>
            BUCHUNG BESTÄTIGT ✓
          </button>
        )}
        <Link href="/kunde/home" className="btn-cancel">Abbrechen</Link>
      </div>
    </div>
  )
}
