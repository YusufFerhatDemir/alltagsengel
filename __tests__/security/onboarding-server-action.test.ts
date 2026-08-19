// ═══════════════════════════════════════════════════════════════════════
// Master-Final-Release-Audit 2026-08-19, Befund B-3 / I-7
//
// components/OnboardingFlow.tsx schrieb `pflegegrad` direkt aus dem
// Browser nach care_recipients — an zwei Dingen vorbei:
//   1. der care_level-Fuehrung (lib/clients/pflegegrad.ts liest zuerst
//      clients.care_level; ohne Sync sah jede Auswertung, u. a. die
//      Kassenabrechnung, weiterhin "kein Pflegegrad")
//   2. jeder Protokollierung
//
// Geprueft: Validierung, care_level-Sync und Audit-Eintrag.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from 'vitest'

type Zeile = Record<string, any>

let sessionUser: { id: string; email: string } | null = null
let daten: Record<string, Zeile[]> = {}
let updates: Array<{ tabelle: string; patch: Zeile }> = []
let inserts: Array<{ tabelle: string; row: Zeile }> = []
let updateFehler: Record<string, { message: string }> = {}
const auditEintraege: any[] = []

vi.mock('@/lib/audit-log', () => ({
  logAuditEventOrWarn: async (e: any) => { auditEintraege.push(e); return true },
}))

function baueChain(tabelle: string) {
  const filter: Array<(z: Zeile) => boolean> = []
  let limit = Infinity
  let patch: Zeile | null = null
  let spalten: string[] | null = null

  const treffer = () => (daten[tabelle] || []).filter(z => filter.every(f => f(z))).slice(0, limit)

  const anwenden = () => {
    if (updateFehler[tabelle]) return { data: null, error: updateFehler[tabelle] }
    for (const z of treffer()) Object.assign(z, patch)
    updates.push({ tabelle, patch: patch! })
    return { data: null, error: null }
  }

  const chain: any = {
    select: (s?: string) => { spalten = s ? s.split(',').map(x => x.trim()) : null; return chain },
    update: (p: Zeile) => { patch = p; return chain },
    insert: async (row: Zeile) => {
      inserts.push({ tabelle, row })
      ;(daten[tabelle] ||= []).push({ ...row })
      return { data: null, error: null }
    },
    eq: (s: string, v: any) => { filter.push(z => z[s] === v); return chain },
    limit: (n: number) => { limit = n; return chain },
    maybeSingle: async () => ({ data: treffer()[0] ?? null, error: null }),
    single: async () => {
      const t = treffer()
      return { data: t[0] ?? null, error: t[0] ? null : { message: 'not found' } }
    },
    then: (resolve: any) => resolve(patch ? anwenden() : { data: treffer(), error: null }),
  }
  void spalten
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: sessionUser },
        error: sessionUser ? null : { message: 'no session' },
      }),
    },
    from: (t: string) => baueChain(t),
  }),
}))

import { completeOnboardingAction } from '@/app/onboarding/actions'

const USER_ID = '00000000-0000-4000-8000-0000000000aa'

beforeEach(() => {
  sessionUser = { id: USER_ID, email: 'kunde@example.org' }
  daten = {
    profiles: [{ id: USER_ID, first_name: 'Erika', last_name: 'Musterfrau', onboarding_completed: false, postal_code: null }],
    care_recipients: [],
    clients: [],
  }
  updates = []
  inserts = []
  updateFehler = {}
  auditEintraege.length = 0
})

describe('completeOnboardingAction — Grundfall', () => {
  it('setzt onboarding_completed und die PLZ', async () => {
    const res = await completeOnboardingAction({ pflegegrad: '', plz: '60318' })
    expect(res).toMatchObject({ ok: true })
    expect(daten.profiles[0].onboarding_completed).toBe(true)
    expect(daten.profiles[0].postal_code).toBe('60318')
  })

  it('legt care_recipients an, wenn noch keiner existiert', async () => {
    await completeOnboardingAction({ pflegegrad: '3', plz: '60318' })
    expect(inserts.filter(i => i.tabelle === 'care_recipients')).toHaveLength(1)
    expect(inserts[0].row).toMatchObject({
      profile_id: USER_ID,
      pflegegrad: 3,
      relationship: 'selbst',
      first_name: 'Erika',
      last_name: 'Musterfrau',
    })
  })

  it('aktualisiert einen vorhandenen care_recipients-Datensatz', async () => {
    daten.care_recipients = [{ id: 'cr-1', profile_id: USER_ID, pflegegrad: 1 }]
    await completeOnboardingAction({ pflegegrad: '4' })
    expect(daten.care_recipients[0].pflegegrad).toBe(4)
    expect(inserts.filter(i => i.tabelle === 'care_recipients')).toHaveLength(0)
  })
})

describe('completeOnboardingAction — care_level-Fuehrung (B-3)', () => {
  it('zieht clients.care_level mit', async () => {
    daten.clients = [{ id: 'kl-1', user_id: USER_ID, care_level: null }]
    await completeOnboardingAction({ pflegegrad: '2' })
    expect(daten.clients[0].care_level).toBe(2)
  })

  it('schreibt nicht, wenn care_level bereits stimmt', async () => {
    daten.clients = [{ id: 'kl-1', user_id: USER_ID, care_level: 2 }]
    await completeOnboardingAction({ pflegegrad: '2' })
    expect(updates.filter(u => u.tabelle === 'clients')).toHaveLength(0)
  })

  it('legt keinen Klienten an, wenn keiner existiert — Klientenanlage ist Buerosache', async () => {
    await completeOnboardingAction({ pflegegrad: '2' })
    expect(inserts.filter(i => i.tabelle === 'clients')).toHaveLength(0)
    expect((daten.clients || [])).toHaveLength(0)
  })

  it('bricht nicht ab, wenn der clients-Sync an RLS scheitert', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    daten.clients = [{ id: 'kl-1', user_id: USER_ID, care_level: null }]
    updateFehler.clients = { message: 'permission denied' }

    const res = await completeOnboardingAction({ pflegegrad: '2' })

    expect(res).toMatchObject({ ok: true })
    // Aber: der Fehlschlag darf nicht unbemerkt bleiben.
    expect(spy.mock.calls.some(c => String(c[0]).includes('care_level-Sync'))).toBe(true)
  })
})

describe('completeOnboardingAction — Validierung', () => {
  it.each([['0'], ['6'], ['-1'], ['3.5'], ['drei'], ['<script>']])(
    'verwirft den ungueltigen Pflegegrad %s, schliesst das Onboarding aber ab',
    async (roh) => {
      const res = await completeOnboardingAction({ pflegegrad: roh })
      expect(res).toMatchObject({ ok: true, pflegegrad: null })
      expect(inserts.filter(i => i.tabelle === 'care_recipients')).toHaveLength(0)
      expect(daten.profiles[0].onboarding_completed).toBe(true)
    },
  )

  it.each([['6031'], ['603188'], ['ABCDE'], ['']])('verwirft die ungueltige PLZ %s', async (roh) => {
    await completeOnboardingAction({ plz: roh })
    expect(daten.profiles[0].postal_code).toBeNull()
  })

  it('schreibt ohne Session gar nichts', async () => {
    sessionUser = null
    const res = await completeOnboardingAction({ pflegegrad: '3', plz: '60318' })
    expect(res).toEqual({ ok: false, error: 'Nicht autorisiert.' })
    expect(updates).toHaveLength(0)
    expect(inserts).toHaveLength(0)
  })
})

describe('completeOnboardingAction — Protokollierung', () => {
  it('erzeugt einen Audit-Eintrag mit Session-Identitaet', async () => {
    await completeOnboardingAction({ pflegegrad: '3', plz: '60318' })
    expect(auditEintraege).toHaveLength(1)
    expect(auditEintraege[0]).toMatchObject({
      action: 'update',
      actorId: USER_ID,
      entityType: 'profile',
      entityId: USER_ID,
      details: { aktion: 'onboarding_abgeschlossen', pflegegrad_gesetzt: 3, plz_gesetzt: true },
    })
  })

  it('protokolliert auch den Abschluss ohne Pflegegrad', async () => {
    await completeOnboardingAction({})
    expect(auditEintraege).toHaveLength(1)
    expect(auditEintraege[0].details).toMatchObject({ pflegegrad_gesetzt: null, plz_gesetzt: false })
  })
})
