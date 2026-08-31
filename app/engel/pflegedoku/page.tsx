'use client'
// ═══════════════════════════════════════════════════════════════
// Engel: Übersicht der zugewiesenen Kunden mit Pflegedokumentation
// RLS liefert nur Kunden mit aktiver Zuordnung.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ladeListe, zeilenVon, istFehler, zusammenfassen } from '@/lib/ui/ladelage'
import { requireUser } from '@/lib/supabase/require-session'
import { PFLEGE_SCHWEREGRAD, formatDate, statusMeta } from '@/lib/admin/ops'

type KundenKarte = {
  client_id: string
  name: string
  risiken: number
  kritischeRisiken: number
  diagnosen: number
  letzterVerlauf: string | null
  planTitel: string | null
  hoechsterSchweregrad: string | null
}

export default function EngelPflegedokuPage() {
  const router = useRouter()
  const [kunden, setKunden] = useState<KundenKarte[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const user = await requireUser(router, { redirectTo: '/engel/pflegedoku' })
      if (!user) return
      try {
        const supabase = createClient()
        // Alle folgenden Abfragen sind durch RLS auf die zugewiesenen Kunden
        // begrenzt (engel_pflege_*_select über aktive assignments).
        // Vier Abfragen, deren Fehler bis 31.08.2026 alle verworfen wurden:
        // gelesen wurde nur `.data`. Faellt eine aus, fehlen ihre Kunden in
        // der Vereinigung unten — im schlimmsten Fall alle, und die Seite
        // meldet „Keine Pflegedokumentation". Fuer eine Pflegeakte ist das
        // die gefaehrlichste Falschaussage, die die Oberflaeche treffen
        // kann. `zusammenfassen` laesst den Fehler gewinnen: eine
        // unvollstaendige Akte darf nicht wie eine leere aussehen.
        const [risikenRes, diagnosenRes, plaeneRes, verlaufRes] = await Promise.all([
          ladeListe<{ client_id: string; schweregrad: string; bezeichnung: string }>(
            supabase.from('pflege_risiken').select('client_id, schweregrad, bezeichnung'), 'pflegedoku:risiken'),
          ladeListe<{ client_id: string }>(
            supabase.from('pflege_diagnosen').select('client_id'), 'pflegedoku:diagnosen'),
          ladeListe<{ client_id: string; titel: string; status: string }>(
            supabase.from('pflege_massnahmenplaene').select('client_id, titel, status'), 'pflegedoku:plaene'),
          ladeListe<{ client_id: string; eintrag_datum: string }>(
            supabase.from('pflege_verlauf').select('client_id, eintrag_datum').order('eintrag_datum', { ascending: false }), 'pflegedoku:verlauf'),
        ])

        if (zusammenfassen([risikenRes, diagnosenRes, plaeneRes, verlaufRes]) === 'fehler') {
          setError('Die Pflegedokumentation konnte nicht vollständig geladen werden. Bitte laden Sie die Seite neu.')
          return
        }

        const risiken_ = zeilenVon(risikenRes)
        const diagnosen_ = zeilenVon(diagnosenRes)
        const plaene_ = zeilenVon(plaeneRes)
        const verlauf_ = zeilenVon(verlaufRes)

        const ids = new Set<string>()
        for (const zeilen of [risiken_, diagnosen_, plaene_, verlauf_]) {
          for (const z of zeilen) ids.add((z as { client_id: string }).client_id)
        }
        if (ids.size === 0) { setKunden([]); return }

        const klientenLage = await ladeListe<{ id: string; first_name: string | null; last_name: string | null }>(
          supabase.from('clients').select('id, first_name, last_name').in('id', [...ids]),
          'pflegedoku:clients',
        )
        if (istFehler(klientenLage)) {
          setError('Die Kundennamen konnten nicht geladen werden. Bitte laden Sie die Seite neu.')
          return
        }
        const clients = zeilenVon(klientenLage)

        const rang: Record<string, number> = { niedrig: 1, mittel: 2, hoch: 3, kritisch: 4 }

        setKunden([...ids].map(id => {
          const c = clients.find((x: { id: string }) => x.id === id) as { first_name?: string; last_name?: string } | undefined
          const risiken = risiken_.filter((r: any) => r.client_id === id)
          const hoechst = risiken.reduce<string | null>((acc, r: any) => (
            !acc || (rang[r.schweregrad] ?? 0) > (rang[acc] ?? 0) ? r.schweregrad : acc
          ), null)
          const plan = plaene_.find((p: any) => p.client_id === id && p.status === 'aktiv')
          const verlauf = verlauf_.find((v: any) => v.client_id === id)
          return {
            client_id: id,
            name: c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() : 'Kunde',
            risiken: risiken.length,
            kritischeRisiken: risiken.filter((r: any) => r.schweregrad === 'hoch' || r.schweregrad === 'kritisch').length,
            diagnosen: diagnosen_.filter((d: any) => d.client_id === id).length,
            letzterVerlauf: verlauf?.eintrag_datum ?? null,
            planTitel: plan?.titel ?? null,
            hoechsterSchweregrad: hoechst,
          }
        }).sort((a, b) => a.name.localeCompare(b.name, 'de')))
      } catch (err: any) {
        setError(err?.message || 'Pflegedokumentation konnte nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    }
    load()
     
  }, [])

  return (
    <div className="screen" id="engel-pflegedoku">
      <div className="topbar" style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/engel/home" className="back-btn" style={{ textDecoration: 'none' }}>‹</Link>
        <div className="topbar-title">Meine Pflegedoku</div>
      </div>

      <div style={{ padding: '0 20px' }}>
        {error && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.3)', color: 'var(--red-w,#dc2626)', fontSize: 13 }}>
            {error}
          </div>
        )}

        <Link
          href="/engel/pflegedoku/verlauf"
          style={{
            display: 'block', textAlign: 'center', padding: '12px 16px', borderRadius: 14,
            background: 'linear-gradient(135deg,var(--gold2),var(--gold))', color: 'var(--coal)',
            fontWeight: 700, fontSize: 14, textDecoration: 'none', marginBottom: 16,
          }}
        >
          + Verlaufseintrag erfassen
        </Link>

        {loading ? (
          <div className="chat-empty">Laden...</div>
        ) : kunden.length === 0 ? (
          <div className="chat-empty" style={{ paddingTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
            <div className="chat-empty-title">{error ? 'Dokumentation nicht geladen' : 'Keine Pflegedokumentation'}</div>
            <div className="chat-empty-sub">{error ? 'Bitte laden Sie die Seite neu.' : 'Sobald du einem Kunden zugeordnet bist, erscheint hier seine Dokumentation.'}</div>
          </div>
        ) : (
          kunden.map(k => (
            <Link
              key={k.client_id}
              href={`/engel/pflegedoku/${k.client_id}`}
              style={{
                display: 'block', background: 'var(--white)', borderRadius: 16, marginBottom: 12,
                border: '1px solid var(--border)', padding: 16, textDecoration: 'none', color: 'inherit',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{k.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 3 }}>
                    {k.planTitel ? k.planTitel : 'Kein aktiver Plan'}
                  </div>
                </div>
                {k.kritischeRisiken > 0 && k.hoechsterSchweregrad && (
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: statusMeta(PFLEGE_SCHWEREGRAD, k.hoechsterSchweregrad).color,
                    background: `${statusMeta(PFLEGE_SCHWEREGRAD, k.hoechsterSchweregrad).color}18`,
                    padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap',
                  }}>
                    {k.kritischeRisiken} Risiko{k.kritischeRisiken > 1 ? 'en' : ''}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: 'var(--ink4)' }}>
                <span>{k.diagnosen} Diagnosen</span>
                <span>{k.risiken} Risiken</span>
                {k.letzterVerlauf && <span>Zuletzt: {formatDate(k.letzterVerlauf)}</span>}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
