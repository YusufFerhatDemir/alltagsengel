/**
 * Der Bestaetigungslink, der den Administrator zum Kunden machte
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 97, 14.09.2026)
 *
 * In `app/auth/callback/route.ts` stand:
 *
 *     const safeRole = ALLOWED_SIGNUP_ROLES.includes(meta.role)
 *       ? meta.role : 'kunde'
 *     await supabase.from('profiles').upsert({ id: user.id, role: safeRole, … })
 *
 * Zwei Fehler in einer Zeile, und der erste ist schwer.
 *
 * 1. `safeRole` bildet JEDE Rolle ausserhalb der Signup-Liste auf 'kunde'
 *    ab — auch 'admin' und 'superadmin'. Als Schutz beim ANLEGEN ist das
 *    richtig. Aber ein `upsert` legt nicht nur an: es trifft auch eine
 *    BESTEHENDE Zeile. Wer eine privilegierte Rolle in `user_metadata`
 *    traegt und einen Bestaetigungs- oder Magic-Link anklickt, bekam
 *    damit `profiles.role = 'kunde'` geschrieben — und `profiles` ist die
 *    bindende Rollenquelle (lib/auth/rollen.ts).
 *
 *    Der Datenbank-Riegel greift dagegen NICHT. `prevent_role_escalation`
 *    (live am 14.09.2026 aus pg_proc gelesen) wirft nur, wenn der
 *    Handelnde KEIN Admin ist. Hier ist der Handelnde der Betroffene
 *    selbst: `is_admin()` ist wahr, die Herabstufung ist erlaubt.
 *
 *    LIVE GEMESSEN ueber die GoTrue-Admin-API: drei Konten tragen eine
 *    `user_metadata.role` ausserhalb der Signup-Liste, zwei davon haben
 *    `profiles.role = 'superadmin'`.
 *
 * 2. Das Ergebnis wurde verworfen. PostgREST wirft nicht — scheiterte die
 *    Anlage, hatte das Konto eine Sitzung, aber kein Profil. Ohne
 *    profiles-Rolle antwortet jeder Guard mit 403, ohne dass irgendwo
 *    stuende, warum. Der Callback leitete trotzdem weiter.
 *
 * Nebenwirkung derselben Zeile: Vor- und Nachname und die Adresse wurden
 * bei jedem Aufruf aus den Signup-Metadaten ueberschrieben.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { erstelleFakeSupabase, type FakeAufruf, type FakeSupabase } from '../helpers/supabase-fake'

const halter = vi.hoisted(() => ({
  fake: null as unknown as FakeSupabase,
  user: null as null | Record<string, unknown>,
  tauschFehler: null as null | { message: string },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({ error: halter.tauschFehler }),
      getUser: async () => ({ data: { user: halter.user }, error: null }),
    },
    from: (t: string) => (halter.fake.client as unknown as { from: (t: string) => unknown }).from(t),
  }),
}))

vi.mock('@/lib/security', () => ({
  erfasseSicherheitsereignis: async () => undefined,
}))

import { GET as callback } from '@/app/auth/callback/route'

const USER = '00000000-0000-4000-8000-00000000d001'

function setzeAntworten(geber: (a: FakeAufruf) => { data?: unknown; error?: { message: string; code?: string } | null } | undefined) {
  halter.fake = erstelleFakeSupabase(geber)
}

async function ruf(): Promise<{ status: number; ziel: string }> {
  const res = await callback(new Request('https://beispiel.test/auth/callback?code=abc'))
  return { status: res.status, ziel: res.headers.get('location') ?? '' }
}

/** Antwort fuer die Rollenabfrage, die NACH der Anlage kommt. */
function profilMit(rolle: string) {
  return (a: FakeAufruf) => {
    if (a.tabelle === 'profiles' && a.operation === 'insert') {
      return { data: null, error: { message: 'duplicate key value', code: '23505' } }
    }
    if (a.tabelle === 'profiles') return { data: { role: rolle }, error: null }
    return { data: null, error: null }
  }
}

beforeEach(() => {
  halter.tauschFehler = null
  halter.user = { id: USER, email: 'admin@example.org', app_metadata: {}, user_metadata: { role: 'admin' } }
  setzeAntworten(profilMit('superadmin'))
})

describe('Ein bestehendes Profil wird nicht angefasst', () => {
  it('schreibt mit insert, NIE mit upsert', async () => {
    await ruf()
    const schreiben = halter.fake.auf('profiles').filter(a => a.operation === 'insert')
    expect(schreiben).toHaveLength(1)
    // Der Kern des Befundes: `upsert` trifft auch die bestehende Zeile.
    expect(schreiben[0].roh).toBe('insert')
  })

  it('die vorhandene superadmin-Rolle ueberlebt den Klick', async () => {
    const r = await ruf()
    // Die Weiterleitung folgt der Rolle aus profiles — nicht 'kunde'.
    expect(r.ziel).not.toContain('/kunde/home')
    expect(r.ziel).not.toContain('/auth/login')
  })

  it('23505 ist der Normalfall und bricht nichts ab', async () => {
    // „Zeile gibt es schon" ist genau die Absicht von insert.
    expect((await ruf()).status).toBe(307)
  })

  it('versucht KEINEN zweiten Schreibweg nach 23505', async () => {
    // Ein Rueckfall auf update() waere derselbe Befund mit anderem Namen.
    await ruf()
    const schreiben = halter.fake.auf('profiles').filter(a => a.operation !== 'select')
    expect(schreiben.map(a => a.roh)).toEqual(['insert'])
  })
})

describe('Die Anlage selbst bleibt fail-closed gegen privilegierte Rollen', () => {
  it('legt ein Konto mit user_metadata.role=admin als kunde an', async () => {
    // Die Sicherheitsregel bleibt: aus den Anmelde-Metadaten entsteht nie
    // ein privilegiertes Profil. Sie gilt jetzt nur noch fuer die ANLAGE.
    await ruf()
    const angelegt = halter.fake.auf('profiles').find(a => a.operation === 'insert')
    expect((angelegt?.payload as Record<string, unknown>).role).toBe('kunde')
  })

  it('uebernimmt eine erlaubte Signup-Rolle unveraendert', async () => {
    halter.user = { id: USER, email: 'engel@example.org', app_metadata: {}, user_metadata: { role: 'engel', first_name: 'Eva' } }
    setzeAntworten((a) => {
      if (a.tabelle === 'profiles' && a.operation === 'insert') return { data: null, error: null }
      if (a.tabelle === 'profiles') return { data: { role: 'engel' }, error: null }
      if (a.tabelle === 'angels') return { data: { id: USER }, error: null }
      return { data: null, error: null }
    })
    await ruf()
    const angelegt = halter.fake.auf('profiles').find(a => a.operation === 'insert')
    expect((angelegt?.payload as Record<string, unknown>).role).toBe('engel')
  })

  it('schreibt gar nicht, wenn die Metadaten keine Rolle tragen', async () => {
    halter.user = { id: USER, email: 'x@example.org', app_metadata: {}, user_metadata: {} }
    setzeAntworten((a) => (a.tabelle === 'profiles' ? { data: { role: 'kunde' }, error: null } : { data: null, error: null }))
    await ruf()
    expect(halter.fake.auf('profiles').filter(a => a.operation === 'insert')).toHaveLength(0)
  })
})

describe('Eine gescheiterte Anlage wird nicht verschwiegen', () => {
  it('schickt zurueck zur Anmeldung statt in einen Bereich', async () => {
    // Ohne Profil traegt das Konto keine Rolle. Die Weiterleitung nach
    // /kunde/home waere die stille Falschaussage: angemeldet, ohne Zugang.
    setzeAntworten((a) => {
      if (a.tabelle === 'profiles' && a.operation === 'insert') {
        return { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } }
      }
      return { data: null, error: null }
    })
    const r = await ruf()
    expect(r.ziel).toContain('/auth/login?error=rolle_nicht_pruefbar')
  })

  it('fragt danach die Rolle gar nicht mehr ab', async () => {
    setzeAntworten((a) => {
      if (a.tabelle === 'profiles' && a.operation === 'insert') {
        return { data: null, error: { message: 'kaputt', code: '42501' } }
      }
      return { data: null, error: null }
    })
    await ruf()
    expect(halter.fake.auf('profiles').filter(a => a.operation === 'select')).toHaveLength(0)
  })
})

describe('Die Quelle haelt die Richtung fest', () => {
  const QUELLE = readFileSync('app/auth/callback/route.ts', 'utf8')
  const AUSGEFUEHRT = QUELLE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(z => !z.trim().startsWith('//')).join('\n')

  it('kein upsert auf profiles im ausgefuehrten Teil', () => {
    expect(AUSGEFUEHRT).not.toContain('.upsert(')
  })

  it('23505 wird ausdruecklich als Normalfall behandelt', () => {
    expect(AUSGEFUEHRT).toContain("profilAnlage.code !== '23505'")
  })
})
