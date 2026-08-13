// ═══════════════════════════════════════════════════════════════
// Fehlercode-Klassifizierung und Wiedervorlage-Statusmaschine
// ═══════════════════════════════════════════════════════════════
// Kernpunkt beider Testgruppen: nichts wird geraten und nichts verschwindet.
//   - Ein unbekannter Code muss 'unbekannt' ergeben, nicht die plausibelste
//     Kategorie. Falsch einsortiert heisst: aus dem Arbeitsvorrat verschwunden.
//   - Ein Queue-Eintrag darf nicht von 'offen' auf 'erledigt' springen. Sonst
//     ist ein abgelehnter Betrag aus der Liste, ohne dass Geld geflossen ist.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  FEHLER_KATEGORIEN, klassifiziereHeuristisch, klassifiziereFehlercode,
  pflegeKatalogEintrag, type FehlerKategorie,
} from '@/lib/abrechnung/ruecklaeufer-fehlercodes'

/** Minimaler Supabase-Stub: liefert die vorgegebenen Katalogzeilen zurück. */
function katalogStub(zeilen: unknown[]) {
  const kette: Record<string, unknown> = {}
  const gib = () => kette
  Object.assign(kette, {
    select: gib, eq: gib, or: gib, is: gib, order: gib, limit: gib,
    then: (aufloesen: (w: { data: unknown[] }) => void) => aufloesen({ data: zeilen }),
  })
  return { from: () => kette } as never
}

describe('Fehlerkategorien', () => {
  it('kennt genau die vier fachlichen Kategorien plus "unbekannt"', () => {
    expect(Object.keys(FEHLER_KATEGORIEN).sort()).toEqual([
      'datenfehler', 'tarifabweichung', 'unbekannt',
      'verarbeitungsfehler', 'versicherter_unbekannt',
    ])
  })

  it('gibt zu jeder Kategorie eine konkrete Massnahme an', () => {
    for (const [name, b] of Object.entries(FEHLER_KATEGORIEN)) {
      expect(b.massnahme.length, `${name} ohne Massnahme`).toBeGreaterThan(20)
      expect(b.bedeutung.length, `${name} ohne Bedeutung`).toBeGreaterThan(20)
    }
  })
})

describe('Heuristik ohne Katalog', () => {
  it('erkennt das T-Präfix des eigenen SLGA-Parsers als technisch', () => {
    const k = klassifiziereHeuristisch('T301', null)
    expect(k.kategorie).toBe('verarbeitungsfehler')
    expect(k.herkunft).toBe('heuristik')
  })

  it('rät NICHT bei einem unbekannten numerischen Code', () => {
    const k = klassifiziereHeuristisch('4711', null)
    expect(k.kategorie).toBe('unbekannt')
    expect(k.herkunft).toBe('unbekannt')
  })

  it('rät NICHT bei leerer Eingabe', () => {
    expect(klassifiziereHeuristisch(null, null).kategorie).toBe('unbekannt')
    expect(klassifiziereHeuristisch('', '').kategorie).toBe('unbekannt')
  })

  it.each<[string, FehlerKategorie]>([
    ['Kein Versicherungsschutz im Leistungszeitraum', 'versicherter_unbekannt'],
    ['Versichertennummer nicht auffindbar', 'versicherter_unbekannt'],
    ['Vergütung weicht vom Landesrahmenvertrag ab', 'tarifabweichung'],
    ['Kürzung der Position auf Vertragssatz', 'tarifabweichung'],
    ['EDIFACT-Syntaxfehler im Segment NAD', 'verarbeitungsfehler'],
    ['Datei konnte nicht entschlüsselt werden', 'verarbeitungsfehler'],
    ['Pflegegrad fehlt', 'datenfehler'],
    ['Geburtsdatum unplausibel', 'datenfehler'],
  ])('ordnet den Klartext %o der Kategorie %s zu', (text, erwartet) => {
    expect(klassifiziereHeuristisch(null, text).kategorie).toBe(erwartet)
  })

  it('lässt Text ohne eindeutiges Merkmal unklassifiziert', () => {
    expect(klassifiziereHeuristisch('999', 'Rückmeldung der Kasse').kategorie).toBe('unbekannt')
  })
})

describe('Katalog schlägt Heuristik', () => {
  it('nutzt den Katalogeintrag und nennt dessen Quelle', async () => {
    const supabase = katalogStub([{
      id: 'kat-1',
      kategorie: 'tarifabweichung',
      beschreibung: 'Position nicht im Vertrag',
      massnahme: 'Tarif prüfen',
      korrigierbar: true,
      spec_quelle: 'Fehlerverzeichnis DAVASO, Stand 01/2026',
      organization_id: 'org-1',
      quelle_ik: '123456789',
    }])

    // Der Klartext würde heuristisch 'verarbeitungsfehler' ergeben —
    // der Katalog muss gewinnen.
    const k = await klassifiziereFehlercode(supabase, 'org-1', '301', 'EDIFACT-Syntaxfehler', '123456789')
    expect(k.kategorie).toBe('tarifabweichung')
    expect(k.herkunft).toBe('katalog')
    expect(k.quelle).toContain('DAVASO')
    expect(k.katalogId).toBe('kat-1')
  })

  it('bevorzugt den mandanteneigenen Eintrag vor dem allgemeinen', async () => {
    const supabase = katalogStub([
      {
        id: 'global', kategorie: 'datenfehler', beschreibung: 'allgemein',
        massnahme: null, korrigierbar: true, spec_quelle: 'q', organization_id: null, quelle_ik: null,
      },
      {
        id: 'eigen', kategorie: 'tarifabweichung', beschreibung: 'mandantenspezifisch',
        massnahme: null, korrigierbar: true, spec_quelle: 'q', organization_id: 'org-1', quelle_ik: null,
      },
    ])

    const k = await klassifiziereFehlercode(supabase, 'org-1', '301', null, null)
    expect(k.katalogId).toBe('eigen')
    expect(k.kategorie).toBe('tarifabweichung')
  })

  it('fällt ohne Treffer auf die Heuristik zurück', async () => {
    const k = await klassifiziereFehlercode(katalogStub([]), 'org-1', 'T900', null, null)
    expect(k.kategorie).toBe('verarbeitungsfehler')
    expect(k.herkunft).toBe('heuristik')
    expect(k.katalogId).toBeNull()
  })
})

describe('Katalogpflege braucht einen Beleg', () => {
  const basis = {
    organizationId: 'org-1',
    kassenCode: '301',
    kategorie: 'datenfehler' as FehlerKategorie,
    beschreibung: 'Pflichtfeld fehlt',
    actorId: 'user-1',
  }

  it('weist einen Eintrag ohne spec_quelle ab', async () => {
    await expect(
      pflegeKatalogEintrag(katalogStub([]), { ...basis, specQuelle: '' }),
    ).rejects.toThrow(/spec_quelle ist Pflicht/)
  })

  it('weist einen Eintrag ohne Code ab', async () => {
    await expect(
      pflegeKatalogEintrag(katalogStub([]), { ...basis, kassenCode: '  ', specQuelle: 'Verzeichnis X' }),
    ).rejects.toThrow(/kassen_code ist Pflicht/)
  })
})
