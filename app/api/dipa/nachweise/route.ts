// ═══════════════════════════════════════════════════════════════
// Betriebs-Seite: aggregierte Nutzungsnachweise für die Evaluation
//
// WARUM HIER service_role NÖTIG IST: coach_nutzungsereignisse hat
// bewusst KEINE Admin-Policy — ein Admin darf einzelne Ereignisse nicht
// lesen. Für die Evaluation werden sie im Systemkontext gelesen und
// SOFORT aggregiert; die Route gibt niemals Einzelzeilen oder Pseudonyme
// heraus.
//
// SCHUTZ KLEINER FALLZAHLEN: Unter MIN_GRUPPENGROESSE Teilnehmenden
// liefert werteNutzungAus() nur die Teilnehmerzahl und setzt
// `unterdrueckt` — sonst wäre eine Kennzahl faktisch ein Einzeldatensatz.
//
// KEINE WIRKSAMKEITSAUSSAGE: Das sind Nutzungskennzahlen. Die Bewertung
// erfolgt im Evaluationskonzept, nicht hier.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { werteNutzungAus, type NutzungsZeile } from '@/lib/coach/nachweise'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const istDatum = (wert: string | null) => Boolean(wert && /^\d{4}-\d{2}-\d{2}$/.test(wert))
  const von = istDatum(url.searchParams.get('von')) ? url.searchParams.get('von')! : null
  const bis = istDatum(url.searchParams.get('bis')) ? url.searchParams.get('bis')! : null

  const admin = createAdminClient()
  let query = admin
    .from('coach_nutzungsereignisse')
    .select('pseudonym, ereignis, modul_key, rolle, auswertungswoche, anzahl')
    .limit(50000)
  if (von) query = query.gte('auswertungswoche', von)
  if (bis) query = query.lte('auswertungswoche', bis)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: 'Nachweisdaten konnten nicht geladen werden.' }, { status: 500 })
  }

  const auswertung = werteNutzungAus((data ?? []) as NutzungsZeile[])
  return NextResponse.json({
    zeitraum: { von, bis },
    auswertung,
    hinweis:
      'Nutzungskennzahlen auf Basis pseudonymisierter Ereignisse. Keine Aussage über Wirksamkeit — Bewertung ausschließlich nach Evaluationskonzept.',
  })
}
