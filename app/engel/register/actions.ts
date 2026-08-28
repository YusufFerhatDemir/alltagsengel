'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgIdOrDefault } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { geocodePLZ } from '@/lib/geocoding'
import { ENGEL_HOURLY_RATE } from '@/lib/pricing/b2c-constants'

// Register: user may not have 'engel' role yet — only check authenticated
async function requireAuth() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  // Registrierung: der Nutzer hat noch keine caregivers/clients-Zeile —
  // bewusster Stamm-Org-Fallback (Audit MITTEL-1, dokumentierte Ausnahme).
  const organizationId = await getActiveOrgIdOrDefault()
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Engel'
  return { supabase, userId: user.id, organizationId, role: profile?.role ?? null, name }
}

// ---------------------------------------------------------------------------
// Register as Engel — upsert angel row + update profile
// ---------------------------------------------------------------------------
export async function registerAsEngel(data: {
  firstName: string
  lastName: string
  email: string
  phone: string
  plz: string
  stadt: string
  qualification: string
  services: string[]
  availability: string[]
  /**
   * WIRD IGNORIERT (Track 12, B1). Der Stundensatz ist eine
   * Konditionsentscheidung des Betriebs und wird serverseitig aus
   * ENGEL_HOURLY_RATE gesetzt. Das Feld bleibt in der Signatur, damit
   * bestehende Aufrufer nicht brechen — die Registrierungsseite schickt
   * ohnehin genau diese Konstante zurueck.
   */
  hourlyRate?: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // --- Input validation ---
    if (!Array.isArray(data.services) || data.services.length === 0) {
      return { ok: false, error: 'Bitte mindestens eine Leistung wählen.' }
    }
    if (!Array.isArray(data.availability) || data.availability.length === 0) {
      return { ok: false, error: 'Bitte mindestens einen Verfügbarkeitstag wählen.' }
    }
    const { supabase, userId, organizationId, role, name } = await requireAuth()

    // --- 1. Angel-Profil anlegen ------------------------------------------
    // Diese Server Action laeuft ueber den ADMIN-Client und umgeht damit
    // sowohl RLS als auch die Spalten-GRANTs. Beides ist notwendig — seit
    // Track 9 hat `authenticated` auf `angels` kein INSERT und nur noch
    // UPDATE auf (is_online, bio, services, availability); hourly_rate,
    // qualification, is_certified und is_45b_capable sind live gesperrt
    // (has_column_privilege = false, am 28.08.2026 gegen die Produktion
    // geprueft).
    //
    // BEFUND (Track 12, B1): genau dadurch war diese Stelle das offene
    // Gegenstueck zu jener Sperre. `requireAuth()` prueft nur, DASS jemand
    // angemeldet ist — keine Rolle, und vor allem nicht, ob dieses Konto
    // bereits registriert ist. Der Aufruf war ein `upsert` auf `id`, also
    // idempotent per Konstruktion: ein laengst registrierter Engel konnte
    // die Action ein zweites Mal aufrufen und dabei seinen eigenen
    // hourly_rate, seine qualification und die beiden Kennzeichen
    // is_certified/is_45b_capable frei setzen — dieselben vier Spalten, die
    // Track 9 an der Datenbank verriegelt hat. Server Actions sind
    // aufrufbare HTTP-Endpunkte; dass die Oberflaeche das Feld gar nicht
    // anbietet, ist keine Schranke.
    //
    // Drei Aenderungen:
    //
    //   1. Der Stundensatz kommt NICHT mehr aus dem Aufruf. Er ist eine
    //      Konditionsentscheidung des Betriebs und steht als
    //      ENGEL_HOURLY_RATE in lib/pricing/b2c-constants.ts — die
    //      Registrierungsseite hat schon immer genau diese Konstante
    //      geschickt und nie eine Nutzereingabe. Der Parameter bleibt in
    //      der Signatur, damit bestehende Aufrufer nicht brechen, wird aber
    //      ignoriert; abweichende Saetze setzt die Personalverwaltung.
    //   2. Ein bereits vorhandener Datensatz wird nur noch in den Feldern
    //      fortgeschrieben, die der Engel selbst pflegen darf. hourly_rate,
    //      qualification und die Kennzeichen bleiben stehen.
    //   3. rating/total_jobs/satisfaction_pct werden nur bei der ERSTanlage
    //      gesetzt. Vorher stempelte jeder erneute Aufruf sie auf
    //      5,0 / 0 / 100 zurueck — eine Bewertungshistorie liess sich damit
    //      loeschen.
    const admin = createAdminClient()

    const { data: bestand, error: bestandError } = await admin
      .from('angels')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    if (bestandError) {
      return { ok: false, error: bestandError.message }
    }

    // Nur bei der Erstanlage: alles, was der Engel nicht selbst bestimmt.
    const erstanlage = {
      hourly_rate: ENGEL_HOURLY_RATE,
      qualification: data.qualification || null,
      is_certified: (data.qualification || '').includes('45b') || (data.qualification || '').includes('53b'),
      is_45b_capable: (data.qualification || '').includes('45b'),
      total_jobs: 0,
      rating: 5.0,
      satisfaction_pct: 100,
      bio: null,
    }

    // Bei jedem Aufruf: die Felder, die der Engel ohnehin selbst pflegen
    // darf (dieselben vier wie im Spalten-GRANT aus Track 9).
    const selbstgepflegt = {
      services: data.services,
      availability: data.availability,
      is_online: true,
    }

    const { error: angelError } = bestand
      ? await admin.from('angels').update(selbstgepflegt).eq('id', userId)
      : await admin.from('angels').insert({ id: userId, ...erstanlage, ...selbstgepflegt })

    if (angelError) {
      return { ok: false, error: angelError.message }
    }

    // --- 2. Update profile with personal data ---
    const profileUpdate: Record<string, any> = {}
    if (data.firstName) profileUpdate.first_name = data.firstName
    if (data.lastName) profileUpdate.last_name = data.lastName
    if (data.email) profileUpdate.email = data.email
    if (data.phone) profileUpdate.phone = data.phone
    if (data.plz || data.stadt) {
      profileUpdate.location = [data.plz, data.stadt].filter(Boolean).join(' ')
      if (data.plz && data.plz.length === 5) {
        profileUpdate.postal_code = data.plz
        const coords = await geocodePLZ(data.plz)
        if (coords) {
          profileUpdate.latitude = coords.lat
          profileUpdate.longitude = coords.lng
        }
      }
    }
    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', userId)

      if (profileError) {
        return { ok: false, error: profileError.message }
      }
    }

    // --- 3. Audit log (fail-soft) ---
    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'angel',
      entityId: userId,
      details: {
        services: data.services,
        availability: data.availability,
        qualification: data.qualification || null,
      },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Registrierung fehlgeschlagen.' }
  }
}
