/**
 * Verworfene Abfragefehler — die Restliste aus `lint:leerzustand --bericht`
 * ========================================================================
 *
 * Die Vorrunde hat die vier Geldweg-Fail-opens geschlossen (Mahntor,
 * Gutschriftdeckel, SEPA-Doppeleinzug, XRechnung) — siehe
 * `fail-open-verworfene-abfragefehler.test.ts`. Uebrig blieben 19 Stellen
 * derselben Form, an denen der verworfene Fehler nicht die Freigabe kippt,
 * sondern etwas anderes anrichtet:
 *
 *   - er geht in eine AUSGEHENDE DATEI (EDIFACT an die Pflegekasse,
 *     Leistungsnachweis-PDF): eine Rechnung ohne Positionen, ein Nachweis
 *     ohne Handzeichen,
 *   - er wird DAUERHAFT GESCHRIEBEN (Fehlercode-Kategorie in der
 *     Wiedervorlage, Lauf-Status im DAKOTA-Versand),
 *   - er wird zur AUSKUNFT AN EINEN MENSCHEN (Angehoerigenportal,
 *     Vertragsstand im Coach-Abo, Aenderungsverlauf eines Nachweises).
 *
 * Jeder Test stellt genau EINE Abfrage auf Fehler und prueft, dass daraus
 * kein Ergebnis wird. Die Gegenprobe — dieselbe Abfrage sauber und leer —
 * steht jeweils daneben; ohne sie kaeme ein Pruefling durch, der einfach
 * immer abbricht, und der waere genauso unbrauchbar.
 */
import { describe, it, expect } from 'vitest'
import { erstelleFakeSupabase, type FakeAufruf } from './helpers/supabase-fake'

const ORG = '22222222-2222-4222-8222-222222222222'
const FEHLER = { message: 'Verbindung unterbrochen', code: '08006' }

// ════════════════════════════════════════════════════════════════════
// EDIFACT-Export — die Datei, die die Forderung bei der Kasse anmeldet
// ════════════════════════════════════════════════════════════════════

/**
 * Gesunder Export-Durchlauf bis auf die eine Tabelle in `kaputt`.
 * `nr` grenzt bei mehrfach gelesenen Tabellen den einzelnen Aufruf ab.
 */
function exportFake(kaputt: { tabelle: string; nr?: number } | null) {
  const stoert = (a: FakeAufruf) =>
    kaputt !== null
    && a.tabelle === kaputt.tabelle
    && (kaputt.nr === undefined || a.nr === kaputt.nr)

  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (stoert(a)) return { error: FEHLER, data: null, count: null }

    switch (a.tabelle) {
      case 'abrechnungslaeufe':
        return { data: {
          id: 'lauf-1', status: 'freigegeben', organization_id: ORG,
          abrechnungsmonat: '2026-07-01', lauf_nummer: 1,
          gesamtbetrag_cent: 10_000, anzahl_rechnungen: 1,
        } }
      case 'dta_lauf_rechnungen':
        return { data: [{ invoice_id: 'inv-1', betrag_cent: 10_000 }] }
      case 'invoices':
        // nr 0 = Sammelabfrage, nr>0 = Kostentraeger-Nachschlag je Rechnung.
        return a.nr === 0
          ? { data: [{
              id: 'inv-1', client_id: 'client-1', invoice_number_formatted: 'RE-1',
              total_amount: 100, period_start: '2026-07-01', period_end: '2026-07-31',
            }] }
          : { data: { kostentraeger_ik: '999999999', kostentraeger_name: 'AOK' } }
      case 'clients':
        return { data: [{
          id: 'client-1', first_name: 'Erika', last_name: 'Mustermann',
          versichertennummer: 'A123456789', geburtsdatum: '1940-01-01',
          care_level: 3, pflegegrad: null, pflegekasse_ik: '999999999',
          address: 'Weg 1', city: 'Frankfurt', zip_code: '60311',
        }] }
      case 'verordnungen':
        return { data: [{
          id: 'vo-1', client_id: 'client-1',
          kostentraeger_ik_nummer: '999999999', kostentraeger_name: 'AOK',
        }] }
      case 'service_records':
        return { data: [{
          id: 'sr-1', client_id: 'client-1', date: '2026-07-05',
          service_type: 'alltagsbegleitung_45a', duration_minutes: 60,
          amount: 100, caregiver_id: 'cg-1', proof_status: 'signiert',
          billing_status: 'offen', caregiver: { first_name: 'Anna', last_name: 'Engel' },
        }] }
      default:
        return { data: [] }
    }
  })
}

async function exportiere(kaputt: { tabelle: string; nr?: number } | null) {
  const { exportiereLauf } = await import('@/lib/abrechnung/kassenabrechnung-engine')
  const fake = exportFake(kaputt)
  return { fake, lauf: exportiereLauf(fake.client as never, 'lauf-1', '123456789', 'actor-1', ORG) }
}

describe('EDIFACT-Export: keine halbe Datei aus einer gescheiterten Abfrage', () => {
  it('bricht ab, wenn die Leistungen nicht lesbar sind', async () => {
    // Der teuerste Fall dieser Gruppe: `records` wurde zur leeren Liste und
    // jeder Fall ging mit null Positionen — aber mit Rechnungsbetrag — an
    // die Kasse.
    const { lauf } = await exportiere({ tabelle: 'service_records' })
    await expect(lauf).rejects.toThrow(/Leistungen konnten nicht geladen werden/i)
  })

  it('bricht ab, wenn die Klientendaten nicht lesbar sind', async () => {
    // Ohne Klienten blieb `clientMap` leer, jeder Fall wurde per
    // `if (!client) continue` uebersprungen — der Export meldete Erfolg
    // mit null Faellen.
    const { lauf } = await exportiere({ tabelle: 'clients' })
    await expect(lauf).rejects.toThrow(/Klientendaten konnten nicht geladen werden/i)
  })

  it('bricht ab, wenn die Verordnungen nicht lesbar sind', async () => {
    // Sonst faellt der Fall stillschweigend auf einen anderen
    // Kostentraeger zurueck — die Forderung ginge an die falsche Kasse.
    const { lauf } = await exportiere({ tabelle: 'verordnungen' })
    await expect(lauf).rejects.toThrow(/Verordnungen konnten nicht geladen werden/i)
  })

  it('bricht ab, wenn die Rechnungsdaten nicht lesbar sind', async () => {
    const { lauf } = await exportiere({ tabelle: 'invoices', nr: 0 })
    await expect(lauf).rejects.toThrow(/Rechnungsdaten konnten nicht geladen werden/i)
  })

  it('Gegenprobe: der gesunde Durchlauf kommt ueber diese vier Abfragen hinaus', async () => {
    // Der Export scheitert danach an Dingen, die dieser Doppelgaenger nicht
    // stellt (Zertifikat, Annahmestelle, Dateiablage). Entscheidend ist,
    // dass KEINE der vier neuen Meldungen faellt — sonst blockierte die
    // Haertung den Normalfall.
    const { lauf } = await exportiere(null)
    const fehler = await lauf.then(() => null, (e: Error) => e)
    if (fehler) {
      expect(fehler.message).not.toMatch(
        /(Leistungen|Klientendaten|Verordnungen|Rechnungsdaten) konnten nicht geladen werden/i,
      )
    }
  })
})

// ════════════════════════════════════════════════════════════════════
// Leistungsnachweis-PDF — das Blatt, das die Kasse als Nachweis bekommt
// ════════════════════════════════════════════════════════════════════

function nachweisFake(kaputt: string | null) {
  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle === kaputt) return { error: FEHLER, data: null, count: null }
    switch (a.tabelle) {
      case 'verordnungen':
        return { data: {
          id: 'vo-1', client_id: 'client-1', verordnung_type: '45a',
          leistungsart: 'alltagsbegleitung_45a', genehmigung_status: 'genehmigt',
          genehmigung_aktenzeichen: 'AZ-1', genehmigung_bis: '2026-12-31',
          kostentraeger_name: 'AOK', kostentraeger_ik_nummer: '999999999',
          abtretungserklaerung_vorhanden: true,
        } }
      case 'clients':
        return { data: {
          id: 'client-1', organization_id: ORG, first_name: 'Erika',
          last_name: 'Mustermann', date_of_birth: '1940-01-01', care_level: 3,
          address: 'Weg 1', zip_code: '60311', city: 'Frankfurt',
          insurance_name: 'AOK', insurance_number: 'A1',
          versichertennummer: 'A123456789', pflegekasse_name: 'AOK',
          pflegekasse_ik: '999999999',
        } }
      case 'service_records':
        return { data: [{
          id: 'sr-1', date: '2026-07-05', start_time: '09:00:00',
          end_time: '10:00:00', duration_minutes: 60,
          service_type: 'alltagsbegleitung_45a', amount: 100, status: 'signed',
          proof_status: 'signiert', billing_status: 'offen',
          client_signature: null, caregiver_initials: null, verordnung_id: 'vo-1',
        }] }
      case 'service_signatures':
        return { data: [{ service_record_id: 'sr-1', signer_role: 'client' }] }
      case 'organizations':
        // Ohne eigene IK bricht getOrgIK ab, bevor die Gegenprobe etwas
        // ueber die Unterschriften aussagen kann.
        return { data: { ik_nummer: '123456789', name: 'Alltagsengel' } }
      case 'leistungspreise':
      case 'billing_tariffs':
        return { data: [{
          leistungsart: 'alltagsbegleitung_45a', preis_cent: 3000,
          gueltig_ab: '2026-01-01', gueltig_bis: null,
          tarif_status: 'verifiziert', verifizierungs_quelle: 'Landesrahmenvertrag',
        }] }
      default:
        return { data: [] }
    }
  })
}

describe('Leistungsnachweis-PDF: fehlendes Handzeichen ist eine Aussage', () => {
  it('bricht ab, wenn die Unterschriften nicht lesbar sind', async () => {
    // Sonst traegt jede Zeile des Nachweises „kein Handzeichen" — und
    // genau dieses Blatt legt die Kasse der Pruefung zugrunde.
    const { loadLeistungsnachweis } = await import('@/lib/abrechnung/leistungsnachweis-pdf')
    const fake = nachweisFake('service_signatures')
    await expect(loadLeistungsnachweis({
      verordnung_id: 'vo-1', monat: '2026-07', supabase: fake.client as never,
    })).rejects.toThrow(/Unterschriften konnten nicht geladen werden/i)
  })

  it('Gegenprobe: eine vorhandene Unterschrift erscheint als Handzeichen', async () => {
    const { loadLeistungsnachweis } = await import('@/lib/abrechnung/leistungsnachweis-pdf')
    const fake = nachweisFake(null)
    const d = await loadLeistungsnachweis({
      verordnung_id: 'vo-1', monat: '2026-07', supabase: fake.client as never,
    })
    expect(d.einsaetze).toHaveLength(1)
    expect(d.einsaetze[0].handzeichen_klient).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════════
// SGB-V-Vollstaendigkeit — „keine Verordnung" ist ein Befund, kein Ausfall
// ════════════════════════════════════════════════════════════════════

describe('HKP-Vollstaendigkeit: ein Abfrageausfall ist kein Datenproblem', () => {
  const leistung = {
    id: 'sr-1', client_id: 'client-1', verordnung_id: 'vo-1',
    date: '2026-07-05', amount: 100, proof_status: 'signiert',
    billing_status: 'offen', status: 'signed',
  }

  it('bricht ab, statt jede Leistung als "keine_verordnung" zu melden', async () => {
    const { pruefeVollstaendigkeit } = await import('@/lib/abrechnung/sgb-v/leistungsnachweis-service')
    const fake = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'service_records') return { data: [leistung] }
      if (a.tabelle === 'verordnungen') return { error: FEHLER, data: null }
      return { data: [] }
    })
    await expect(pruefeVollstaendigkeit(fake.client as never, ORG, '2026-07-01', '2026-07-31'))
      .rejects.toThrow(/Verordnungen konnten nicht geladen werden/i)
  })

  it('Gegenprobe: eine wirklich fehlende Verordnung bleibt der Befund "keine_verordnung"', async () => {
    const { pruefeVollstaendigkeit } = await import('@/lib/abrechnung/sgb-v/leistungsnachweis-service')
    const fake = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'service_records') return { data: [leistung] }
      return { data: [] }
    })
    const e = await pruefeVollstaendigkeit(fake.client as never, ORG, '2026-07-01', '2026-07-31')
    expect(e).toHaveLength(1)
    expect(e[0].probleme).toContain('keine_verordnung')
  })
})

// ════════════════════════════════════════════════════════════════════
// Monatsabschluss — Unterschriften und Namen
// ════════════════════════════════════════════════════════════════════

function abschlussFake(kaputt: string | null) {
  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle === kaputt) return { error: FEHLER, data: null, count: null }
    switch (a.tabelle) {
      case 'verordnungen':
        return { data: [{
          id: 'vo-1', client_id: 'client-1', verordnung_type: '45a',
          leistungsart: 'alltagsbegleitung_45a', genehmigung_status: 'genehmigt',
          genehmigung_aktenzeichen: 'AZ-1', gueltig_von: '2026-01-01',
          gueltig_bis: '2026-12-31', genehmigung_bis: '2026-12-31',
          abtretungserklaerung_vorhanden: true, kostentraeger_ik_nummer: '999999999',
        }] }
      case 'clients':
        return { data: [{ id: 'client-1', first_name: 'Erika', last_name: 'Mustermann' }] }
      case 'service_records':
        return { data: [{
          id: 'sr-1', verordnung_id: 'vo-1', client_id: 'client-1',
          date: '2026-07-05', duration_minutes: 60,
          service_type: 'alltagsbegleitung_45a', amount: 100, status: 'signed',
          client_signature: null, proof_status: 'signiert', billing_status: 'offen',
        }] }
      case 'service_signatures':
        return { data: [{ service_record_id: 'sr-1' }] }
      default:
        return { data: [] }
    }
  })
}

describe('Monatsabschluss: „nicht unterschrieben" wird nicht aus einem Ausfall abgeleitet', () => {
  it('bricht ab, wenn die Unterschriften nicht lesbar sind', async () => {
    // Sonst meldet der Abschluss Einsaetze als nachzuholen, deren
    // Unterschrift laengst vorliegt — und der Nachweis wird ein zweites
    // Mal beim Kunden eingeholt.
    const { erstelleMonatsabschluss } = await import('@/lib/abrechnung/monatsabschluss')
    await expect(erstelleMonatsabschluss('2026-07', abschlussFake('service_signatures').client as never, {
      bundesland: 'hessen', organizationId: ORG, dryRun: true,
    })).rejects.toThrow(/Unterschriften konnten nicht geladen werden/i)
  })

  it('bricht ab, wenn die Klienten nicht lesbar sind', async () => {
    const { erstelleMonatsabschluss } = await import('@/lib/abrechnung/monatsabschluss')
    await expect(erstelleMonatsabschluss('2026-07', abschlussFake('clients').client as never, {
      bundesland: 'hessen', organizationId: ORG, dryRun: true,
    })).rejects.toThrow(/Klienten konnten nicht geladen werden/i)
  })

  it('Gegenprobe: der gesunde Lauf zaehlt die Unterschrift und warnt nicht', async () => {
    const { erstelleMonatsabschluss } = await import('@/lib/abrechnung/monatsabschluss')
    const e = await erstelleMonatsabschluss('2026-07', abschlussFake(null).client as never, {
      bundesland: 'hessen', organizationId: ORG, dryRun: true,
    })
    expect(e.warnungen.some(w => /ohne Klienten-Unterschrift/.test(w.text))).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════════
// DAKOTA-Versand — ein Statuswechsel, der in die Datenbank geschrieben wird
// ════════════════════════════════════════════════════════════════════

describe('Lauf-Status: unbekannt ist nicht unvollstaendig', () => {
  const AUFTRAEGE = 'dta_dakota_auftraege'
  const LAEUFE = 'abrechnungslaeufe'

  it('schreibt gar nichts, wenn die Auftraege nicht lesbar sind', async () => {
    // Vorher wurde der Ausfall zu „es fehlen noch Auftraege" und stempelte
    // einen womoeglich vollstaendig uebermittelten Lauf auf
    // 'uebermittlung_laeuft' zurueck.
    const { aktualisiereLaufStatus } = await import('@/lib/abrechnung/versand')
    const fake = erstelleFakeSupabase((a: FakeAufruf) =>
      a.tabelle === AUFTRAEGE ? { error: FEHLER, data: null } : { data: [] })
    expect(await aktualisiereLaufStatus(fake.client as never, 'lauf-1', ORG)).toBe('unbekannt')
    expect(fake.auf(LAEUFE)).toHaveLength(0)
  })

  it('Gegenprobe: sind alle Auftraege draussen, gilt der Lauf als uebermittelt', async () => {
    const { aktualisiereLaufStatus } = await import('@/lib/abrechnung/versand')
    const fake = erstelleFakeSupabase((a: FakeAufruf) =>
      a.tabelle === AUFTRAEGE
        ? { data: [{ id: 'auf-1', status: 'uebermittelt' }] }
        : { data: [] })
    expect(await aktualisiereLaufStatus(fake.client as never, 'lauf-1', ORG)).toBe('uebermittelt')
    expect(fake.ersterAuf(LAEUFE, 'update')?.payload).toMatchObject({ status: 'uebermittelt' })
  })

  it('Gegenprobe: ein offener Auftrag haelt den Lauf auf unvollstaendig', async () => {
    // Teiluebermittlung ist kein Erfolg — dieser Zustand muss weiterhin
    // geschrieben werden, sonst haette die Haertung ihn mit erledigt.
    const { aktualisiereLaufStatus } = await import('@/lib/abrechnung/versand')
    const fake = erstelleFakeSupabase((a: FakeAufruf) =>
      a.tabelle === AUFTRAEGE
        ? { data: [
            { id: 'auf-1', status: 'uebermittelt' },
            { id: 'auf-2', status: 'offen' },
          ] }
        : { data: [] })
    expect(await aktualisiereLaufStatus(fake.client as never, 'lauf-1', ORG)).toBe('unvollstaendig')
    expect(fake.ersterAuf(LAEUFE, 'update')?.payload).toMatchObject({ status: 'uebermittlung_laeuft' })
  })
})

// ════════════════════════════════════════════════════════════════════
// Rueckläufer-Katalog — die Kategorie wird dauerhaft geschrieben
// ════════════════════════════════════════════════════════════════════

describe('Fehlercode-Katalog: kein stiller Rueckfall auf die Heuristik', () => {
  it('bricht ab, statt die Kategorie zu raten', async () => {
    // Die geratene Kategorie landete als Tatsache in dta_wiedervorlage —
    // ein falsch einsortierter Rueckläufer ist aus dem Arbeitsvorrat
    // verschwunden.
    const { klassifiziereFehlercode } = await import('@/lib/abrechnung/ruecklaeufer-fehlercodes')
    const fake = erstelleFakeSupabase(() => ({ error: FEHLER, data: null }))
    await expect(klassifiziereFehlercode(fake.client as never, ORG, '301', 'Syntaxfehler', '123456789'))
      .rejects.toThrow(/Katalog nicht abrufbar/i)
  })

  it('Gegenprobe: ein leerer Katalog fuehrt weiter auf die Heuristik', async () => {
    const { klassifiziereFehlercode } = await import('@/lib/abrechnung/ruecklaeufer-fehlercodes')
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    const k = await klassifiziereFehlercode(fake.client as never, ORG, 'T301', null, null)
    expect(k.herkunft).toBe('heuristik')
  })
})

// ════════════════════════════════════════════════════════════════════
// Coach-Abo — der Vertragsstand eines zahlenden Kunden
// ════════════════════════════════════════════════════════════════════

describe('Coach-Abo: „keine Bestellung" wird nicht aus einem Ausfall abgeleitet', () => {
  it('bricht ab, statt null zurueckzugeben', async () => {
    // `null` heisst an jeder Aufrufstelle „es liegt keine Bestellung vor":
    // der Kunde saehe kein Abo, keine Rechnungen, keinen Zugang — und
    // Widerruf wie Kuendigung liefen ins 404.
    const { massgeblicheBestellung } = await import('@/lib/coach/verkauf-server')
    const fake = erstelleFakeSupabase(() => ({ error: FEHLER, data: null }))
    await expect(massgeblicheBestellung(fake.client as never, 'coach-1'))
      .rejects.toThrow(/Vertragsstand konnte gerade nicht geladen werden/i)
  })

  it('nennt dem Kunden keinen Datenbanktext', async () => {
    const { massgeblicheBestellung } = await import('@/lib/coach/verkauf-server')
    const { UserFacingError } = await import('@/lib/api/user-facing-error')
    const fake = erstelleFakeSupabase(() => ({ error: FEHLER, data: null }))
    const err = await massgeblicheBestellung(fake.client as never, 'coach-1')
      .then(() => null, (e: unknown) => e)
    expect(err).toBeInstanceOf(UserFacingError)
    expect((err as Error).message).not.toMatch(/Verbindung unterbrochen|08006/)
  })

  it('Gegenprobe: ein Kunde ohne Bestellung bekommt weiter null', async () => {
    const { massgeblicheBestellung } = await import('@/lib/coach/verkauf-server')
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    expect(await massgeblicheBestellung(fake.client as never, 'coach-1')).toBeNull()
  })

  it('Gegenprobe: die bezahlte Bestellung schlaegt den offenen Checkout', async () => {
    const { massgeblicheBestellung } = await import('@/lib/coach/verkauf-server')
    const fake = erstelleFakeSupabase(() => ({ data: [
      { id: 'b-2', status: 'offen' },
      { id: 'b-1', status: 'aktiv' },
    ] }))
    const b = await massgeblicheBestellung(fake.client as never, 'coach-1')
    expect(b?.id).toBe('b-1')
  })
})

// ════════════════════════════════════════════════════════════════════
// WhatsApp-Eskalation — ein leerer Verlauf liest sich wie ein Erstkontakt
// ════════════════════════════════════════════════════════════════════

describe('Eskalationsmail: leerer Verlauf wird als nicht abrufbar benannt', () => {
  /** Faengt den Resend-Aufruf ab und gibt den Mailtext zurueck. */
  async function mailtext(senden: () => Promise<boolean>): Promise<string> {
    const alterKey = process.env.RESEND_API_KEY
    const altesFetch = globalThis.fetch
    process.env.RESEND_API_KEY = 'testschluessel'
    let text = ''
    globalThis.fetch = (async (_url: unknown, init: { body?: string } = {}) => {
      text = String(JSON.parse(init.body ?? '{}').text ?? '')
      return { ok: true, status: 200, text: async () => '' }
    }) as never
    try {
      await senden()
    } finally {
      globalThis.fetch = altesFetch
      if (alterKey === undefined) delete process.env.RESEND_API_KEY
      else process.env.RESEND_API_KEY = alterKey
    }
    return text
  }

  it('nennt den nicht abrufbaren Verlauf in der Eskalationsmail', async () => {
    // Ohne den Hinweis antwortet das Team dem Kunden, als gaebe es keinen
    // Vorlauf — bei einer medizinischen Eskalation der teuerste Irrtum.
    const { sendEscalationEmail } = await import('@/lib/whatsapp/escalation')
    const text = await mailtext(() => sendEscalationEmail({
      fromPhone: '+4915100000000', reason: 'medical', kind: 'medical',
      conversation: [], historieUnvollstaendig: true,
    }))
    expect(text).toMatch(/nicht abrufbar/i)
    expect(text).toMatch(/NICHT vollständig/i)
  })

  it('nennt ihn auch in der Entwurfsmail', async () => {
    const { sendDraftNotificationEmail } = await import('@/lib/whatsapp/escalation')
    const text = await mailtext(() => sendDraftNotificationEmail({
      fromPhone: '+4915100000000', customerMessage: 'Frage', botDraft: 'Entwurf',
      conversation: [], historieUnvollstaendig: true,
    }))
    expect(text).toMatch(/nicht abrufbar/i)
  })

  it('Gegenprobe: ein wirklich leerer Erstkontakt bekommt keinen Hinweis', async () => {
    const { sendEscalationEmail } = await import('@/lib/whatsapp/escalation')
    const text = await mailtext(() => sendEscalationEmail({
      fromPhone: '+4915100000000', reason: 'general', kind: 'general',
      conversation: [],
    }))
    expect(text).not.toMatch(/nicht abrufbar/i)
  })

  it('Gegenprobe: ein vorhandener Verlauf steht weiterhin vollstaendig in der Mail', async () => {
    const { sendEscalationEmail } = await import('@/lib/whatsapp/escalation')
    const text = await mailtext(() => sendEscalationEmail({
      fromPhone: '+4915100000000', reason: 'general', kind: 'general',
      conversation: [
        { direction: 'inbound', body: 'Erste Frage', created_at: '2026-07-01T10:00:00Z' },
        { direction: 'outbound', body: 'Erste Antwort', created_at: '2026-07-01T10:01:00Z' },
      ],
    }))
    expect(text).toContain('Erste Frage')
    expect(text).toContain('Erste Antwort')
    expect(text).not.toMatch(/nicht abrufbar/i)
  })
})

// ════════════════════════════════════════════════════════════════════
// Die Regel selbst — sie darf nicht ihre eigene Dokumentation zaehlen
// ════════════════════════════════════════════════════════════════════

describe('lint-leerzustand: Kommentare sind kein Code', () => {
  it('zaehlt ein Beispiel im Kommentar nicht als Treffer', async () => {
    // `lib/ui/ladelage.ts` erklaert im Kopfkommentar genau die Form, die es
    // verhindert — und stand deshalb als Treffer im eigenen Bericht.
    const { pruefeQuelle } = await import('../scripts/lint-leerzustand')
    const quelle = `
      /**
       *   const { data } = await supabase.from('assignments').select('*')
       *   setAssignments(data || [])
       */
      export const x = 1
    `
    expect(pruefeQuelle(quelle, 'x.ts')).toHaveLength(0)
  })

  it('zaehlt auch den Zeilenkommentar nicht', async () => {
    const { pruefeQuelle } = await import('../scripts/lint-leerzustand')
    const quelle = `
      // const { data } = await supabase.from('x').select('*')
      // setListe(data || [])
      export const x = 1
    `
    expect(pruefeQuelle(quelle, 'x.ts')).toHaveLength(0)
  })

  it('findet echten Code weiterhin — auch direkt hinter einem Kommentar', async () => {
    // Die Gegenprobe zur Kommentarblindheit: wer zu viel ausblendet, hat
    // die Regel abgeschaltet statt sie geschaerft.
    const { pruefeQuelle } = await import('../scripts/lint-leerzustand')
    const quelle = `
      // Erklaerender Vorspann ohne Belang
      const { data } = await supabase.from('assignments').select('*')
      setEinsaetze(data || []) // nachgestellter Kommentar
    `
    expect(pruefeQuelle(quelle, 'x.tsx')).toHaveLength(1)
  })

  it('haelt ein `//` in einem String nicht fuer einen Kommentar', async () => {
    // Sonst verdeckte eine URL im Code alles dahinter in derselben Zeile.
    const { pruefeQuelle } = await import('../scripts/lint-leerzustand')
    const quelle = `
      const url = 'https://example.test'
      const { data } = await supabase.from('x').select('*')
      setListe(data || [])
    `
    expect(pruefeQuelle(quelle, 'x.tsx')).toHaveLength(1)
  })

  it('meldet die Zeilennummer des Originals, nicht die der ausgeblendeten Fassung', async () => {
    const { pruefeQuelle } = await import('../scripts/lint-leerzustand')
    const quelle = [
      '/* Zeile 1',
      '   Zeile 2',
      '   Zeile 3 */',
      "const { data } = await supabase.from('x').select('*')",
      'setListe(data || [])',
    ].join('\n')
    expect(pruefeQuelle(quelle, 'x.tsx')[0].zeile).toBe(4)
  })

  it('findet in lib/ und app/api keine Stelle mehr', async () => {
    // Die eigentliche Regressionssperre dieser Runde: die 19 Stellen vom
    // 01.09.2026 sind zu, eine neue faellt hier auf.
    const { pruefeQuelle } = await import('../scripts/lint-leerzustand')
    const { readFileSync, readdirSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const SKIP = ['node_modules', '.next', 'dist', 'out', '__tests__']

    function sammeln(wurzel: string, treffer: string[] = []): string[] {
      let eintraege: string[]
      try { eintraege = readdirSync(wurzel) } catch { return treffer }
      for (const e of eintraege) {
        if (SKIP.includes(e)) continue
        const pfad = join(wurzel, e)
        if (statSync(pfad).isDirectory()) sammeln(pfad, treffer)
        else if (/\.tsx?$/.test(pfad) && !pfad.endsWith('.test.ts')) treffer.push(pfad)
      }
      return treffer
    }

    const befunde = ['lib', 'app/api']
      .flatMap(w => sammeln(w))
      .flatMap(d => pruefeQuelle(readFileSync(d, 'utf-8'), d))

    expect(
      befunde.map(b => `${b.datei}:${b.zeile} (${b.variable})`),
      'Neue Entscheidungsstelle mit verworfenem Abfragefehler',
    ).toEqual([])
  })
})
