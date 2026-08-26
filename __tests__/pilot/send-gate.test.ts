// ═══════════════════════════════════════════════════════════════════════
// EINMAL-FREIGABE FÜR DEN ERSTEN ECHTEN RECHNUNGSVERSAND
//
// Eine Freigabe, die sich umgehen lässt, ist keine. Diese Suite greift sie
// deshalb aus allen Richtungen an, in denen sie nachgeben könnte:
//
//   · ohne Token, mit erfundenem Token, mit fremdem Token
//   · mit gültigem Token auf einer ANDEREN Rechnung
//   · mit gültigem Token, aber verändertem Empfänger oder Betrag
//   · zweimal mit demselben Token
//   · mit einem Token, das zwischen Ausstellung und Verwendung überholt wurde
//
// Und die Eigenschaft, die den Rest trägt: der Aufrufer kann den
// Preflight-Stand nicht mitbringen. Käme er aus dem Request, hätte sich
// jede Oberfläche die stärkste Sperre des Systems selbst ausstellen können.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'
import {
  erstversandFreigabe,
  erzeugeSendeToken,
  pruefeSendeToken,
  verbraucheSendeToken,
  entwerteSendeToken,
  entwerteAlleOffenenTokens,
  FIRST_REAL_INVOICE_APPROVED,
  FREIGABE_ENV,
} from '@/lib/pilot/send-gate'

const ORG = '00000000-0000-4000-8000-000000000042'
const INV = '00000000-0000-4000-8000-0000000000cc'
const ANDERE_INV = '00000000-0000-4000-8000-0000000000dd'
const TOKEN = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const FREMDES_TOKEN = '9c858901-8a57-4791-81fe-4c455b099bc9'
const AKTEUR = '00000000-0000-4000-8000-00000000a001'

const JETZT = new Date('2026-08-26T12:00:00.000Z')
const SPAETER = new Date('2026-08-26T14:00:00.000Z')

const EMPFAENGER = 'erika.schmidt@web.de'
const BETRAG_CENT = 15050

const ENV_FREI: Record<string, string | undefined> = { [FREIGABE_ENV]: '1' }
const ENV_ZU: Record<string, string | undefined> = {}

// ---------------------------------------------------------------------------
// Fixtures für den Preflight-Durchlauf (erzeugeSendeToken führt ihn selbst aus)
// ---------------------------------------------------------------------------

const RECHNUNG_OK = {
  id: INV, organization_id: ORG, client_id: 'client-1',
  invoice_number: 'RE-2026-0001', invoice_number_formatted: 'RE-2026-0001',
  status: 'freigegeben', correction_type: null, correction_of: null,
  total_amount: 150.5, period_start: '2026-07-01', period_end: '2026-07-31',
  due_date: '2026-08-14', sent_at: null, frozen_at: '2026-08-01T10:00:00Z', deleted_at: null,
}
const KLIENT_OK = {
  id: 'client-1', organization_id: ORG, first_name: 'Erika', last_name: 'Schmidt',
  email: EMPFAENGER, address: 'Hauptstraße 1', city: 'Frankfurt', zip_code: '60311',
  insurance_name: null, status: 'active',
}
const POSITION_OK = {
  id: 'item-1', invoice_id: INV, description: 'Alltagsbegleitung', date: '2026-07-05',
  duration_minutes: 120, amount: 150.5, budget_type: 'private', tariff_preis_cent: 7525,
}
const ORG_OK = {
  id: ORG, name: 'Alltagsengel UG (haftungsbeschränkt)',
  iban: 'DE02120300000000202051', bic: 'BYLADEM1001', bank_name: 'Deutsche Kreditbank', settings: {},
}

/** Eine offene, gültige Freigabe. */
const GATE_OFFEN = {
  id: TOKEN,
  organization_id: ORG,
  invoice_id: INV,
  empfaenger: EMPFAENGER,
  betrag_cents: BETRAG_CENT,
  preflight_status: 'READY_FOR_SEND',
  erstellt_von: AKTEUR,
  erstellt_am: '2026-08-26T11:30:00.000Z',
  gueltig_bis: '2026-08-26T12:30:00.000Z',
  verbraucht_am: null,
  entwertet_am: null,
}

interface Lage {
  gate?: Record<string, unknown> | null
  gateFehler?: string
  emailLogTreffer?: number
  emailLogFehler?: string
  zustellspurTreffer?: number
  sperren?: { schwere: string; grund: string; invoice_id: string | null; gesetzt_am: string }[]
  sperreFehler?: string
  /** Antwort des UPDATE beim Verbrauch. */
  verbrauchZeilen?: Record<string, unknown>[]
  verbrauchFehler?: string
  /** Fehler beim INSERT der Freigabe. */
  insertFehler?: { message: string; code?: string }
  rechnung?: Record<string, unknown> | null
  klient?: Record<string, unknown> | null
}

function db(lage: Lage = {}) {
  return (a: FakeAufruf) => {
    switch (a.tabelle) {
      case 'pilot_send_gate': {
        if (a.operation === 'insert') {
          return lage.insertFehler
            ? { error: lage.insertFehler }
            : { data: { id: TOKEN, gueltig_bis: '2026-08-26T13:00:00.000Z' } }
        }
        if (a.operation === 'update') {
          return lage.verbrauchFehler
            ? { error: { message: lage.verbrauchFehler } }
            : { data: lage.verbrauchZeilen ?? [{ ...GATE_OFFEN, verbraucht_am: JETZT.toISOString() }] }
        }
        return lage.gateFehler
          ? { error: { message: lage.gateFehler } }
          : { data: lage.gate === undefined ? GATE_OFFEN : lage.gate }
      }
      case 'invoice_email_log':
        return lage.emailLogFehler
          ? { error: { message: lage.emailLogFehler } }
          : { count: lage.emailLogTreffer ?? 0 }
      case 'notification_delivery_log':
        return { count: lage.zustellspurTreffer ?? 0 }
      case 'pilot_versand_sperre':
        return lage.sperreFehler
          ? { error: { message: lage.sperreFehler } }
          : { data: lage.sperren ?? [] }
      // ── Preflight-Fixtures ──
      case 'invoices': {
        const idFilter = a.filter.find(f => f.methode === 'eq' && f.spalte === 'id')?.wert
        if (a.filter.some(f => f.spalte === 'invoice_number_formatted')) return { data: [{ id: INV }] }
        if (idFilter === INV) return { data: lage.rechnung === undefined ? RECHNUNG_OK : lage.rechnung }
        return { data: { id: idFilter } }
      }
      case 'clients':
        return { data: lage.klient === undefined ? KLIENT_OK : lage.klient }
      case 'organizations':
        return { data: ORG_OK }
      case 'invoice_items':
        return { data: [POSITION_OK] }
      case 'invoice_packages':
        return { data: { pdf_url: 'https://storage.example/p.pdf', page_count: 2 } }
      case 'billing_audit_trail':
        return { data: [], count: 3 }
      default:
        return { data: [] }
    }
  }
}

async function pruefe(lage: Lage = {}, ueberschreibungen: Partial<Parameters<typeof pruefeSendeToken>[1]> = {}) {
  const fake = erstelleFakeSupabase(db(lage))
  const ergebnis = await pruefeSendeToken(fake.client, {
    token: TOKEN, invoiceId: INV, organizationId: ORG,
    empfaenger: EMPFAENGER, betragCents: BETRAG_CENT,
    quelle: ENV_FREI, jetzt: JETZT,
    ...ueberschreibungen,
  })
  return { ergebnis, fake }
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Die Grundstellung
// ═══════════════════════════════════════════════════════════════════════

describe('Grundstellung', () => {
  it('FIRST_REAL_INVOICE_APPROVED steht im Quelltext auf false', () => {
    // Diese Zusicherung ist der Kern des Auftrags. Sie zu ändern heißt,
    // diesen Test zu ändern — und das steht dann im Diff.
    expect(FIRST_REAL_INVOICE_APPROVED).toBe(false)
  })

  it('ohne Umgebungsvariable ist der Erstversand nicht freigegeben', () => {
    const f = erstversandFreigabe(ENV_ZU)
    expect(f.freigegeben).toBe(false)
    expect(f.herkunft).toBe('keine')
  })

  it('nur der exakte Wert 1 gibt frei', () => {
    for (const wert of ['0', 'true', 'ja', 'yes', ' 1', '1 ', 'JA', '']) {
      expect(erstversandFreigabe({ [FREIGABE_ENV]: wert }).freigegeben, `Wert "${wert}"`).toBe(false)
    }
    expect(erstversandFreigabe({ [FREIGABE_ENV]: '1' }).freigegeben).toBe(true)
  })

  it('nennt den Grund, statt nur nein zu sagen', () => {
    expect(erstversandFreigabe(ENV_ZU).grund).toContain(FREIGABE_ENV)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Prüfen — die Angriffsrichtungen
// ═══════════════════════════════════════════════════════════════════════

describe('Prüfen', () => {
  it('ohne Freigabe wird abgelehnt, noch bevor irgendetwas gelesen wird', async () => {
    const { ergebnis, fake } = await pruefe({}, { quelle: ENV_ZU })
    expect(ergebnis.erlaubt).toBe(false)
    expect(ergebnis).toMatchObject({ code: 'keine_freigabe' })
    // Kein Datenbankzugriff: fail-closed heißt hier auch, gar nicht erst
    // nachzusehen.
    expect(fake.aufrufe).toEqual([])
  })

  it('ohne Token wird abgelehnt', async () => {
    for (const token of [null, undefined, '', '   ']) {
      const { ergebnis } = await pruefe({}, { token })
      expect(ergebnis.erlaubt).toBe(false)
      expect(ergebnis).toMatchObject({ code: 'kein_token' })
    }
  })

  it('ein Token mit falschem Format wird abgelehnt, ohne die Datenbank zu fragen', async () => {
    const { ergebnis, fake } = await pruefe({}, { token: 'nicht-uuid' })
    expect(ergebnis).toMatchObject({ code: 'token_ungueltiges_format' })
    // PostgREST beantwortete eine kaputte UUID mit 22P02 — ein Formatfehler
    // soll nicht wie ein Datenbankproblem aussehen.
    expect(fake.auf('pilot_send_gate')).toEqual([])
  })

  it('ein unbekanntes Token wird abgelehnt', async () => {
    const { ergebnis } = await pruefe({ gate: null }, { token: FREMDES_TOKEN })
    expect(ergebnis).toMatchObject({ code: 'token_unbekannt' })
  })

  it('das Token wird mandantengefenced gesucht — ein fremdes ist schlicht unbekannt', async () => {
    const { fake } = await pruefe()
    const a = fake.ersterAuf('pilot_send_gate')
    expect(hatFilter(a, 'eq', 'id', TOKEN)).toBe(true)
    expect(hatFilter(a, 'eq', 'organization_id', ORG)).toBe(true)
  })

  it('ein bereits verbrauchtes Token wird abgelehnt', async () => {
    const { ergebnis } = await pruefe({ gate: { ...GATE_OFFEN, verbraucht_am: '2026-08-26T11:45:00.000Z' } })
    expect(ergebnis).toMatchObject({ code: 'token_verbraucht' })
  })

  it('ein entwertetes Token wird abgelehnt', async () => {
    const { ergebnis } = await pruefe({ gate: { ...GATE_OFFEN, entwertet_am: '2026-08-26T11:45:00.000Z' } })
    expect(ergebnis).toMatchObject({ code: 'token_entwertet' })
  })

  it('ein abgelaufenes Token wird abgelehnt', async () => {
    const { ergebnis } = await pruefe({}, { jetzt: SPAETER })
    expect(ergebnis).toMatchObject({ code: 'token_abgelaufen' })
  })

  it('ein Token ohne READY_FOR_SEND wird abgelehnt', async () => {
    const { ergebnis } = await pruefe({ gate: { ...GATE_OFFEN, preflight_status: 'NEEDS_REVIEW' } })
    expect(ergebnis).toMatchObject({ code: 'preflight_nicht_bereit' })
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Die vier Bindungen
// ═══════════════════════════════════════════════════════════════════════

describe('Bindungen', () => {
  it('richtiges Token, falsche Rechnung → Ablehnung', async () => {
    const { ergebnis } = await pruefe({}, { invoiceId: ANDERE_INV })
    expect(ergebnis).toMatchObject({ code: 'rechnung_abweichend' })
  })

  it('geänderter Empfänger → Ablehnung', async () => {
    const { ergebnis } = await pruefe({}, { empfaenger: 'jemand.anderes@web.de' })
    expect(ergebnis).toMatchObject({ code: 'empfaenger_abweichend' })
  })

  it('geänderter Betrag → Ablehnung', async () => {
    const { ergebnis } = await pruefe({}, { betragCents: 15051 })
    expect(ergebnis).toMatchObject({ code: 'betrag_abweichend' })
  })

  it('Groß-/Kleinschreibung in der Adresse ist kein Ablehnungsgrund', async () => {
    const { ergebnis } = await pruefe({}, { empfaenger: '  Erika.Schmidt@WEB.de ' })
    expect(ergebnis.erlaubt).toBe(true)
  })

  it('richtiges Token, richtige Rechnung, unverändert → erlaubt', async () => {
    const { ergebnis } = await pruefe()
    expect(ergebnis.erlaubt).toBe(true)
    if (ergebnis.erlaubt) expect(ergebnis.gate.invoiceId).toBe(INV)
  })

  it('die Prüfung schreibt nichts — der Verbrauch ist ein eigener Schritt', async () => {
    const { fake } = await pruefe()
    expect(fake.aufrufe.filter(a => a.operation !== 'select')).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Was sich zwischen Ausstellung und Verwendung geändert haben kann
// ═══════════════════════════════════════════════════════════════════════

describe('Nachträgliche Sperren', () => {
  it('ein inzwischen protokollierter Versand blockiert das gültige Token', async () => {
    const { ergebnis } = await pruefe({ emailLogTreffer: 1 })
    expect(ergebnis).toMatchObject({ code: 'bereits_versendet' })
  })

  it('eine inzwischen gesetzte Sperre blockiert das gültige Token', async () => {
    const { ergebnis } = await pruefe({ sperren: [{ schwere: 'P0', grund: 'Nachprüfung ergab eine Abweichung.', invoice_id: null, gesetzt_am: '2026-08-26T10:00:00.000Z' }] })
    expect(ergebnis).toMatchObject({ code: 'versandsperre' })
  })

  it('eine Sperre auf einer anderen Rechnung hält dieses Token nicht auf', async () => {
    const { ergebnis } = await pruefe({ sperren: [{ schwere: 'P0', grund: 'Anderer Beleg.', invoice_id: ANDERE_INV, gesetzt_am: '2026-08-26T10:00:00.000Z' }] })
    expect(ergebnis.erlaubt).toBe(true)
  })

  it('ein unlesbares Versandprotokoll lehnt ab, statt durchzulassen', async () => {
    const { ergebnis } = await pruefe({ emailLogFehler: 'permission denied' })
    expect(ergebnis).toMatchObject({ code: 'quelle_unlesbar' })
  })

  it('eine unlesbare Sperrtabelle lehnt ab', async () => {
    const { ergebnis } = await pruefe({ sperreFehler: 'relation does not exist' })
    expect(ergebnis).toMatchObject({ code: 'quelle_unlesbar' })
  })

  it('ein unlesbares Gate lehnt ab', async () => {
    const { ergebnis } = await pruefe({ gateFehler: 'connection reset' })
    expect(ergebnis).toMatchObject({ code: 'quelle_unlesbar' })
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. Verbrauch — einmal und nur einmal
// ═══════════════════════════════════════════════════════════════════════

describe('Verbrauch', () => {
  async function verbrauche(lage: Lage = {}, invoiceId = INV) {
    const fake = erstelleFakeSupabase(db(lage))
    const ergebnis = await verbraucheSendeToken(fake.client, {
      token: TOKEN, invoiceId, organizationId: ORG, actorId: AKTEUR, jetzt: JETZT,
    })
    return { ergebnis, fake }
  }

  it('verbraucht ein offenes Token', async () => {
    const { ergebnis } = await verbrauche()
    expect(ergebnis.ok).toBe(true)
  })

  it('der Verbrauch ist ein bedingtes UPDATE — die Bedingung steht im WHERE, nicht im Vorher-Lesen', async () => {
    const { fake } = await verbrauche()
    const a = fake.ersterAuf('pilot_send_gate', 'update')!
    expect(hatFilter(a, 'eq', 'id', TOKEN)).toBe(true)
    expect(hatFilter(a, 'eq', 'organization_id', ORG)).toBe(true)
    expect(hatFilter(a, 'eq', 'invoice_id', INV)).toBe(true)
    // Diese beiden sind der Trick: ohne sie gäbe es zwischen Lesen und
    // Schreiben ein Zeitfenster, und das Fenster wäre eine zweite Rechnung.
    expect(hatFilter(a, 'is', 'verbraucht_am', null)).toBe(true)
    expect(hatFilter(a, 'is', 'entwertet_am', null)).toBe(true)
  })

  it('ein zweiter Verbrauch trifft null Zeilen und wird abgewiesen', async () => {
    const { ergebnis } = await verbrauche({ verbrauchZeilen: [] })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis).toMatchObject({ code: 'token_verbraucht' })
  })

  it('der Verbrauch eines Tokens auf einer anderen Rechnung trifft null Zeilen', async () => {
    // Live sorgt das `eq('invoice_id', …)` dafür; hier bildet die Fixture
    // die leere Antwort nach.
    const { ergebnis } = await verbrauche({ verbrauchZeilen: [] }, ANDERE_INV)
    expect(ergebnis.ok).toBe(false)
  })

  it('ein Fehler beim UPDATE gilt NICHT als Verbrauch', async () => {
    const { ergebnis } = await verbrauche({ verbrauchFehler: 'deadlock detected' })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis).toMatchObject({ code: 'quelle_unlesbar' })
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. Ausstellen
// ═══════════════════════════════════════════════════════════════════════

describe('Ausstellen', () => {
  async function stelleAus(lage: Lage = {}, extra: Partial<Parameters<typeof erzeugeSendeToken>[1]> = {}) {
    const fake = erstelleFakeSupabase(db(lage))
    const ergebnis = await erzeugeSendeToken(fake.client, {
      invoiceId: INV, organizationId: ORG, actorId: AKTEUR,
      quelle: ENV_FREI, jetzt: JETZT,
      ...extra,
    })
    return { ergebnis, fake }
  }

  it('ohne Freigabe wird nichts ausgestellt und nichts geschrieben', async () => {
    const { ergebnis, fake } = await stelleAus({}, { quelle: ENV_ZU })
    expect(ergebnis.ok).toBe(false)
    expect(fake.aufrufe.filter(a => a.operation !== 'select')).toEqual([])
  })

  it('stellt für eine READY_FOR_SEND-Rechnung ein Token aus', async () => {
    const { ergebnis } = await stelleAus()
    expect(ergebnis.ok).toBe(true)
    if (ergebnis.ok) {
      expect(ergebnis.token).toBe(TOKEN)
      expect(ergebnis.bericht.urteil).toBe('READY_FOR_SEND')
    }
  })

  it('der Aufrufer bestimmt den Preflight-Stand NICHT — er wird selbst ermittelt', async () => {
    const { fake } = await stelleAus()
    const insert = fake.ersterAuf('pilot_send_gate', 'insert')!
    const payload = insert.payload as Record<string, unknown>
    expect(payload.preflight_status).toBe('READY_FOR_SEND')
    // Empfänger und Betrag kommen aus der Datenbank, nicht aus dem Aufruf.
    expect(payload.empfaenger).toBe(EMPFAENGER)
    expect(payload.betrag_cents).toBe(BETRAG_CENT)
    expect(payload.organization_id).toBe(ORG)
    expect(payload.invoice_id).toBe(INV)
  })

  it('stellt für eine NEEDS_REVIEW-Rechnung KEIN Token aus', async () => {
    // Im Regelbetrieb dürfte ein Mensch das verantworten. Beim ersten
    // Versand gibt es keine Erfahrung, auf die er sich stützen könnte.
    const { ergebnis, fake } = await stelleAus({ klient: { ...KLIENT_OK, status: 'inactive' } })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis).toMatchObject({ code: 'preflight_nicht_bereit' })
    expect(fake.auf('pilot_send_gate')).toEqual([])
  })

  it('stellt für eine BLOCKED-Rechnung KEIN Token aus', async () => {
    const { ergebnis } = await stelleAus({ rechnung: { ...RECHNUNG_OK, frozen_at: null } })
    expect(ergebnis.ok).toBe(false)
  })

  it('stellt bei stehender Sperre KEIN Token aus', async () => {
    const { ergebnis } = await stelleAus({ sperren: [{ schwere: 'P0', grund: 'P0 nach Nachprüfung.', invoice_id: null, gesetzt_am: '2026-08-26T10:00:00.000Z' }] })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis).toMatchObject({ code: 'versandsperre' })
  })

  it('lehnt ab, wenn der bestätigte Empfänger vom hinterlegten abweicht', async () => {
    const { ergebnis } = await stelleAus({}, { erwarteterEmpfaenger: 'jemand.anderes@web.de' })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis).toMatchObject({ code: 'empfaenger_abweichend' })
  })

  it('lehnt ab, wenn der bestätigte Betrag vom Rechnungsbetrag abweicht', async () => {
    const { ergebnis } = await stelleAus({}, { erwarteterBetragCent: 9999 })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis).toMatchObject({ code: 'betrag_abweichend' })
  })

  it('nimmt eine übereinstimmende Bestätigung an', async () => {
    const { ergebnis } = await stelleAus({}, { erwarteterEmpfaenger: EMPFAENGER, erwarteterBetragCent: BETRAG_CENT })
    expect(ergebnis.ok).toBe(true)
  })

  it('erklärt eine 23505-Kollision als Sperre, nicht als Datenbankproblem', async () => {
    const { ergebnis } = await stelleAus({ insertFehler: { message: 'duplicate key value', code: '23505' } })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis).toMatchObject({ code: 'bereits_versendet' })
    if (!ergebnis.ok) expect(ergebnis.grund).toContain('UNIQUE')
  })

  it('setzt eine Gültigkeit, die nach der Ausstellung endet', async () => {
    const { fake } = await stelleAus()
    const payload = fake.ersterAuf('pilot_send_gate', 'insert')!.payload as Record<string, string>
    expect(new Date(payload.gueltig_bis).getTime()).toBeGreaterThan(new Date(payload.erstellt_am).getTime())
  })

  it('schreibt genau eine Zeile und sonst nichts', async () => {
    const { fake } = await stelleAus()
    const schreibend = fake.aufrufe.filter(a => a.operation !== 'select')
    expect(schreibend).toHaveLength(1)
    expect(schreibend[0].tabelle).toBe('pilot_send_gate')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7. Entwerten
// ═══════════════════════════════════════════════════════════════════════

describe('Entwerten', () => {
  it('entwertet ein offenes Token', async () => {
    const fake = erstelleFakeSupabase(db({ verbrauchZeilen: [{ id: TOKEN }] }))
    const e = await entwerteSendeToken(fake.client, { token: TOKEN, organizationId: ORG, grund: 'Abbruch', jetzt: JETZT })
    expect(e.ok).toBe(true)
  })

  it('entwertet ein bereits verbrauchtes Token nicht — das wäre eine Geschichtsfälschung', async () => {
    const fake = erstelleFakeSupabase(db({ verbrauchZeilen: [] }))
    const e = await entwerteSendeToken(fake.client, { token: TOKEN, organizationId: ORG, grund: 'Abbruch' })
    expect(e.ok).toBe(false)
  })

  it('entwertet alle offenen Tokens eines Mandanten und zählt sie', async () => {
    const fake = erstelleFakeSupabase(db({ verbrauchZeilen: [{ id: TOKEN }, { id: FREMDES_TOKEN }] }))
    const anzahl = await entwerteAlleOffenenTokens(fake.client, { organizationId: ORG, grund: 'Nachprüfung P0' })
    expect(anzahl).toBe(2)
    const a = fake.ersterAuf('pilot_send_gate', 'update')!
    expect(hatFilter(a, 'eq', 'organization_id', ORG)).toBe(true)
    expect(hatFilter(a, 'is', 'verbraucht_am', null)).toBe(true)
  })

  it('meldet null statt 0, wenn die Entwertung nicht ausführbar war', async () => {
    const fake = erstelleFakeSupabase(db({ verbrauchFehler: 'permission denied' }))
    // 0 hieße „nichts war offen", null heißt „nicht feststellbar" — und nur
    // eines davon ist beruhigend.
    expect(await entwerteAlleOffenenTokens(fake.client, { organizationId: ORG, grund: 'x' })).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 8. Die Datenbank trägt die Regel mit
// ═══════════════════════════════════════════════════════════════════════

describe('Migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase', 'migrations', '20261005000000_pilot_send_gate.sql'), 'utf8')

  it('erlaubt nur READY_FOR_SEND als Preflight-Stand', () => {
    // Damit steht die Regel nicht nur in TypeScript.
    expect(sql).toContain("CHECK (preflight_status = 'READY_FOR_SEND')")
  })

  it('lässt höchstens ein offenes Token je Rechnung zu', () => {
    expect(sql).toContain('pilot_send_gate_offen_je_rechnung')
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*pilot_send_gate_offen_je_rechnung[\s\S]*WHERE verbraucht_am IS NULL AND entwertet_am IS NULL/)
  })

  it('lässt höchstens ein verbrauchtes Token je Rechnung zu — die Doppelversand-Sperre', () => {
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*pilot_send_gate_einmal_verbraucht[\s\S]*WHERE verbraucht_am IS NOT NULL/)
  })

  it('fencet beide Tabellen mandantenweise und RESTRICTIVE', () => {
    for (const tabelle of ['pilot_send_gate', 'pilot_versand_sperre']) {
      expect(sql).toContain(`ALTER TABLE public.${tabelle} ENABLE ROW LEVEL SECURITY`)
      expect(sql).toContain(`org_fence_${tabelle}`)
    }
    expect(sql.match(/AS RESTRICTIVE/g)).toHaveLength(2)
  })

  it('ist transaktional gekapselt', () => {
    // Ein halb angewendetes Schema wäre schlimmer als gar keines: die
    // erste Tabelle stünde ohne die zweite, und die Sperre, die den
    // Versand aufhält, wäre genau die, die fehlt.
    const begin = sql.indexOf('BEGIN;')
    const ersteAnweisung = sql.indexOf('CREATE TABLE')
    expect(begin).toBeGreaterThanOrEqual(0)
    expect(begin).toBeLessThan(ersteAnweisung)
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true)
  })

  it('hat ein Rollback', () => {
    const rb = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20261005000001_rollback_pilot_send_gate.sql'), 'utf8')
    expect(rb).toContain('DROP TABLE IF EXISTS public.pilot_send_gate')
    expect(rb).toContain('DROP TABLE IF EXISTS public.pilot_versand_sperre')
  })
})
