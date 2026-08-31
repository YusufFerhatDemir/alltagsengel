import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { pruefeEinsatzfreigabe, pruefeClientFreigabe, pruefeBudget, pruefeVPBudget } from '@/lib/personal/einsatzfreigabe'
import { pruefeCaregiverVerfuegbarkeit } from '@/lib/touren/server'
import { assertZeitfenster } from '@/lib/personal/dienstplan'
import { ladeKonflikte } from '@/lib/einsatzplanung/konflikte-server'
import { logBillingAction } from '@/lib/billing/core/audit'
import { logAuditEvent } from '@/lib/audit-log'
import { safeDbError } from '@/lib/utils/api-error'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'
const log = logger.child('einsatzplanung')

async function requireStaff(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, response: NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 }) }
  const quellen = await holeRollenQuellenFuer(supabase, user)
  // Einsatzplanung gehoert zum Einsatzgeschehen: admin/superadmin und pdl.
  if (!quellenDuerfen(quellen, 'einsatz.lesen')) {
    return { ok: false as const, response: NextResponse.json({ error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' }, { status: 403 }) }
  }
  // `quellen` wandert mit: die force_override-Regel weiter unten ist eine
  // ZWEITE Entscheidung, und die gehoert auf dieselbe Grundlage wie diese
  // hier — nicht auf die wirksame Rolle als blosse Beschriftung.
  return { ok: true as const, userId: user.id, role: quellen.rolle, quellen }
}

export const GET = withTracking(async function GET(req: NextRequest) {
  const supabase = await createClient()
  const auth = await requireStaff(supabase)
  if (!auth.ok) return auth.response

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const caregiverId = searchParams.get('caregiver_id') || null
  const clientId = searchParams.get('client_id') || null
  const bundesland = searchParams.get('bundesland') || null
  const status = searchParams.get('status') || null

  if (!start || !end) {
    return NextResponse.json({ error: 'start und end Parameter erforderlich' }, { status: 400 })
  }

  const admin = createAdminClient()
  let query = admin
    .from('assignments')
    .select(`
      id, assignment_date, weekday, start_time, end_time, status,
      service_type, recurrence_rule, bundesland,
      client:clients!inner(id, first_name, last_name),
      caregiver:caregivers!inner(id, first_name, last_name)
    `)
    .eq('organization_id', organizationId)
    .gte('assignment_date', start)
    .lte('assignment_date', end)

  if (caregiverId) query = query.eq('caregiver_id', caregiverId)
  if (clientId) query = query.eq('client_id', clientId)
  if (bundesland) query = query.eq('bundesland', bundesland)
  if (status) query = query.eq('status', status)

  const { data, error } = await query.order('assignment_date').order('start_time')

  if (error) return safeDbError(error)
  return NextResponse.json(data)
})

export const POST = withTracking(async function POST(req: NextRequest) {
  const supabase = await createClient()
  const auth = await requireStaff(supabase)
  if (!auth.ok) return auth.response

  const body = await req.json()
  const {
    client_id, caregiver_id, assignment_date, weekday,
    start_time, end_time, service_type, is_recurring,
    valid_from, valid_until, address, zip_code,
    recurrence_rule, recurrence_end, notes, status: assignmentStatus,
  } = body

  if (!client_id || !caregiver_id || !start_time || !end_time || !service_type) {
    return NextResponse.json({ error: 'Pflichtfelder: client_id, caregiver_id, start_time, end_time, service_type' }, { status: 400 })
  }

  // Zeitfenster pruefen — dieselbe Regel wie im Dienstplan (assertZeitfenster):
  // Format HH:MM, Nachteinsaetze ueber Mitternacht ausdruecklich erlaubt,
  // aber kein Null-Einsatz (Beginn = Ende). Bis hierher gab es auf
  // `assignments` GAR KEINE Zeitpruefung: ein Tippfehler im Format schlug als
  // roher Postgres-Fehler durch (HTTP 500 statt lesbarer Meldung), und ein
  // Einsatz "10:00-10:00" liess sich anlegen — er belegt keine Zeit, wird vom
  // Doppelbelegungs-Trigger folgerichtig ignoriert und erzeugt spaeter einen
  // Leistungsnachweis ueber 0 Minuten.
  try {
    assertZeitfenster(start_time, end_time, null, 'Einsatz')
  } catch (err) {
    return apiErrorResponse(err, req, 400)
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
  }

  const admin = createAdminClient()

  // D1: force_override nur fuer admin/superadmin
  // Uebersteuern einer fehlenden Einsatzfreigabe ist eine Personalentscheidung.
  if (body.force_override && !quellenDuerfen(auth.quellen, 'personal.schreiben')) {
    return NextResponse.json(
      { error: 'force_override ist nur fuer Administratoren erlaubt.' },
      { status: 403 }
    )
  }

  // Fail-closed mit lesbarem Status: beide Prueffunktionen WERFEN, wenn
  // Klient bzw. Mitarbeiter unter dieser ID in dieser Organisation nicht
  // existieren (UserFacingError, Status 404). Ungefangen lief dieser Wurf
  // durch `withTracking` bis in den Next.js-Handler und kam als HTTP 500
  // ohne Klartext zurueck — eine schlicht falsche ID sah damit aus wie ein
  // Serverausfall, und die Disposition hatte nichts, woran sie den Tippfehler
  // erkennen konnte.
  let clientCheck
  try {
    clientCheck = await pruefeClientFreigabe(admin, client_id, organizationId, assignment_date)
  } catch (err) {
    return apiErrorResponse(err, req, 404)
  }
  if (!clientCheck.freigegeben && !body.force_override) {
    return NextResponse.json({
      error: `Klient "${clientCheck.clientName}" ist nicht für Einsätze freigegeben.`,
      client_probleme: clientCheck.probleme,
      hinweis: 'Mit force_override: true kann die Zuweisung erzwungen werden.',
    }, { status: 422 })
  }

  let freigabe
  try {
    freigabe = await pruefeEinsatzfreigabe(admin, caregiver_id, organizationId)
  } catch (err) {
    return apiErrorResponse(err, req, 404)
  }
  if (!freigabe.freigegeben && !body.force_override) {
    return NextResponse.json({
      error: `Mitarbeiter "${freigabe.caregiverName}" ist nicht für Einsätze freigegeben.`,
      freigabe_probleme: freigabe.probleme,
      abgelaufene_qualifikationen: freigabe.abgelaufeneQualifikationen,
      hinweis: 'Mit force_override: true kann die Zuweisung erzwungen werden.',
    }, { status: 422 })
  }

  const warnungen: string[] = []
  if (clientCheck.probleme.length > 0 && body.force_override) {
    warnungen.push(`Client-Freigabe übersteuert: ${clientCheck.probleme.join('; ')}`)
  }
  if (freigabe.probleme.length > 0 && body.force_override) {
    warnungen.push(`Einsatzfreigabe übersteuert: ${freigabe.probleme.join('; ')}`)
  }

  // ── Abwesenheit + Verfügbarkeitsfenster ───────────────────────────
  // Diese Prüfung gab es bisher NUR in der Tourenplanung (POST /api/tours).
  // Über /api/einsatzplanung ließ sich einem Engel im genehmigten Urlaub ein
  // Einsatz zuweisen (Bereich 3 der Lückenanalyse, P2). Gleiche Semantik wie
  // dort: Abwesenheit blockiert (422, mit force_override übersteuerbar),
  // ein Termin außerhalb der gepflegten angel_availability-Fenster warnt nur.
  //
  // Ohne assignment_date wird nicht geprüft: eine Serie (weekday +
  // recurrence_rule) hat kein einzelnes Datum, gegen das sich eine
  // Abwesenheit sinnvoll halten ließe.
  if (assignment_date) {
    // Fail-closed: die Prueffunktion wirft, wenn das Datum unbrauchbar ist
    // oder die Abwesenheitsliste nicht gelesen werden konnte. Vorher galt
    // beides still als "nicht abwesend".
    let verfuegbarkeit
    try {
      verfuegbarkeit = await pruefeCaregiverVerfuegbarkeit(
        admin, caregiver_id, assignment_date, start_time ?? null, end_time ?? null
      )
    } catch (err) {
      return apiErrorResponse(err, req, 400)
    }
    if (verfuegbarkeit.abwesend && !body.force_override) {
      return NextResponse.json({
        error: `Mitarbeiter "${freigabe.caregiverName}" ist am ${assignment_date} abwesend (${verfuegbarkeit.abwesenheitsGrund}).`,
        hinweis: 'Mit force_override: true kann die Zuweisung erzwungen werden.',
      }, { status: 422 })
    }
    if (verfuegbarkeit.abwesend) {
      warnungen.push(`Abwesenheit übersteuert: ${verfuegbarkeit.abwesenheitsGrund}.`)
    }
    if (verfuegbarkeit.ausserhalbZeitfenster) {
      warnungen.push('Einsatz liegt außerhalb der gepflegten Verfügbarkeits-Zeitfenster.')
    }
  } else {
    warnungen.push('Ohne Einsatzdatum wurde keine Abwesenheits- und Verfügbarkeitsprüfung durchgeführt.')
  }

  const isVP = service_type === 'verhinderungspflege' || service_type === 'verhinderung'
  const budgetCheck = await pruefeBudget(admin, client_id, organizationId, isVP ? 'verhinderungspflege' : undefined)
  if (budgetCheck.blockiert && !body.force_override) {
    return NextResponse.json({
      error: `Budget-Blockierung: ${budgetCheck.warnung}`,
      hinweis: 'Mit force_override: true kann die Zuweisung erzwungen werden.',
    }, { status: 422 })
  }
  if (budgetCheck.warnung) warnungen.push(budgetCheck.warnung)

  if (isVP) {
    const vpCheck = await pruefeVPBudget(admin, client_id, organizationId)
    if (vpCheck.vpKzpKombiniertWarnung) warnungen.push(vpCheck.vpKzpKombiniertWarnung)
  }

  // ── Zeitliche Überschneidung ──────────────────────────────────────
  // Bereich 3 der Lückenanalyse (P2): bisher meldete sich ein Konflikt erst
  // als roher Datenbankfehler des Triggers `check_assignment_overlap` — die
  // Meldung enthält UUIDs und wird vom Fehler-Sanitizer zu Recht verschluckt.
  // Der Planende sah also nur "Fehler beim Speichern".
  //
  // Die Mitarbeiter-Doppelbelegung ist hier BEWUSST NICHT über
  // force_override übersteuerbar: der Trigger blockiert sie ohnehin, ein
  // angebotener Übersteuerungsweg wäre eine Zusage, die die Datenbank nicht
  // einhält. Die Klienten-Überschneidung kennt der Trigger nicht und ist
  // fachlich nicht immer falsch (Doppelbesetzung beim Transfer) — sie warnt.
  //
  // Gilt auch für Serien (weekday statt assignment_date): der Trigger prüft
  // sie über einen eigenen Zweig (Wochentag + Gültigkeitsfenster), den
  // `ladeKonflikte`/`findeKonflikte` exakt nachbilden — vorher lief eine
  // Serie hier ungeprüft durch und der Nutzer sah nur die rohe DB-Meldung.
  if (assignment_date || weekday != null) {
    // ladeKonflikte prueft die IDs/Datumsformate, bevor sie in einen
    // PostgREST-Filter wandern, und wirft dabei UserFacingError. Ohne
    // diese Uebersetzung waere daraus eine 500er-Antwort geworden.
    let konflikte
    try {
      konflikte = await ladeKonflikte(admin, organizationId, {
        id: '',
        client_id,
        caregiver_id,
        assignment_date,
        weekday,
        valid_from,
        valid_until,
        start_time,
        end_time,
        status: assignmentStatus || 'GEPLANT',
      })
    } catch (err) {
      return apiErrorResponse(err, req, 400)
    }
    const mitarbeiterKonflikt = konflikte.find(k => k.art === 'mitarbeiter')
    if (mitarbeiterKonflikt) {
      return NextResponse.json({
        error: `Zeitliche Doppelbelegung: ${mitarbeiterKonflikt.meldung}`,
        konflikt_id: mitarbeiterKonflikt.gegenId,
        hinweis: 'Bitte Uhrzeit ändern oder eine andere Betreuungskraft wählen. Dieser Konflikt ist nicht übersteuerbar.',
      }, { status: 409 })
    }
    for (const k of konflikte.filter(k => k.art === 'klient')) {
      warnungen.push(`Terminüberschneidung beim Klienten: ${k.meldung}`)
    }
  }

  // Audit-Trail bei force_override
  if (body.force_override && warnungen.length > 0) {
    await logBillingAction(admin, {
      entityType: 'invoice',
      organizationId,
      entityId: `assignment-override-${client_id}-${caregiver_id}`,
      action: 'force_override',
      newState: {
        client_id,
        caregiver_id,
        assignment_date,
        service_type,
        overridden_checks: warnungen,
      },
      reason: body.override_reason || 'Keine Begruendung angegeben',
      actorId: auth.userId,
      actorRole: auth.role,
    })
  }

  const insertData: Record<string, unknown> = {
    client_id,
    caregiver_id,
    start_time,
    end_time,
    service_type,
    status: assignmentStatus || 'GEPLANT',
    is_recurring: is_recurring ?? false,
    created_by: auth.userId,
    organization_id: organizationId,
  }
  if (assignment_date) insertData.assignment_date = assignment_date
  if (weekday != null) insertData.weekday = weekday
  if (valid_from) insertData.valid_from = valid_from
  if (valid_until) insertData.valid_until = valid_until
  if (address) insertData.address = address
  if (zip_code) insertData.zip_code = zip_code
  if (recurrence_rule) insertData.recurrence_rule = recurrence_rule
  if (recurrence_end) insertData.recurrence_end = recurrence_end
  if (notes) insertData.notes = notes

  const { data, error } = await supabase.from('assignments').insert(insertData).select().single()

  if (error) {
    if (error.message.includes('DOPPELBELEGUNG')) {
      return apiErrorResponse(error, req, 409)
    }
    return safeDbError(error)
  }

  await logAuditEvent({
    action: 'create',
    actorId: auth.userId,
    organizationId,
    entityType: 'assignment',
    entityId: data.id,
    details: { nachher: data },
    request: req,
  }).catch(err => log.errorWithException('Audit-Log fehlgeschlagen', err))

  return NextResponse.json({ ...data, warnungen: warnungen.length > 0 ? warnungen : undefined }, { status: 201 })
})

export const PATCH = withTracking(async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const auth = await requireStaff(supabase)
  if (!auth.ok) return auth.response

  const body = await req.json()
  const { id, force_override, ...updates } = body

  if (!id) return NextResponse.json({ error: 'id erforderlich' }, { status: 400 })

  // D1: force_override nur fuer admin/superadmin
  if (force_override && !quellenDuerfen(auth.quellen, 'personal.schreiben')) {
    return NextResponse.json(
      { error: 'force_override ist nur fuer Administratoren erlaubt.' },
      { status: 403 }
    )
  }

  const organizationId = await getActiveOrgId()
  // Fail-closed (Audit MITTEL-1): ohne Org wuerde die Einsatzfreigabe-Pruefung
  // komplett uebersprungen — genau der Pfad, den sie absichern soll.
  if (!organizationId) {
    return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
  }
  const patchWarnungen: string[] = []
  {
    const admin = createAdminClient()
    // Gleicher Grund wie im POST: eine unbekannte ID ist ein 404 mit
    // Klartext, kein generischer 500.
    if (updates.caregiver_id) {
      let freigabe
      try {
        freigabe = await pruefeEinsatzfreigabe(admin, updates.caregiver_id, organizationId)
      } catch (err) {
        return apiErrorResponse(err, req, 404)
      }
      if (!freigabe.freigegeben && !force_override) {
        return NextResponse.json({
          error: `Mitarbeiter "${freigabe.caregiverName}" ist nicht für Einsätze freigegeben.`,
          freigabe_probleme: freigabe.probleme,
          abgelaufene_qualifikationen: freigabe.abgelaufeneQualifikationen,
          hinweis: 'Mit force_override: true kann die Zuweisung erzwungen werden.',
        }, { status: 422 })
      }
    }
    if (updates.client_id) {
      let clientCheck
      try {
        clientCheck = await pruefeClientFreigabe(admin, updates.client_id, organizationId, updates.assignment_date)
      } catch (err) {
        return apiErrorResponse(err, req, 404)
      }
      if (!clientCheck.freigegeben && !force_override) {
        return NextResponse.json({
          error: `Klient "${clientCheck.clientName}" ist nicht für Einsätze freigegeben.`,
          client_probleme: clientCheck.probleme,
          hinweis: 'Mit force_override: true kann die Zuweisung erzwungen werden.',
        }, { status: 422 })
      }
    }

    // ── Abwesenheit + Verfügbarkeitsfenster (gleiche Prüfung wie im POST) ──
    // Greift, sobald sich Mitarbeiter, Datum oder Uhrzeit ändern. Nicht
    // veränderte Werte kommen aus dem Bestand — sonst würde ein reiner
    // Datumswechsel gegen den alten Tag geprüft und liefe ins Leere.
    if (updates.caregiver_id || updates.assignment_date || updates.weekday != null || updates.start_time || updates.end_time || updates.client_id) {
      const { data: bestand } = await admin
        .from('assignments')
        .select('client_id, caregiver_id, assignment_date, weekday, valid_from, valid_until, start_time, end_time, status')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .maybeSingle()

      const caregiverId = updates.caregiver_id ?? bestand?.caregiver_id ?? null
      const clientId = updates.client_id ?? bestand?.client_id ?? null
      const datum = updates.assignment_date ?? bestand?.assignment_date ?? null
      const wochentag = updates.weekday ?? bestand?.weekday ?? null
      const gueltigVon = updates.valid_from ?? bestand?.valid_from ?? null
      const gueltigBis = updates.valid_until ?? bestand?.valid_until ?? null
      const startZeit = updates.start_time ?? bestand?.start_time ?? null
      const endeZeit = updates.end_time ?? bestand?.end_time ?? null

      // Gemergte Zeiten pruefen (Bestand + Aenderung) — sonst liesse sich ein
      // gueltiger Einsatz per PATCH auf "10:00-10:00" oder eine kaputte
      // Uhrzeit ziehen, an denen die Anlage laengst scheitert.
      if (updates.start_time !== undefined || updates.end_time !== undefined) {
        try {
          assertZeitfenster(startZeit, endeZeit, null, 'Einsatz')
        } catch (err) {
          return apiErrorResponse(err, req, 400)
        }
      }

      if (caregiverId && datum) {
        let verfuegbarkeit
        try {
          verfuegbarkeit = await pruefeCaregiverVerfuegbarkeit(
            admin, caregiverId, datum, startZeit, endeZeit
          )
        } catch (err) {
          return apiErrorResponse(err, req, 400)
        }
        if (verfuegbarkeit.abwesend && !force_override) {
          return NextResponse.json({
            error: `Mitarbeiter ist am ${datum} abwesend (${verfuegbarkeit.abwesenheitsGrund}).`,
            hinweis: 'Mit force_override: true kann die Änderung erzwungen werden.',
          }, { status: 422 })
        }
        if (verfuegbarkeit.abwesend) {
          patchWarnungen.push(`Abwesenheit übersteuert: ${verfuegbarkeit.abwesenheitsGrund}.`)
        }
        if (verfuegbarkeit.ausserhalbZeitfenster) {
          patchWarnungen.push('Einsatz liegt außerhalb der gepflegten Verfügbarkeits-Zeitfenster.')
        }
      }

      // Zeitliche Überschneidung — gleiche Regel wie im POST. Geprüft wird
      // gegen Bestand + Änderung zusammen, damit ein reiner Zeitwechsel nicht
      // gegen die alten Werte läuft. Der eigene Datensatz zählt nicht mit
      // (Abgleich über `id` in findeKonflikte).
      if (datum || wochentag != null) {
        let konflikte
        try {
          konflikte = await ladeKonflikte(admin, organizationId, {
            id,
            client_id: clientId,
            caregiver_id: caregiverId,
            assignment_date: datum,
            weekday: wochentag,
            valid_from: gueltigVon,
            valid_until: gueltigBis,
            start_time: startZeit,
            end_time: endeZeit,
            status: updates.status ?? bestand?.status ?? null,
          })
        } catch (err) {
          return apiErrorResponse(err, req, 400)
        }
        const mitarbeiterKonflikt = konflikte.find(k => k.art === 'mitarbeiter')
        if (mitarbeiterKonflikt) {
          return NextResponse.json({
            error: `Zeitliche Doppelbelegung: ${mitarbeiterKonflikt.meldung}`,
            konflikt_id: mitarbeiterKonflikt.gegenId,
            hinweis: 'Bitte Uhrzeit ändern oder eine andere Betreuungskraft wählen. Dieser Konflikt ist nicht übersteuerbar.',
          }, { status: 409 })
        }
        for (const k of konflikte.filter(k => k.art === 'klient')) {
          patchWarnungen.push(`Terminüberschneidung beim Klienten: ${k.meldung}`)
        }
      }
    }
  }

  // D1-Fix: Audit-Trail bei force_override im PATCH
  if (force_override && organizationId) {
    const admin = createAdminClient()
    const warnungen: string[] = []
    // Auch hier faengt der Block den Wurf ab: der Audit-Eintrag ist Beiwerk,
    // aber eine unbekannte ID darf auch aus ihm heraus kein 500 erzeugen.
    if (updates.caregiver_id) {
      try {
        const freigabe = await pruefeEinsatzfreigabe(admin, updates.caregiver_id, organizationId)
        if (!freigabe.freigegeben) warnungen.push(`Einsatzfreigabe übersteuert: ${freigabe.probleme.join('; ')}`)
      } catch (err) {
        return apiErrorResponse(err, req, 404)
      }
    }
    if (updates.client_id) {
      try {
        const clientCheck = await pruefeClientFreigabe(admin, updates.client_id, organizationId, updates.assignment_date)
        if (!clientCheck.freigegeben) warnungen.push(`Client-Freigabe übersteuert: ${clientCheck.probleme.join('; ')}`)
      } catch (err) {
        return apiErrorResponse(err, req, 404)
      }
    }
    if (warnungen.length > 0) {
      await logBillingAction(admin, {
        entityType: 'invoice',
        organizationId,
        entityId: `assignment-override-patch-${id}`,
        action: 'force_override',
        newState: {
          assignment_id: id,
          updates: Object.keys(updates),
          overridden_checks: warnungen,
        },
        reason: body.override_reason || 'Keine Begruendung angegeben',
        actorId: auth.userId,
        actorRole: auth.role,
      })
    }
  }

  const { organization_id: _oid, id: _uid, created_at: _ca, created_by: _cb, ...safeUpdates } = updates
  const updatePayload = { ...safeUpdates, updated_at: new Date().toISOString() }
  delete updatePayload.force_override
  let query = supabase
    .from('assignments')
    .update(updatePayload)
    .eq('id', id)
  query = query.eq('organization_id', organizationId)
  const { data, error } = await query.select().single()

  if (error) {
    if (error.message.includes('DOPPELBELEGUNG')) {
      return NextResponse.json({ error: 'Zeitliche Doppelbelegung erkannt.' }, { status: 409 })
    }
    return safeDbError(error)
  }

  await logAuditEvent({
    action: 'update',
    actorId: auth.userId,
    organizationId: organizationId || undefined,
    entityType: 'assignment',
    entityId: id,
    details: { aenderungen: safeUpdates },
    request: req,
  }).catch(err => log.errorWithException('Audit-Log fehlgeschlagen', err))

  return NextResponse.json({ ...data, warnungen: patchWarnungen.length > 0 ? patchWarnungen : undefined })
})
