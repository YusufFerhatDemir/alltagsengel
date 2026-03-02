'use client'
import { useEffect, useState } from 'react'

export default function StatusBar() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0'))
      setDate(
        String(now.getDate()).padStart(2, '0') + '.' +
        String(now.getMonth() + 1).padStart(2, '0') + '.' +
        now.getFullYear()
      )
    }
    update()
    const interval = setInterval(update, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="sb" id="sbar">
      <span className="sb-time">{time}</span>
      <span className="sb-date">{date}</span>
    </div>
  )
}
