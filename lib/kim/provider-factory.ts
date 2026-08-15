import type { IKimProvider } from './provider-interface'
import type { KimProviderConfig } from './types'
import { MockKimProvider, type MockKimProviderOptions } from './mock-provider'
import { TestKimProvider, type TestKimProviderOptions } from './test-provider'

/**
 * Einziger Konstruktionspunkt für KIM-Provider. Die Fachlogik ruft
 * ausschließlich hier auf — nie `new MockKimProvider()` o.ä. direkt —
 * damit ein späterer Providerwechsel (echter TI-Konnektor) NUR diese
 * eine Funktion ändert.
 *
 * kim_plus/kim_basis wirft ausnahmslos: der echte TI-Konnektor ist
 * extern und die KIM-Client-Spezifikation (Technische Anlage 5) liegt
 * diesem Projekt nicht vor. Erfundene Zustellwerte wären in einem
 * echten Gesundheitsnetz das gefährlichste denkbare Ergebnis — s.
 * supabase/migrations/20260830010000_kim_ti_geruest.sql (kim_formatversionen,
 * spec_bestaetigt). Diese Sperre fällt erst, wenn eine echte
 * Provider-Implementierung hinzukommt.
 */
export function createKimProvider(config: Pick<KimProviderConfig, 'provider_type' | 'config'>): IKimProvider {
  switch (config.provider_type) {
    case 'mock':
      return new MockKimProvider(config.config as MockKimProviderOptions)
    case 'test':
      return new TestKimProvider(config.config as TestKimProviderOptions)
    case 'kim_plus':
    case 'kim_basis':
      throw new Error(
        `KIM-Provider "${config.provider_type}" ist noch nicht implementiert: der echte TI-Konnektor ist extern ` +
        'und die KIM-Client-Spezifikation (Technische Anlage 5) liegt nicht vor. Versand bleibt für diesen ' +
        'Providertyp gesperrt, bis eine echte Implementierung + bestätigte Spezifikation vorliegen.'
      )
    default: {
      const exhaustive: never = config.provider_type
      throw new Error(`Unbekannter KIM-Providertyp: ${String(exhaustive)}`)
    }
  }
}
