'use client'
import { useEffect, useState } from 'react'

export default function StatusBar() {
  const [time, setTime] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0'))
    }
    update()
    const interval = setInterval(update, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="sb" id="sbar">
      <span className="sb-time">{time}</span>
      <div className="sb-ic"><span>&#9650;&#9650;&#9650;</span><span>&#9679;</span></div>
    </div>
  )
}
