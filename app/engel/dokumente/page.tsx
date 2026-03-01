'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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

  useEffect(() => { loadDocs() }, [])

  async function loadDocs() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id)
      .order('uploaded_at', { ascending: false })
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

    const MAX_SIZE = 10 * 1024 * 1024
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']

    if (file.size > MAX_SIZE) {
      alert('Datei zu groß (max. 10 MB)')
      setUploading(false)
      return
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      alert('Ungültiger Dateityp. Erlaubt: JPEG, PNG, WebP, GIF, PDF')
      setUploading(false)
      return
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${user.id}/${Date.now()}-${safeName}`
    const { error: uploadErr } = await supabase.storage.from('documents').upload(filePath, file)
    if (uploadErr) { console.error('Upload error:', uploadErr); setUploading(false); return }

    await supabase.from('documents').insert({
      user_id: user.id,
      type: selectedType,
      file_name: file.name,
      file_url: filePath,
      status: 'pending',
    })
    setSelectedType('')
    setUploading(false)
    loadDocs()
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
          <label className="dok-upload-btn">
            <input type="file" accept="image/*,.pdf" onChange={handleUpload} hidden />
            {uploading ? 'Wird hochgeladen...' : 'Datei auswählen & hochladen'}
          </label>
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
