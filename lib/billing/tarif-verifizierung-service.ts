/**
 * Server-Seite des Freigabeprozesses — geteilt von beiden Preistabellen.
 *
 * billing_tariffs (Rechnungstarife) und leistungspreise (Vorschau-/Monats-
 * abschlusspreise) haben denselben Freigabeprozess, aber unterschiedliche
 * Spalten. Diese Datei ist die einzige Stelle, an der der Prozess steht —
 * sonst driften die beiden Routen auseinander und eine Tabelle bekommt
 * irgendwann eine schwaechere Pruefung als die andere.
 */

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin, type OpsAuthContext } from '@/lib/ops/api-auth'
import { safeDbError } from '@/lib/utils/api-error'
import {
  pruefeStatusaenderung,
  bewerteAbrechenbarkeit,
  type QuellTabelle,
} from '@/lib/billing/core/tarif-verifizierung'
import { ladeBelege, signiereBeleg, istMigrationFehlt, MIGRATION_FEHLT_TEXT } from '@/lib/billing/core/tarif-belege'
import { logger } from '@/lib/logger'
const log = logger.child('billing')

export interface TabellenProfil {
  tabelle: QuellTabelle
  /** Spalte, ueber die die Historie in billing_tariff_audit haengt. */
  audit_spalte: 'tariff_id' | 'leistungspreis_id'
  /** leistungspreise hat kein deleted_at und keine rechtsgrundlage. */
  hat_soft_delete: boolean
  hat_rechtsgrundlage: boolean
  bezeichnung: string
}

export const PROFIL: Record<QuellTabelle, TabellenProfil> = {
  billing_tariffs: {
    tabelle: 'billing_tariffs',
    audit_spalte: 'tariff_id',
    hat_soft_delete: true,
    hat_rechtsgrundlage: true,
    bezeichnung: 'Tarif',
  },
  leistungspreise: {
    tabelle: 'leistungspreise',
    audit_spalte: 'leistungspreis_id',
    hat_soft_delete: false,
    hat_rechtsgrundlage: false,
    bezeichnung: 'Leistungspreis',
  },
}

interface Zeile {
  id: string
  organization_id: string | null
  leistungsart: string
  rechtsgrundlage?: string | null
  tarif_status: string | null
  preis_cent: number
  beleg_id?: string | null
  deleted_at?: string | null
}

/**
 * Laedt die Zeile mit explizitem Org-Fence.
 *
 * Der Admin-Client umgeht RLS, deshalb steht die Mandantentrennung hier im
 * Filter. leistungspreise-Altbestand kann organization_id NULL haben (vor
 * Phase 3 Multi-Mandant); solche Zeilen sind fuer jeden Mandanten sichtbar,
 * weil sie keinem zugeordnet sind — genau so liest sie auch der
 * Monatsabschluss und lib/go-live/status.ts.
 */
async function ladeZeile(
  admin: SupabaseClient,
  profil: TabellenProfil,
  id: string,
  organizationId: string
): Promise<{ ok: true; zeile: Zeile } | { ok: false; response: NextResponse }> {
  const spalten = [
    'id',
    'organization_id',
    'leistungsart',
    'tarif_status',
    'preis_cent',
    'beleg_id',
    profil.hat_rechtsgrundlage ? 'rechtsgrundlage' : null,
    profil.hat_soft_delete ? 'deleted_at' : null,
  ]
    .filter(Boolean)
    .join(', ')

  let query = admin.from(profil.tabelle).select(spalten).eq('id', id)
  query = profil.hat_soft_delete
    ? query.eq('organization_id', organizationId)
    : query.or(`organization_id.eq.${organizationId},organization_id.is.null`)

  const { data, error } = await query.maybeSingle()

  if (error && istMigrationFehlt(error.message)) {
    return { ok: false, response: NextResponse.json({ error: MIGRATION_FEHLT_TEXT }, { status: 503 }) }
  }
  if (error || !data) {
    return {
      ok: false,
      response: NextResponse.json({ error: `${profil.bezeichnung} nicht gefunden.` }, { status: 404 }),
    }
  }

  const zeile = data as unknown as Zeile
  if (profil.hat_soft_delete && zeile.deleted_at) {
    return {
      ok: false,
      response: NextResponse.json({ error: `${profil.bezeichnung} ist gelöscht.` }, { status: 400 }),
    }
  }

  return { ok: true, zeile }
}

// ---------------------------------------------------------------------------
// PATCH — Statusaenderung
// ---------------------------------------------------------------------------

/**
 * Der EINZIGE zulaessige Anwendungs-Weg, tarif_status zu aendern.
 *
 * Durchgesetzt wird die Regel zusaetzlich vom DB-Trigger
 * trg_verifizierung_belegpflicht (20260904000000) — der greift auch dann,
 * wenn jemand diese Route umgeht und direkt per PostgREST schreibt.
 *
 * Body: { status: 'verified'|'unverified'|'blocked', quelle: string, belegId?: string }
 */
export async function handleVerifizierungPatch(
  request: Request,
  quellTabelle: QuellTabelle,
  id: string
): Promise<NextResponse> {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const ctx: OpsAuthContext = auth.ctx
  const profil = PROFIL[quellTabelle]

  try {
    const body = await request.json().catch(() => null)
    const admin = createAdminClient()

    const geladen = await ladeZeile(admin, profil, id, ctx.organizationId)
    if (!geladen.ok) return geladen.response
    const zeile = geladen.zeile

    const pruefung = pruefeStatusaenderung({
      zielStatus: body?.status,
      quelle: body?.quelle,
      belegId: body?.belegId,
      quellTabelle,
      rechtsgrundlage: zeile.rechtsgrundlage ?? null,
    })
    if (!pruefung.ok) {
      return NextResponse.json({ error: pruefung.fehler }, { status: 400 })
    }

    // Der Beleg muss zu genau dieser Zeile gehoeren. Der DB-Trigger prueft das
    // ebenfalls; hier steht es, damit der Admin einen lesbaren Satz bekommt
    // statt einer Trigger-Exception.
    if (pruefung.belegId) {
      const belegSpalte = quellTabelle === 'billing_tariffs' ? 'tariff_id' : 'leistungspreis_id'
      const { data: beleg, error: belegFehler } = await admin
        .from('billing_tarif_belege')
        .select('id, organization_id, quell_tabelle, tariff_id, leistungspreis_id')
        .eq('id', pruefung.belegId)
        .eq('quell_tabelle', quellTabelle)
        .eq(belegSpalte, id)
        .maybeSingle()

      if (belegFehler && istMigrationFehlt(belegFehler.message)) {
        return NextResponse.json({ error: MIGRATION_FEHLT_TEXT }, { status: 503 })
      }
      if (!beleg) {
        return NextResponse.json(
          { error: `Der ausgewählte Beleg gehört nicht zu diesem ${profil.bezeichnung}.` },
          { status: 400 }
        )
      }
      if (beleg.organization_id !== ctx.organizationId) {
        return NextResponse.json(
          { error: 'Der ausgewählte Beleg gehört zu einer anderen Organisation.' },
          { status: 403 }
        )
      }
    }

    const aenderung: Record<string, unknown> = {
      tarif_status: pruefung.zielStatus,
      verifiziert_am: new Date().toISOString(),
      verifiziert_von: `${ctx.name} (${ctx.userId})`,
      verifizierungs_quelle: pruefung.quelle || null,
      // Wird die Freigabe zurueckgenommen oder gesperrt, faellt auch die
      // Belegzuordnung weg: sonst sieht ein gesperrter Tarif so aus, als
      // trage ihn noch ein gueltiger Nachweis.
      beleg_id: pruefung.zielStatus === 'verified' ? pruefung.belegId : null,
    }

    let update = admin.from(profil.tabelle).update(aenderung).eq('id', id)
    update = profil.hat_soft_delete
      ? update.eq('organization_id', ctx.organizationId)
      : update.or(`organization_id.eq.${ctx.organizationId},organization_id.is.null`)

    const { data: aktualisiert, error } = await update.select().single()

    if (error) {
      log.errorWithException('Tarif-Verifizierung fehlgeschlagen', error)
      if (istMigrationFehlt(error.message)) {
        return NextResponse.json({ error: MIGRATION_FEHLT_TEXT }, { status: 503 })
      }
      // Die Belegpflicht des DB-Triggers meldet sich mit einem verstaendlichen
      // Satz ("Freigabe abgelehnt: …") — der soll den Admin auch erreichen.
      if (error.message?.startsWith('Freigabe abgelehnt')) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      return safeDbError(error, 500, 'Verifizierung konnte nicht gespeichert werden.')
    }

    return NextResponse.json({
      zeile: aktualisiert,
      quellTabelle,
      vorherigerStatus: zeile.tarif_status,
      abrechenbar: bewerteAbrechenbarkeit({
        quellTabelle,
        tarifStatus: pruefung.zielStatus,
        rechtsgrundlage: zeile.rechtsgrundlage ?? null,
      }),
    })
  } catch (err) {
    log.errorWithException('Unerwarteter Fehler bei der Tarif-Verifizierung', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// GET — Historie + Belege einer Zeile
// ---------------------------------------------------------------------------

export interface HistorieEintrag {
  id: string
  aktion: string
  alter_status: string | null
  neuer_status: string | null
  alter_betrag_cent: number | null
  neuer_betrag_cent: number | null
  benutzer: string | null
  quelle: string | null
  beleg_id: string | null
  created_at: string
}

export async function handleDetailGet(
  quellTabelle: QuellTabelle,
  id: string
): Promise<NextResponse> {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const profil = PROFIL[quellTabelle]

  try {
    const admin = createAdminClient()

    const geladen = await ladeZeile(admin, profil, id, auth.ctx.organizationId)
    if (!geladen.ok) return geladen.response

    const { data: historieRows, error: historieFehler } = await admin
      .from('billing_tariff_audit')
      .select('id, aktion, alter_status, neuer_status, alter_betrag_cent, neuer_betrag_cent, benutzer, quelle, beleg_id, created_at')
      .eq(profil.audit_spalte, id)
      .order('created_at', { ascending: false })
      .limit(100)

    // Fehlt die Migration, ist beleg_id in der Audit-Tabelle unbekannt. Die
    // Historie ohne Beleg-Bezug ist immer noch wertvoll — lieber die
    // reduzierte Ansicht als gar keine.
    let historie: HistorieEintrag[] = (historieRows ?? []) as HistorieEintrag[]
    if (historieFehler) {
      const { data: fallback } = await admin
        .from('billing_tariff_audit')
        .select('id, aktion, alter_status, neuer_status, alter_betrag_cent, neuer_betrag_cent, benutzer, quelle, created_at')
        .eq('tariff_id', id)
        .order('created_at', { ascending: false })
        .limit(100)
      historie = ((fallback ?? []) as Omit<HistorieEintrag, 'beleg_id'>[]).map(e => ({ ...e, beleg_id: null }))
    }

    let belege: Array<Record<string, unknown>> = []
    let belegHinweis: string | null = null
    try {
      const rows = await ladeBelege(admin, {
        organizationId: auth.ctx.organizationId,
        quellTabelle,
        zeilenId: id,
      })
      belege = await Promise.all(
        rows.map(async b => ({
          id: b.id,
          dateiname: b.dateiname,
          mime_type: b.mime_type,
          groesse_bytes: b.groesse_bytes,
          sha256: b.sha256,
          quelle: b.quelle,
          hochgeladen_von: b.hochgeladen_von,
          hochgeladen_am: b.hochgeladen_am,
          url: await signiereBeleg(admin, b),
        }))
      )
    } catch (e) {
      belegHinweis = (e as Error).message
    }

    return NextResponse.json({ quellTabelle, zeile: geladen.zeile, historie, belege, belegHinweis })
  } catch (err) {
    log.errorWithException('Tarif-Detail laden fehlgeschlagen', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
