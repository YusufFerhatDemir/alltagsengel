// ═══════════════════════════════════════════════════════════════════════
// NACHPRÜFUNG NACH EINEM ECHTEN VERSAND
//
// Der Versandweg meldet „versendet", sobald Resend die Mail angenommen hat.
// Was danach passiert — Protokollzeile, Zustellspur, Audit-Eintrag,
// `sent_at` — steht in vier getrennten Schreibvorgängen, von denen jeder
// einzeln scheitern kann, ohne den Rückgabewert zu ändern.
//
// Diese Suite gibt jedem der acht Prüfpunkte einen Fall, der ihn AUSLÖST,
// und die Gegenprobe, dass er im Normalfall bestanden ist. Ohne die
// Gegenprobe wäre nicht unterscheidbar, ob ein Punkt anschlägt, weil er
// greift, oder weil er immer anschlägt.
//
// Dazu die Eigenschaft, an der alles hängt: JEDE Abweichung — auch ein
// nicht prüfbarer Punkt — setzt eine P0-Sperre und entwertet offene
// Freigaben.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'

import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'
import {
  pruefeNachVersand,
  nachpruefungAlsText,
  type NachpruefErgebnis,
  type NachpruefSchluessel,
} from '@/lib/pilot/post-send-verification'

const ORG = '00000000-0000-4000-8000-000000000042'
const FREMDE_ORG = '00000000-0000-4000-8000-000000000099'
const INV = '00000000-0000-4000-8000-0000000000cc'
const AKTEUR = '00000000-0000-4000-8000-00000000a001'
const JETZT = new Date('2026-08-26T12:00:00.000Z')

const EMPFAENGER = 'erika.schmidt@web.de'
const BETREFF = 'Ihre Rechnung RE-2026-0001'
const MESSAGE_ID = 'resend-4711'
const BETRAG_CENT = 15050

const LOG_OK = {
  id: 'log-1',
  organization_id: ORG,
  status: 'versendet',
  empfaenger_email: EMPFAENGER,
  betreff: BETREFF,
  provider_message_id: MESSAGE_ID,
  versendet_am: '2026-08-26T11:59:00.000Z',
  versuch: 1,
}

const ZUSTELL_OK = {
  id: 'zu-1',
  organization_id: ORG,
  status: 'sent',
  attempt_count: 1,
  provider_message_id: MESSAGE_ID,
}

const RECHNUNG_OK = {
  id: INV,
  organization_id: ORG,
  sent_at: '2026-08-26T11:59:01.000Z',
  total_amount: 150.5,
  status: 'freigegeben',
}

interface Lage {
  emailLog?: Record<string, unknown>[]
  emailLogFehler?: string
  zustellung?: Record<string, unknown>[]
  zustellungFehler?: string
  rechnung?: Record<string, unknown> | null
  rechnungFehler?: string
  auditZahl?: number
  auditFehler?: string
  /** Fehler beim Setzen der Sperre. */
  sperreFehler?: string
  /** Antwort des Entwertungs-UPDATE. */
  entwertet?: Record<string, unknown>[]
  entwertungFehler?: string
}

function db(lage: Lage = {}) {
  return (a: FakeAufruf) => {
    switch (a.tabelle) {
      case 'invoice_email_log':
        return lage.emailLogFehler
          ? { error: { message: lage.emailLogFehler } }
          : { data: lage.emailLog ?? [LOG_OK] }
      case 'notification_delivery_log':
        return lage.zustellungFehler
          ? { error: { message: lage.zustellungFehler } }
          : { data: lage.zustellung ?? [ZUSTELL_OK] }
      case 'invoices':
        return lage.rechnungFehler
          ? { error: { message: lage.rechnungFehler } }
          : { data: lage.rechnung === undefined ? RECHNUNG_OK : lage.rechnung }
      case 'billing_audit_trail':
        return lage.auditFehler
          ? { error: { message: lage.auditFehler } }
          : { count: lage.auditZahl ?? 1, data: { id: 'audit-1' } }
      case 'pilot_versand_sperre':
        return lage.sperreFehler ? { error: { message: lage.sperreFehler } } : { data: { id: 'sperre-1' } }
      case 'pilot_send_gate':
        return lage.entwertungFehler
          ? { error: { message: lage.entwertungFehler } }
          : { data: lage.entwertet ?? [] }
      default:
        return { data: [] }
    }
  }
}

async function nachpruefen(
  lage: Lage = {},
  extra: Partial<Parameters<typeof pruefeNachVersand>[1]> = {},
) {
  const fake = erstelleFakeSupabase(db(lage))
  const ergebnis = await pruefeNachVersand(fake.client, {
    invoiceId: INV, organizationId: ORG, actorId: AKTEUR,
    versandStatus: 'versendet',
    providerMessageId: MESSAGE_ID,
    empfaenger: EMPFAENGER,
    betreff: BETREFF,
    betragCents: BETRAG_CENT,
    jetzt: JETZT,
    ...extra,
  })
  return { ergebnis, fake }
}

function punkt(e: NachpruefErgebnis, schluessel: NachpruefSchluessel) {
  return e.punkte.find(p => p.schluessel === schluessel)!
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Der bestätigte Fall
// ═══════════════════════════════════════════════════════════════════════

describe('Grundlage', () => {
  it('ein sauberer Versand wird bestätigt', async () => {
    const { ergebnis } = await nachpruefen()
    // Fällt dieser Test, schlägt irgendein Punkt grundlos an — dann sind
    // alle folgenden Auslöse-Tests wertlos.
    expect(ergebnis.abweichungen).toEqual([])
    expect(ergebnis.urteil).toBe('BESTAETIGT')
  })

  it('liefert immer alle acht Punkte', async () => {
    const { ergebnis } = await nachpruefen()
    expect(ergebnis.punkte.map(p => p.schluessel)).toEqual([
      'resend_erfolg', 'message_id', 'protokoll_genau_eins', 'keine_retry_dublette',
      'empfaenger_betreff_betrag', 'audit_eintrag', 'rechnungsstatus', 'keine_fremde_organisation',
    ])
  })

  it('ein bestätigter Lauf schreibt nichts', async () => {
    const { fake } = await nachpruefen()
    expect(fake.aufrufe.filter(a => a.operation !== 'select')).toEqual([])
    expect(fake.auf('pilot_versand_sperre')).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Die acht Punkte einzeln
// ═══════════════════════════════════════════════════════════════════════

describe('1. Resend-Erfolg', () => {
  it('schlägt an, wenn der Versand übersprungen wurde', async () => {
    const { ergebnis } = await nachpruefen({}, { versandStatus: 'uebersprungen' })
    expect(punkt(ergebnis, 'resend_erfolg').bestanden).toBe(false)
  })

  it('schlägt an, wenn der Versand fehlschlug', async () => {
    const { ergebnis } = await nachpruefen({}, { versandStatus: 'fehlgeschlagen' })
    expect(punkt(ergebnis, 'resend_erfolg').bestanden).toBe(false)
  })
})

describe('2. Provider-Kennung', () => {
  it('schlägt an, wenn gar keine Kennung vorliegt', async () => {
    const { ergebnis } = await nachpruefen({}, { providerMessageId: null })
    expect(punkt(ergebnis, 'message_id').bestanden).toBe(false)
  })

  it('schlägt an, wenn die Kennung in keiner Protokollzeile steht', async () => {
    const { ergebnis } = await nachpruefen({ emailLog: [{ ...LOG_OK, provider_message_id: null }] })
    expect(punkt(ergebnis, 'message_id').bestanden).toBe(false)
  })

  it('schlägt an, wenn Protokoll und Antwort verschiedene Kennungen tragen', async () => {
    // Dann gehört das Protokoll zu einem ANDEREN Versand — der
    // gefährlichste der drei Fälle.
    const { ergebnis } = await nachpruefen({ emailLog: [{ ...LOG_OK, provider_message_id: 'resend-9999' }] })
    const p = punkt(ergebnis, 'message_id')
    expect(p.bestanden).toBe(false)
    expect(p.befund).toContain('anderen Versand')
  })

  it('ist nicht prüfbar, wenn das Protokoll nicht lesbar ist', async () => {
    const { ergebnis } = await nachpruefen({ emailLogFehler: 'permission denied' })
    expect(punkt(ergebnis, 'message_id').bestanden).toBeNull()
  })
})

describe('3. Genau ein Protokolleintrag', () => {
  it('schlägt an, wenn gar keiner da ist', async () => {
    const { ergebnis } = await nachpruefen({ emailLog: [] })
    const p = punkt(ergebnis, 'protokoll_genau_eins')
    expect(p.bestanden).toBe(false)
    expect(p.befund).toContain('unversendet')
  })

  it('schlägt an, wenn zwei Erfolgszeilen da sind', async () => {
    const { ergebnis } = await nachpruefen({ emailLog: [LOG_OK, { ...LOG_OK, id: 'log-2', versuch: 2 }] })
    expect(punkt(ergebnis, 'protokoll_genau_eins').bestanden).toBe(false)
  })

  it('zählt fehlgeschlagene Zeilen nicht mit', async () => {
    // Ein gescheiterter Vorversuch ist kein zweiter Versand.
    const { ergebnis } = await nachpruefen({
      emailLog: [{ ...LOG_OK, id: 'log-0', status: 'fehlgeschlagen', provider_message_id: null }, LOG_OK],
    })
    expect(punkt(ergebnis, 'protokoll_genau_eins').bestanden).toBe(true)
  })
})

describe('4. Keine Retry-Dublette', () => {
  it('schlägt an bei zwei Erfolgszeilen in der Zustellspur', async () => {
    const { ergebnis } = await nachpruefen({ zustellung: [ZUSTELL_OK, { ...ZUSTELL_OK, id: 'zu-2' }] })
    expect(punkt(ergebnis, 'keine_retry_dublette').bestanden).toBe(false)
  })

  it('schlägt an, wenn die Erfolgszeile einen zweiten Versuch trägt', async () => {
    const { ergebnis } = await nachpruefen({ zustellung: [{ ...ZUSTELL_OK, attempt_count: 2 }] })
    const p = punkt(ergebnis, 'keine_retry_dublette')
    expect(p.bestanden).toBe(false)
    expect(p.befund).toContain('attempt_count 2')
  })

  it('schlägt an, wenn gar keine Erfolgszeile da ist', async () => {
    const { ergebnis } = await nachpruefen({ zustellung: [] })
    expect(punkt(ergebnis, 'keine_retry_dublette').bestanden).toBe(false)
  })

  it('akzeptiert eine „delivered"-Zeile genauso wie „sent"', async () => {
    const { ergebnis } = await nachpruefen({ zustellung: [{ ...ZUSTELL_OK, status: 'delivered' }] })
    expect(punkt(ergebnis, 'keine_retry_dublette').bestanden).toBe(true)
  })
})

describe('5. Empfänger, Betreff, Betrag', () => {
  it('schlägt an bei abweichendem Empfänger', async () => {
    const { ergebnis } = await nachpruefen({ emailLog: [{ ...LOG_OK, empfaenger_email: 'jemand.anderes@web.de' }] })
    expect(punkt(ergebnis, 'empfaenger_betreff_betrag').bestanden).toBe(false)
  })

  it('schlägt an bei abweichendem Betreff', async () => {
    const { ergebnis } = await nachpruefen({ emailLog: [{ ...LOG_OK, betreff: 'Etwas ganz anderes' }] })
    expect(punkt(ergebnis, 'empfaenger_betreff_betrag').bestanden).toBe(false)
  })

  it('schlägt an bei abweichendem Betrag', async () => {
    // total_amount steht in EURO, nicht in Cent — der Vergleich muss
    // umrechnen, sonst wäre jeder Versand eine Abweichung.
    const { ergebnis } = await nachpruefen({ rechnung: { ...RECHNUNG_OK, total_amount: 99.99 } })
    const p = punkt(ergebnis, 'empfaenger_betreff_betrag')
    expect(p.bestanden).toBe(false)
    expect(p.befund).toContain('9999')
  })

  it('rechnet Euro korrekt in Cent um', async () => {
    const { ergebnis } = await nachpruefen({ rechnung: { ...RECHNUNG_OK, total_amount: 150.5 } })
    expect(punkt(ergebnis, 'empfaenger_betreff_betrag').bestanden).toBe(true)
  })

  it('Groß-/Kleinschreibung im Empfänger ist keine Abweichung', async () => {
    const { ergebnis } = await nachpruefen({ emailLog: [{ ...LOG_OK, empfaenger_email: 'Erika.Schmidt@WEB.de' }] })
    expect(punkt(ergebnis, 'empfaenger_betreff_betrag').bestanden).toBe(true)
  })
})

describe('6. Audit-Eintrag', () => {
  it('schlägt an, wenn kein Eintrag existiert', async () => {
    const { ergebnis } = await nachpruefen({ auditZahl: 0 })
    expect(punkt(ergebnis, 'audit_eintrag').bestanden).toBe(false)
  })

  it('sucht gezielt nach der Versand-Aktion, nicht nach irgendeinem Eintrag', async () => {
    const { fake } = await nachpruefen()
    const a = fake.auf('billing_audit_trail').find(x => x.operation === 'select' && x.head)!
    expect(hatFilter(a, 'eq', 'entity_id', INV)).toBe(true)
    expect(hatFilter(a, 'eq', 'action', 'email_versendet')).toBe(true)
    expect(hatFilter(a, 'eq', 'organization_id', ORG)).toBe(true)
  })

  it('ist nicht prüfbar, wenn der Trail nicht lesbar ist', async () => {
    const { ergebnis } = await nachpruefen({ auditFehler: 'permission denied' })
    expect(punkt(ergebnis, 'audit_eintrag').bestanden).toBeNull()
  })
})

describe('7. Rechnungsstatus', () => {
  it('schlägt an, wenn sent_at leer geblieben ist', async () => {
    // Genau der Zustand, aus dem ein Doppelversand entsteht.
    const { ergebnis } = await nachpruefen({ rechnung: { ...RECHNUNG_OK, sent_at: null } })
    const p = punkt(ergebnis, 'rechnungsstatus')
    expect(p.bestanden).toBe(false)
    expect(p.befund).toContain('Doppelversand')
  })

  it('schlägt an, wenn die Rechnung unter diesem Mandanten nicht existiert', async () => {
    const { ergebnis } = await nachpruefen({ rechnung: null })
    expect(punkt(ergebnis, 'rechnungsstatus').bestanden).toBe(false)
  })
})

describe('8. Keine fremde Organisation', () => {
  it('schlägt an, wenn eine Protokollzeile zu einem anderen Mandanten gehört', async () => {
    const { ergebnis } = await nachpruefen({ emailLog: [{ ...LOG_OK, organization_id: FREMDE_ORG }] })
    expect(punkt(ergebnis, 'keine_fremde_organisation').bestanden).toBe(false)
  })

  it('schlägt an, wenn eine Zustellzeile zu einem anderen Mandanten gehört', async () => {
    const { ergebnis } = await nachpruefen({ zustellung: [{ ...ZUSTELL_OK, organization_id: FREMDE_ORG }] })
    expect(punkt(ergebnis, 'keine_fremde_organisation').bestanden).toBe(false)
  })

  // Das ist der Kern des Punkts: würde org-gefiltert gelesen, wäre eine
  // fremde Zeile unsichtbar — und genau die will man finden.
  it('liest die Protokolle bewusst OHNE Mandantenfilter', async () => {
    const { fake } = await nachpruefen()
    const log = fake.ersterAuf('invoice_email_log')!
    expect(hatFilter(log, 'eq', 'invoice_id', INV)).toBe(true)
    expect(hatFilter(log, 'eq', 'organization_id', ORG)).toBe(false)

    const zu = fake.ersterAuf('notification_delivery_log')!
    expect(hatFilter(zu, 'eq', 'correlation_id', INV)).toBe(true)
    expect(hatFilter(zu, 'eq', 'organization_id', ORG)).toBe(false)
  })

  it('die Rechnung wird dagegen sehr wohl org-gefenced gelesen', async () => {
    const { fake } = await nachpruefen()
    expect(hatFilter(fake.ersterAuf('invoices'), 'eq', 'organization_id', ORG)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Fail-closed: jede Abweichung sperrt
// ═══════════════════════════════════════════════════════════════════════

describe('Sperre bei Abweichung', () => {
  it('eine einzige Abweichung genügt für P0', async () => {
    const { ergebnis, fake } = await nachpruefen({ auditZahl: 0 })
    expect(ergebnis.urteil).toBe('ABWEICHUNG')
    expect(ergebnis.sperreGesetzt).toBe(true)
    const insert = fake.ersterAuf('pilot_versand_sperre', 'insert')!
    expect((insert.payload as Record<string, unknown>).schwere).toBe('P0')
  })

  it('ein NICHT PRÜFBARER Punkt zählt wie eine Abweichung', async () => {
    // Der Sinn der Nachprüfung ist zu BESTÄTIGEN. Ein unbestätigter
    // Versand ist kein bestätigter.
    const { ergebnis } = await nachpruefen({ auditFehler: 'permission denied' })
    expect(ergebnis.urteil).toBe('ABWEICHUNG')
    expect(ergebnis.sperreGesetzt).toBe(true)
  })

  it('die Sperre gilt nur für diese Rechnung, wenn kein fremder Mandant im Spiel ist', async () => {
    const { fake } = await nachpruefen({ auditZahl: 0 })
    const payload = fake.ersterAuf('pilot_versand_sperre', 'insert')!.payload as Record<string, unknown>
    expect(payload.invoice_id).toBe(INV)
    expect(payload.organization_id).toBe(ORG)
  })

  it('eine fremde Organisation sperrt mandantenweit, nicht nur diesen Beleg', async () => {
    const { fake } = await nachpruefen({ emailLog: [{ ...LOG_OK, organization_id: FREMDE_ORG }] })
    const payload = fake.ersterAuf('pilot_versand_sperre', 'insert')!.payload as Record<string, unknown>
    expect(payload.invoice_id).toBeNull()
  })

  it('die Sperre trägt die Einzelbefunde, damit sie begründbar bleibt', async () => {
    const { fake } = await nachpruefen({ auditZahl: 0, rechnung: { ...RECHNUNG_OK, sent_at: null } })
    const befunde = (fake.ersterAuf('pilot_versand_sperre', 'insert')!.payload as { befunde: unknown[] }).befunde
    expect(befunde.length).toBe(2)
    expect(befunde.map(b => (b as { schluessel: string }).schluessel)).toContain('audit_eintrag')
  })

  it('entwertet offene Einmal-Freigaben', async () => {
    const { ergebnis, fake } = await nachpruefen({ auditZahl: 0, entwertet: [{ id: 'gate-1' }] })
    expect(ergebnis.entwerteteFreigaben).toBe(1)
    const upd = fake.ersterAuf('pilot_send_gate', 'update')!
    expect(hatFilter(upd, 'is', 'verbraucht_am', null)).toBe(true)
  })

  it('meldet es laut, wenn die Sperre selbst nicht gesetzt werden konnte', async () => {
    // Der schwerste denkbare Zustand: etwas ist schiefgegangen UND nichts
    // hält den nächsten Versand auf.
    const { ergebnis } = await nachpruefen({ auditZahl: 0, sperreFehler: 'permission denied' })
    expect(ergebnis.sperreGesetzt).toBe(false)
    expect(ergebnis.sperreFehlgeschlagen).toBe(true)
  })

  it('heilt nichts — kein Nachsetzen von sent_at, kein Aufräumen von Dubletten', async () => {
    const { fake } = await nachpruefen({
      rechnung: { ...RECHNUNG_OK, sent_at: null },
      emailLog: [LOG_OK, { ...LOG_OK, id: 'log-2' }],
    })
    // Geschrieben werden ausschließlich Sperre, Entwertung und Audit.
    const erlaubt = new Set(['pilot_versand_sperre', 'pilot_send_gate', 'billing_audit_trail'])
    for (const a of fake.aufrufe.filter(a => a.operation !== 'select')) {
      expect(erlaubt.has(a.tabelle), `schreibt in ${a.tabelle}`).toBe(true)
    }
    expect(fake.auf('invoices').every(a => a.operation === 'select')).toBe(true)
    expect(fake.auf('invoice_email_log').every(a => a.operation === 'select')).toBe(true)
  })

  it('ein Audit-Fehler reißt die Nachprüfung nicht mit', async () => {
    // Der Versand ist bereits passiert — ein geworfener Audit-Fehler
    // dürfte den Aufrufer nicht in einen Fehlerpfad schicken.
    const fake = erstelleFakeSupabase(a => {
      if (a.tabelle === 'billing_audit_trail' && a.operation === 'insert') throw new Error('audit kaputt')
      return db({ auditZahl: 0 })(a)
    })
    const ergebnis = await pruefeNachVersand(fake.client, {
      invoiceId: INV, organizationId: ORG, actorId: AKTEUR,
      versandStatus: 'versendet', providerMessageId: MESSAGE_ID,
      empfaenger: EMPFAENGER, betreff: BETREFF, betragCents: BETRAG_CENT, jetzt: JETZT,
    })
    expect(ergebnis.urteil).toBe('ABWEICHUNG')
    expect(ergebnis.sperreGesetzt).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Textfassung
// ═══════════════════════════════════════════════════════════════════════

describe('Textfassung', () => {
  it('trägt das Urteil in Zeile 1', async () => {
    const { ergebnis } = await nachpruefen()
    expect(nachpruefungAlsText(ergebnis).split('\n')[0]).toContain('BESTÄTIGT')
  })

  it('nennt bei Abweichung die Anzahl und die gesetzte Sperre', async () => {
    const { ergebnis } = await nachpruefen({ auditZahl: 0 })
    const text = nachpruefungAlsText(ergebnis)
    expect(text).toContain('ABWEICHUNG (P0)')
    expect(text).toContain('P0-Versandsperre ist gesetzt')
  })

  it('warnt ausdrücklich, wenn die Sperre nicht gesetzt werden konnte', async () => {
    const { ergebnis } = await nachpruefen({ auditZahl: 0, sperreFehler: 'permission denied' })
    expect(nachpruefungAlsText(ergebnis)).toContain('VON HAND gestoppt')
  })

  it('nennt alle acht Punkte', async () => {
    const { ergebnis } = await nachpruefen()
    const text = nachpruefungAlsText(ergebnis)
    for (const p of ergebnis.punkte) expect(text).toContain(p.titel)
  })
})
