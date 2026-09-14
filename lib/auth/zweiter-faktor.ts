// ═══════════════════════════════════════════════════════════════════════
// Der zweite Faktor — zwei Hälften, zwei Quellen
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (Block 95, 14.09.2026)
//
// Der zweite Faktor wurde serverseitig an vier Stellen durchgesetzt. Drei
// davon — lib/ops/api-auth.ts, lib/abrechnung/require-admin.ts und
// lib/auth/guard.ts — trafen die Entscheidung aus EINER Abfrage:
//
//     const { data: aal } = await supabase.auth.mfa
//       .getAuthenticatorAssuranceLevel()
//     if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') …
//
// Diese eine Abfrage trägt beide Hälften der Frage:
//   `nextLevel`    — hat das Konto überhaupt einen Faktor?
//   `currentLevel` — ist DIESE Sitzung damit erhoben worden?
//
// Fällt sie aus, fallen beide Hälften zusammen aus — und eine fehlende
// Antwort ist in dieser Form von „kein Faktor eingerichtet" nicht zu
// unterscheiden. Der Riegel ließ dann durch. Der `catch {}` darunter war
// leer, der `error` der Abfrage wurde verworfen: es gab keine Spur davon,
// dass ein Faktor gerade nicht geprüft werden konnte.
//
// Die vierte Stelle, lib/coach/api-auth.ts, macht es seit jeher richtig:
// sie liest die Faktorliste aus dem Benutzerobjekt, das `auth.getUser()`
// ohnehin geliefert hat, und braucht das Sitzungsniveau nur noch als
// zweite, UNABHÄNGIGE Hälfte. Für ein Konto MIT Faktor ist ein Ausfall
// dort gesperrt, nicht offen.
//
// Dieses Modul ist diese Trennung für die drei übrigen Stellen. Die
// Entscheidungsregel selbst liegt weiter in lib/admin/mfa.ts — dort ist
// sie IO-frei und wird vom Layout-Guard genauso gelesen. Deren Kopf
// verspricht seit dem ersten Tag, dass die Regeln „in Layout-Guards wie
// in API-Routen dieselben" seien; bis hierhin war das für keine einzige
// API-Route wahr.
//
// WAS SICH NICHT ÄNDERT: Wer KEINEN bestätigten Faktor hat, kommt
// weiterhin durch. Sonst käme niemand mehr an die Einrichtung heran.
// Das ist die eine Fail-open-Richtung, die hier gewollt ist — und sie
// hängt jetzt an der Faktorliste, nicht mehr am Gelingen einer Abfrage.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminMfaStand } from '@/lib/admin/mfa'
import type { MfaFaktor, MfaNiveau } from '@/lib/coach/mfa'
import { authLogger } from '@/lib/logger'

export const ZWEITER_FAKTOR_TEXT =
  'Zweiter Faktor nicht verifiziert. Bitte erneut anmelden.'

/**
 * Faktorliste aus dem Benutzerobjekt von `auth.getUser()`.
 *
 * Die Liste kommt vom Auth-Dienst mit der Benutzerantwort mit — sie
 * kostet keinen zusätzlichen Aufruf. Strukturell statt über den
 * `User`-Typ, weil die Aufrufer den angemeldeten Benutzer in
 * unterschiedlich eng typisierten Variablen halten.
 */
export function faktorenVon(user: unknown): MfaFaktor[] {
  const liste = (user as { factors?: unknown } | null | undefined)?.factors
  return Array.isArray(liste) ? (liste as MfaFaktor[]) : []
}

/**
 * Niveau der laufenden Sitzung (AAL).
 *
 * Rein lokale Auswertung des Sitzungs-Tokens — kein Netzaufruf. `null`
 * heißt „nicht feststellbar"; für ein Konto MIT Faktor ist das dasselbe
 * wie „nicht erhoben", also gesperrt. Der Fehler wird protokolliert:
 * eine Prüfung, die gerade nicht stattfinden kann, darf nicht spurlos
 * bleiben.
 */
export async function niveauDerSitzung(supabase: SupabaseClient): Promise<MfaNiveau> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error) {
      authLogger.warnWithException('AAL-Niveau nicht lesbar — Sitzung gilt als nicht erhoben', error)
      return null
    }
    const stufe = data?.currentLevel
    return stufe === 'aal1' || stufe === 'aal2' ? stufe : null
  } catch (fehler) {
    authLogger.warnWithException('AAL-Abfrage fehlgeschlagen — Sitzung gilt als nicht erhoben', fehler)
    return null
  }
}

/**
 * Darf mit dieser Sitzung weitergearbeitet werden?
 * `null` = ja. Sonst die fertige 403-Antwort.
 *
 * Reihenfolge ist Absicht: OHNE bestätigten Faktor wird das Niveau gar
 * nicht erst erfragt — es könnte nichts entscheiden, und ein Ausfall der
 * Abfrage darf für diese Konten keine Rolle spielen.
 */
export async function zweiterFaktorRiegel(
  supabase: SupabaseClient,
  faktoren: MfaFaktor[] | null | undefined,
): Promise<NextResponse | null> {
  if (!adminMfaStand(faktoren, null).eingerichtet) return null

  const stand = adminMfaStand(faktoren, await niveauDerSitzung(supabase))
  if (stand.verifiziert) return null

  return NextResponse.json({ error: ZWEITER_FAKTOR_TEXT }, { status: 403 })
}
