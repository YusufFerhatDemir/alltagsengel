'use client'
// ═══════════════════════════════════════════════════════════════
// SignaturePad — leichtgewichtiges Canvas-Unterschriftenfeld
// ═══════════════════════════════════════════════════════════════
// Keine externe Abhängigkeit. Unterstützt Maus + Touch (Betreuungs-
// kräfte unterschreiben auf dem Handy). Liefert die Unterschrift als
// PNG-Data-URL über onChange.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useRef, useState, useCallback } from 'react'

export default function SignaturePad({
  onChange,
  height = 180,
  label,
}: {
  onChange: (dataUrl: string | null) => void
  height?: number
  label?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [hasContent, setHasContent] = useState(false)

  // Canvas an Geräte-Pixeldichte anpassen
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = height * ratio
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(ratio, ratio)
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#1A1612'
    }
  }, [height])

  useEffect(() => {
    setupCanvas()
    const onResize = () => setupCanvas()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [setupCanvas])

  function pos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const point = 'touches' in e ? e.touches[0] : e
    return { x: point.clientX - rect.left, y: point.clientY - rect.top }
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    drawing.current = true
    last.current = pos(e)
  }

  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !last.current) return
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    if (!hasContent) setHasContent(true)
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    const canvas = canvasRef.current
    if (canvas && hasContent) onChange(canvas.toDataURL('image/png'))
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasContent(false)
    onChange(null)
  }

  return (
    <div>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--ink3)', fontWeight: 600 }}>{label}</span>
          {hasContent && (
            <button type="button" onClick={clear} style={{
              background: 'none', border: 'none', color: 'var(--gold2)', fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Löschen
            </button>
          )}
        </div>
      )}
      <div style={{
        background: '#FFFFFF', borderRadius: 10, border: '1px solid var(--border)',
        position: 'relative', overflow: 'hidden',
      }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height, display: 'block', touchAction: 'none', cursor: 'crosshair' }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {!hasContent && (
          <span style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            color: '#BBB', fontSize: 13, pointerEvents: 'none',
          }}>
            Hier unterschreiben
          </span>
        )}
      </div>
    </div>
  )
}
