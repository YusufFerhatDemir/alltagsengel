// ═══════════════════════════════════════════════════════════════════
// Track 5 — Storno-Blindheit und einseitiger Statussync in der Kette
// ═══════════════════════════════════════════════════════════════════
//
// Zwei Befunde, beide live belegt (28.08.2026):
//
//  A) 'STORNIERT' hat kein Gegenstueck im status-Werteset. Ein widerrufener
//     Nachweis bleibt deshalb auf status='signed' stehen und kam durch
//     jeden Filter der Form .in('status', ['complete','signed','invoiced']).
//     Betroffen waren die Nachweiswege zur Pflegekasse und die
//     Vollstaendigkeitspruefung.
//
//  B) Der DB-Trigger sync_service_record_status laeuft nur in EINE Richtung
//     (proof_status -> status). Live tragen 28 von 30 Nachweisen
//     proof_status='ENTWURF', 15 davon bei status='invoiced'. Die
//     Automatisierungsketten lasen allein proof_status und legten daraus
//     taeglich Aufgaben an.

import { describe, it, expect } from 'vitest'
import { createAutomationMock } from '../automation/_mock'
import { erstelleFakeSupabase, hatFilter } from '../helpers/supabase-fake'
import { meldeFehlendeNachweise } from '@/lib/automation/nachweis-fehlt'
import { erinnereFehlendeUnterschriften } from '@/lib/automation/unterschrift-erinnerung'
import { pruefeVollstaendigkeit } from '@/lib/abrechnung/sgb-v/leistungsnachweis-service'
import { erstellePruefmappe, bewerteLeistungsnachweise } from '@/lib/analytics/pruefmappe'

const ORG = 'org-1'
const ACTOR = 'actor-1'

// ── A) Kette 1: fehlender Leistungsnachweis ───────────────────────

describe('nachweis-fehlt — abgerechnete Nachweise loesen keine Aufgabe mehr aus', () => {
  it('die Abfrage schraenkt zusaetzlich auf status draft/incomplete ein', async () => {
    const fake = erstelleFakeSupabase(a => (a.tabelle === 'service_records' ? { data: [] } : { data: null }))
    await meldeFehlendeNachweise(fake.client as any, ORG, ACTOR)
    const abfrage = fake.ersterAuf('service_records', 'select')
    expect(hatFilter(abfrage, 'eq', 'proof_status', 'ENTWURF')).toBe(true)
    expect(hatFilter(abfrage, 'in', 'status', ['draft', 'incomplete'])).toBe(true)
    // Ohne diese Spalten koennte der JS-Filter nichts entscheiden.
    expect(abfrage?.spalten).toContain('status')
    expect(abfrage?.spalten).toContain('billing_status')
  })

  it('GEGENPROBE: die live vorgefundene Zeile (invoiced + ENTWURF) ergibt 0 Aufgaben', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('service_records', 'select', [
      {
        id: 'sr-1', date: '2026-07-01', client_id: 'c-1', caregiver_id: 'cg-1',
        service_type: 'grundpflege', clients: null,
        status: 'invoiced', proof_status: 'ENTWURF', billing_status: 'OFFEN',
      },
    ])
    mock.setzeAntwort('caregivers', 'select', { user_id: 'u-1' })
    mock.setzeAntwort('organization_members', 'select', [{ user_id: 'u-pdl' }])
    mock.setzeAntwort('profiles', 'select', [{ id: 'u-pdl' }])
    mock.setzeAntwort('ops_aufgaben', 'select', null)
    mock.setzeAntwort('ops_aufgaben', 'insert', { id: 'x' })

    const ergebnis = await meldeFehlendeNachweise(mock.client as any, ORG, ACTOR)

    // Bis hierher waren das zwei Aufgaben — an die Betreuungskraft UND an
    // die PDL — fuer einen Einsatz, der bereits auf einer Rechnung steht.
    expect(ergebnis.aufgabenErstellt).toBe(0)
    expect(mock.inserts.filter(i => i.table === 'ops_aufgaben')).toHaveLength(0)
  })

  it('ein echter Entwurf loest weiterhin beide Aufgaben aus', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('service_records', 'select', [
      {
        id: 'sr-2', date: '2026-07-01', client_id: 'c-1', caregiver_id: 'cg-1',
        service_type: 'grundpflege', clients: null,
        status: 'draft', proof_status: 'ENTWURF', billing_status: 'OFFEN',
      },
    ])
    mock.setzeAntwort('caregivers', 'select', { user_id: 'u-1' })
    mock.setzeAntwort('organization_members', 'select', [{ user_id: 'u-pdl' }])
    mock.setzeAntwort('profiles', 'select', [{ id: 'u-pdl' }])
    mock.setzeAntwort('ops_aufgaben', 'select', null)
    mock.setzeAntwort('ops_aufgaben', 'insert', { id: 'x' })

    const ergebnis = await meldeFehlendeNachweise(mock.client as any, ORG, ACTOR)
    expect(ergebnis.aufgabenErstellt).toBe(2)
  })

  it('ein stornierter Nachweis loest keine Aufgabe aus', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('service_records', 'select', [
      {
        id: 'sr-3', date: '2026-07-01', client_id: 'c-1', caregiver_id: 'cg-1',
        service_type: 'grundpflege', clients: null,
        status: 'draft', proof_status: 'ENTWURF', billing_status: 'STORNIERT',
      },
    ])
    mock.setzeAntwort('caregivers', 'select', { user_id: 'u-1' })
    mock.setzeAntwort('organization_members', 'select', [{ user_id: 'u-pdl' }])
    mock.setzeAntwort('profiles', 'select', [{ id: 'u-pdl' }])
    mock.setzeAntwort('ops_aufgaben', 'select', null)

    const ergebnis = await meldeFehlendeNachweise(mock.client as any, ORG, ACTOR)
    expect(ergebnis.aufgabenErstellt).toBe(0)
  })
})

// ── B) Kette: Unterschrifts-Erinnerung ────────────────────────────

describe('unterschrift-erinnerung — kein Erinnern an gesperrte Nachweise', () => {
  it('die Abfrage schliesst status signed/invoiced aus', async () => {
    const fake = erstelleFakeSupabase(a => (a.tabelle === 'service_records' ? { data: [] } : { data: null }))
    await erinnereFehlendeUnterschriften(fake.client as any, ORG, ACTOR)
    const abfrage = fake.ersterAuf('service_records', 'select')
    expect(hatFilter(abfrage, 'not', 'status')).toBe(true)
    expect(abfrage?.spalten).toContain('signature_hash')
  })

  it('GEGENPROBE: die abgerechnete Zeile ohne client_signature erzeugt keine Erinnerung mehr', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('service_records', 'select', [
      {
        id: 'sr-1', date: '2026-07-01', client_id: 'c-1', caregiver_id: 'cg-1',
        status: 'invoiced', proof_status: 'ENTWURF', billing_status: 'OFFEN',
        signature_hash: null, client_signature: null,
      },
    ])
    mock.setzeAntwort('ops_aufgaben', 'select', null)
    mock.setzeAntwort('ops_aufgaben', 'insert', { id: 'x' })

    const ergebnis = await erinnereFehlendeUnterschriften(mock.client as any, ORG, ACTOR)
    expect(ergebnis.aufgabenErstellt).toBe(0)
  })

  it('ein offener Nachweis ohne Unterschrift wird weiterhin erinnert', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('service_records', 'select', [
      {
        id: 'sr-2', date: '2026-07-01', client_id: 'c-1', caregiver_id: 'cg-1',
        status: 'complete', proof_status: 'ABGESCHLOSSEN', billing_status: 'OFFEN',
        signature_hash: null, client_signature: null,
      },
    ])
    mock.setzeAntwort('ops_aufgaben', 'select', null)
    mock.setzeAntwort('caregivers', 'select', { user_id: 'u-1' })
    mock.setzeAntwort('ops_aufgaben', 'insert', { id: 'x' })

    const ergebnis = await erinnereFehlendeUnterschriften(mock.client as any, ORG, ACTOR)
    expect(ergebnis.fehler).toEqual([])
    expect(ergebnis.aufgabenErstellt).toBe(1)
  })
})

// ── C) SGB-V-Vollstaendigkeitspruefung ────────────────────────────

const VERORDNUNG = {
  id: 'vo-1',
  client_id: 'c-1',
  verordnung_type: 'haeusliche_krankenpflege',
  genehmigung_status: 'genehmigt',
  gueltig_von: '2026-01-01',
  gueltig_bis: '2026-12-31',
  genehmigung_bis: null,
  verordnung_nummer: 'V-1',
  genehmigung_aktenzeichen: 'AZ-1',
  kostentraeger_ik_nummer: '123456789',
  kostentraeger_name: 'Kasse',
}

function fakeFuerVollstaendigkeit(leistungen: unknown[]) {
  return erstelleFakeSupabase(a => {
    if (a.tabelle === 'service_records') return { data: leistungen }
    if (a.tabelle === 'verordnungen') return { data: [VERORDNUNG] }
    return { data: [] }
  })
}

describe('pruefeVollstaendigkeit — beide Statusspalten, Storno getrennt', () => {
  it('abgerechnete Leistung mit proof_status=ENTWURF gilt als abgeschlossen', async () => {
    const fake = fakeFuerVollstaendigkeit([
      { id: 'l-1', client_id: 'c-1', verordnung_id: 'vo-1', date: '2026-06-15', amount: 50, proof_status: 'ENTWURF', billing_status: 'OFFEN', status: 'invoiced' },
    ])
    const ergebnis = await pruefeVollstaendigkeit(fake.client as any, ORG, '2026-06-01', '2026-06-30')
    expect(ergebnis[0].probleme).not.toContain('nicht_abgeschlossen')
    expect(ergebnis[0].ok).toBe(true)
  })

  it('GEGENPROBE: die alte Regel las nur proof_status und meldete "nicht abgeschlossen"', () => {
    const alteRegel = (p: string) => !['ABGESCHLOSSEN', 'UNTERSCHRIEBEN', 'ABGERECHNET'].includes(p)
    expect(alteRegel('ENTWURF')).toBe(true)
  })

  it('ein echter Entwurf bleibt "nicht abgeschlossen"', async () => {
    const fake = fakeFuerVollstaendigkeit([
      { id: 'l-2', client_id: 'c-1', verordnung_id: 'vo-1', date: '2026-06-15', amount: 50, proof_status: 'ENTWURF', billing_status: 'OFFEN', status: 'draft' },
    ])
    const ergebnis = await pruefeVollstaendigkeit(fake.client as any, ORG, '2026-06-01', '2026-06-30')
    expect(ergebnis[0].probleme).toContain('nicht_abgeschlossen')
  })

  it('eine stornierte Leistung wird als storniert gemeldet, nicht als unfertig', async () => {
    const fake = fakeFuerVollstaendigkeit([
      { id: 'l-3', client_id: 'c-1', verordnung_id: 'vo-1', date: '2026-06-15', amount: 50, proof_status: 'UNTERSCHRIEBEN', billing_status: 'STORNIERT', status: 'signed' },
    ])
    const ergebnis = await pruefeVollstaendigkeit(fake.client as any, ORG, '2026-06-01', '2026-06-30')
    expect(ergebnis[0].probleme).toContain('storniert')
    expect(ergebnis[0].ok).toBe(false)
  })

  it('GEGENPROBE: nach der alten Regel war genau diese Zeile abrechenbar (ok=true)', () => {
    // proof_status='UNTERSCHRIEBEN' stand in der Erlaubnisliste, das Storno
    // stand in billing_status und wurde gar nicht gelesen.
    const alteRegel = (p: string) => !['ABGESCHLOSSEN', 'UNTERSCHRIEBEN', 'ABGERECHNET'].includes(p)
    expect(alteRegel('UNTERSCHRIEBEN')).toBe(false)
  })

  it('die Abfrage liest billing_status und status mit', async () => {
    const fake = fakeFuerVollstaendigkeit([])
    await pruefeVollstaendigkeit(fake.client as any, ORG, '2026-06-01', '2026-06-30')
    const abfrage = fake.ersterAuf('service_records', 'select')
    expect(abfrage?.spalten).toContain('billing_status')
    expect(abfrage?.spalten).toContain('status')
  })
})

// ── D) Pruefmappe ─────────────────────────────────────────────────

describe('Pruefmappe — Storno zaehlt nicht gegen die Dokumentationsquote', () => {
  it('bewerteLeistungsnachweise rechnet mit der uebergebenen Menge', () => {
    const k = bewerteLeistungsnachweise([{ client_signature: 'ja' }], 0)
    expect(k.anzahl).toBe(1)
    expect(k.status).toBe('vollstaendig')
  })

  it('der stornierte, unsignierte Nachweis fliesst nicht mehr in die Quote', async () => {
    const fake = erstelleFakeSupabase(a => {
      if (a.tabelle === 'service_records') {
        return {
          data: [
            { id: 'r-1', client_signature: 'Frau Meier', proof_status: 'UNTERSCHRIEBEN', billing_status: 'OFFEN' },
            { id: 'r-2', client_signature: null, proof_status: 'STORNIERT', billing_status: 'STORNIERT' },
          ],
        }
      }
      return { data: [] }
    })
    const mappe = await erstellePruefmappe(fake.client as any, {
      organizationId: ORG, clientId: 'c-1', von: '2026-06-01', bis: '2026-06-30',
    })
    const kat = mappe.kategorien.find(k => k.schluessel === 'leistungsnachweise')
    expect(kat?.anzahl).toBe(1)
    expect(kat?.status).toBe('vollstaendig')
    expect(kat?.hinweis).toContain('1/1')
  })

  it('GEGENPROBE: mit dem Storno in der Menge waere die Quote 1/2 gewesen', () => {
    const kat = bewerteLeistungsnachweise(
      [{ client_signature: 'Frau Meier' }, { client_signature: null }],
      0,
    )
    expect(kat.hinweis).toContain('1/2')
    expect(kat.status).toBe('unvollstaendig')
  })
})
