// ═══════════════════════════════════════════════════════════════════════
// Standortfreigabe — die Einwilligung lesen und setzen
// ═══════════════════════════════════════════════════════════════════════
//
// EINE REGEL TRAEGT DIESES MODUL:
// Einschalten kann nur das Konto selbst, und nur ausdruecklich.
// `enabledByUser` ist deshalb kein Vorgabewert und kein `?? true` — der
// Aufrufer muss ihn setzen, und die Route setzt ihn ausschliesslich aus
// einer bestaetigten Eingabe der Person, nie aus einem Standardwert.
// Der CHECK der Tabelle wiederholt dieselbe Bedingung; hier steht sie,
// damit die Person eine verstaendliche Antwort bekommt statt eines
// Datenbankfehlers.
//
// AUSSCHALTEN GEHT IMMER.
// `setzeEinstellung` mit Modus 'off' prueft NICHTS ausser der Identitaet
// — keine Betriebssystem-Berechtigung, keine Organisation, keine
// bestehende Zeile. Ein Widerruf, der an einer Vorbedingung scheitern
// kann, ist kein Widerruf. Zusaetzlich gibt es den Weg an diesem Modul
// vorbei: die RLS-Policy `standort_freigabe_selbst_abschalten` erlaubt
// dem Browser-Client, `mode` auf 'off' zu setzen, falls diese Route
// einmal nicht erreichbar ist.
//
// JEDE AENDERUNG IST EIN SICHERHEITSEREIGNIS.
// Ein- und Ausschalten schreiben in security_audit_log mit Vorher/
// Nachher. Ohne diese Spur waere „ich habe das nie eingeschaltet" eine
// Aussage gegen eine Datenbankzeile, die jeden Verlauf ueberschreibt.
// ═══════════════════════════════════════════════════════════════════════

import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { erfasseSicherheitsereignis, organisationFuerKonto } from '@/lib/security'
import {
  MODUS_AUS,
  brauchtBetriebssystemFreigabe,
  istModus,
  type Modus,
} from './modi'

type AdminClient = ReturnType<typeof createAdminClient>

const log = logger.child('standort:einstellungen')

export interface StandortEinstellung {
  /** null, solange die Person noch nie etwas eingestellt hat. */
  id: string | null
  userId: string
  organizationId: string | null
  modus: Modus
  enabledAt: string | null
  disabledAt: string | null
  enabledByUser: boolean
  osPermissionGranted: boolean
  updatedAt: string | null
}

const SPALTEN =
  'id, user_id, organization_id, mode, enabled_at, disabled_at, '
  + 'enabled_by_user, os_permission_granted, updated_at'

/**
 * Die Vorgabe fuer ein Konto ohne Zeile.
 *
 * Es wird KEINE Zeile angelegt, nur um eine zu haben: „noch nie etwas
 * eingestellt" und „ausdruecklich abgeschaltet" sind zwei verschiedene
 * Aussagen, und die Oberflaeche soll die zweite nicht behaupten
 * koennen, wenn nur die erste zutrifft.
 */
function vorgabe(userId: string): StandortEinstellung {
  return {
    id: null,
    userId,
    organizationId: null,
    modus: MODUS_AUS,
    enabledAt: null,
    disabledAt: null,
    enabledByUser: false,
    osPermissionGranted: false,
    updatedAt: null,
  }
}

function ausZeile(zeile: Record<string, unknown>): StandortEinstellung {
  const modus = zeile.mode
  return {
    id: String(zeile.id),
    userId: String(zeile.user_id),
    organizationId: (zeile.organization_id as string | null) ?? null,
    // Ein unbekannter Wert in der Spalte wird als 'off' gelesen. Das ist
    // die fail-closed Richtung: im Zweifel wird nicht erhoben.
    modus: istModus(modus) ? modus : MODUS_AUS,
    enabledAt: (zeile.enabled_at as string | null) ?? null,
    disabledAt: (zeile.disabled_at as string | null) ?? null,
    enabledByUser: zeile.enabled_by_user === true,
    osPermissionGranted: zeile.os_permission_granted === true,
    updatedAt: (zeile.updated_at as string | null) ?? null,
  }
}

/** Die Einstellung eines Kontos. Ohne Zeile: die Vorgabe ('off'). */
export async function leseEinstellung(
  admin: AdminClient,
  userId: string,
): Promise<StandortEinstellung> {
  const { data, error } = await admin
    .from('location_sharing_settings')
    .select(SPALTEN)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data ? ausZeile(data as unknown as Record<string, unknown>) : vorgabe(userId)
}

export interface SetzeEingabe {
  userId: string
  modus: Modus
  /**
   * Die ausdrueckliche eigene Aktivierung. KEIN Vorgabewert — siehe
   * Kopf. Beim Abschalten ohne Bedeutung.
   */
  enabledByUser: boolean
  /** Was das Geraet zur Betriebssystem-Berechtigung gemeldet hat. */
  osPermissionGranted: boolean
  /** Fuer IP, Geraet und Plattform des Sicherheitsereignisses. */
  request?: Request | Headers | null
}

export type SetzeErgebnis =
  | { ok: true; einstellung: StandortEinstellung; vorher: Modus }
  | { ok: false; grund: string }

/**
 * Modus setzen.
 *
 * Gibt bei einer abgelehnten Eingabe `{ ok: false, grund }` zurueck
 * statt zu werfen: der Grund ist fuer die Person bestimmt („dafuer
 * fehlt die Standortberechtigung Ihres Geräts"), nicht fuer den
 * Fehlerkanal.
 */
export async function setzeEinstellung(
  admin: AdminClient,
  eingabe: SetzeEingabe,
): Promise<SetzeErgebnis> {
  const { userId, modus } = eingabe
  const einschalten = modus !== MODUS_AUS

  if (einschalten && !eingabe.enabledByUser) {
    return {
      ok: false,
      grund:
        'Die Standortfreigabe kann nur von Ihnen selbst aktiviert werden. '
        + 'Bitte bestätigen Sie die Freigabe.',
    }
  }

  if (brauchtBetriebssystemFreigabe(modus) && !eingabe.osPermissionGranted) {
    return {
      ok: false,
      grund:
        'Für die dauerhafte Freigabe muss Ihr Gerät den Standortzugriff erlaubt '
        + 'haben. Bitte erteilen Sie die Berechtigung in den Einstellungen Ihres '
        + 'Geräts und versuchen Sie es erneut.',
    }
  }

  // Bestand ZUERST lesen. Zwei Gruende: die Spur braucht den
  // Vorher-Wert, und ein blindes Upsert wuerde beim Abschalten die
  // bereits erteilte Betriebssystem-Berechtigung ueberschreiben, obwohl
  // der Abschaltweg darueber nichts aussagt (Befund „Upsert stempelt
  // Endzustaende zurueck").
  const vorherEinstellung = await leseEinstellung(admin, userId)

  // Die Organisation kommt aus der Kontozuordnung, NIE aus der Anfrage.
  const organizationId =
    vorherEinstellung.organizationId ?? (await organisationFuerKonto(admin, userId))

  const nutzlast = {
    user_id: userId,
    organization_id: organizationId,
    mode: modus,
    // Beim Abschalten bleibt der bisherige Wert stehen: dass die Person
    // einmal selbst zugestimmt hat, wird durch den Widerruf nicht
    // unwahr — und der CHECK der Tabelle verlangt ihn nur fuer
    // mode <> 'off'.
    enabled_by_user: einschalten ? true : vorherEinstellung.enabledByUser,
    os_permission_granted: einschalten
      ? eingabe.osPermissionGranted
      : vorherEinstellung.osPermissionGranted,
    geaendert_von: userId,
  }

  const { data, error } = await admin
    .from('location_sharing_settings')
    .upsert(nutzlast, { onConflict: 'user_id' })
    .select(SPALTEN)
    .single()

  if (error) throw error

  const einstellung = ausZeile(data as unknown as Record<string, unknown>)

  // Fail-soft wie ueberall in der Sicherheitsspur: eine fehlende
  // Protokollzeile darf den Widerruf nicht scheitern lassen.
  try {
    await erfasseSicherheitsereignis({
      eventType: einschalten ? 'location_sharing_enabled' : 'location_sharing_disabled',
      userId,
      organizationId,
      request: eingabe.request ?? undefined,
      metadata: {
        funktion: 'Standortfreigabe',
        vorher: vorherEinstellung.modus,
        nachher: einstellung.modus,
        os_berechtigung: einstellung.osPermissionGranted,
        eigene_aktivierung: einstellung.enabledByUser,
        ergebnis: 'SUCCESS',
      },
    })
  } catch (err) {
    log.errorWithException('Standortfreigabe: Sicherheitsereignis nicht geschrieben', err)
  }

  return { ok: true, einstellung, vorher: vorherEinstellung.modus }
}
