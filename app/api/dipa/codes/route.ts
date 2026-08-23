// ═══════════════════════════════════════════════════════════════
// Betriebs-Seite: Freischaltcodes verwalten (15a, Schritt 2)
//
// Der Klartext-Code wird GENAU EINMAL zurückgegeben — beim Anlegen.
// Danach existiert nur noch der Hash. Wer den Code verliert, muss einen
// neuen ausstellen; das ist beabsichtigt.
//
// Diese Route sieht keine Gesundheitsdaten: coach_freischaltcodes hat
// keinen Bezug auf coach_users, die Einlösung steht nur als Pseudonym
// darin (DiPAV-Trennungsgebot).
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { createClient } from '@/lib/supabase/server'
import { heuteBerlin } from '@/lib/utils/timezone'
import {
  codePraefix, erzeugeCode, hashCode, pepperKonfiguriert,
  FREISCHALT_QUELLEN, type FreischaltQuelle,
} from '@/lib/coach/freischaltung'

export async function GET() {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('coach_freischaltcodes')
    .select('id, code_praefix, quelle, kostentraeger_ik, genehmigt_am, gueltig_von, gueltig_bis, status, abrechnungsweg_key, eingeloest_am, notiz, created_at')
    .eq('organization_id', auth.ctx.organizationId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: 'Codes konnten nicht geladen werden.' }, { status: 500 })
  return NextResponse.json({ codes: data ?? [], pepperKonfiguriert: pepperKonfiguriert() })
}

/** Neuen Code ausstellen. Antwort enthält den Klartext-Code einmalig. */
export async function POST(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  const quelle: FreischaltQuelle = FREISCHALT_QUELLEN.includes(body.quelle) ? body.quelle : 'pflegekasse'

  const datumOderNull = (wert: unknown) =>
    typeof wert === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(wert) ? wert : null

  const gueltigVon = datumOderNull(body.gueltig_von) ?? heuteBerlin()
  const gueltigBis = datumOderNull(body.gueltig_bis)
  if (gueltigBis && gueltigBis < gueltigVon) {
    return NextResponse.json({ error: 'Das Enddatum liegt vor dem Startdatum.' }, { status: 400 })
  }

  const code = erzeugeCode()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('coach_freischaltcodes')
    .insert({
      organization_id: auth.ctx.organizationId,
      code_hash: hashCode(code),
      code_praefix: codePraefix(code),
      quelle,
      kostentraeger_ik: typeof body.kostentraeger_ik === 'string' ? body.kostentraeger_ik.slice(0, 20) : null,
      genehmigt_am: datumOderNull(body.genehmigt_am),
      gueltig_von: gueltigVon,
      gueltig_bis: gueltigBis,
      abrechnungsweg_key: typeof body.abrechnungsweg_key === 'string' ? body.abrechnungsweg_key.slice(0, 60) : null,
      notiz: typeof body.notiz === 'string' ? body.notiz.slice(0, 500) : null,
      erstellt_von: auth.ctx.userId,
    })
    .select('id, code_praefix, quelle, gueltig_von, gueltig_bis, status, created_at')
    .single()

  if (error) return NextResponse.json({ error: 'Code konnte nicht angelegt werden.' }, { status: 400 })

  return NextResponse.json({
    code: data,
    klartext: code,
    hinweis: 'Notieren Sie den Code jetzt — er wird nicht gespeichert und kann später nicht erneut angezeigt werden.',
    pepperKonfiguriert: pepperKonfiguriert(),
  })
}
