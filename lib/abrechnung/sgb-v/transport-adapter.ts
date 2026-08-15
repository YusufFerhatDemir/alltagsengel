/**
 * § 302 SGB V — Transport-Adapter (Warteschlange)
 *
 * Adapter-Pattern für die Übertragung des internen Prüf-Exports
 * (./export-generator.ts) — NICHT des amtlichen EDIFACT-Datensatzes, der an
 * ./generator.ts gesperrt bleibt.
 *
 *   MockAdapter        — simuliert einen Versand, verändert nichts extern.
 *                         Für Pipeline-Tests/Demo, ohne jede externe Wirkung.
 *   FileExportAdapter   — legt den Export für manuellen Abruf ab (Fallback:
 *                         Anhang per Post/E-Mail, solange kein automatischer
 *                         Kanal existiert).
 *   DakotaAdapter       — Platzhalter für den echten DAKOTA/SFTP-Transport
 *                         (lib/abrechnung/transport.ts). Wirft bewusst, bis
 *                         der amtliche Datensatz existiert UND
 *                         SGB_V_302_FREIGABE gesetzt ist.
 *   KimAdapter          — Platzhalter für KIM-Übertragung, analog gesperrt.
 *
 * Die Warteschlange (`sgb_v_uebertragungsqueue`) ist bewusst unabhängig vom
 * Gate SGB_V_302_FREIGABE: Mock/File-Export sind interne Werkzeuge und
 * behaupten nicht, eine amtliche Abrechnung zu sein — deshalb dürfen sie
 * schon heute laufen. Nur Dakota-/KIM-Adapter prüfen das Gate.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../../billing/core/audit'
import { pruefeFreigabe, ExternGesperrtError } from '../externe-freigaben'
import { pruefExportAlsJson, type PruefExport } from './export-generator'

export type AdapterTyp = 'mock' | 'file_export' | 'dakota' | 'kim'

export interface TransportResult {
  erfolg: boolean
  meldung: string
  zielReferenz: string | null
}

export interface TransportStatus {
  status: 'wartend' | 'in_bearbeitung' | 'erfolgreich' | 'fehlgeschlagen' | 'abgebrochen'
  meldung: string | null
}

export interface ITransportAdapter {
  readonly typ: AdapterTyp
  send(datensatz: PruefExport): Promise<TransportResult>
  checkStatus(zielReferenz: string): Promise<TransportStatus>
}

export class MockAdapter implements ITransportAdapter {
  readonly typ: AdapterTyp = 'mock'
  constructor(private readonly erzwingeFehler = false) {}

  async send(datensatz: PruefExport): Promise<TransportResult> {
    if (this.erzwingeFehler) {
      return { erfolg: false, meldung: 'Mock-Adapter: simulierter Fehlschlag.', zielReferenz: null }
    }
    return {
      erfolg: true,
      meldung: `Mock-Adapter: ${datensatz.anzahlFaelle} Fälle simuliert übertragen (kein amtlicher Versand).`,
      zielReferenz: `mock:${datensatz.laufId}`,
    }
  }

  async checkStatus(): Promise<TransportStatus> {
    return { status: 'erfolgreich', meldung: 'Mock-Adapter meldet immer sofortigen Erfolg.' }
  }
}

/** Legt den Prüf-Export als Datei-URL ab. `speichern` kapselt den tatsächlichen Storage-Zugriff. */
export class FileExportAdapter implements ITransportAdapter {
  readonly typ: AdapterTyp = 'file_export'
  constructor(
    private readonly speichern: (dateiname: string, inhalt: string) => Promise<string>,
  ) {}

  async send(datensatz: PruefExport): Promise<TransportResult> {
    const dateiname = `sgb-v-pruefexport_${datensatz.laufId}.json`
    const url = await this.speichern(dateiname, pruefExportAlsJson(datensatz))
    return {
      erfolg: true,
      meldung: `Prüf-Export abgelegt (kein amtlicher Datensatz) — manueller Abruf/Versand erforderlich.`,
      zielReferenz: url,
    }
  }

  async checkStatus(zielReferenz: string): Promise<TransportStatus> {
    return { status: 'erfolgreich', meldung: `Datei liegt unter ${zielReferenz} zum manuellen Abruf bereit.` }
  }
}

abstract class GesperrterAdapter implements ITransportAdapter {
  abstract readonly typ: AdapterTyp
  protected abstract readonly label: string

  async send(): Promise<TransportResult> {
    try {
      pruefeFreigabe('sgb_v_302_freigabe', `Transport-Adapter ${this.typ}`)
    } catch (err) {
      if (err instanceof ExternGesperrtError) {
        return { erfolg: false, meldung: err.message, zielReferenz: null }
      }
      throw err
    }
    // Gate offen heisst noch nicht "Datensatz existiert" — der amtliche
    // Generator ist die zweite, unabhängige Sperre (siehe generator.ts).
    return {
      erfolg: false,
      meldung: `${this.label}-Adapter ist nicht implementiert. Erst nach Vorliegen der Technischen Anlage 1 `
        + 'und Implementierung von generator.ts anschliessbar.',
      zielReferenz: null,
    }
  }

  async checkStatus(): Promise<TransportStatus> {
    return { status: 'abgebrochen', meldung: `${this.label}-Adapter ist nicht implementiert.` }
  }
}

export class DakotaAdapter extends GesperrterAdapter {
  readonly typ: AdapterTyp = 'dakota'
  protected readonly label = 'DAKOTA'
}

export class KimAdapter extends GesperrterAdapter {
  readonly typ: AdapterTyp = 'kim'
  protected readonly label = 'KIM'
}

export function adapterFuer(typ: AdapterTyp, speichern?: (dateiname: string, inhalt: string) => Promise<string>): ITransportAdapter {
  switch (typ) {
    case 'mock': return new MockAdapter()
    case 'file_export':
      if (!speichern) throw new Error('FileExportAdapter braucht eine Speicherfunktion.')
      return new FileExportAdapter(speichern)
    case 'dakota': return new DakotaAdapter()
    case 'kim': return new KimAdapter()
  }
}

// ── Warteschlange ────────────────────────────────────────────────

export async function reiheEin(
  supabase: SupabaseClient,
  organizationId: string,
  laufId: string,
  adapterTyp: AdapterTyp,
  actorId: string,
): Promise<string> {
  const { data: lauf } = await supabase
    .from('sgb_v_laeufe')
    .select('id')
    .eq('id', laufId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!lauf) throw new Error('§ 302-Lauf nicht gefunden oder gehört zu einer anderen Organisation.')

  const { data: row, error } = await supabase
    .from('sgb_v_uebertragungsqueue')
    .insert({ organization_id: organizationId, lauf_id: laufId, adapter_typ: adapterTyp, status: 'wartend', eingereiht_von: actorId })
    .select('id')
    .single()

  if (error || !row) throw new Error(`Warteschlangeneintrag konnte nicht angelegt werden: ${error?.message}`)

  await logBillingAction(supabase, {
    entityType: 'sgb_v_uebertragung',
    organizationId,
    entityId: row.id,
    action: 'sgb_v_uebertragung_eingereiht',
    newState: { lauf_id: laufId, adapter_typ: adapterTyp },
    actorId,
  })

  return row.id
}

export async function ladeWarteschlange(supabase: SupabaseClient, organizationId: string, laufId?: string) {
  let query = supabase
    .from('sgb_v_uebertragungsqueue')
    .select('id, lauf_id, adapter_typ, status, versuch_zaehler, letzter_versuch_am, letzter_fehler, ziel_referenz, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
  if (laufId) query = query.eq('lauf_id', laufId)

  const { data, error } = await query
  if (error) throw new Error(`Warteschlange konnte nicht geladen werden: ${error.message}`)
  return data || []
}

/**
 * Verarbeitet einen Warteschlangeneintrag: lädt den Prüf-Export für den
 * zugehörigen Lauf und ruft den passenden Adapter auf. Erhöht immer
 * versuch_zaehler, damit ein Blick auf die Zeile zeigt, wie oft bereits
 * versucht wurde — auch bei durchgängigem Fehlschlag.
 */
export async function verarbeiteEintrag(
  supabase: SupabaseClient,
  organizationId: string,
  queueId: string,
  datensatz: PruefExport,
  actorId: string,
  speichern?: (dateiname: string, inhalt: string) => Promise<string>,
): Promise<TransportResult> {
  const { data: eintrag } = await supabase
    .from('sgb_v_uebertragungsqueue')
    .select('id, adapter_typ, versuch_zaehler')
    .eq('id', queueId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!eintrag) throw new Error('Warteschlangeneintrag nicht gefunden oder gehört zu einer anderen Organisation.')

  const adapter = adapterFuer(eintrag.adapter_typ as AdapterTyp, speichern)
  const jetzt = new Date().toISOString()

  await supabase
    .from('sgb_v_uebertragungsqueue')
    .update({ status: 'in_bearbeitung', versuch_zaehler: eintrag.versuch_zaehler + 1, letzter_versuch_am: jetzt })
    .eq('id', queueId)

  const ergebnis = await adapter.send(datensatz)

  await supabase
    .from('sgb_v_uebertragungsqueue')
    .update({
      status: ergebnis.erfolg ? 'erfolgreich' : 'fehlgeschlagen',
      letzter_fehler: ergebnis.erfolg ? null : ergebnis.meldung,
      ziel_referenz: ergebnis.zielReferenz,
    })
    .eq('id', queueId)

  await logBillingAction(supabase, {
    entityType: 'sgb_v_uebertragung',
    organizationId,
    entityId: queueId,
    action: ergebnis.erfolg ? 'sgb_v_uebertragung_erfolgreich' : 'sgb_v_uebertragung_fehlgeschlagen',
    newState: { adapter_typ: eintrag.adapter_typ, meldung: ergebnis.meldung },
    actorId,
  })

  return ergebnis
}
