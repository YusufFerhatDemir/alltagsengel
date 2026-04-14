'use client'
import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BRAND, DOC_STATUS_LABELS, CLASSIFICATION_LABELS } from '@/lib/mis/constants'
import { SectionHeader, Card, DataTable, MisButton, SearchInput, StatusBadge, Badge, Tabs, EmptyState, Modal } from '@/components/mis/MisComponents'
import { MIcon } from '@/components/mis/MisIcons'
import type { MisDocument, DocumentCategory } from '@/lib/mis/types'

export default function DocumentsPage() {
  const [docs, setDocs] = useState<MisDocument[]>([])
  const [categories, setCategories] = useState<DocumentCategory[]>([])
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<MisDocument | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadForm, setUploadForm] = useState({ title: '', description: '', category_id: '', classification: 'internal', iso_doc_number: '', tags: '' })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const [{ data: docData }, { data: catData }] = await Promise.all([
      supabase.from('mis_documents').select('*, category:mis_document_categories(*)').order('updated_at', { ascending: false }),
      supabase.from('mis_document_categories').select('*').order('sort_order'),
    ])
    setDocs(docData as MisDocument[] || [])
    setCategories(catData as DocumentCategory[] || [])
    setLoading(false)
  }

  async function handleUpload() {
    const supabase = createClient()
    const file = fileRef.current?.files?.[0]

    const { data: { user } } = await supabase.auth.getUser()

    let filePath = ''
    let fileName = ''
    let fileSize = 0
    let fileType = ''

    if (file) {
      fileName = file.name
      fileSize = file.size
      fileType = file.type
      const ext = file.name.split('.').pop()
      filePath = `documents/${Date.now()}_${file.name}`
      await supabase.storage.from('mis-documents').upload(filePath, file)
    }

    const { error } = await supabase.from('mis_documents').insert({
      title: uploadForm.title,
      description: uploadForm.description,
      category_id: uploadForm.category_id || null,
      file_path: filePath,
      file_name: fileName,
      file_size: fileSize,
      file_type: fileType,
      classification: uploadForm.classification,
      iso_doc_number: uploadForm.iso_doc_number || null,
      tags: uploadForm.tags ? uploadForm.tags.split(',').map(t => t.trim()) : [],
      owner_id: user?.id,
      status: 'draft',
    })

    if (!error) {
      // Audit log
      await supabase.from('mis_audit_log').insert({
        entity_type: 'document', entity_id: crypto.randomUUID(),
        action: 'create', actor_id: user?.id, actor_name: 'Admin',
        details: { title: uploadForm.title },
      })
      setUploadOpen(false)
      setUploadForm({ title: '', description: '', category_id: '', classification: 'internal', iso_doc_number: '', tags: '' })
      loadData()
    }
  }

  async function handleStatusChange(docId: string, newStatus: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('mis_documents').update({
      status: newStatus,
      ...(newStatus === 'approved' ? { approved_by: user?.id, approved_at: new Date().toISOString() } : {}),
    }).eq('id', docId)
    await supabase.from('mis_audit_log').insert({
      entity_type: 'document', entity_id: docId,
      action: newStatus === 'approved' ? 'approve' : 'update',
      actor_id: user?.id, details: { new_status: newStatus },
    })
    loadData()
    setSelectedDoc(null)
  }

  async function handleDownload(doc: MisDocument) {
    if (!doc.file_path) return
    const supabase = createClient()
    const { data } = await supabase.storage.from('mis-documents').createSignedUrl(doc.file_path, 3600)
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank')
      await supabase.from('mis_documents').update({ download_count: doc.download_count + 1 }).eq('id', doc.id)
    }
  }

  const filteredDocs = docs.filter(d => {
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase()) || d.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
    const matchTab = activeTab === 'all' || d.status === activeTab
    return matchSearch && matchTab
  })

  const tabCounts = {
    all: docs.length,
    draft: docs.filter(d => d.status === 'draft').length,
    review: docs.filter(d => d.status === 'review').length,
    approved: docs.filter(d => d.status === 'approved').length,
    archived: docs.filter(d => d.status === 'archived').length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader
        title="Dokumentenmanagement"
        subtitle="ISO 9001 konforme Dokumentenlenkung mit Versionierung & Audit-Trail"
        icon="files"
        actions={<MisButton icon="upload" onClick={() => setUploadOpen(true)}>Hochladen</MisButton>}
      />

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Dokument suchen..." />
        </div>
      </div>

      <Tabs tabs={[
        { id: 'all', label: 'Alle', count: tabCounts.all },
        { id: 'draft', label: 'Entwurf', icon: 'edit', count: tabCounts.draft },
        { id: 'review', label: 'Prüfung', icon: 'eye', count: tabCounts.review },
        { id: 'approved', label: 'Genehmigt', icon: 'check', count: tabCounts.approved },
        { id: 'archived', label: 'Archiviert', icon: 'folder', count: tabCounts.archived },
      ]} active={activeTab} onChange={setActiveTab} />

      {loading ? (
        <Card><div style={{ padding: 40, textAlign: 'center', color: BRAND.muted }}>Laden...</div></Card>
      ) : filteredDocs.length === 0 ? (
        <EmptyState
          icon="files"
          title="Keine Dokumente vorhanden"
          description="Laden Sie Ihr erstes Dokument hoch, um das Dokumentenmanagement zu starten."
          action={<MisButton icon="upload" onClick={() => setUploadOpen(true)}>Dokument hochladen</MisButton>}
        />
      ) : (
        <DataTable
          columns={[
            { key: 'title', label: 'Titel', render: (r) => (
              <div>
                <div style={{ fontWeight: 600 }}>{r.title as string}</div>
                {Boolean(r.iso_doc_number) && <span style={{ fontSize: 11, color: BRAND.muted }}>{r.iso_doc_number as string} Rev. {r.iso_revision as string}</span>}
              </div>
            )},
            { key: 'category', label: 'Kategorie', render: (r) => {
              const cat = r.category as DocumentCategory | null
              return cat ? <Badge label={cat.name} color={cat.color || BRAND.gold} size="sm" /> : '—'
            }},
            { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status as string} /> },
            { key: 'classification', label: 'Klasse', render: (r) => (
              <span style={{ fontSize: 12, color: BRAND.muted }}>{CLASSIFICATION_LABELS[r.classification as string] || r.classification as string}</span>
            )},
            { key: 'version', label: 'Ver.', width: '60px' },
            { key: 'file_size', label: 'Größe', render: (r) => {
              const size = r.file_size as number
              return size > 0 ? (size > 1e6 ? `${(size/1e6).toFixed(1)} MB` : `${(size/1e3).toFixed(0)} KB`) : '—'
            }},
            { key: 'updated_at', label: 'Aktualisiert', render: (r) => new Date(r.updated_at as string).toLocaleDateString('de-DE') },
          ]}
          data={filteredDocs as unknown as Record<string,unknown>[]}
          onRowClick={(r) => setSelectedDoc(r as unknown as MisDocument)}
        />
      )}

      {/* Upload Modal */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Dokument hochladen" width={600}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Titel *</label>
            <input value={uploadForm.title} onChange={e => setUploadForm({...uploadForm, title: e.target.value})} style={inputStyle} placeholder="Dokumenttitel" />
          </div>
          <div>
            <label style={labelStyle}>Beschreibung</label>
            <textarea value={uploadForm.description} onChange={e => setUploadForm({...uploadForm, description: e.target.value})} style={{...inputStyle, minHeight: 80}} placeholder="Kurzbeschreibung" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Kategorie</label>
              <select value={uploadForm.category_id} onChange={e => setUploadForm({...uploadForm, category_id: e.target.value})} style={inputStyle}>
                <option value="">— Auswählen —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Klassifikation</label>
              <select value={uploadForm.classification} onChange={e => setUploadForm({...uploadForm, classification: e.target.value})} style={inputStyle}>
                {Object.entries(CLASSIFICATION_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>ISO Dok.-Nr.</label>
              <input value={uploadForm.iso_doc_number} onChange={e => setUploadForm({...uploadForm, iso_doc_number: e.target.value})} style={inputStyle} placeholder="z.B. DOC-QMS-001" />
            </div>
            <div>
              <label style={labelStyle}>Tags (kommagetrennt)</label>
              <input value={uploadForm.tags} onChange={e => setUploadForm({...uploadForm, tags: e.target.value})} style={inputStyle} placeholder="qualität, iso, prozess" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Datei</label>
            <input ref={fileRef} type="file" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <MisButton variant="secondary" onClick={() => setUploadOpen(false)}>Abbrechen</MisButton>
            <MisButton icon="upload" onClick={handleUpload} disabled={!uploadForm.title}>Hochladen</MisButton>
          </div>
        </div>
      </Modal>

      {/* Document Detail Modal */}
      <Modal open={!!selectedDoc} onClose={() => setSelectedDoc(null)} title={selectedDoc?.title || 'Dokument'} width={640}>
        {selectedDoc && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><span style={labelStyle}>Status</span><div><StatusBadge status={selectedDoc.status} /></div></div>
              <div><span style={labelStyle}>Klassifikation</span><div>{CLASSIFICATION_LABELS[selectedDoc.classification]}</div></div>
              <div><span style={labelStyle}>Version</span><div>{selectedDoc.version} (Rev. {selectedDoc.iso_revision})</div></div>
              <div><span style={labelStyle}>ISO Nr.</span><div>{selectedDoc.iso_doc_number || '—'}</div></div>
              <div><span style={labelStyle}>Downloads</span><div>{selectedDoc.download_count}</div></div>
              <div><span style={labelStyle}>Aktualisiert</span><div>{new Date(selectedDoc.updated_at).toLocaleString('de-DE')}</div></div>
            </div>
            {selectedDoc.description && <div><span style={labelStyle}>Beschreibung</span><p style={{ fontSize: 13, color: BRAND.coal, margin: '4px 0' }}>{selectedDoc.description}</p></div>}
            {selectedDoc.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {selectedDoc.tags.map(t => <Badge key={t} label={t} color={BRAND.gold} size="sm" />)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', borderTop: `1px solid ${BRAND.border}`, paddingTop: 16 }}>
              {selectedDoc.file_path && <MisButton icon="download" variant="secondary" onClick={() => handleDownload(selectedDoc)}>Herunterladen</MisButton>}
              {selectedDoc.status === 'draft' && <MisButton icon="eye" variant="secondary" onClick={() => handleStatusChange(selectedDoc.id, 'review')}>Zur Prüfung</MisButton>}
              {selectedDoc.status === 'review' && <MisButton icon="check" onClick={() => handleStatusChange(selectedDoc.id, 'approved')}>Genehmigen</MisButton>}
              {selectedDoc.status !== 'archived' && <MisButton icon="folder" variant="ghost" onClick={() => handleStatusChange(selectedDoc.id, 'archived')}>Archivieren</MisButton>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 11, color: BRAND.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${BRAND.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: BRAND.light, boxSizing: 'border-box' }
