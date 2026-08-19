/**
 * KIM — Betriebsmodus des Versandwegs (Track 5, 19.08.2026)
 *
 * DAS PROBLEM, DAS DIESES MODUL LÖST
 * Der WS3-Nachrichtenpfad (message-service → outbox-service → Provider) kann
 * heute schon vollständig durchlaufen: `resolveOrgProvider()` liefert ohne
 * Konfiguration den Mock-Provider, `processOutbox()` setzt danach
 * `kim_messages.status = 'gesendet'`, und `pollDeliveryStatuses()` zieht die
 * Zeile über 'zugestellt' bis 'gelesen' weiter.
 *
 * Bis Track 5 war an der gespeicherten Nachricht NICHT erkennbar, dass diese
 * Zustellung simuliert war. Eine Zeile mit status='zugestellt' sah exakt aus
 * wie eine echte KIM-Zustellung an eine Arztpraxis — in einem Postfach, das
 * im Gesundheitswesen als Zustellnachweis gilt. Das ist eine vorgetäuschte
 * Produktivverbindung, auch wenn niemand sie so gemeint hat.
 *
 * ZWEI REGELN
 *   1. KENNZEICHNEN. Jede über einen simulierten Provider erzeugte oder
 *      abgeholte Nachricht trägt in `metadata.kim_simulation` fest, womit sie
 *      verarbeitet wurde. Die Kennzeichnung entsteht am selben Ort wie der
 *      Statuswechsel — sie kann nicht "vergessen" werden.
 *   2. NICHT MISCHEN. Steht das Gate KIM_AKTIV auf true, behauptet der
 *      Betreiber Echtbetrieb (gematik-Zulassung, Provider-Vertrag, Konnektor).
 *      Ein simulierter Provider darf dann NICHT mehr senden — sonst laufen
 *      echte Arztbriefe in einen Simulator, der Erfolg meldet. In dieser
 *      Kombination wird hart abgebrochen, nicht stillschweigend simuliert.
 *
 * Das echte Senden bleibt davon unberührt gesperrt: `createKimProvider()`
 * wirft für kim_plus/kim_basis, und lib/kim/versand.ts (Block-18-Pfad) wirft
 * bedingungslos. Dieses Modul erlaubt nichts, es verhindert nur, dass eine
 * Simulation wie Echtbetrieb aussieht.
 */
import { istFreigegeben } from '../abrechnung/externe-freigaben'
import type { IKimProvider, KimProviderInfo } from './provider-interface'

/** Schlüssel in `kim_messages.metadata`. Bewusst sprechend — die Spalte wird von Menschen gelesen. */
export const KIM_SIMULATION_KEY = 'kim_simulation'

export const KIM_SIMULATION_HINWEIS =
  'SIMULIERT — kein echter KIM-Versand, keine Verbindung zur Telematikinfrastruktur. '
  + 'Zustellstatus stammt von einem Simulator und ist KEIN Zustellnachweis.'

export interface KimSimulationsMarker {
  simuliert: true
  provider_typ: KimProviderInfo['providerType']
  provider_bezeichnung: string
  hinweis: string
  markiert_am: string
}

export class KimBetriebsmodusError extends Error {
  readonly code = 'KIM_SIMULATION_IM_ECHTBETRIEB'
  constructor(info: KimProviderInfo) {
    super(
      `KIM_AKTIV steht auf true (Echtbetrieb), aber der aktive Provider ist "${info.displayName}" — eine Simulation. `
      + 'Der Versand wird abgebrochen: eine simulierte Zustellung im Echtbetrieb wäre von einer echten nicht zu '
      + 'unterscheiden. Entweder einen echten Provider konfigurieren oder KIM_AKTIV zurücksetzen.'
    )
    this.name = 'KimBetriebsmodusError'
  }
}

export interface KimVersandModus {
  /** Env-Gate KIM_AKTIV. */
  gateOffen: boolean
  /** Meldet der aktive Provider selbst, dass er simuliert? */
  simuliert: boolean
  providerTyp: KimProviderInfo['providerType']
  providerBezeichnung: string
  /** Darf die Warteschlange mit diesem Provider verarbeitet werden? */
  erlaubt: boolean
  /** Klartext, warum nicht — null wenn erlaubt. */
  grund: string | null
}

export function ermittleVersandModus(provider: IKimProvider): KimVersandModus {
  const info = provider.getProviderInfo()
  const gateOffen = istFreigegeben('kim_aktiv')

  // Gate offen + Simulator = die gefährliche Kombination. Alles andere läuft:
  // Gate zu + Simulator ist der heutige Normalfall (gekennzeichnet), und ein
  // echter Provider existiert noch gar nicht (provider-factory.ts wirft).
  const verboten = gateOffen && info.isSimulated

  return {
    gateOffen,
    simuliert: info.isSimulated,
    providerTyp: info.providerType,
    providerBezeichnung: info.displayName,
    erlaubt: !verboten,
    grund: verboten ? new KimBetriebsmodusError(info).message : null,
  }
}

/** Wirft, wenn der Modus den Versand verbietet. Aufruf vor jedem Provider-Zugriff, der Zustand schreibt. */
export function pruefeVersandModus(provider: IKimProvider): KimVersandModus {
  const modus = ermittleVersandModus(provider)
  if (!modus.erlaubt) throw new KimBetriebsmodusError(provider.getProviderInfo())
  return modus
}

/**
 * Baut die Kennzeichnung für `kim_messages.metadata`. Gibt bei einem echten
 * Provider `null` zurück — dann gibt es nichts zu kennzeichnen.
 */
export function simulationsMarker(modus: KimVersandModus, jetzt: string = new Date().toISOString()): KimSimulationsMarker | null {
  if (!modus.simuliert) return null
  return {
    simuliert: true,
    provider_typ: modus.providerTyp,
    provider_bezeichnung: modus.providerBezeichnung,
    hinweis: KIM_SIMULATION_HINWEIS,
    markiert_am: jetzt,
  }
}

/**
 * Führt bestehende Metadaten mit der Kennzeichnung zusammen.
 *
 * Ein einmal gesetzter Marker wird NICHT entfernt, auch wenn dieselbe
 * Nachricht später über einen echten Provider erneut angefasst würde: dass
 * diese Zeile einmal durch einen Simulator gelaufen ist, bleibt Teil ihrer
 * Geschichte.
 */
export function mitSimulationsMarker(
  vorhandeneMetadata: Record<string, unknown> | null | undefined,
  marker: KimSimulationsMarker | null,
): Record<string, unknown> {
  const basis = { ...(vorhandeneMetadata ?? {}) }
  if (!marker) return basis
  return { ...basis, [KIM_SIMULATION_KEY]: marker }
}

/** Trägt diese Nachricht die Simulationskennzeichnung? Für UI und Auswertungen. */
export function istSimulierteNachricht(metadata: Record<string, unknown> | null | undefined): boolean {
  const marker = (metadata ?? {})[KIM_SIMULATION_KEY] as KimSimulationsMarker | undefined
  return marker?.simuliert === true
}
