/**
 * Tests fuer die Prevention-Control „Weiterleitung auf verworfenen Ladefehler".
 * @see scripts/lint-ladefehler.ts
 *
 * Zwei Aufgaben: die Regel muss die echte Form FINDEN und darf die
 * legitimen Formen NICHT anschlagen. Ohne den zweiten Teil wird eine
 * Prevention-Control abgeschaltet, sobald sie einmal zu laut war.
 */
import { describe, it, expect } from 'vitest'
import { pruefeQuelle } from '../scripts/lint-ladefehler'

describe('lint-ladefehler — findet die Form', () => {
  it('erkennt Weiterleitung auf ein null, das auch ein Fehler sein kann', () => {
    // Genau der Fall aus app/auth/callback (bis 31.08.2026).
    const quelle = `
      const { data: angel } = await supabase.from('angels').select('id').eq('id', user.id).single()
      if (!angel) return NextResponse.redirect(\`\${origin}/engel/register\`)
    `
    const befunde = pruefeQuelle(quelle, 'x.ts')
    expect(befunde).toHaveLength(1)
    expect(befunde[0].variable).toBe('angel')
  })

  it('erkennt router.replace genauso wie eine Server-Weiterleitung', () => {
    const quelle = `
      const { data: a } = await supabase.from('angels').select('*').eq('id', user.id).maybeSingle()
      if (!a) {
        router.replace('/engel/register')
        return
      }
    `
    expect(pruefeQuelle(quelle, 'x.tsx')).toHaveLength(1)
  })

  it('erkennt auch die Form ohne Umbenennung', () => {
    const quelle = `
      const { data } = await supabase.from('clients').select('*').single()
      if (!data) { redirect('/kunde/home') }
    `
    expect(pruefeQuelle(quelle, 'x.ts')).toHaveLength(1)
  })
})

describe('lint-ladefehler — schlaegt bei den legitimen Formen nicht an', () => {
  it('ignoriert eine Abfrage, die ihren Fehler mitnimmt', () => {
    const quelle = `
      const { data: a, error } = await supabase.from('angels').select('*').maybeSingle()
      if (error) { setError('…'); return }
      if (!a) { router.replace('/engel/register'); return }
    `
    expect(pruefeQuelle(quelle, 'x.tsx')).toEqual([])
  })

  it('ignoriert auth.getUser — dort IST null die Aussage „nicht angemeldet"', () => {
    const quelle = `
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
    `
    expect(pruefeQuelle(quelle, 'x.tsx')).toEqual([])
  })

  it('ignoriert einen verworfenen Fehler OHNE Weiterleitung', () => {
    // Nicht Gegenstand dieser Regel — das ist der Leerzustand-Fall, den
    // lib/ui/ladelage.ts behandelt.
    const quelle = `
      const { data } = await supabase.from('bookings').select('*')
      setBookings(data || [])
    `
    expect(pruefeQuelle(quelle, 'x.tsx')).toEqual([])
  })

  it('ignoriert eine Null-Pruefung, die nur einen Fehler wirft', () => {
    const quelle = `
      const { data: profile } = await supabase.from('profiles').select('role').single()
      if (!profile) throw new Error('Nicht autorisiert.')
    `
    expect(pruefeQuelle(quelle, 'x.ts')).toEqual([])
  })
})

describe('lint-ladefehler — die Regel laeuft ueber das echte Repo', () => {
  it('meldet das Repo als sauber', async () => {
    // Diese Suite ist der Grund, warum die Regel nicht verrottet: sie
    // beweist, dass die oben geprueften Muster auch auf dem echten Baum
    // dieselbe Antwort geben.
    const { execFileSync } = await import('node:child_process')
    const aus = execFileSync('npx', ['tsx', 'scripts/lint-ladefehler.ts'], {
      encoding: 'utf-8', cwd: process.cwd(),
    })
    expect(aus).toContain('lint-ladefehler OK')
  }, 120_000)
})
