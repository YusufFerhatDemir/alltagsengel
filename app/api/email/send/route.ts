import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { holeRollenQuellenFuer, quellenSindAdministration } from '@/lib/auth/rollen-quelle'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { sendEmailNotificationErgebnis } from '@/lib/notifications'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'
import { logger } from '@/lib/logger'
import { vorlageFinden, vorlageRendern } from '@/lib/email/templates'

const log = logger.child('api:email:send')

// ═══════════════════════════════════════════════════════════════════════
// VORLAGENVERSAND — Vorschau immer, Versand nur auf ausdrückliche Ansage
//
// ZWEI MODI, UND DER GEFÄHRLICHERE IST NICHT DER STANDARD
//   modus='vorschau'  rendert und gibt zurück. Kein Versand, kein Schreiben.
//   modus='senden'    sendet über Resend und protokolliert.
//
// Fehlt `modus`, gilt 'vorschau'. Ein vergessenes Feld darf nie dazu
// führen, dass eine Mail rausgeht — der teurere Weg muss der sein, den man
// ausdrücklich wählt.
//
// Automatische Auslöser rufen diese Route NICHT auf. Sie legen Entwürfe an
// (lib/email/entwuerfe.ts); der Versand geschieht ausschließlich über den
// Knopf in der Verwaltung.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Beide Rollenquellen, nicht nur `profiles`.
 *
 * `profiles` allein liesse eine Herabstufung in `app_metadata` wirkungslos —
 * genau das prueft `npm run lint:route-auth`, und genau das hat die Pruefung
 * an dieser Route auch gemeldet. Versand ist ein Vorbehaltsbereich: Post
 * geht nach draussen und laesst sich nicht zurueckholen.
 */
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')

  const quellen = await holeRollenQuellenFuer(supabase, user)
  if (!quellenSindAdministration(quellen)) {
    throw new Error('Nur fuer Administratoren.')
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) throw new Error('Keine Organisation zugewiesen.')

  return {
    userId: user.id,
    organizationId,
    role: quellen.rolle,
    name: quellen.name,
  }
}

export const POST = withTracking(async function POST(request: NextRequest) {
  try {
    const { userId, organizationId, role, name } = await requireAdmin()

    const body = await request.json()
    const modus = body.modus === 'senden' ? 'senden' : 'vorschau'

    const vorlage = vorlageFinden(body.vorlageId)
    if (!vorlage) {
      return NextResponse.json({ error: 'Unbekannte Vorlage.' }, { status: 400 })
    }

    const werte: Record<string, string> = {}
    if (body.werte && typeof body.werte === 'object') {
      for (const [k, v] of Object.entries(body.werte)) {
        // Nur Felder, die die Vorlage kennt. Ein unbekanntes Feld
        // stillschweigend zu übernehmen hieße, es in die jsonb-Spalte zu
        // schreiben, wo es niemand je wieder ansieht.
        if (typeof v === 'string' && vorlage.felder.some(f => f.key === k)) {
          werte[k] = v.slice(0, 2000)
        }
      }
    }

    const gerendert = vorlageRendern(vorlage, werte)

    // ── Vorschau ──────────────────────────────────────────────────────
    if (modus === 'vorschau') {
      return NextResponse.json({
        modus: 'vorschau',
        betreff: gerendert.betreff,
        rumpfHtml: gerendert.rumpfHtml,
        fehlendeFelder: gerendert.fehlendeFelder,
        absender: 'Alltagsengel <info@alltagsengel.care>',
      })
    }

    // ── Versand ───────────────────────────────────────────────────────
    const empfaenger = typeof body.empfaengerEmail === 'string' ? body.empfaengerEmail.trim() : ''
    if (!empfaenger || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(empfaenger)) {
      return NextResponse.json(
        { error: 'Ohne gültige Empfängeradresse kann nicht gesendet werden.' },
        { status: 400 },
      )
    }

    // Fail-closed: eine Vorlage mit Lücke geht nicht raus. Eine Einladung
    // ohne Termin ist beim Empfänger schlimmer als gar keine Mail.
    if (gerendert.fehlendeFelder.length > 0) {
      return NextResponse.json(
        { error: `Pflichtangaben fehlen: ${gerendert.fehlendeFelder.join(', ')}` },
        { status: 400 },
      )
    }

    const empfaengerName = typeof body.empfaengerName === 'string' && body.empfaengerName.trim()
      ? body.empfaengerName.trim()
      : (werte.vorname || 'Alltagsengel')

    const ergebnis = await sendEmailNotificationErgebnis(
      empfaenger,
      empfaengerName,
      gerendert.betreff,
      gerendert.rumpfHtml,
    )

    // Der Versand gilt nur mit Provider-Kennung als bewiesen — ohne sie
    // hat das SDK zwar nicht geworfen, aber nichts belegt. Die Kennung
    // heisst bei Resend `messageId`.
    const erfolgreich = ergebnis.ok
    const providerId = ergebnis.ok ? ergebnis.messageId : null
    const fehlerGrund = ergebnis.ok ? null : ergebnis.grund

    // Entwurf nachführen, sofern einer angegeben wurde.
    const entwurfId = typeof body.entwurfId === 'string' ? body.entwurfId : null
    if (entwurfId) {
      const admin = createAdminClient()
      const { error: schreibFehler } = await admin
        .from('email_entwuerfe')
        .update(erfolgreich
          ? {
            status: 'gesendet',
            gesendet_am: new Date().toISOString(),
            gesendet_von: userId,
            provider_id: providerId,
            fehler: null,
          }
          : {
            status: 'fehlgeschlagen',
            fehler: fehlerGrund ?? 'unbekannt',
          })
        .eq('id', entwurfId)
      if (schreibFehler) {
        log.error(`Entwurf ${entwurfId} konnte nicht nachgefuehrt werden: ${schreibFehler.message}`)
      }
    }

    await logAuditEventOrWarn({
      // `share` statt eines neuen Wertes wie 'email_gesendet': die Spalte
      // `mis_audit_log.action` traegt einen CHECK, und ein unbekannter Wert
      // laesst den Eintrag LAUTLOS scheitern — der Versand waere dann nicht
      // protokolliert. `share` ist in der Liste und trifft die Sache:
      // Inhalt wurde einem Empfaenger zugaenglich gemacht.
      action: 'share',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'email_vorlage',
      entityId: vorlage.id,
      details: {
        empfaenger,
        betreff: gerendert.betreff,
        erfolgreich,
        entwurf_id: entwurfId,
      },
    })

    if (!erfolgreich) {
      return NextResponse.json(
        { error: 'Der Versand ist fehlgeschlagen. Die Meldung steht im Protokoll.' },
        { status: 502 },
      )
    }

    return NextResponse.json({
      modus: 'senden',
      gesendet: true,
      betreff: gerendert.betreff,
      providerId,
    })
  } catch (err: any) {
    if (typeof err?.message === 'string' && /autorisiert|Administratoren|Organisation/.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    return safeApiError(err, request)
  }
})
