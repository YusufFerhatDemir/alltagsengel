'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { uploadServiceProof } from '@/lib/upload-service-proof'
import { euro, formatDate, fullName, statusMeta, OCR_STATUS, REVIEW_ERROR_TYPE } from '@/lib/admin/ops'
import { Banner, EmptyRow, StatusBadge } from '@/components/admin/OpsUI'

interface Option { id: string; label: string }

interface RecordOption {
  id: string
  label: string
  date: string
  start_time: string | null
  end_time: string | null
  amount: number | null
  status: string
}

interface OcrRow {
  id: string
  service_record_id: string | null
  image_url: string
  confidence: number | null
  status: string
  engine: string | null
  created_at: string
  client: string
  errorCount: number
}

// ── Naive deutsche Struktur-Extraktion aus OCR-Rohtext ──────────
// Datum DD.MM.YYYY, Zeitspannen HH:MM-HH:MM, Euro-Beträge 12,34 €
function extractFields(text: string): { date: string | null; times: string[]; amounts: number[] } {
  const dateMatch = text.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/)
  const date = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null

  const timeMatches = [...text.matchAll(/\b(\d{1,2}[:.]\d{2})\s*-\s*(\d{1,2}[:.]\d{2})\b/g)]
  const times = timeMatches.map(m => `${m[1].replace('.', ':').padStart(5, '0')}-${m[2].replace('.', ':').padStart(5, '0')}`)

  const amountMatches = [...text.matchAll(/(\d{1,4}[.,]\d{2})\s*€?/g)]
  const amounts = amountMatches
    .map(m => Number(m[1].replace('.', '').replace(',', '.')))
    .filter(n => !isNaN(n) && n > 0 && n < 10000)

  return { date, times, amounts }
}

export default function LeistungsnachweisUploadPage() {
  const [clients, setClients] = useState<Option[]>([])
  const [clientId, setClientId] = useState('')
  const [records, setRecords] = useState<RecordOption[]>([])
  const [recordId, setRecordId] = useState('')
  const [loadingRecords, setLoadingRecords] = useState(false)

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [recent, setRecent] = useState<OcrRow[]>([])
  const [loadingRecent, setLoadingRecent] = useState(true)

  // Inline-Neuanlage eines Entwurfs-Nachweises
  const [showNewRecord, setShowNewRecord] = useState(false)
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [newServiceType, setNewServiceType] = useState('Alltagsbegleitung')
  const [creatingRecord, setCreatingRecord] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase.from('clients').select('id, first_name, last_name').order('last_name')
      setClients((data || []).map((c: any) => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim() })))
    }
    load()
    loadRecent()
  }, [])

  useEffect(() => {
    if (!clientId) { setRecords([]); setRecordId(''); return }
    async function loadRecords() {
      setLoadingRecords(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('service_records')
        .select('id, date, start_time, end_time, amount, status')
        .eq('client_id', clientId)
        .order('date', { ascending: false })
        .limit(50)
      const recs = (data || []).map((r: any) => ({
        id: r.id,
        label: `${formatDate(r.date)} · ${r.status}`,
        date: r.date,
        start_time: r.start_time,
        end_time: r.end_time,
        amount: r.amount,
        status: r.status,
      }))
      setRecords(recs)
      setRecordId('')
      setLoadingRecords(false)
    }
    loadRecords()
  }, [clientId])

  async function loadRecent() {
    setLoadingRecent(true)
    try {
      const supabase = createClient()
      const { data, error: e } = await supabase
        .from('ocr_results')
        .select('id, service_record_id, image_url, confidence, status, engine, created_at, service_record:service_records(client:clients(first_name, last_name))')
        .order('created_at', { ascending: false })
        .limit(30)
      if (e) { console.error('OCR-Historie Ladefehler:', e); setLoadingRecent(false); return }

      const rows = (data || []) as any[]
      const ids = rows.map(r => r.id)
      let errorCounts: Record<string, number> = {}
      if (ids.length > 0) {
        const { data: errs } = await supabase
          .from('review_errors')
          .select('ocr_result_id')
          .in('ocr_result_id', ids)
        errorCounts = (errs || []).reduce((acc: Record<string, number>, e: any) => {
          if (e.ocr_result_id) acc[e.ocr_result_id] = (acc[e.ocr_result_id] || 0) + 1
          return acc
        }, {})
      }

      setRecent(rows.map(r => ({
        id: r.id,
        service_record_id: r.service_record_id,
        image_url: r.image_url,
        confidence: r.confidence,
        status: r.status,
        engine: r.engine,
        created_at: r.created_at,
        client: fullName(r.service_record?.client),
        errorCount: errorCounts[r.id] || 0,
      })))
    } catch (err) {
      console.error('OCR-Historie Fehler:', err)
    } finally {
      setLoadingRecent(false)
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setError(null)
    setSuccess(null)
    const reader = new FileReader()
    reader.onload = () => setPreview(reader.result as string)
    reader.readAsDataURL(f)
  }

  async function createDraftRecord() {
    if (!clientId) { setError('Bitte zuerst einen Klienten wählen.'); return }
    setCreatingRecord(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data, error: insErr } = await supabase
        .from('service_records')
        .insert({
          client_id: clientId,
          date: newDate,
          service_type: newServiceType,
          status: 'draft',
        })
        .select('id, date, start_time, end_time, amount, status')
        .single()
      if (insErr || !data) { setError(`Fehler beim Anlegen: ${insErr?.message}`); setCreatingRecord(false); return }
      setRecords(prev => [{ id: data.id, label: `${formatDate(data.date)} · ${data.status}`, date: data.date, start_time: data.start_time, end_time: data.end_time, amount: data.amount, status: data.status }, ...prev])
      setRecordId(data.id)
      setShowNewRecord(false)
    } catch (err: any) {
      setError(`Unerwarteter Fehler: ${err.message}`)
    } finally {
      setCreatingRecord(false)
    }
  }

  async function runOcrAndUpload() {
    setError(null)
    setSuccess(null)
    if (!file) { setError('Bitte zuerst ein Foto auswählen.'); return }
    if (!recordId) { setError('Bitte einen Leistungsnachweis auswählen oder neu anlegen.'); return }

    setScanning(true)
    setProgress(0)
    try {
      // 1) Upload in den privaten service-proofs-Bucket
      const uploadResult = await uploadServiceProof(file, recordId)
      if (!uploadResult.ok || !uploadResult.url) {
        setError(uploadResult.errorMessage || 'Upload fehlgeschlagen.')
        setScanning(false)
        return
      }

      // 2) Tesseract-OCR (client-seitig, deutsches Sprachmodell)
      const { default: Tesseract } = await import('tesseract.js')
      const result = await Tesseract.recognize(file, 'deu', {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100))
          }
        },
      })

      const rawText = result.data.text || ''
      const confidence = result.data.confidence ?? 0
      const extracted = extractFields(rawText)

      // 3) API-Route: ocr_results + review_errors anlegen
      const res = await fetch('/api/admin/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_record_id: recordId,
          image_url: uploadResult.url,
          raw_text: rawText,
          extracted,
          confidence,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Fehler bei der Prüfung.')
        setScanning(false)
        return
      }

      const errCount = (json.review_errors || []).length
      setSuccess(
        errCount > 0
          ? `OCR abgeschlossen (Konfidenz ${confidence.toFixed(0)}%). ${errCount} Auffälligkeit(en) im Prüfprotokoll erfasst.`
          : `OCR abgeschlossen (Konfidenz ${confidence.toFixed(0)}%). Keine Auffälligkeiten gefunden.`
      )
      setFile(null)
      setPreview(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      loadRecent()
    } catch (err: any) {
      console.error('OCR-Fehler:', err)
      setError('Fehler bei der Texterkennung. Bitte erneut versuchen (gute Beleuchtung hilft).')
    } finally {
      setScanning(false)
      setProgress(0)
    }
  }

  const selectedRecord = useMemo(() => records.find(r => r.id === recordId), [records, recordId])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1>KI-Leistungsnachweis-Prüfzentrale</h1>
          <p className="admin-subtitle">Foto hochladen, automatisch per OCR auslesen und gegen den erfassten Nachweis prüfen</p>
        </div>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {success && <Banner tone="info">{success}</Banner>}

      <div style={card}>
        <h2 style={cardTitle}>1. Klient &amp; Leistungsnachweis wählen</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ flex: '1 1 240px' }}>
            <span style={label}>Klient</span>
            <select value={clientId} onChange={e => setClientId(e.target.value)} style={select}>
              <option value="">— wählen —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <span style={label}>Leistungsnachweis</span>
            <select value={recordId} onChange={e => setRecordId(e.target.value)} style={select} disabled={!clientId || loadingRecords}>
              <option value="">{loadingRecords ? 'Laden…' : '— wählen —'}</option>
              {records.map(r => (
                <option key={r.id} value={r.id}>
                  {formatDate(r.date)} · {r.status}{r.amount ? ` · ${euro(r.amount)}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {clientId && (
          !showNewRecord ? (
            <button onClick={() => setShowNewRecord(true)} style={linkBtn}>+ Neuen Entwurf-Nachweis anlegen</button>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <span style={label}>Datum</span>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ ...select, width: 160 }} />
              </div>
              <div>
                <span style={label}>Leistung</span>
                <input type="text" value={newServiceType} onChange={e => setNewServiceType(e.target.value)} style={{ ...select, width: 220 }} />
              </div>
              <button onClick={createDraftRecord} disabled={creatingRecord} style={primaryBtnSm}>
                {creatingRecord ? 'Anlegen…' : 'Anlegen'}
              </button>
              <button onClick={() => setShowNewRecord(false)} style={linkBtn}>Abbrechen</button>
            </div>
          )
        )}

        {selectedRecord && (
          <p style={{ fontSize: 12, color: 'var(--ink4)', margin: '4px 0 0' }}>
            Gewählt: {formatDate(selectedRecord.date)} · Status {selectedRecord.status}
          </p>
        )}
      </div>

      <div style={card}>
        <h2 style={cardTitle}>2. Foto des Leistungsnachweises hochladen</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFile}
          style={{ marginBottom: 12 }}
        />
        {preview && (
          <div style={{ marginBottom: 12 }}>
            <img src={preview} alt="Vorschau" style={{ maxWidth: 240, maxHeight: 240, borderRadius: 10, border: '1px solid var(--border)' }} />
          </div>
        )}
        {scanning && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ height: 8, borderRadius: 6, background: 'var(--coal3)', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(135deg,var(--gold2),var(--gold))', transition: 'width .2s' }} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 4 }}>KI-Texterkennung läuft… {progress}%</p>
          </div>
        )}
        <button onClick={runOcrAndUpload} disabled={scanning || !file || !recordId} style={primaryBtn}>
          {scanning ? 'Wird geprüft…' : 'Hochladen & KI-Prüfung starten'}
        </button>
      </div>

      <h2 style={{ ...cardTitle, marginTop: 28 }}>Letzte OCR-Prüfungen</h2>
      {loadingRecent ? <p>Laden…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Datum</th><th>Klient</th><th>Konfidenz</th><th>Status</th><th>Auffälligkeiten</th><th>Prüfprotokoll</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <EmptyRow colSpan={6}>Noch keine OCR-Prüfungen durchgeführt</EmptyRow>
              ) : recent.map(r => {
                const sm = statusMeta(OCR_STATUS, r.status)
                return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.created_at)}</td>
                    <td style={{ fontWeight: 600 }}>{r.client}</td>
                    <td>{r.confidence != null ? `${Number(r.confidence).toFixed(0)}%` : '—'}</td>
                    <td><StatusBadge label={sm.label} color={sm.color} /></td>
                    <td>{r.errorCount > 0 ? `${r.errorCount} Eintrag/Einträge` : '—'}</td>
                    <td>
                      {r.service_record_id ? (
                        <Link href={`/admin/pruefprotokoll?service_record_id=${r.service_record_id}`} style={{ color: 'var(--gold2)', fontSize: 13 }}>
                          Ansehen →
                        </Link>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 11, color: 'var(--ink5)', marginTop: 8 }}>
        Fehlertypen im Prüfprotokoll: {Object.values(REVIEW_ERROR_TYPE).join(' · ')}
      </p>
    </div>
  )
}

const card: React.CSSProperties = {
  background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 16,
  padding: 20, marginBottom: 20,
}
const cardTitle: React.CSSProperties = {
  fontFamily: "'Cormorant Garamond',serif", fontSize: 18, fontWeight: 700, color: 'var(--ink)', margin: '0 0 14px',
}
const label: React.CSSProperties = {
  display: 'block', fontSize: 13, color: 'var(--ink3)', fontWeight: 600, marginBottom: 4,
}
const select: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10,
  fontSize: 14, background: 'var(--coal3)', color: 'var(--ink)', fontFamily: "'Jost',sans-serif",
  outline: 'none', boxSizing: 'border-box',
}
const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontFamily: 'inherit',
}
const primaryBtnSm: React.CSSProperties = {
  ...primaryBtn, padding: '8px 14px', fontSize: 13,
}
const linkBtn: React.CSSProperties = {
  fontSize: 13, color: 'var(--gold2)', background: 'none', border: 'none',
  cursor: 'pointer', fontFamily: 'inherit', padding: 0, textDecoration: 'underline',
}
