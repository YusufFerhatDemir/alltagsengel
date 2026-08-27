import { NextResponse } from 'next/server'
import { holeRollenQuellen } from '@/lib/auth/rollen-quelle'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId, resolveUserOrgId } from '@/lib/organizations/server'
import { sichtbareDokumenttypen, type Zugriffsart } from './berechtigung'
import type { SignaturDokumentTyp } from './types'

export interface SigAuthContext {
  userId: string
  organizationId: string
  role: string
  name: string
  /** Beide Rollenquellen — fuer Folgepruefungen im selben Vorgang. */
  appRolle: string
  profilRolle: string
  /** Dokumentarten, die diese Rollenlage in dieser Zugriffsart anfassen darf. */
  sichtbareTypen: SignaturDokumentTyp[]
}

export type SigAuthResult =
  | { ok: true; ctx: SigAuthContext }
  | { ok: false; response: NextResponse }

/**
 * Guard fuer die Verwaltungswege des Signaturmoduls.
 *
 * Geprueft wird NICHT mehr pauschal 'einsatz.lesen'. Die Tabelle
 * signatur_dokumente fuehrt sechs Dokumentarten quer ueber drei
 * Fachbereiche — 'pflegebericht' sind Gesundheitsdaten, 'vertrag' und
 * 'einwilligung' Klienten-Stammdaten. Ueber die pauschale Pruefung haette
 * die Buchhaltung, die ausdruecklich keine Gesundheitsdaten sehen soll,
 * Pflegeberichte gelesen. Welche Arten jemand sieht, entscheidet
 * lib/signaturen/berechtigung.ts; wer gar keine sieht, bekommt 403 und
 * keine leere Liste.
 */
export async function requireSigAdmin(art: Zugriffsart = 'lesen'): Promise<SigAuthResult> {
  const supabase = await createClient()
  const quellen = await holeRollenQuellen(supabase)
  if (!quellen) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  const sichtbareTypen = sichtbareDokumenttypen(quellen.appRolle, quellen.profilRolle, art)
  if (sichtbareTypen.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' },
        { status: 403 },
      ),
    }
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  return {
    ok: true,
    ctx: {
      userId: quellen.userId,
      organizationId,
      role: quellen.rolle,
      name: quellen.name,
      appRolle: quellen.appRolle,
      profilRolle: quellen.profilRolle,
      sichtbareTypen,
    },
  }
}

/**
 * Guard fuer den Signatar-Weg (signieren / ablehnen).
 *
 * Hier gibt es bewusst KEINE Rollenpruefung: wer unterschreiben soll, ist
 * haeufig weder Administration noch Verwaltungsrolle — die Zuordnung
 * steht in signaturen.signatar_id, und genau die pruefen die Funktionen
 * in lib/signaturen/signaturen.ts vor jedem Schreibvorgang. Dieser Guard
 * liefert nur Identitaet und Mandant.
 */
export async function requireSigUser(): Promise<
  | { ok: true; userId: string; role: string; organizationId: string; appRolle: string; profilRolle: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const quellen = await holeRollenQuellen(supabase)
  if (!quellen) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  if (!quellen.profilRolle) {
    return { ok: false, response: NextResponse.json({ error: 'Kein Profil.' }, { status: 403 }) }
  }

  const organizationId = await resolveUserOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  return {
    ok: true,
    userId: quellen.userId,
    role: quellen.rolle,
    organizationId,
    appRolle: quellen.appRolle,
    profilRolle: quellen.profilRolle,
  }
}
