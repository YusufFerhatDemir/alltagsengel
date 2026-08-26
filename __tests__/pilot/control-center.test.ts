/**
 * MONEY PATH PILOT — Betriebsübersicht
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Track 7 von Phase 7. Geprüft wird nicht, ob die Zahlen „schön"
 * aussehen, sondern drei Eigenschaften, an denen ein Dashboard scheitern
 * kann, ohne dass es auffällt:
 *
 *   1. FAIL-CLOSED. Eine Abfrage, die scheitert, darf nicht als 0
 *      erscheinen. „Keine Klärfälle" und „Klärfälle nicht zählbar" sind
 *      zwei verschiedene Aussagen — nur eine davon ist beruhigend.
 *
 *   2. MANDANTENZAUN. Jede einzelne Abfrage muss auf
 *      `organization_id` filtern. Der Dienst läuft mit service_role
 *      (BYPASSRLS); vergisst eine Abfrage den Filter, zeigt das Dashboard
 *      fremde Zahlen und niemand merkt es, weil eine Zahl immer plausibel
 *      aussieht.
 *
 *   3. KEINE SCHREIBOPERATION. Das Modul darf nichts verändern.
 *
 * Der Doppelgänger aus `__tests__/helpers/supabase-fake.ts` protokolliert
 * jeden Aufruf mit allen Filtern — genau deshalb sind (2) und (3)
 * überhaupt prüfbar.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'

import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'
import {
  ermittleMoneyPath,
  NICHT_VERSANDFAEHIGE_STATUS,
  FREIGABE_HINWEIS,
  type MoneyPathUebersicht,
} from '@/lib/pilot/control-center'

const ORG = '11111111-1111-4111-8111-111111111111'
const FREMD = '22222222-2222-4222-8222-222222222222'

/** Umgebung mit allem Nötigen — Werte sind Platzhalter, keine Geheimnisse. */
const ENV_VOLLSTAENDIG: Record<string, string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://beispiel.test',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  RESEND_API_KEY: 'test-key',
  CRON_SECRET: 'test-key',
}

/**
 * Ein Doppelgänger, der jede Zählabfrage mit derselben Zahl beantwortet
 * und jede Listenabfrage mit einer leeren Liste.
 *
 * Absichtlich stumpf: die Suite prüft Struktur und Filter, nicht
 * Fachlogik. Wo eine bestimmte Antwort nötig ist, überschreibt der
 * jeweilige Test sie.
 */
function fake(
  antwort: (a: FakeAufruf) => { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null } | undefined = () => undefined,
) {
  return erstelleFakeSupabase(a => {
    const eigen = antwort(a)
    if (eigen) return eigen
    if (a.tabelle === 'organizations') return { data: { name: 'Testmandant' } }
    if (a.head) return { count: 0 }
    return { data: [] }
  })
}

async function lauf(
  f: ReturnType<typeof fake>,
  quelle = ENV_VOLLSTAENDIG,
): Promise<MoneyPathUebersicht> {
  return ermittleMoneyPath(f.client as unknown as SupabaseClient, ORG, quelle)
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Struktur
// ═══════════════════════════════════════════════════════════════════════

describe('Struktur', () => {
  it('liefert genau die fünf Bereiche des Auftrags', async () => {
    const u = await lauf(fake())
    expect(u.bereiche.map(b => b.id)).toEqual(['camt', 'rechnung', 'mahnung', 'datev', 'system'])
  })

  it('jeder Bereich hat Ampel, Begründung und mindestens eine Kennzahl', async () => {
    const u = await lauf(fake())
    for (const b of u.bereiche) {
      expect(['gruen', 'gelb', 'rot', 'ungeprueft']).toContain(b.ampel)
      expect(b.begruendung.length).toBeGreaterThan(10)
      expect(b.kennzahlen.length).toBeGreaterThan(0)
    }
  })

  it('jede Kennzahl erklärt, was sie bedeutet', async () => {
    const u = await lauf(fake())
    for (const b of u.bereiche) {
      for (const k of b.kennzahlen) {
        expect(k.bedeutung.length, `${b.id}/${k.label} ohne Bedeutung`).toBeGreaterThan(10)
      }
    }
  })

  it('der Freigabe-Hinweis steht im Datenmodell, nicht nur im Seitentext', async () => {
    // Er muss auch in der API-Antwort auftauchen — sonst liest ihn
    // niemand, der die Zahlen weiterverarbeitet.
    const u = await lauf(fake())
    expect(u.freigabeHinweis).toBe(FREIGABE_HINWEIS)
    expect(u.freigabeHinweis).toMatch(/keine Freigabe/i)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Fail-closed
// ═══════════════════════════════════════════════════════════════════════

describe('Fail-closed', () => {
  it('eine gescheiterte Zählung ergibt null, nicht 0', async () => {
    const f = fake(a => a.tabelle === 'klaerfaelle'
      ? { error: { message: 'Verbindung unterbrochen', code: '08006' } }
      : undefined)
    const u = await lauf(f)

    const camt = u.bereiche.find(b => b.id === 'camt')!
    const klaerfaelle = camt.kennzahlen.find(k => k.label === 'offene Klärfälle')!
    expect(klaerfaelle.wert).toBeNull()
    expect(klaerfaelle.wert).not.toBe(0)
  })

  it('ein Bereich mit einer nicht messbaren Kennzahl ist NIE grün', async () => {
    const f = fake(a => a.tabelle === 'klaerfaelle'
      ? { error: { message: 'Verbindung unterbrochen' } }
      : undefined)
    const u = await lauf(f)
    expect(u.bereiche.find(b => b.id === 'camt')!.ampel).toBe('ungeprueft')
  })

  it('der Fehler landet in den Hinweisen und ist dort benannt', async () => {
    const f = fake(a => a.tabelle === 'klaerfaelle'
      ? { error: { message: 'Verbindung unterbrochen' } }
      : undefined)
    const u = await lauf(f)
    expect(u.hinweise.join(' ')).toContain('klaerfaelle')
    expect(u.hinweise.join(' ')).toContain('Verbindung unterbrochen')
  })

  it('ein Ausnahmefehler (kein PostgREST-Fehlerobjekt) wird ebenso behandelt', async () => {
    const f = erstelleFakeSupabase(a => {
      if (a.tabelle === 'dunning_email_queue') throw new Error('Zeitüberschreitung')
      if (a.tabelle === 'organizations') return { data: { name: 'Testmandant' } }
      if (a.head) return { count: 0 }
      return { data: [] }
    })
    const u = await lauf(f)
    expect(u.bereiche.find(b => b.id === 'mahnung')!.ampel).toBe('ungeprueft')
    expect(u.hinweise.join(' ')).toContain('Zeitüberschreitung')
  })

  it('eine leere Datenbank ist gruen, nicht rot', async () => {
    // Wichtige Abgrenzung: „noch nie gelaufen" ist kein Fehler. Wer das
    // rot färbt, kann später nicht mehr unterscheiden, ob etwas fehlt
    // oder ob etwas kaputt ist.
    const u = await lauf(fake())
    expect(u.bereiche.find(b => b.id === 'camt')!.ampel).toBe('gruen')
    expect(u.bereiche.find(b => b.id === 'camt')!.begruendung).toContain('nie gelaufen')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Mandantenzaun
// ═══════════════════════════════════════════════════════════════════════

describe('Mandantentrennung', () => {
  it('JEDE Abfrage filtert auf organization_id', async () => {
    const f = fake()
    await lauf(f)
    expect(f.aufrufe.length).toBeGreaterThan(10)

    const ohneFence = f.aufrufe.filter(a => {
      // organizations wird über die Primärschlüsselspalte `id` gelesen —
      // dort IST der Mandant der Filter.
      if (a.tabelle === 'organizations') return !hatFilter(a, 'eq', 'id', ORG)
      return !hatFilter(a, 'eq', 'organization_id', ORG)
    })

    expect(
      ohneFence.map(a => `${a.tabelle} (${a.operation})`),
      'Abfragen ohne Mandantenfilter — service_role umgeht RLS, hier fehlt der einzige Schutz',
    ).toEqual([])
  })

  it('keine Abfrage trägt eine fremde Organisations-ID', async () => {
    const f = fake()
    await lauf(f)
    const fremd = f.aufrufe.filter(a =>
      a.filter.some(x => x.wert === FREMD))
    expect(fremd).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Keine Schreiboperation
// ═══════════════════════════════════════════════════════════════════════

describe('Nur lesend', () => {
  it('das Modul führt weder insert, update noch delete aus', async () => {
    const f = fake()
    await lauf(f)
    const schreibend = f.aufrufe.filter(a => a.operation !== 'select')
    expect(
      schreibend.map(a => `${a.operation} auf ${a.tabelle}`),
      'Eine Betriebsübersicht darf nichts verändern',
    ).toEqual([])
  })

  it('die API-Route bietet kein POST, PUT, PATCH oder DELETE an', () => {
    // Der Riegel gegen „einen Knopf drankleben ist ja schnell gemacht".
    const route = readFileSync(join(process.cwd(), 'app/api/admin/pilot/route.ts'), 'utf8')
    expect(route).toMatch(/export async function GET/)
    for (const verb of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(route, `${verb} darf es hier nicht geben`).not.toMatch(
        new RegExp(`export\\s+(async\\s+)?function\\s+${verb}`),
      )
    }
  })

  it('die Money-Path-Sicht ist an die bestehende Pilot-Route angehängt, nicht daneben gebaut', () => {
    // Die Route beantwortet schon zwei Fragen (Betriebsbereitschaft,
    // Kundenketten). Eine zweite Route fuer die dritte haette bedeutet:
    // zwei Guards, zwei Caching-Regeln, zwei Stellen zum Vergessen.
    const route = readFileSync(join(process.cwd(), 'app/api/admin/pilot/route.ts'), 'utf8')
    expect(route).toContain('ermittleMoneyPath')
    expect(route).toContain('moneyPath,')
  })

  it('die Admin-Seite enthält für den Money-Path kein Formular und keinen Aktions-Button', () => {
    const seite = readFileSync(join(process.cwd(), 'app/admin/pilot/page.tsx'), 'utf8')
    const abschnitt = seite.slice(seite.indexOf('3 · Money-Path'))
    expect(abschnitt.length, 'Money-Path-Abschnitt nicht gefunden').toBeGreaterThan(100)
    expect(abschnitt).not.toMatch(/<form/i)
    expect(abschnitt).not.toMatch(/<button/i)
    expect(abschnitt).not.toMatch(/onClick/)
  })

  it('die Seite zeigt einen fehlenden Messwert als „—", nicht als 0', () => {
    const seite = readFileSync(join(process.cwd(), 'app/admin/pilot/page.tsx'), 'utf8')
    expect(seite).toContain("k.wert === null ? '—' : k.wert")
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. Rechnungsstatus — dieselbe Liste wie im Versand
// ═══════════════════════════════════════════════════════════════════════

describe('Versandfähigkeit', () => {
  it('die Statusliste stimmt mit lib/billing/versand/rechnung-versand.ts überein', () => {
    // Zwei Definitionen derselben Regel an zwei Orten sind die Ursache
    // der meisten Drifts. Der Versand exportiert seine Menge bewusst
    // nicht (eine Sicherheitsregel gehört nicht in eine öffentliche
    // Schnittstelle) — also wird die Übereinstimmung hier erzwungen.
    const quelle = readFileSync(
      join(process.cwd(), 'lib/billing/versand/rechnung-versand.ts'), 'utf8')
    const block = quelle.match(/NICHT_VERSANDFAEHIG:\s*ReadonlySet<string>\s*=\s*new Set\(\[([\s\S]*?)\]\)/)
    expect(block, 'NICHT_VERSANDFAEHIG im Versandmodul nicht gefunden').not.toBeNull()
    const imVersand = [...block![1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort()
    expect(imVersand).toEqual([...NICHT_VERSANDFAEHIGE_STATUS].sort())
  })

  it('versandbereit zählt nur festgeschriebene Rechnungen mit Empfänger', async () => {
    const f = fake(a => {
      if (a.tabelle !== 'invoices') return undefined
      // Die Empfängerprobe ist die einzige invoices-Abfrage ohne head.
      if (!a.head) {
        return {
          data: [
            { id: 'a', client: { email: 'kunde@beispiel.test' } },
            { id: 'b', client: { email: null } },
            { id: 'c', client: null },
          ],
        }
      }
      // Alle Zählabfragen liefern 3 — auch „versandbereit".
      return { count: 3 }
    })
    const u = await lauf(f)
    const rechnung = u.bereiche.find(b => b.id === 'rechnung')!
    expect(rechnung.kennzahlen.find(k => k.label === 'prüfen: kein Empfänger')!.wert).toBe(2)
    // 3 offen minus 2 ohne Empfänger.
    expect(rechnung.kennzahlen.find(k => k.label === 'versandbereit')!.wert).toBe(1)
  })

  it('weist Versandzeitpunkte ohne Festschreibung als eigene rote Kennzahl aus', async () => {
    // Der Befund aus Phase 8.4: `sent_at` allein belegt keinen Versand. Der
    // Versandweg weist eine nicht festgeschriebene Rechnung ab, also kann
    // eine solche Zeile nicht über ihn entstanden sein — sie stammt aus
    // einer Einspielung. Ohne diese Kennzahl liest sich die Zahl
    // „3 versendet" wie ein Erfolg des Versandpfads.
    const f = fake(a => {
      if (a.tabelle !== 'invoices') return undefined
      if (!a.head) return { data: [] }
      // Der Bestand: 3 Rechnungen, alle mit sent_at, keine festgeschrieben.
      // Alles, was auf „noch nicht versendet" oder auf einen gesperrten
      // Status filtert, ist damit leer.
      if (hatFilter(a, 'is', 'sent_at', null)) return { count: 0 }
      if (hatFilter(a, 'in', 'status')) return { count: 0 }
      return { count: 3 }
    })
    const u = await lauf(f)
    const rechnung = u.bereiche.find(b => b.id === 'rechnung')!
    const kz = rechnung.kennzahlen.find(k => k.label === 'versendet ohne Festschreibung')!
    expect(kz.wert).toBe(3)
    expect(kz.ampel).toBe('rot')
    expect(rechnung.ampel).toBe('rot')
    expect(rechnung.begruendung).toContain('NICHT')
  })

  it('meldet die Kennzahl als nicht messbar, statt sie auf 0 zu setzen', async () => {
    // Fail-closed: „keine unbelegten Versendungen" und „konnte nicht
    // nachsehen" dürfen nicht dieselbe Zahl erzeugen.
    const f = fake(a => {
      if (a.tabelle !== 'invoices') return undefined
      if (!a.head) return { data: [] }
      if (hatFilter(a, 'not', 'sent_at') && hatFilter(a, 'is', 'frozen_at', null)) {
        return { error: { message: 'permission denied' } }
      }
      return { count: 0 }
    })
    const u = await lauf(f)
    const rechnung = u.bereiche.find(b => b.id === 'rechnung')!
    expect(rechnung.kennzahlen.find(k => k.label === 'versendet ohne Festschreibung')!.wert).toBeNull()
    expect(rechnung.ampel).toBe('ungeprueft')
  })

  it('fehlende Empfänger färben den Bereich gelb, nicht grün', async () => {
    // Die blockierenden Zähler müssen hier ausdrücklich 0 sein — sonst
    // prüfte der Test, dass 'blockiert' 'blockiert' schlägt, und nicht,
    // dass ein fehlender Empfänger überhaupt eine Ampel bewegt.
    const f = fake(a => {
      if (a.tabelle !== 'invoices') return undefined
      if (!a.head) return { data: [{ id: 'b', client: { email: null } }] }
      const blockierend =
        hatFilter(a, 'is', 'frozen_at', null) || hatFilter(a, 'in', 'status', [...NICHT_VERSANDFAEHIGE_STATUS])
      return { count: blockierend ? 0 : 1 }
    })
    const u = await lauf(f)
    const rechnung = u.bereiche.find(b => b.id === 'rechnung')!
    expect(rechnung.kennzahlen.find(k => k.label === 'blockiert: nicht festgeschrieben')!.wert).toBe(0)
    expect(rechnung.ampel).toBe('gelb')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. Dublettenprobe
// ═══════════════════════════════════════════════════════════════════════

describe('CAMT-Dublettenprobe', () => {
  it('zwei Zeilen mit identischem Buchungshash sind BLOCKIERT', async () => {
    // Der Index auf quelldatei_hash ist bewusst NICHT unique — die Sperre
    // sitzt in der Import-Route. Diese Zählung ist die einzige
    // Möglichkeit, ihr Versagen überhaupt zu bemerken.
    const f = fake(a => {
      if (a.tabelle !== 'zahlungseingaenge' || a.head) return undefined
      return { data: [
        { quelldatei_hash: 'h1' },
        { quelldatei_hash: 'h1' },
        { quelldatei_hash: 'h2' },
      ] }
    })
    const u = await lauf(f)
    const camt = u.bereiche.find(b => b.id === 'camt')!
    expect(camt.kennzahlen.find(k => k.label === 'Hash-Dubletten')!.wert).toBe(1)
    expect(camt.ampel).toBe('rot')
    expect(camt.begruendung).toContain('mehrfach verbucht')
  })

  it('Zeilen ohne Hash zählen nicht als Dublette', async () => {
    const f = fake(a => {
      if (a.tabelle !== 'zahlungseingaenge' || a.head) return undefined
      return { data: [{ quelldatei_hash: null }, { quelldatei_hash: null }] }
    })
    const u = await lauf(f)
    expect(u.bereiche.find(b => b.id === 'camt')!
      .kennzahlen.find(k => k.label === 'Hash-Dubletten')!.wert).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7. System — Umgebung und Schalter
// ═══════════════════════════════════════════════════════════════════════

describe('System', () => {
  it('eine fehlende Pflicht-Variable blockiert den Systembereich', async () => {
    const u = await lauf(fake(), { ...ENV_VOLLSTAENDIG, RESEND_API_KEY: undefined })
    const system = u.bereiche.find(b => b.id === 'system')!
    expect(system.ampel).toBe('rot')
    expect(system.begruendung).toContain('Pflicht-Variable')
  })

  it('kein Variablenwert taucht in der Ausgabe auf', async () => {
    // Der Kern: geprüft wird die EXISTENZ, nie der Wert. Ein Dashboard,
    // das einen Schlüssel anzeigt, ist ein Leck.
    const geheim = 'geheimer-schluessel-nicht-anzeigen'
    const u = await lauf(fake(), { ...ENV_VOLLSTAENDIG, RESEND_API_KEY: geheim })
    expect(JSON.stringify(u)).not.toContain(geheim)
  })

  it('der neue Alt-Key-Name zählt genauso wie der alte', async () => {
    // Während der Supabase-Key-Migration darf das Dashboard nicht
    // „Env fehlt" melden, obwohl alles läuft.
    const u = await lauf(fake(), {
      NEXT_PUBLIC_SUPABASE_URL: 'https://beispiel.test',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      SUPABASE_SECRET_KEY: 'sb_secret_test',
      RESEND_API_KEY: 'test',
      CRON_SECRET: 'test',
    })
    expect(u.bereiche.find(b => b.id === 'system')!
      .kennzahlen.find(k => k.label === 'fehlende Pflicht-Variablen')!.wert).toBe(0)
  })

  it('ausgeschaltete Versandschalter erscheinen im Klartext', async () => {
    const u = await lauf(fake())
    const rechnung = u.bereiche.find(b => b.id === 'rechnung')!
    // Ohne RECHNUNGSVERSAND_AUTOMATISCH steht der Grund in der Begründung —
    // nicht nur „inaktiv".
    expect(rechnung.begruendung).toMatch(/Rechnungsversand/i)
  })

  it('ein ungültiger Schalterwert ist eine Warnung, kein stilles Aus', async () => {
    const u = await lauf(fake(), { ...ENV_VOLLSTAENDIG, RECHNUNGSVERSAND_AUTOMATISCH: 'true' })
    const system = u.bereiche.find(b => b.id === 'system')!
    const warnungen = system.kennzahlen.find(k => k.label === 'Schalter-Warnungen')!
    expect(warnungen.wert).toBeGreaterThan(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 8. DATEV
// ═══════════════════════════════════════════════════════════════════════

describe('DATEV', () => {
  it('unvollständige Kanzlei-Konfiguration blockiert den Bereich', async () => {
    const u = await lauf(fake())   // organizations liefert kein datev_config
    const datev = u.bereiche.find(b => b.id === 'datev')!
    expect(datev.ampel).toBe('rot')
    expect(datev.begruendung).toContain('BUSINESS_INPUT_REQUIRED')
  })

  it('mit vollständiger Konfiguration und ohne Fehlläufe ist der Bereich bereit', async () => {
    const f = fake(a => a.tabelle === 'organizations'
      ? { data: { name: 'Testmandant', datev_config: {
          beraternummer: '1234567', mandantennummer: '12345',
          kontenrahmen: 'SKR03', wjBeginn: '01-01', sachkontenlaenge: 4,
          naechsteDebitorennummer: 10000, erzeugerKuerzel: 'AE',
        } } }
      : undefined)
    const u = await lauf(f)
    const datev = u.bereiche.find(b => b.id === 'datev')!
    expect(datev.ampel).toBe('gruen')
    expect(datev.begruendung).toContain('Noch kein Buchungsstapel')
  })

  it('ein Lauf im Status "fehler" blockiert', async () => {
    const f = fake(a => {
      if (a.tabelle === 'organizations') {
        return { data: { name: 'T', datev_config: {
          beraternummer: '1234567', mandantennummer: '12345', kontenrahmen: 'SKR03',
          wjBeginn: '01-01', sachkontenlaenge: 4, naechsteDebitorennummer: 10000, erzeugerKuerzel: 'AE',
        } } }
      }
      if (a.tabelle === 'datev_exports' && hatFilter(a, 'eq', 'status', 'fehler')) return { count: 2 }
      return undefined
    })
    const u = await lauf(f)
    const datev = u.bereiche.find(b => b.id === 'datev')!
    expect(datev.ampel).toBe('rot')
    expect(datev.begruendung).toContain('Stapelprüfung')
  })
})
