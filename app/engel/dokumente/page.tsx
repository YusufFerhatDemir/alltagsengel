'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import { uploadDocument, MAX_FILE_SIZE_MB } from '@/lib/upload-document'
import { IconDocument, IconCheck, IconClock, IconInfo } from '@/components/Icons'

const docTypes = [
  { key: 'ausweis', label: 'Personalausweis', desc: 'Vorder- und Rückseite' },
  { key: 'fuehrungszeugnis', label: 'Führungszeugnis', desc: 'Erweitert, max. 3 Monate alt' },
  { key: 'zertifikat', label: 'Qualifikationsnachweis', desc: 'Pflege-, Betreuungszertifikat' },
  { key: 'versicherung', label: 'Versicherungsnachweis', desc: 'Haftpflicht- / Unfallversicherung' },
  { key: 'sonstiges', label: 'Sonstiges', desc: 'Weitere relevante Dokumente' },
]

const statusInfo: Record<string, { label: string; color: string }> = {
  pending: { label: 'Wird geprüft', color: 'var(--gold2)' },
  verified: { label: 'Verifiziert', color: 'var(--green)' },
  rejected: { label: 'Abgelehnt', color: 'var(--red-w)' },
}

export default function EngelDokumentePage() {
  const router = useRouter()
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selectedType, setSelectedType] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState(false)

  useEffect(() => { loadDocs() }, [])

  async function loadDocs() {
    const user = await requireUser(router, { redirectTo: '/engel/dokumente' })
    if (!user) return
    const supabase = createClient()
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id)
      .order('uploaded_at', { ascending: false })
    setDocuments(data || [])
    setLoading(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    if (!file || !selectedType) return

    setUploading(true)
    setUploadError('')
    setUploadSuccess(false)

    try {
      const user = await requireUser(router, { redirectTo: '/engel/dokumente' })
      if (!user) return

      const result = await uploadDocument(file, user.id, selectedType)

      if (!result.ok) {
        setUploadError(result.errorMessage || 'Unbekannter Fehler beim Upload.')
        return
      }

      setUploadSuccess(true)
      setSelectedType('')
      setTimeout(() => setUploadSuccess(false), 4000)
      loadDocs()
    } catch (err) {
      console.error('[handleUpload] Unexpected error:', err)
      setUploadError('Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.')
    } finally {
      setUploading(false)
      if (input) input.value = ''
    }
  }

  return (
    <div className="screen" id="dokumente">
      <div className="topbar">
        <button className="back-btn" onClick={() => router.back()} type="button">‹</button>
        <div className="topbar-title">Dokumente</div>
      </div>

      <div className="dok-body">
        <div className="dok-info">
          <IconInfo size={16} />
          <span>Lade deine Dokumente hoch, um als verifizierter Engel freigeschaltet zu werden.</span>
        </div>

        <div className="section-label">Dokument hochladen</div>
        <div className="dok-types">
          {docTypes.map(dt => (
            <div key={dt.key} className={`dok-type${selectedType === dt.key ? ' on' : ''}`} onClick={() => setSelectedType(dt.key)}>
              <div className="dok-type-icon"><IconDocument size={18} /></div>
              <div>
                <div className="dok-type-label">{dt.label}</div>
                <div className="dok-type-desc">{dt.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {selectedType && (
          <label className="dok-upload-btn" style={uploading ? { opacity: 0.6, pointerEvents: 'none' } : undefined}>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={handleUpload}
              disabled={uploading}
              hidden
            />
            {uploading ? 'Wird hochgeladen...' : 'Datei auswählen & hochladen'}
          </label>
        )}

        {uploadError && (
          <div
            role="alert"
            style={{
              marginTop: 10,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(220, 38, 38, 0.08)',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              color: 'var(--red-w, #dc2626)',
              fontSize: 13,
              lineHeight: 1.4,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              {uploadError}
              <button
                type="button"
                onClick={() => setUploadError('')}
                style={{
                  marginLeft: 8,
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  textDecoration: 'underline',
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Schließen
              </button>
            </div>
          </div>
        )}

        {uploadSuccess && (
          <div
            role="status"
            style={{
              marginTop: 10,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: 'var(--green, #10b981)',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 16 }}>✓</span>
            <span>Dokument erfolgreich hochgeladen. Wird jetzt geprüft.</span>
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 6 }}>
          Max. {MAX_FILE_SIZE_MB} MB · JPG, PNG, HEIC, PDF
        </div>

        <div className="section-label" style={{ marginTop: 24 }}>Meine Dokumente</div>
        {loading ? (
          <div className="chat-empty">Laden...</div>
        ) : documents.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon"><IconDocument size={40} /></div>
            <div className="chat-empty-title">Keine Dokumente</div>
            <div className="chat-empty-sub">Lade dein erstes Dokument hoch</div>
          </div>
        ) : (
          documents.map(doc => {
            const st = statusInfo[doc.status] || statusInfo.pending
            return (
              <div key={doc.id} className="dok-card">
                <div className="dok-card-icon"><IconDocument size={20} /></div>
                <div className="dok-card-info">
                  <div className="dok-card-name">{doc.file_name}</div>
                  <div className="dok-card-type">{docTypes.find(d => d.key === doc.type)?.label || doc.type}</div>
                  <div className="dok-card-date">{new Date(doc.uploaded_at).toLocaleDateString('de-DE')}</div>
                </div>
                <div className="dok-card-status" style={{ color: st.color }}>
                  {doc.status === 'verified' ? <IconCheck size={14} /> : <IconClock size={14} />}
                  {st.label}
                </div>
              </div>
            )
          })
        )}
        <div style={{ height: 90 }}></div>
      </div>
    </div>
  )
}
