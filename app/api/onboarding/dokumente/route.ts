/**
 * POST /api/onboarding/dokumente — Unterlage zum eigenen Ablauf hochladen
 *
 * ── DER PFAD IST DIE GRENZE ────────────────────────────────────────────
 * Abgelegt wird unter `onboarding/{organizationId}/{userId}/…`. Beide
 * Bestandteile stammen aus der SITZUNG, nie aus dem Formular — sonst
 * koennte ein Aufrufer in den Ordner einer anderen Person schreiben.
 * Der Dateiname wird zusaetzlich entschaerft (sanitizeStorageName), damit
 * „../" oder ein Slash den Pfad nicht verlassen kann.
 *
 * ── ZUERST PRUEFEN, DANN SCHREIBEN ─────────────────────────────────────
 * Typ und Groesse werden vor dem Upload geprueft. Eine abgelehnte Datei
 * erreicht den Speicher gar nicht erst.
 *
 * ── FEHLSCHLAG IST NICHT SCHLIMM ───────────────────────────────────────
 * Der Unterlagen-Schritt ist freiwillig. Geht der Upload schief, bekommt
 * die Person eine verstaendliche Meldung und kann weitermachen; die
 * Luecke steht danach in fehlende_angaben und kommt ueber die Erinnerung
 * zurueck.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgIdOrDefault } from '@/lib/organizations/server'
import { withTracking } from '@/lib/monitoring/tracker'
import { getClientIp } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { validateFileUpload, sanitizeStorageName } from '@/lib/file-upload-validation'
import { istOnboardingTyp } from '@/lib/onboarding/schritte'
import { vermerkeDokument, OnboardingAbgeschlossenError } from '@/lib/onboarding/service'
import { logger } from '@/lib/logger'

const log = logger.child('api:onboarding:dokumente')

const BUCKET = 'documents'
const MAX_BYTES = 10 * 1024 * 1024

/** Welche Unterlagen der Ablauf kennt. Geschlossene Liste — der Wert wird
 *  Teil des Speicherpfads und darf nichts Beliebiges sein. */
const ARTEN = ['lebenslauf', 'zeugnisse', 'qualifikationsnachweise', 'fuehrungszeugnis'] as const

export const POST = withTracking(async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Bitte melden Sie sich an, um Unterlagen hochzuladen.' },
      { status: 401 },
    )
  }

  // Uploads sind teuer und werden deshalb je Person gedrosselt, nicht nur
  // je IP: hinter einer IP koennen viele Menschen sitzen.
  if (!(await rateLimitPersistent(`onboarding-upload:${user.id}`, 20, 60 * 60 * 1000))) {
    return NextResponse.json(
      { error: 'Zu viele Uploads — bitte versuchen Sie es später erneut.' },
      { status: 429 },
    )
  }
  void getClientIp(request)

  let formular: FormData
  try {
    formular = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Die Datei konnte nicht gelesen werden.' }, { status: 400 })
  }

  const typ = formular.get('typ')
  const art = String(formular.get('art') ?? '')
  const datei = formular.get('datei')

  if (!istOnboardingTyp(typ)) {
    return NextResponse.json({ error: 'Unbekannte Ablaufart.' }, { status: 400 })
  }
  if (!(ARTEN as readonly string[]).includes(art)) {
    return NextResponse.json({ error: 'Unbekannte Unterlagenart.' }, { status: 400 })
  }
  if (!(datei instanceof File)) {
    return NextResponse.json({ error: 'Keine Datei erhalten.' }, { status: 400 })
  }

  const pruefung = validateFileUpload(datei, MAX_BYTES)
  if (!pruefung.valid) {
    return NextResponse.json({ error: pruefung.error ?? 'Datei nicht zulässig.' }, { status: 400 })
  }

  const organizationId = await getActiveOrgIdOrDefault()
  const sicher = sanitizeStorageName(pruefung.sanitizedFilename ?? datei.name)
  // Zeitstempel im Namen: eine erneut hochgeladene Unterlage ueberschreibt
  // die frühere nicht, sie ergänzt sie. Was gilt, sagt dokument_status.
  const pfad = `onboarding/${organizationId}/${user.id}/${art}-${Date.now()}-${sicher}`

  try {
    const admin = createAdminClient()

    const { error: speicherFehler } = await admin.storage
      .from(BUCKET)
      .upload(pfad, datei, { contentType: datei.type, upsert: false })

    if (speicherFehler) {
      log.errorWithException('Upload fehlgeschlagen', new Error(speicherFehler.message))
      return NextResponse.json(
        { error: 'Das Hochladen hat nicht geklappt. Sie können es später nachreichen.' },
        { status: 502 },
      )
    }

    await vermerkeDokument(
      admin,
      { userId: user.id, organizationId, typ },
      art,
      { pfad, dateiname: sicher, groesse: datei.size },
    )

    // Der PFAD wird nicht zurueckgegeben — die Oberflaeche braucht ihn
    // nicht, und ein Speicherpfad im Browser ist eine Einladung.
    return NextResponse.json({ ok: true, art, dateiname: sicher })
  } catch (err) {
    if (err instanceof OnboardingAbgeschlossenError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    log.errorWithException('Unterlage vermerken', err)
    return NextResponse.json(
      { error: 'Das Hochladen hat nicht geklappt. Sie können es später nachreichen.' },
      { status: 500 },
    )
  }
})
