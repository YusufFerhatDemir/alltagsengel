/**
 * IK-Aufloesung — unter welchem Institutionskennzeichen abgerechnet wird
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Das Institutionskennzeichen ist die Kennung, unter der ein
 * Leistungserbringer gegenueber den Kassen auftritt. Sie steht auf jedem
 * Leistungsnachweis, in jeder EDIFACT-Nutzdatendatei, in jeder XRechnung
 * und in jedem Rechnungspaket. `lib/config/org-config.ts` loest sie auf —
 * und wurde bisher nur per Quelltextlesen geprueft
 * (__tests__/security/p0-5-no-hardcoded-ik.test.ts). Ausgefuehrt wurde die
 * Funktion in keinem Test.
 *
 * ── BEFUNDE ────────────────────────────────────────────────────────────
 *   IK-1  app/api/leistungsnachweis/route.ts rief getOrgIK(admin) OHNE
 *         Organisation auf, obwohl die aktive Organisation zwei Zeilen
 *         darueber schon geladen und fail-closed geprueft war. Jeder
 *         Leistungsnachweis eines zweiten Mandanten trug damit die IK von
 *         Alltagsengel.
 *   IK-2  Der Env-Rueckfall ALLTAGSENGEL_IK galt fuer JEDE Organisation.
 *         Ein Mandant ohne gepflegte ik_nummer rechnete still unter
 *         fremdem Institutionskennzeichen ab.
 *
 * Es werden keine echten Kennzeichen verwendet: die Werte hier sind frei
 * erfundene Testzeichenfolgen.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { getOrgIK } from '@/lib/config/org-config'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'

const ORG_ZWEITER = '00000000-0000-4000-8000-00000000e001'

/** Frei erfundene Testwerte — keine echten Institutionskennzeichen. */
const IK_AUS_DB = 'IK-TEST-DATENBANK'
const IK_AUS_ENV = 'IK-TEST-UMGEBUNG'

/**
 * Supabase-Attrappe fuer organizations.
 * `ik` = Wert der Zeile; `fehler` = Abfrage scheitert (z. B. Tabelle fehlt).
 */
function stub(opts: { ik?: string | null; fehler?: string } = {}) {
  const gelesen: string[] = []
  const client = {
    from(tabelle: string) {
      if (tabelle !== 'organizations') throw new Error(`Unerwartete Tabelle: ${tabelle}`)
      return {
        select: () => ({
          eq: (_spalte: string, wert: string) => {
            gelesen.push(wert)
            return {
              single: async () => opts.fehler
                ? { data: null, error: { message: opts.fehler } }
                : { data: { ik_nummer: opts.ik ?? null }, error: null },
            }
          },
        }),
      }
    },
  }
  return { client: client as never, gelesen }
}

const ENV_SICHERUNG = {
  a: process.env.ALLTAGSENGEL_IK,
  b: process.env.NEXT_PUBLIC_ALLTAGSENGEL_IK,
}

beforeEach(() => {
  delete process.env.ALLTAGSENGEL_IK
  delete process.env.NEXT_PUBLIC_ALLTAGSENGEL_IK
})

afterEach(() => {
  if (ENV_SICHERUNG.a === undefined) delete process.env.ALLTAGSENGEL_IK
  else process.env.ALLTAGSENGEL_IK = ENV_SICHERUNG.a
  if (ENV_SICHERUNG.b === undefined) delete process.env.NEXT_PUBLIC_ALLTAGSENGEL_IK
  else process.env.NEXT_PUBLIC_ALLTAGSENGEL_IK = ENV_SICHERUNG.b
})

// ═══════════════════════════════════════════════════════════════════
describe('Quelle: die Organisationszeile', () => {
  it('liefert die IK aus der Datenbank', async () => {
    const { client, gelesen } = stub({ ik: IK_AUS_DB })
    expect(await getOrgIK(client, ORG_ZWEITER)).toBe(IK_AUS_DB)
    expect(gelesen).toEqual([ORG_ZWEITER])
  })

  it('bevorzugt die Datenbank vor der Umgebungsvariablen', async () => {
    process.env.ALLTAGSENGEL_IK = IK_AUS_ENV
    const { client } = stub({ ik: IK_AUS_DB })
    expect(await getOrgIK(client, DEFAULT_ORG_ID)).toBe(IK_AUS_DB)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('IK-2: Env-Rueckfall gilt nur der Stamm-Organisation', () => {
  it('greift fuer die Stamm-Organisation', async () => {
    // Der Rueckfall ist gewollt: solange organizations.ik_nummer nicht
    // gepflegt ist, muss der eigene Betrieb weiterlaufen.
    process.env.ALLTAGSENGEL_IK = IK_AUS_ENV
    const { client } = stub({ ik: null })
    expect(await getOrgIK(client, DEFAULT_ORG_ID)).toBe(IK_AUS_ENV)
  })

  it('greift auch ueber NEXT_PUBLIC_ALLTAGSENGEL_IK', async () => {
    process.env.NEXT_PUBLIC_ALLTAGSENGEL_IK = IK_AUS_ENV
    const { client } = stub({ ik: null })
    expect(await getOrgIK(client, DEFAULT_ORG_ID)).toBe(IK_AUS_ENV)
  })

  it('greift NICHT fuer einen anderen Mandanten', async () => {
    // Der Kern des Befunds: eine einzelne Zahl in einer Umgebungsvariablen
    // ist die IK von Alltagsengel und kann gar nichts anderes sein. Sie
    // einem zweiten Mandanten unterzuschieben, laesst ihn unter fremdem
    // Institutionskennzeichen abrechnen.
    process.env.ALLTAGSENGEL_IK = IK_AUS_ENV
    const { client } = stub({ ik: null })

    await expect(getOrgIK(client, ORG_ZWEITER)).rejects.toThrow(/nicht hinterlegt/)
    await expect(getOrgIK(client, ORG_ZWEITER)).rejects.toThrow(/fremdem/)
  })

  it('greift auch dann nicht, wenn die Tabelle gar nicht abfragbar ist', async () => {
    // Ein Abfragefehler (fehlende Migration, RLS) darf nicht dazu fuehren,
    // dass ein Fremdmandant auf die Stamm-IK zurueckfaellt.
    process.env.ALLTAGSENGEL_IK = IK_AUS_ENV
    const { client } = stub({ fehler: 'relation "organizations" does not exist' })
    await expect(getOrgIK(client, ORG_ZWEITER)).rejects.toThrow(/nicht hinterlegt/)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Fail-closed ohne jede Quelle', () => {
  it('wirft fuer die Stamm-Organisation, wenn nichts gesetzt ist', async () => {
    const { client } = stub({ ik: null })
    await expect(getOrgIK(client, DEFAULT_ORG_ID)).rejects.toThrow(/nicht konfiguriert/)
  })

  it('rechnet nie mit einem geratenen Wert weiter', async () => {
    // Kein Platzhalter, keine Null, kein leerer String: die Funktion hat
    // genau zwei Ausgaenge — eine belegte IK oder eine Ausnahme.
    const { client } = stub({ ik: '' })
    await expect(getOrgIK(client, ORG_ZWEITER)).rejects.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('IK-1: Aufrufer geben die Organisation mit', () => {
  const WURZEL = path.resolve(__dirname, '../..')

  /**
   * Jeder Aufruf, der eine IK fuer Kassen- oder Kundenunterlagen
   * aufloest, muss die Organisation mitgeben. `getOrgIK(client)` ohne
   * zweiten Parameter faellt auf die Stamm-Organisation zurueck — in
   * einem Mandantenbetrieb ist das immer die falsche.
   */
  const DATEIEN = [
    'app/api/leistungsnachweis/route.ts',
    'app/api/billing/dta/dry-run/route.ts',
    'app/api/billing/dta/[id]/export/route.ts',
    'lib/abrechnung/leistungsnachweis-pdf.ts',
    'lib/pdf/rechnung-paket.ts',
    'lib/billing/xrechnung/invoice-to-xrechnung.ts',
  ]

  for (const datei of DATEIEN) {
    it(`${datei} ruft getOrgIK NICHT ohne Organisation auf`, () => {
      const src = readFileSync(path.join(WURZEL, datei), 'utf-8')
      // Ein einziges Argument (kein Komma vor der schliessenden Klammer)
      // ist der Rueckfall auf die Stamm-Organisation.
      const ohneOrg = /getOrgIK\(\s*[A-Za-z_$][\w$]*\s*\)/.exec(src)
      expect(ohneOrg, `${datei}: ${ohneOrg?.[0]}`).toBeNull()
      expect(src).toMatch(/getOrgIK\(/)
    })
  }
})
