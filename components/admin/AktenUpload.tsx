'use client'
// ═══════════════════════════════════════════════════════════════
// Wiederverwendbare Upload-Komponente für akten_dokumente
// Drag & Drop, SHA-256 Client-Hash (zur Anzeige/Vorabprüfung —
// der serverseitige Hash aus dem Storage-Upload ist maßgeblich),
// Fortschrittsanzeige, Typ/Kategorie/Gültigkeit, automatische
// Zuordnung zu Kunde ODER Mitarbeiter.
// ═══════════════════════════════════════════════════════════════
import { useRef, useState } from 'react'
import { AKTEN_DOKUMENT_TYP, AKTEN_KATEGORIE, AKTEN_SICHTBARKEIT } from '@/lib/admin/ops'
import type { AktenDokument } from '@/lib/akten/types'
import { klickbar } from '@/lib/a11y'

interface AktenUploadProps {
  /** Genau eine der beiden Zuordnungen setzen — bei keiner wird ein Org-Dokument angelegt. */
  clientId?: string | null
  caregiverId?: string | null
  defaultKategorie?: string
  defaultDokumentTyp?: string
  onUploaded: (dokument: AktenDokument) => void
  onCancel?: () => void
}

async function computeSha256Preview(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  if (typeof globalThis.crypto?.subtle?.digest !== 'function') return ''
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function AktenUpload({ clientId, caregiverId, defaultKategorie, defaultDokumentTyp, onUploaded, onCancel }: AktenUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [sha256, setSha256] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [titel, setTitel] = useState('')
  const [dokumentTyp, setDokumentTyp] = useState(defaultDokumentTyp || 'sonstiges')
  const [kategorie, setKategorie] = useState(defaultKategorie || 'allgemein')
  const [sichtbarkeit, setSichtbarkeit] = useState('intern')
  const [gueltigVon, setGueltigVon] = useState('')
  const [gueltigBis, setGueltigBis] = useState('')
  const [ablaufdatum, setAblaufdatum] = useState('')
  const [tags, setTags] = useState('')
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function pickFile(f: File) {
    setFile(f)
    if (!titel) setTitel(f.name.replace(/\.[^.]+$/, ''))
    setSha256(await computeSha256Preview(f))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) pickFile(f)
  }

  function upload() {
    if (!file || !titel) {
      setError('Datei und Titel sind Pflichtfelder.')
      return
    }
    setError('')
    setUploading(true)
    setProgress(0)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('titel', titel)
    formData.append('dokumentTyp', dokumentTyp)
    formData.append('kategorie', kategorie)
    formData.append('sichtbarkeit', sichtbarkeit)
    if (clientId) formData.append('clientId', clientId)
    if (caregiverId) formData.append('caregiverId', caregiverId)
    if (gueltigVon) formData.append('gueltigVon', gueltigVon)
    if (gueltigBis) formData.append('gueltigBis', gueltigBis)
    if (ablaufdatum) formData.append('ablaufdatum', ablaufdatum)
    if (tags) formData.append('tags', tags)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/akten/dokumente')
    xhr.upload.onprogress = ev => {
      if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100))
    }
    xhr.onload = () => {
      setUploading(false)
      try {
        const body = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300 && body.dokument) {
          onUploaded(body.dokument as AktenDokument)
        } else {
          setError(body.error || 'Upload fehlgeschlagen.')
        }
      } catch {
        setError('Upload fehlgeschlagen (ungültige Serverantwort).')
      }
    }
    xhr.onerror = () => {
      setUploading(false)
      setError('Netzwerkfehler beim Upload.')
    }
    xhr.send(formData)
  }

  return (
    <div style={{ background: 'var(--coal2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        {...klickbar(() => inputRef.current?.click())}
        aria-label="Datei auswählen oder hierher ziehen"
        style={{
          border: `2px dashed ${dragOver ? 'var(--gold)' : 'var(--border)'}`,
          borderRadius: 10, padding: 24, textAlign: 'center', cursor: 'pointer',
          background: dragOver ? 'rgba(201,150,60,.06)' : 'transparent', transition: 'all .15s',
        }}
      >
        <input
          ref={inputRef} type="file" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f) }}
        />
        {file ? (
          <div>
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{file.name}</div>
            <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 4 }}>
              {(file.size / 1024).toFixed(0)} KB
              {sha256 && <span title={sha256}> · SHA-256: {sha256.slice(0, 16)}…</span>}
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--ink4)', fontSize: 14 }}>
            Datei hierher ziehen oder klicken zum Auswählen
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 10, color: '#D04B3B', fontSize: 13 }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginTop: 14 }}>
        <label style={fieldLabel}>
          Titel *
          <input value={titel} onChange={e => setTitel(e.target.value)} style={input} />
        </label>
        <label style={fieldLabel}>
          Dokumenttyp
          <select value={dokumentTyp} onChange={e => setDokumentTyp(e.target.value)} style={input}>
            {Object.entries(AKTEN_DOKUMENT_TYP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label style={fieldLabel}>
          Kategorie
          <select value={kategorie} onChange={e => setKategorie(e.target.value)} style={input}>
            {Object.entries(AKTEN_KATEGORIE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label style={fieldLabel}>
          Sichtbarkeit
          <select value={sichtbarkeit} onChange={e => setSichtbarkeit(e.target.value)} style={input}>
            {Object.entries(AKTEN_SICHTBARKEIT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label style={fieldLabel}>
          Gültig von
          <input type="date" value={gueltigVon} onChange={e => setGueltigVon(e.target.value)} style={input} />
        </label>
        <label style={fieldLabel}>
          Gültig bis
          <input type="date" value={gueltigBis} onChange={e => setGueltigBis(e.target.value)} style={input} />
        </label>
        <label style={fieldLabel}>
          Ablaufdatum
          <input type="date" value={ablaufdatum} onChange={e => setAblaufdatum(e.target.value)} style={input} />
        </label>
        <label style={fieldLabel}>
          Tags (Komma-getrennt)
          <input value={tags} onChange={e => setTags(e.target.value)} style={input} placeholder="z. B. wichtig, 2026" />
        </label>
      </div>

      {uploading && (
        <div style={{ marginTop: 14 }}>
          <div style={{ height: 6, borderRadius: 6, background: 'var(--coal3)', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(135deg,var(--gold2),var(--gold))', transition: 'width .2s' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 4 }}>Wird hochgeladen… {progress}%</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button onClick={upload} disabled={uploading || !file} style={primaryBtn}>
          {uploading ? 'Wird hochgeladen…' : 'Dokument hochladen'}
        </button>
        {onCancel && <button onClick={onCancel} disabled={uploading} style={secondaryBtn}>Abbrechen</button>}
      </div>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--coal)', fontWeight: 600,
  background: 'linear-gradient(135deg,var(--gold2),var(--gold))', border: 'none',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
const secondaryBtn: React.CSSProperties = {
  fontSize: 14, color: 'var(--ink)', fontWeight: 600,
  background: 'var(--coal3)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
const fieldLabel: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12,
  color: 'var(--ink4)', fontWeight: 600,
}
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 14, background: 'var(--coal)', color: 'var(--ink)',
  fontFamily: 'inherit', outline: 'none',
}
