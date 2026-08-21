// ═══════════════════════════════════════════════════════════
// KUNDEN-LEBENSZYKLUS — Status + Pipeline-Status
// ═══════════════════════════════════════════════════════════
// FACHLICH GETRENNT VON DER DSGVO-LÖSCHUNG: hier geht es nur darum, ob
// ein Klient betreut wird. Löschen tut ausschließlich app/api/user/delete.
//
// `status` steuert die Einsatzplanung (lib/personal/einsatzfreigabe.ts:
// nur 'aktiv'/'active'/'neu' sind freigegeben), `pipeline_status` bildet
// den Vertriebs-/Betreuungsverlauf ab (app/mis/crm).
// ═══════════════════════════════════════════════════════════

/** Statuswerte, die die Oberfläche kennt (lib/admin/ops.ts CLIENT_STATUS). */
export const CLIENT_STATUS_WERTE = ['active', 'new', 'paused', 'inactive', 'archived'] as const
export type ClientStatusWert = (typeof CLIENT_STATUS_WERTE)[number]

/** Pipeline-Stufen (app/mis/crm/page.tsx PIPELINE_STATUS). */
export const PIPELINE_STATUS_WERTE = ['lead', 'erstgespraech', 'active', 'paused', 'ended'] as const
export type PipelineStatusWert = (typeof PIPELINE_STATUS_WERTE)[number]

/**
 * Statuswerte, die über diese Route gesetzt werden dürfen.
 *
 * 'new' fehlt bewusst: „Neu" ist ein Anlagezustand, kein Ziel eines
 * bewussten Statuswechsels — ein beendeter Klient wird nicht wieder „neu".
 */
export const SETZBARE_STATUS = ['active', 'paused', 'inactive', 'archived'] as const

/**
 * Pipeline-Stufe, die fachlich zu einem Status gehört, wenn der Aufrufer
 * keine eigene angibt. Ohne das bliebe `pipeline_status` für immer auf
 * 'erstgespraech' stehen (Befund Bereich 1 der Lückenanalyse).
 */
export const PIPELINE_ZU_STATUS: Record<string, PipelineStatusWert> = {
  active: 'active',
  paused: 'paused',
  inactive: 'ended',
  archived: 'ended',
}

export interface StatuswechselPruefung {
  fehler: string | null
  status: ClientStatusWert | null
  pipelineStatus: PipelineStatusWert | null
}

/**
 * Prüft und normalisiert einen Statuswechsel-Request.
 *
 * Fail-closed: unbekannte Werte werden abgewiesen, statt sie an den
 * DB-CHECK durchzureichen (der meldet nur eine rohe Postgres-Fehlermeldung).
 */
export function pruefeStatuswechsel(body: Record<string, unknown>): StatuswechselPruefung {
  const roh = typeof body.status === 'string' ? body.status.trim() : ''
  if (!roh) {
    return { fehler: 'status ist erforderlich.', status: null, pipelineStatus: null }
  }
  if (!(SETZBARE_STATUS as readonly string[]).includes(roh)) {
    return {
      fehler: `Ungültiger Status "${roh}". Erlaubt: ${SETZBARE_STATUS.join(', ')}.`,
      status: null,
      pipelineStatus: null,
    }
  }
  const status = roh as ClientStatusWert

  let pipelineStatus: PipelineStatusWert | null = PIPELINE_ZU_STATUS[status] ?? null

  if (body.pipeline_status !== undefined && body.pipeline_status !== null && body.pipeline_status !== '') {
    const ps = String(body.pipeline_status).trim()
    if (!(PIPELINE_STATUS_WERTE as readonly string[]).includes(ps)) {
      return {
        fehler: `Ungültiger pipeline_status "${ps}". Erlaubt: ${PIPELINE_STATUS_WERTE.join(', ')}.`,
        status: null,
        pipelineStatus: null,
      }
    }
    pipelineStatus = ps as PipelineStatusWert
  }

  return { fehler: null, status, pipelineStatus }
}

/**
 * Sperrt dieser Status neue Einsätze?
 *
 * Exakter Spiegel von lib/personal/einsatzfreigabe.ts::pruefeClientFreigabe().
 * ACHTUNG, bewusst so: die Freigabe kennt 'neu' (deutsch), die Anlage schreibt
 * aber 'new' (englisch, POST /api/admin/clients). Ein frisch angelegter Klient
 * ist deshalb heute für die Einsatzplanung gesperrt. Diese Funktion bildet den
 * IST-Zustand ab und beschönigt ihn nicht — sonst würde die Oberfläche eine
 * Freigabe behaupten, die es nicht gibt.
 */
export function sperrtEinsaetze(status: string | null | undefined): boolean {
  if (!status) return false
  return !['aktiv', 'active', 'neu'].includes(status)
}
