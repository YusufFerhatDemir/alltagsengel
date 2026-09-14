import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('api:auth')

interface RateLimitEntry {
  key: string
  attempts: number
  first_attempt: string
  locked_until: string
  updated_at?: string
}

// ═══════════════════════════════════════════════════════════
// Server-Side Login Rate Limiter (Persistent via Supabase)
// Max 5 Versuche pro IP + E-Mail in 15 Minuten
// Nach 5 Fehlversuchen: 15 Min Sperre
// Nach 10 Fehlversuchen: 60 Min Sperre
// Nach 20 Fehlversuchen: 24h Sperre (Brute-Force-Verdacht)
// ═══════════════════════════════════════════════════════════

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

function getLockDuration(attempts: number): number {
  if (attempts >= 20) return 86400000   // 24 Stunden
  if (attempts >= 10) return 3600000    // 60 Minuten
  if (attempts >= 5) return 900000      // 15 Minuten
  return 0
}

function formatLockMessage(remainingMs: number): string {
  const remainingMin = Math.ceil(remainingMs / 60000)
  return remainingMin > 60
    ? `Zu viele Fehlversuche. Konto für ${Math.ceil(remainingMin / 60)} Stunden gesperrt.`
    : `Zu viele Fehlversuche. Bitte warten Sie ${remainingMin} Minuten.`
}

/**
 * Die Art des Schluessels — nie der Schluessel selbst.
 *
 * `email:…` traegt eine Adresse, `ip:…` eine IP. Beides gehoert nicht ins
 * Protokoll (AUTH-002-Muster wie im Catch dieser Route). Fuer die Frage
 * „welcher Zaehler ist ausgefallen" reicht die Art.
 */
function schluesselArt(key: string): 'email' | 'ip' | 'unbekannt' {
  if (key.startsWith('email:')) return 'email'
  if (key.startsWith('ip:')) return 'ip'
  return 'unbekannt'
}

/**
 * Ein Eintrag — oder null, weil es keinen gibt.
 *
 * BEFUND (Block 66): hier stand `const { data } = ….single()`. Der Fehler
 * wurde verworfen, und `null` heisst beim Aufrufer „kein Eintrag" — also
 * „nicht gesperrt". Ein Verbindungsabbruch, eine Schemadrift oder eine
 * entzogene Berechtigung sahen damit exakt so aus wie ein unbescholtener
 * Anmeldeversuch: der `check`-Zweig antwortete `allowed: true`, ohne dass
 * irgendwo ein Wort darueber fiel. Der Brute-Force-Schutz konnte
 * VOLLSTAENDIG fehlen, und nichts im System haette es gesagt. Live traegt
 * die Tabelle 32 Zeilen mit bis zu 6 Fehlversuchen — sie ist in Gebrauch.
 *
 * `.maybeSingle()` statt `.single()` ist die Voraussetzung dafuer: bei
 * `.single()` ist der haeufigste Normalfall (noch kein Eintrag) selbst ein
 * Fehler (PGRST116), und ein Protokolleintrag darauf waere Laerm statt
 * Signal.
 *
 * Fail-open bleibt: die Route blockiert Anmeldungen nicht, wenn ihr
 * Zaehlwerk streikt (Begruendung im Catch am Ende). Neu ist nur, dass es
 * hoerbar geschieht.
 */
async function getEntry(supabase: SupabaseClient, key: string): Promise<RateLimitEntry | null> {
  const { data, error } = await supabase
    .from('login_rate_limits')
    .select('*')
    .eq('key', key)
    .maybeSingle()
  if (error) {
    log.error('Rate-Limit-Eintrag nicht lesbar — eine Sperre wuerde JETZT nicht erkannt', {
      art: schluesselArt(key), code: error.code,
    })
    return null
  }
  return (data as RateLimitEntry | null) ?? null
}

/**
 * Zaehlt einen Fehlversuch fort. Gibt den Grund zurueck, wenn nicht.
 *
 * Der Rueckgabewert ist der Befund: vorher wurde das Versprechen nur
 * abgewartet. Schlug der Schreibvorgang fehl, blieb der Zaehler stehen —
 * und mit ihm die Sperre, die sich aus ihm aufbaut. Ein Angreifer haette
 * beliebig weiter geraten.
 */
async function upsertEntry(
  supabase: SupabaseClient, key: string, attempts: number, firstAttempt: string, lockedUntil: string,
): Promise<string | null> {
  const { error } = await supabase
    .from('login_rate_limits')
    .upsert({
      key,
      attempts,
      first_attempt: firstAttempt,
      locked_until: lockedUntil,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
  return error ? `${schluesselArt(key)} (${error.code ?? 'ohne Code'})` : null
}

/**
 * Loescht einen Zaehler. Gibt den Grund zurueck, wenn nicht.
 *
 * ABSICHTLICH OHNE ZEILENPRUEFUNG — anders als ueberall sonst: null
 * getroffene Zeilen ist hier der Normalfall (es gab keinen Zaehler, weil
 * es keine Fehlversuche gab) und kein Fehlschlag. Nur der Fehler zaehlt.
 */
async function deleteEntry(supabase: SupabaseClient, key: string): Promise<string | null> {
  const { error } = await supabase.from('login_rate_limits').delete().eq('key', key)
  return error ? `${schluesselArt(key)} (${error.code ?? 'ohne Code'})` : null
}

/**
 * Liefert den eingeloggten User der aktuellen Session — oder null.
 * Faengt eigene Fehler ab, damit der Aufrufer FAIL-CLOSED (401) reagiert
 * und nicht in den fail-open-Catch der Route rutscht.
 */
async function getVerifiedUser(): Promise<{ id: string; email?: string | null } | null> {
  try {
    const authClient = await createClient()
    const { data, error } = await authClient.auth.getUser()
    if (error || !data?.user) return null
    return { id: data.user.id, email: data.user.email }
  } catch {
    return null
  }
}

export const POST = withTracking(async function POST(req: NextRequest) {
  try {
    const { email, action } = await req.json()
    const ip = getClientIP(req)

    if (!email || !action) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const keyByIP = `ip:${ip}`
    const keyByEmail = `email:${email.toLowerCase()}`
    const now = new Date()

    if (action === 'check') {
      for (const key of [keyByIP, keyByEmail]) {
        const entry = await getEntry(supabase, key)
        if (entry && new Date(entry.locked_until) > now) {
          const remainingMs = new Date(entry.locked_until).getTime() - now.getTime()
          return NextResponse.json({
            allowed: false,
            locked: true,
            remainingSeconds: Math.ceil(remainingMs / 1000),
            message: formatLockMessage(remainingMs),
            attempts: entry.attempts,
          })
        }
      }
      return NextResponse.json({ allowed: true })
    }

    if (action === 'fail') {
      const nichtGezaehlt: string[] = []
      for (const key of [keyByIP, keyByEmail]) {
        const entry = await getEntry(supabase, key)

        let attempts = 0
        let firstAttempt = now.toISOString()
        let lockedUntil = now.toISOString()

        if (entry) {
          const entryAge = now.getTime() - new Date(entry.first_attempt).getTime()
          const stillLocked = new Date(entry.locked_until) > now

          // Reset wenn Window abgelaufen (24h) und nicht gesperrt
          if (entryAge > 86400000 && !stillLocked) {
            attempts = 1
            firstAttempt = now.toISOString()
            lockedUntil = now.toISOString()
          } else {
            attempts = entry.attempts + 1
            firstAttempt = entry.first_attempt
            const lockDuration = getLockDuration(attempts)
            lockedUntil = lockDuration > 0
              ? new Date(now.getTime() + lockDuration).toISOString()
              : entry.locked_until
          }
        } else {
          attempts = 1
        }

        const grund = await upsertEntry(supabase, key, attempts, firstAttempt, lockedUntil)
        if (grund) nichtGezaehlt.push(grund)
      }
      if (nichtGezaehlt.length > 0) {
        // Der Zaehler steht — also baut sich auch keine Sperre auf. Die
        // Antwort unten liest den tatsaechlichen Stand neu und bleibt
        // dadurch wahr; sie kann nur nicht wissen, dass sie es aus dem
        // falschen Grund ist.
        log.error('Fehlversuch NICHT gezaehlt — die Sperre baut sich nicht auf', {
          zaehler: nichtGezaehlt.join(', '),
        })
      }

      // Aktuelle Werte für Response laden
      const ipEntry = await getEntry(supabase, keyByIP)
      const emailEntry = await getEntry(supabase, keyByEmail)
      const maxAttempts = Math.max(ipEntry?.attempts || 0, emailEntry?.attempts || 0)

      if (maxAttempts >= 5) {
        const lockDuration = getLockDuration(maxAttempts)
        return NextResponse.json({
          locked: true,
          remainingSeconds: Math.ceil(lockDuration / 1000),
          message: formatLockMessage(lockDuration),
          attempts: maxAttempts,
        })
      }

      const remaining = 5 - maxAttempts
      return NextResponse.json({
        locked: false,
        attemptsRemaining: remaining,
        message: remaining <= 2
          ? `Noch ${remaining} Versuch${remaining === 1 ? '' : 'e'} bevor Ihr Konto gesperrt wird.`
          : undefined,
      })
    }

    if (action === 'success') {
      // ═══ SECURITY: 'success' ist nur nach echtem Login erlaubt ═══
      // Vorher konnte jeder per POST {email:"opfer@x.de", action:"success"}
      // den Brute-Force-Schutz eines fremden Kontos zuruecksetzen. Jetzt muss
      // eine gueltige Session existieren UND die uebergebene E-Mail muss zum
      // eingeloggten User gehoeren.
      const sessionUser = await getVerifiedUser()
      if (!sessionUser) {
        return NextResponse.json(
          { error: 'Nicht authentifiziert' },
          { status: 401 }
        )
      }
      if ((sessionUser.email ?? '').toLowerCase() !== String(email).toLowerCase()) {
        return NextResponse.json(
          { error: 'E-Mail gehoert nicht zur aktiven Sitzung' },
          { status: 403 }
        )
      }

      // AUTH-006: Bisher wurde der IP-Counter bei Success GAR NICHT resettet.
      // Das hat ein reales Problem in Shared-IP-Settings (Pflegeheim, Büro,
      // Hotel-WLAN, NAT-Gateway): Ein Kollege tippt 5x falsch → 15min Sperre
      // für alle 50 Leute hinter der NAT.
      //
      // Neuer Trade-off:
      //  1) E-Mail-Counter: komplett löschen (wie bisher — Login-Success
      //     beweist, dass der Account-Inhaber da ist).
      //  2) IP-Counter: **halbieren** statt löschen. Das bewahrt Schutz
      //     gegen Credential-Stuffing (Angreifer, der viele E-Mails
      //     von derselben IP probiert, baut trotzdem Druck auf), gibt
      //     aber einem ehrlichen User ein „Atmen" nach jedem erfolgreichen
      //     Login.
      //  3) Wenn der IP-Eintrag aktuell gesperrt ist, lassen wir die
      //     Sperre unangetastet — Success von einem gesperrten Key sollte
      //     gar nicht stattfinden, aber falls doch, nicht als Exploit-Weg.
      const emailGrund = await deleteEntry(supabase, keyByEmail)
      if (emailGrund) {
        // Der Nutzer hat sich soeben ausgewiesen — und sein Zaehler steht
        // weiter auf dem alten Stand. Beim naechsten Vertipper sperrt ihn
        // die Route aus einem Konto aus, dessen Inhaber er nachweislich
        // ist. Vorher fiel genau das lautlos aus.
        log.error('Zaehler nach erfolgreicher Anmeldung NICHT geloescht', { zaehler: emailGrund })
      }

      const ipEntry = await getEntry(supabase, keyByIP)
      if (ipEntry) {
        const stillLocked = new Date(ipEntry.locked_until) > now
        if (!stillLocked) {
          const halvedAttempts = Math.floor(ipEntry.attempts / 2)
          if (halvedAttempts <= 0) {
            // Komplett löschen bei <=1 verbleibender Markierung
            const ipGrund = await deleteEntry(supabase, keyByIP)
            if (ipGrund) {
              log.error('IP-Zaehler nach erfolgreicher Anmeldung NICHT geloescht', { zaehler: ipGrund })
            }
          } else {
            const halbGrund = await upsertEntry(
              supabase,
              keyByIP,
              halvedAttempts,
              ipEntry.first_attempt,
              // Lock zurücksetzen, da halvedAttempts < 5 (Lock-Schwelle)
              now.toISOString()
            )
            if (halbGrund) {
              log.error('IP-Zaehler nach erfolgreicher Anmeldung NICHT halbiert', { zaehler: halbGrund })
            }
          }
        }
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: unknown) {
    // AUTH-002-Pattern: niemals rohes err-Objekt loggen
    const e = err as { code?: string; name?: string } | undefined
    log.error('Rate limit error', { code: e?.code, name: e?.name })
    // FAIL-OPEN bei Rate Limiter Fehler (Login nicht blockieren)
    return NextResponse.json({ allowed: true })
  }
})
