// ═══════════════════════════════════════════════════════════════
// Produktbezogene Löschung der PflegeCoach-Daten (15b, Löschkonzept)
//
// Schließt GAP-LOESCHUNG: Bisher lief die Löschung nur über den
// allgemeinen Konto-Löschflow der Plattform. Hier kann der Nutzer
// ausschließlich seine DiPA-Daten löschen und sein Alltagsengel-Konto
// behalten — das ist die Konsequenz der Produkttrennung.
//
// WAS GELÖSCHT WIRD: coach_users und alles, was per ON DELETE CASCADE
// daran hängt (Consents, Assessments, Ziele, Aktivitäten, Erledigungen,
// Messungen, Berichte, Freigaben, Freischaltungen, Anspruchsprüfungen)
// sowie die eigenen pseudonymisierten Nutzungsereignisse.
//
// WAS BLEIBT (und warum): der Eintrag im Audit-Log (coach_audit_log,
// Metadaten ohne Werte, Nachweis der Löschung selbst) und der ausgegebene
// Freischaltcode auf der Betriebs-Seite (Abrechnungsnachweis, kein
// Personenbezug — nur ein nicht auflösbares Pseudonym). Begründung und
// Fristen: audit/dipa/loeschkonzept.md.
//
// Vor der Löschung sollte der Nutzer exportieren (/api/coach/export) —
// die Oberfläche weist darauf hin und verlangt eine ausdrückliche
// Bestätigung.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'

const BESTAETIGUNG = 'LOESCHEN'

/** Vorschau: was würde gelöscht? */
export async function GET() {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const zaehle = async (tabelle: string) => {
    const { count } = await auth.supabase
      .from(tabelle)
      .select('id', { count: 'exact', head: true })
      .eq('coach_user_id', auth.coachUser.id)
    return count ?? 0
  }

  const [consents, assessments, ziele, aktivitaeten, erledigungen, messungen, berichte, freigaben] =
    await Promise.all([
      zaehle('coach_consents'),
      zaehle('coach_assessments'),
      zaehle('coach_goals'),
      zaehle('coach_activities'),
      zaehle('coach_activity_log'),
      zaehle('coach_measurements'),
      zaehle('coach_reports'),
      auth.supabase
        .from('coach_shares')
        .select('id', { count: 'exact', head: true })
        .eq('owner_coach_user_id', auth.coachUser.id)
        .then(r => r.count ?? 0),
    ])

  const { count: ereignisse } = await auth.supabase
    .from('coach_nutzungsereignisse')
    .select('id', { count: 'exact', head: true })

  return NextResponse.json({
    umfang: {
      einwilligungen: consents,
      assessments,
      ziele,
      aktivitaeten,
      erledigungen,
      messungen,
      berichte,
      freigaben,
      nutzungsereignisse: ereignisse ?? 0,
    },
    bestaetigungswort: BESTAETIGUNG,
  })
}

/**
 * Löscht alle PflegeCoach-Daten des Nutzers.
 * Das Alltagsengel-Konto bleibt bestehen.
 */
export async function DELETE(request: Request) {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  if (body.bestaetigung !== BESTAETIGUNG) {
    return NextResponse.json(
      { error: `Bitte bestätigen Sie die Löschung mit dem Wort ${BESTAETIGUNG}.` },
      { status: 400 }
    )
  }

  // Zuerst die pseudonymen Nachweisdaten: sie hängen nicht an coach_users
  // und würden sonst als Waise zurückbleiben.
  const { data: pseudonym } = await auth.supabase.rpc('coach_mein_pseudonym')
  if (pseudonym) {
    const { error } = await auth.supabase
      .from('coach_nutzungsereignisse')
      .delete()
      .eq('pseudonym', pseudonym)
    if (error) {
      return NextResponse.json({ error: 'Die Nutzungsdaten konnten nicht gelöscht werden.' }, { status: 500 })
    }
  }

  const { error } = await auth.supabase
    .from('coach_users')
    .delete()
    .eq('id', auth.coachUser.id)

  if (error) {
    return NextResponse.json({ error: 'Die Daten konnten nicht gelöscht werden.' }, { status: 500 })
  }

  return NextResponse.json({ geloescht: true })
}
