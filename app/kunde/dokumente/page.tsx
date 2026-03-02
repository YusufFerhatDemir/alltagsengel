'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { IconDocument, IconCheck, IconClock, IconInfo } from '@/components/Icons'

const docTypes = [
  { key: 'ausweis', label: 'Personalausweis', desc: 'Vorder- und Rückseite' },
  { key: 'versicherung', label: 'Versicherungsnachweis', desc: 'Krankenversicherungskarte' },
  { key: 'sonstiges', label: 'Sonstiges Dokument', desc: 'Vollmacht, Pflegegrad-Bescheid etc.' },
]

const statusInfo: Record<string, { label: string; color: string }> = {
  pending: { label: 'Wird geprüft', color: 'var(--gold2)' },
  verified: { label: 'Verifiziert', color: 'var(--green)' },
  rejected: { label: 'Abgelehnt', color: 'var(--red-w)' },
}

interface DocumentItem {
  id: string
  type: string
  file_name: string
  status: string
  uploaded_at: string
}

export default function KundeDokumentePage() {
  const router = useRouter()
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [selectedType, setSelectedType] = useState('')

  useEffect(() => {
    loadDocs()
  }, [])

  async function loadDocs() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('documents')
      .select('id, type, file_name, status, uploaded_at')
      .eq('user_id', user.id)
      .order('uploaded_at', { ascending: false })
    if (error) {
      setActionError('Dokumente konnten nicht geladen werden.')
      setLoading(false)
      return
    }
    setDocuments(data || [])
    setLoading(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedType) return
    setUploading(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${user.id}/${Date.now()}-${safeName}`
    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(filePath, file)

    if (uploadErr) {
      console.error('Upload error:', uploadErr)
      setActionError('Upload fehlgeschlagen. Bitte versuchen Sie es erneut.')
      setUploading(false)
      return
    }

    await supabase.from('documents').insert({
      user_id: user.id,
      type: selectedType,
      file_name: file.name,
      storage_path: filePath,
      status: 'pending',
    })

    setActionError('')
    setSelectedType('')
    setUploading(false)
    loadDocs()
  }

  async function handleOpenDocument(documentId: string) {
    setOpeningId(documentId)
    setActionError('')

    try {
      const res = await fetch('/api/documents/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })

      const payload = await res.json()
      if (!res.ok) {
        setActionError(payload?.error || 'Dokument konnte nicht geöffnet werden.')
        return
      }

      if (!payload?.url) {
        setActionError('Kein gültiger Download-Link verfügbar.')
        return
      }

      window.open(payload.url, '_blank', 'noopener,noreferrer')
    } catch {
      setActionError('Dokument konnte nicht geöffnet werden.')
    } finally {
      setOpeningId(null)
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
          <span>Lade deine Dokumente hoch für eine schnellere Abwicklung deiner Buchungen.</span>
        </div>

        <div className="section-label">Dokument hochladen</div>
        <div className="dok-types">
          {docTypes.map(dt => (
            <div
              key={dt.key}
              className={`dok-type${selectedType === dt.key ? ' on' : ''}`}
              onClick={() => setSelectedType(dt.key)}
            >
              <div className="dok-type-icon"><IconDocument size={18} /></div>
              <div>
                <div className="dok-type-label">{dt.label}</div>
                <div className="dok-type-desc">{dt.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {selectedType && (
          <label className="dok-upload-btn">
            <input type="file" accept="image/*,.pdf" onChange={handleUpload} hidden />
            {uploading ? 'Wird hochgeladen...' : 'Datei auswählen & hochladen'}
          </label>
        )}

        {actionError && (
          <div style={{ color: 'var(--red-w)', fontSize: 12, marginTop: 8 }}>{actionError}</div>
        )}

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
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div className="dok-card-status" style={{ color: st.color }}>
                    {doc.status === 'verified' ? <IconCheck size={14} /> : <IconClock size={14} />}
                    {st.label}
                  </div>
                  <button
                    className="admin-order-btn ghost"
                    type="button"
                    disabled={openingId === doc.id}
                    onClick={() => handleOpenDocument(doc.id)}
                  >
                    {openingId === doc.id ? 'Öffnet...' : 'Öffnen'}
                  </button>
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
