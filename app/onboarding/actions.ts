'use server'

// ═══════════════════════════════════════════════════════════════════════
// Server Action fuer den Onboarding-Abschluss (components/OnboardingFlow)
//
// Master-Audit 2026-08-19, B-3 / I-7:
// OnboardingFlow.tsx schrieb `pflegegrad` direkt aus dem Browser nach
// `care_recipients` — an zwei Dingen vorbei:
//   1. der `care_level`-Fuehrung: `pflegegradVon()` liest zuerst
//      `clients.care_level`. Wurde nur `care_recipients.pflegegrad`
//      gesetzt, sah jede Auswertung (u. a. die Kassenabrechnung)
//      weiterhin "kein Pflegegrad" — siehe lib/clients/pflegegrad.ts.
//   2. jeder Protokollierung: eine Pflegegrad-Aenderung entstand ohne
//      Audit-Eintrag.
//
// Diese Action ersetzt den Direktschreibpfad:
//   * Identitaet kommt aus der Session, nicht aus dem Formular
//   * Pflegegrad und PLZ werden serverseitig validiert
//   * `clients.care_level` wird mitgezogen (Fuehrungsspalte)
//   * der Abschluss erzeugt einen Audit-Eintrag
// ═══════════════════════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'

export interface OnboardingEingabe {
  /** Pflegegrad 1–5, oder leer/undefined wenn der Nutzer keinen angibt. */
  pflegegrad?: string | number | null
  /** Deutsche PLZ, 5 Ziffern. Leer = nicht aendern. */
  plz?: string | null
}

function parsePflegegrad(roh: unknown): number | null {
  if (roh === null || roh === undefined || roh === '') return null
  const n = Number(roh)
  if (!Number.isInteger(n) || n < 1 || n > 5) return null
  return n
}

function parsePlz(roh: unknown): string | null {
  const s = String(roh ?? '').trim()
  return /^\d{5}$/.test(s) ? s : null
}

export async function completeOnboardingAction(
  eingabe: OnboardingEingabe
): Promise<{ ok: true; pflegegrad: number | null } | { ok: false; error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { ok: false, error: 'Nicht autorisiert.' }

    // Ungueltige Eingaben werden verworfen, nicht gespeichert. Ein
    // abgelehnter Pflegegrad darf den Onboarding-Abschluss nicht blockieren
    // — der Nutzer kann ihn spaeter im Profil nachtragen.
    const pflegegrad = parsePflegegrad(eingabe?.pflegegrad)
    const plz = parsePlz(eingabe?.plz)

    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single()

    const updates: Record<string, unknown> = { onboarding_completed: true }
    if (plz) updates.postal_code = plz

    const { error: profilFehler } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)

    if (profilFehler) {
      return { ok: false, error: profilFehler.message }
    }

    if (pflegegrad !== null) {
      // (a) care_recipients — Pflegebeduerftiger aus Kundensicht
      const { data: existing } = await supabase
        .from('care_recipients')
        .select('id')
        .eq('profile_id', user.id)
        .limit(1)
        .maybeSingle()

      if (existing) {
        const { error } = await supabase
          .from('care_recipients')
          .update({ pflegegrad })
          .eq('id', existing.id)
        if (error) return { ok: false, error: error.message }
      } else {
        const { error } = await supabase.from('care_recipients').insert({
          profile_id: user.id,
          first_name: profile?.first_name || '',
          last_name: profile?.last_name || '',
          pflegegrad,
          relationship: 'selbst',
        })
        if (error) return { ok: false, error: error.message }
      }

      // (b) clients.care_level — Fuehrungsspalte fuer alle Auswertungen.
      // Existiert (noch) kein Klienten-Datensatz zu diesem Profil, wird
      // hier bewusst KEINER angelegt: die Klientenanlage ist ein
      // Buero-Vorgang mit Kundennummer und Stammdatenpflicht.
      const { data: klient } = await supabase
        .from('clients')
        .select('id, care_level')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      if (klient && klient.care_level !== pflegegrad) {
        const { error } = await supabase
          .from('clients')
          .update({ care_level: pflegegrad })
          .eq('id', klient.id)
        // Fehlschlag ist hier nicht fatal (RLS kann dem Kunden das
        // Schreiben auf clients verwehren) — aber er darf nicht
        // unbemerkt bleiben, sonst driften die beiden Spalten wieder.
        if (error) {
          console.error('[onboarding] clients.care_level-Sync fehlgeschlagen:', error.message)
        }
      }
    }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: user.id,
      actorRole: 'kunde',
      actorName: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Alltagsengel',
      entityType: 'profile',
      entityId: user.id,
      details: {
        aktion: 'onboarding_abgeschlossen',
        pflegegrad_gesetzt: pflegegrad,
        plz_gesetzt: plz !== null,
      },
    })

    return { ok: true, pflegegrad }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
