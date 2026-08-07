'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { requireUser } from '@/lib/supabase/require-session'
import { VERTRAGS_STATUS, VERTRAGS_TYP, formatDate, statusMeta } from '@/lib/admin/ops'
import type { AktenVertrag } from '@/lib/akten/types'

export default function EngelVertraegePage() {
  const router = useRouter()
  const [vertraege, setVertraege] = useState<AktenVertrag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const user = await requireUser(router, { redirectTo: '/engel/vertraege' })
      if (!user) return
      try {
        const supabase = createClient()
        // RLS liefert nur eigene, nicht gelöschte Verträge (engel_akten_vertraege_select)
        const { data, error: e } = await supabase
          .from('akten_vertraege')
          .select('*')
          .order('created_at', { ascending: false })
        if (e) throw new Error(e.message)
        setVertraege((data || []) as AktenVertrag[])
      } catch (err: any) {
        setError(err?.message || 'Verträge konnten nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="screen" id="engel-vertraege">
      <div className="topbar" style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/engel/home" className="back-btn" style={{ textDecoration: 'none' }}>‹</Link>
        <div className="topbar-title">Meine Verträge</div>
      </div>

      <div style={{ padding: '0 20px' }}>
        {error && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.3)', color: 'var(--red-w,#dc2626)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="chat-empty">Laden...</div>
        ) : vertraege.length === 0 ? (
          <div className="chat-empty" style={{ paddingTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📄</div>
            <div className="chat-empty-title">Keine Verträge</div>
            <div className="chat-empty-sub">Sobald ein Vertrag für dich hinterlegt wurde, erscheint er hier.</div>
          </div>
        ) : (
          vertraege.map(v => {
            const st = statusMeta(VERTRAGS_STATUS, v.status)
            const tp = statusMeta(VERTRAGS_TYP, v.vertragstyp)
            return (
              <div key={v.id} style={{ background: 'var(--white)', borderRadius: 16, marginBottom: 12, border: '1px solid var(--border)', padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{v.titel}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 3 }}>{tp.label}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: `${st.color}18`, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                    {st.label}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: 'var(--ink4)' }}>
                  {v.vertragsbeginn && <span>Beginn: {formatDate(v.vertragsbeginn)}</span>}
                  {v.vertragsende && <span>Ende: {formatDate(v.vertragsende)}</span>}
                  {v.unterschrift_datum && <span>Unterschrieben: {formatDate(v.unterschrift_datum)}</span>}
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
