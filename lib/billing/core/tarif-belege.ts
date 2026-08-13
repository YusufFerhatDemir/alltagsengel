/**
 * Tarif-Belege — Upload und Abruf der Primaerbelege.
 *
 * Die Dateien liegen im privaten Bucket 'tarif-belege' (Migration
 * 20260904000000). Der Bucket hat bewusst KEINE Client-Storage-Policies:
 * jeder Zugriff laeuft ueber API-Routen mit service_role, gleiche Konvention
 * wie lib/akten/dokumente.ts. Ein Client bekommt nie mehr als eine
 * kurzlebige signierte URL.
 *
 * Der Supabase-Client wird injiziert, nie global importiert (Konvention aus
 * lib/billing/core/*). Es muss der Admin-/Service-Role-Client sein.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeBelegDateiname, type QuellTabelle } from './tarif-verifizierung'

export const BELEG_BUCKET = 'tarif-belege'

export interface TarifBeleg {
  id: string
  organization_id: string
  quell_tabelle: QuellTabelle
  tariff_id: string | null
  leistungspreis_id: string | null
  bucket: string
  dateipfad: string
  dateiname: string
  mime_type: string
  groesse_bytes: number
  sha256: string
  quelle: string | null
  hochgeladen_von: string
  hochgeladen_am: string
}

/**
 * Fehlt die Migration auf der Ziel-Datenbank, meldet PostgREST einen
 * Schema-Cache-Fehler. Das soll als klarer Satz beim Admin ankommen und nicht
 * als "Interner Serverfehler" — sonst sucht jemand stundenlang im Code.
 */
export function istMigrationFehlt(fehlermeldung: string | null | undefined): boolean {
  const m = (fehlermeldung ?? '').toLowerCase()
  return (
    m.includes('could not find the table') ||
    m.includes('schema cache') ||
    m.includes('does not exist') ||
    m.includes('relation "public.billing_tarif_belege"') ||
    m.includes('bucket not found')
  )
}

export const MIGRATION_FEHLT_TEXT =
  'Die Belegverwaltung ist auf dieser Datenbank noch nicht eingerichtet ' +
  '(Migration 20260904000000_tarif_belege_belegpflicht.sql nicht angewendet). ' +
  'Solange sie fehlt, kann kein Beleg hochgeladen und damit kein Kassentarif ' +
  'freigegeben werden — das ist beabsichtigt fail-closed.'

export async function berechneSha256Hex(data: ArrayBuffer): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const hash = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }
  const { createHash } = await import('crypto')
  return createHash('sha256').update(Buffer.from(data)).digest('hex')
}

export interface BelegUploadParams {
  organizationId: string
  quellTabelle: QuellTabelle
  zeilenId: string
  quelle: string | null
  hochgeladenVon: string
  datei: { name: string; type: string; arrayBuffer: ArrayBuffer }
  /** Nur fuer deterministische Pfade in Tests. */
  zeitstempel?: number
}

/**
 * Laedt einen Beleg hoch und registriert ihn.
 *
 * Reihenfolge ist wichtig: erst Storage, dann Tabellenzeile. Schlaegt die
 * Zeile fehl, wird die Datei wieder entfernt — sonst bleibt eine verwaiste
 * Datei im Bucket liegen, die niemand mehr zuordnen kann.
 */
export async function ladeBelegHoch(
  admin: SupabaseClient,
  params: BelegUploadParams
): Promise<TarifBeleg> {
  const sha256 = await berechneSha256Hex(params.datei.arrayBuffer)
  const stempel = params.zeitstempel ?? Date.now()
  const dateipfad = `${params.organizationId}/${params.quellTabelle}/${params.zeilenId}/${stempel}-${sanitizeBelegDateiname(params.datei.name)}`

  const { error: uploadFehler } = await admin.storage
    .from(BELEG_BUCKET)
    .upload(dateipfad, params.datei.arrayBuffer, {
      contentType: params.datei.type || 'application/octet-stream',
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadFehler) {
    if (istMigrationFehlt(uploadFehler.message)) throw new Error(MIGRATION_FEHLT_TEXT)
    throw new Error(`Beleg konnte nicht gespeichert werden: ${uploadFehler.message}`)
  }

  const { data, error } = await admin
    .from('billing_tarif_belege')
    .insert({
      organization_id: params.organizationId,
      quell_tabelle: params.quellTabelle,
      tariff_id: params.quellTabelle === 'billing_tariffs' ? params.zeilenId : null,
      leistungspreis_id: params.quellTabelle === 'leistungspreise' ? params.zeilenId : null,
      bucket: BELEG_BUCKET,
      dateipfad,
      dateiname: params.datei.name.slice(0, 200),
      mime_type: params.datei.type || 'application/octet-stream',
      groesse_bytes: params.datei.arrayBuffer.byteLength,
      sha256,
      quelle: params.quelle,
      hochgeladen_von: params.hochgeladenVon,
    })
    .select()
    .single()

  if (error || !data) {
    await admin.storage.from(BELEG_BUCKET).remove([dateipfad]).catch(() => undefined)
    if (istMigrationFehlt(error?.message)) throw new Error(MIGRATION_FEHLT_TEXT)
    throw new Error(`Beleg konnte nicht registriert werden: ${error?.message ?? 'unbekannt'}`)
  }

  return data as TarifBeleg
}

/** Belege einer Tarif- bzw. Preiszeile, neueste zuerst. */
export async function ladeBelege(
  admin: SupabaseClient,
  params: { organizationId: string; quellTabelle: QuellTabelle; zeilenId: string }
): Promise<TarifBeleg[]> {
  const spalte = params.quellTabelle === 'billing_tariffs' ? 'tariff_id' : 'leistungspreis_id'
  const { data, error } = await admin
    .from('billing_tarif_belege')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('quell_tabelle', params.quellTabelle)
    .eq(spalte, params.zeilenId)
    .order('hochgeladen_am', { ascending: false })

  if (error) {
    if (istMigrationFehlt(error.message)) throw new Error(MIGRATION_FEHLT_TEXT)
    throw new Error(`Belege konnten nicht geladen werden: ${error.message}`)
  }
  return (data ?? []) as TarifBeleg[]
}

/** Kurzlebige signierte URL. Standard 5 Minuten — lang genug zum Ansehen. */
export async function signiereBeleg(
  admin: SupabaseClient,
  beleg: Pick<TarifBeleg, 'bucket' | 'dateipfad'>,
  gueltigSekunden = 300
): Promise<string | null> {
  const { data, error } = await admin.storage
    .from(beleg.bucket || BELEG_BUCKET)
    .createSignedUrl(beleg.dateipfad, gueltigSekunden)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
