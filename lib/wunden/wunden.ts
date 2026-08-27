// ═══════════════════════════════════════════════════════════════
// Wund-Stammdaten — wounds
// Kein Hard-Delete: Wunden werden über status='abgeheilt' geschlossen.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { heuteBerlin } from '@/lib/utils/timezone'
import { UserFacingError } from '@/lib/api/user-facing-error'
import {
  assertDatumNichtInZukunft,
  assertErlaubt,
  KOERPERSEITE_WERTE,
  WUND_STATUS_WERTE,
  WUND_TYP_WERTE,
  type Koerperseite,
  type Wound,
  type WoundMitKunde,
  type WundStatus,
  type WundTyp,
} from './types'

function assertDekubitusGrad(wundTyp: WundTyp | undefined, grad: number | null | undefined): void {
  if (grad === null || grad === undefined) return
  if (wundTyp !== 'dekubitus') throw new UserFacingError('Dekubitus-Grad ist nur bei Wundtyp "dekubitus" erlaubt.')
  if (!Number.isInteger(grad) || grad < 1 || grad > 4) throw new UserFacingError('Dekubitus-Grad muss zwischen I (1) und IV (4) liegen.')
}

export interface CreateWoundParams {
  organizationId: string
  clientId: string
  wundTyp: WundTyp
  dekubitusGrad?: number | null
  lokalisation: string
  koerperstelleCode?: string | null
  koerperseite?: Koerperseite | null
  entstandenAm?: string | null
  bemerkung?: string | null
  erstelltVon: string
}

export async function createWound(supabase: SupabaseClient, params: CreateWoundParams): Promise<Wound> {
  if (!params.lokalisation?.trim()) throw new UserFacingError('Lokalisation ist ein Pflichtfeld.')
  assertErlaubt(params.wundTyp, WUND_TYP_WERTE, 'wund_typ')
  assertErlaubt(params.koerperseite ?? null, KOERPERSEITE_WERTE, 'koerperseite')
  assertDekubitusGrad(params.wundTyp, params.dekubitusGrad)
  assertDatumNichtInZukunft(params.entstandenAm, 'Entstehungsdatum')

  const { data, error } = await supabase
    .from('wounds')
    .insert({
      organization_id: params.organizationId,
      client_id: params.clientId,
      wund_typ: params.wundTyp,
      dekubitus_grad: params.dekubitusGrad ?? null,
      lokalisation: params.lokalisation.trim(),
      koerperstelle_code: params.koerperstelleCode ?? null,
      koerperseite: params.koerperseite ?? null,
      entstanden_am: params.entstandenAm ?? null,
      bemerkung: params.bemerkung ?? null,
      erstellt_von: params.erstelltVon,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Wunde konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as Wound
}

export interface ListWoundsFilter {
  organizationId: string
  clientId?: string
  wundTyp?: WundTyp
  status?: WundStatus
  nurOffene?: boolean
}

export async function listWounds(supabase: SupabaseClient, filter: ListWoundsFilter): Promise<WoundMitKunde[]> {
  let query = supabase
    .from('wounds')
    .select('*, clients(first_name, last_name)')
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })

  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.wundTyp) query = query.eq('wund_typ', filter.wundTyp)
  if (filter.status) query = query.eq('status', filter.status)
  if (filter.nurOffene) query = query.neq('status', 'abgeheilt')

  const { data, error } = await query
  if (error) throw new Error(`Wunden konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as WoundMitKunde[]
}

export async function getWound(supabase: SupabaseClient, id: string, organizationId: string): Promise<WoundMitKunde | null> {
  const { data, error } = await supabase
    .from('wounds')
    .select('*, clients(first_name, last_name)')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`Wunde konnte nicht geladen werden: ${error.message}`)
  return data as WoundMitKunde | null
}

export interface UpdateWoundParams {
  wundTyp?: WundTyp
  dekubitusGrad?: number | null
  lokalisation?: string
  koerperstelleCode?: string | null
  koerperseite?: Koerperseite | null
  entstandenAm?: string | null
  status?: WundStatus
  abgeheiltAm?: string | null
  bemerkung?: string | null
}

export async function updateWound(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateWoundParams
): Promise<Wound> {
  assertErlaubt(patch.wundTyp, WUND_TYP_WERTE, 'wund_typ')
  assertErlaubt(patch.status, WUND_STATUS_WERTE, 'status')
  assertErlaubt(patch.koerperseite ?? null, KOERPERSEITE_WERTE, 'koerperseite')
  assertDatumNichtInZukunft(patch.entstandenAm, 'Entstehungsdatum')
  assertDatumNichtInZukunft(patch.abgeheiltAm, 'Abheilungsdatum')
  if (patch.lokalisation !== undefined && !patch.lokalisation.trim()) {
    throw new UserFacingError('Lokalisation darf nicht leer sein.')
  }

  // Dekubitus-Grad-Konsistenz gilt auch bei Teil-Updates: ohne mitgesendeten
  // wundTyp muss der BESTEHENDE Typ geprüft werden, sonst rutscht z.B. ein
  // Grad bei einer Nicht-Dekubitus-Wunde nur über den kryptischen
  // DB-Constraint-Fehler durch statt über eine verständliche Meldung.
  if (patch.dekubitusGrad !== undefined) {
    let effektiverTyp = patch.wundTyp
    if (effektiverTyp === undefined) {
      const { data: bestehend, error: ladeError } = await supabase
        .from('wounds')
        .select('wund_typ')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (ladeError) throw new Error(`Wunde konnte nicht geladen werden: ${ladeError.message}`)
      if (!bestehend) throw new UserFacingError('Wunde nicht gefunden.', 404)
      effektiverTyp = (bestehend as { wund_typ: WundTyp }).wund_typ
    }
    assertDekubitusGrad(effektiverTyp, patch.dekubitusGrad)
  }

  const update: Record<string, unknown> = {}
  if (patch.wundTyp !== undefined) update.wund_typ = patch.wundTyp
  if (patch.dekubitusGrad !== undefined) update.dekubitus_grad = patch.dekubitusGrad
  if (patch.lokalisation !== undefined) update.lokalisation = patch.lokalisation.trim()
  if (patch.koerperstelleCode !== undefined) update.koerperstelle_code = patch.koerperstelleCode
  if (patch.koerperseite !== undefined) update.koerperseite = patch.koerperseite
  if (patch.entstandenAm !== undefined) update.entstanden_am = patch.entstandenAm
  if (patch.bemerkung !== undefined) update.bemerkung = patch.bemerkung

  // Status und Abheilungsdatum konsistent halten (DB-Constraint erzwingt beides).
  if (patch.status !== undefined) {
    update.status = patch.status
    if (patch.status === 'abgeheilt') {
      update.abgeheilt_am = patch.abgeheiltAm ?? heuteBerlin()
    } else {
      update.abgeheilt_am = null
    }
  } else if (patch.abgeheiltAm !== undefined) {
    throw new UserFacingError('abgeheilt_am kann nur zusammen mit status="abgeheilt" gesetzt werden.')
  }

  if (Object.keys(update).length === 0) throw new UserFacingError('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('wounds')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Wunde konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as Wound
}

/** Kennzahlen für die Kachelzeile der Wundübersicht. */
export function zusammenfassungWunden(wunden: Pick<Wound, 'status' | 'wund_typ'>[]): {
  gesamt: number
  offen: number
  in_abheilung: number
  verschlechtert: number
  dekubitus: number
} {
  return {
    gesamt: wunden.length,
    offen: wunden.filter(w => w.status !== 'abgeheilt').length,
    in_abheilung: wunden.filter(w => w.status === 'in_abheilung').length,
    verschlechtert: wunden.filter(w => w.status === 'verschlechtert').length,
    dekubitus: wunden.filter(w => w.wund_typ === 'dekubitus' && w.status !== 'abgeheilt').length,
  }
}
