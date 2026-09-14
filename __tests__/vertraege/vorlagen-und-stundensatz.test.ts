/**
 * Vertragsvorlagen und Vergütung.
 * @see lib/vertraege/vorlagen.ts, lib/vertraege/stundensatz.ts
 *
 * Ein Vertrag ist das einzige Dokument hier, das den Kunden BINDET. Zwei
 * Dinge dürfen deshalb niemals erfunden werden: die Vergütung und der
 * Stand der § 45a-Anerkennung. Beides prüfen diese Tests nicht als
 * Formulierung, sondern als Regel — ein geratener Preis und ein zu früh
 * versprochener Kassenanspruch sind die beiden Fehler, die hier Geld und
 * Vertrauen kosten.
 *
 * Der PDF-Weg selbst wird nicht hier geprüft, sondern am fertigen
 * Dokument: `npm run verify:vertrag-pdf` lädt das erzeugte PDF wieder und
 * liest die eingebetteten Schriften aus. Ein Test gegen den Quelltext
 * könnte einen Helvetica-Rückfall prinzipiell nicht sehen.
 */
import { describe, it, expect } from 'vitest'
import {
  vertragsBausteine, vorlageFreigegeben, istVorlagenTyp,
  VORLAGEN_TYPEN, VORLAGEN_TITEL, ENTWURF_VERMERK,
} from '@/lib/vertraege/vorlagen'
import { vertragsStundensatz, TOPF_JE_VERTRAGSART, VERTRAGS_LEISTUNGSART } from '@/lib/vertraege/stundensatz'
import { erstelleFakeSupabase, hatFilter, hatOrgFence } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'

const BASIS = {
  auftraggeber: 'Frau Gülşah Öztürk-Weiß',
  vertragsbeginn: '2026-10-01',
  vertragsende: null,
  kuendigungsfristTage: 14,
  autoVerlaengerung: false,
  stundensatzEuro: 40,
  verguetungsQuelle: 'Test',
}

function text(typ: 'dienstleistungsvertrag' | 'betreuungsvertrag', d = BASIS): string {
  return vertragsBausteine(typ, d).flatMap(b => [b.titel, ...b.absaetze]).join(' ')
}

describe('Freigabe-Gate — fail-closed', () => {
  it('ohne gesetzte Variable ist die Vorlage nicht freigegeben', () => {
    expect(vorlageFreigegeben({})).toBe(false)
  })

  it('nur die ausdrückliche 1 gibt frei', () => {
    expect(vorlageFreigegeben({ VERTRAGSVORLAGE_FREIGEGEBEN: '1' })).toBe(true)
    for (const wert of ['true', 'ja', 'yes', '0', '', 'TRUE', ' 1']) {
      expect(vorlageFreigegeben({ VERTRAGSVORLAGE_FREIGEGEBEN: wert })).toBe(false)
    }
  })

  it('der Entwurfs-Vermerk sagt, dass nicht verwendet werden darf', () => {
    expect(ENTWURF_VERMERK).toMatch(/nicht zur Verwendung/i)
    expect(ENTWURF_VERMERK).toMatch(/geprüft|freigegeben/i)
  })
})

describe('Vergütung wird nie erfunden', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'Stundensatz %s erzeugt keine Bausteine, sondern wirft', (satz) => {
      expect(() => vertragsBausteine('dienstleistungsvertrag', { ...BASIS, stundensatzEuro: satz }))
        .toThrow(/Stundensatz/i)
    })

  it('ohne Auftraggeber entsteht kein Vertrag', () => {
    expect(() => vertragsBausteine('dienstleistungsvertrag', { ...BASIS, auftraggeber: '   ' }))
      .toThrow(/Auftraggeber/i)
  })

  it('der übergebene Satz steht wörtlich im Vertrag', () => {
    expect(text('dienstleistungsvertrag', { ...BASIS, stundensatzEuro: 38.5 })).toMatch(/38,50\s*€/)
  })
})

describe('§ 45a — im Anerkennungsverfahren, nicht anerkannt', () => {
  it('der Kassenvertrag nennt das laufende Verfahren', () => {
    expect(text('betreuungsvertrag')).toMatch(/im Anerkennungsverfahren/)
  })

  it('der Kassenvertrag behauptet nirgends eine bestehende Anerkennung', () => {
    const t = text('betreuungsvertrag')
    expect(t).not.toMatch(/\bist anerkannt\b/i)
    expect(t).not.toMatch(/\banerkanntes Angebot\b/i)
  })

  it('er sagt ausdrücklich, dass bis dahin privat abgerechnet wird', () => {
    expect(text('betreuungsvertrag')).toMatch(/als Privatleistung abgerechnet/i)
  })

  it('der Privatvertrag verspricht keine Kassenerstattung', () => {
    const t = text('dienstleistungsvertrag')
    expect(t).not.toMatch(/Pflegekasse/)
    expect(t).not.toMatch(/45b/)
  })
})

describe('Entlastungsbetrag 131 €', () => {
  it('der Kassenvertrag nennt 131 €', () => {
    expect(text('betreuungsvertrag')).toMatch(/131\s*€/)
  })

  it('nirgends der alte Wert 125 €', () => {
    for (const typ of VORLAGEN_TYPEN) expect(text(typ)).not.toMatch(/125\s*€/)
  })
})

describe('Kundenkommunikation', () => {
  it('kein persönlicher Name im Vertragstext — gezeichnet wird als Alltagsengel', () => {
    for (const typ of VORLAGEN_TYPEN) {
      expect(text(typ)).not.toMatch(/Yusuf|Demir|Abdullah/i)
    }
  })

  it('jede Vertragsart hat einen Titel', () => {
    for (const typ of VORLAGEN_TYPEN) expect(VORLAGEN_TITEL[typ]).toBeTruthy()
  })

  it('istVorlagenTyp weist Unbekanntes ab', () => {
    expect(istVorlagenTyp('dienstleistungsvertrag')).toBe(true)
    expect(istVorlagenTyp('arbeitsvertrag')).toBe(false)
    expect(istVorlagenTyp(null)).toBe(false)
  })
})

describe('Laufzeit und Kündigung', () => {
  it('ohne Enddatum läuft der Vertrag unbefristet', () => {
    expect(text('dienstleistungsvertrag')).toMatch(/auf unbestimmte Zeit/)
  })

  it('mit Enddatum steht das Datum im Vertrag', () => {
    const t = text('dienstleistungsvertrag', { ...BASIS, vertragsende: '2027-03-31' })
    expect(t).toMatch(/31\.03\.2027/)
    expect(t).not.toMatch(/auf unbestimmte Zeit/)
  })

  it('die Kündigungsfrist wird übernommen', () => {
    expect(text('dienstleistungsvertrag', { ...BASIS, kuendigungsfristTage: 30 })).toMatch(/30 Tagen/)
  })

  it('die Verlängerungsklausel erscheint nur bei auto_verlaengerung', () => {
    expect(text('dienstleistungsvertrag', { ...BASIS, autoVerlaengerung: true })).toMatch(/verlängert/i)
    expect(text('dienstleistungsvertrag', { ...BASIS, autoVerlaengerung: false })).not.toMatch(/verlängert sich/i)
  })
})

describe('vertragsStundensatz — liest, rät nicht', () => {
  const zeile = (rate: number, extra = {}) => ({
    hourly_rate: rate, description: 'Alltagsbegleitung privat',
    valid_from: '2026-07-19', valid_until: null, is_active: true, ...extra,
  })

  it('liest den Satz mit Mandanten-Fence und richtigem Topf', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [zeile(40)], error: null }))
    const satz = await vertragsStundensatz(fake.client, {
      vertragstyp: 'dienstleistungsvertrag', organizationId: ORG, stichtag: '2026-09-14',
    })
    expect(satz.euro).toBe(40)
    const a = fake.ersterAuf('service_pricing', 'select')
    expect(hatOrgFence(a, ORG)).toBe(true)
    expect(hatFilter(a, 'eq', 'budget_type', 'private')).toBe(true)
    expect(hatFilter(a, 'eq', 'service_type', VERTRAGS_LEISTUNGSART)).toBe(true)
    expect(hatFilter(a, 'eq', 'is_active', true)).toBe(true)
  })

  it('der Kassenvertrag liest den Entlastungs-Topf, nicht den privaten', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [zeile(35)], error: null }))
    await vertragsStundensatz(fake.client, {
      vertragstyp: 'betreuungsvertrag', organizationId: ORG, stichtag: '2026-09-14',
    })
    expect(hatFilter(fake.ersterAuf('service_pricing', 'select'), 'eq', 'budget_type', 'entlastung')).toBe(true)
    expect(TOPF_JE_VERTRAGSART.betreuungsvertrag).toBe('entlastung')
  })

  it('kein Treffer → Fehler, kein Ersatzwert', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [], error: null }))
    await expect(vertragsStundensatz(fake.client, {
      vertragstyp: 'dienstleistungsvertrag', organizationId: ORG, stichtag: '2026-09-14',
    })).rejects.toThrow(/kein aktiver Stundensatz/i)
  })

  it('abgelaufener Satz zählt nicht', async () => {
    const fake = erstelleFakeSupabase(() => ({
      data: [zeile(40, { valid_until: '2026-08-31' })], error: null,
    }))
    await expect(vertragsStundensatz(fake.client, {
      vertragstyp: 'dienstleistungsvertrag', organizationId: ORG, stichtag: '2026-09-14',
    })).rejects.toThrow(/kein aktiver Stundensatz/i)
  })

  it('mehrere verschiedene Sätze → Fehler statt Zufallsauswahl', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [zeile(40), zeile(45)], error: null }))
    await expect(vertragsStundensatz(fake.client, {
      vertragstyp: 'dienstleistungsvertrag', organizationId: ORG, stichtag: '2026-09-14',
    })).rejects.toThrow(/mehrere verschiedene Stundensätze/i)
  })

  it('zweimal derselbe Satz ist kein Konflikt', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [zeile(40), zeile(40)], error: null }))
    const satz = await vertragsStundensatz(fake.client, {
      vertragstyp: 'dienstleistungsvertrag', organizationId: ORG, stichtag: '2026-09-14',
    })
    expect(satz.euro).toBe(40)
  })

  it('Lesefehler erzeugt keinen Vertrag', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: null, error: { message: 'boom' } }))
    await expect(vertragsStundensatz(fake.client, {
      vertragstyp: 'dienstleistungsvertrag', organizationId: ORG, stichtag: '2026-09-14',
    })).rejects.toThrow(/nicht gelesen werden/i)
  })

  it('die Herkunft wird für die Fußnote mitgegeben', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [zeile(40)], error: null }))
    const satz = await vertragsStundensatz(fake.client, {
      vertragstyp: 'dienstleistungsvertrag', organizationId: ORG, stichtag: '2026-09-14',
    })
    expect(satz.quelle).toMatch(/service_pricing/)
    expect(satz.quelle).toMatch(/2026-09-14/)
  })
})
