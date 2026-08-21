import { describe, it, expect } from 'vitest'
import {
  ALLOWED_CLIENT_FIELDS,
  STAMMDATEN_FIELDS,
  HEALTH_FIELDS,
  STAMMDATEN_SET,
  pruefeStammdaten,
} from '@/lib/clients/stammdaten'
import {
  pruefeStatuswechsel,
  sperrtEinsaetze,
  SETZBARE_STATUS,
  PIPELINE_ZU_STATUS,
} from '@/lib/clients/status'

// ═══════════════════════════════════════════════════════════
// Track 6 / Bereich 1 der Lückenanalyse
// ═══════════════════════════════════════════════════════════

describe('Kundenstammdaten-Whitelist', () => {
  it('deckt genau die Felder ab, die in der Oberfläche editierbar sind', () => {
    // Der Befund war: Name, Adresse, PLZ, Ort, Telefon, E-Mail und
    // Geburtsdatum fehlten in ALLOWED_FIELDS — ein Umzug war nicht
    // abbildbar. Dieser Test hält genau das fest.
    for (const feld of ['first_name', 'last_name', 'date_of_birth', 'address', 'zip_code', 'city', 'phone', 'email']) {
      expect(ALLOWED_CLIENT_FIELDS).toContain(feld)
    }
  })

  it('lässt Gesundheitsdaten unverändert in der Whitelist', () => {
    for (const feld of HEALTH_FIELDS) {
      expect(ALLOWED_CLIENT_FIELDS).toContain(feld)
    }
  })

  it('enthält KEINE Felder mit eigenem fachlichen Weg', () => {
    // status/pipeline_status laufen über PATCH .../status,
    // care_level/pflegegrad über PATCH .../pflegegrad.
    for (const gesperrt of ['status', 'pipeline_status', 'care_level', 'pflegegrad', 'customer_number', 'organization_id', 'id']) {
      expect(ALLOWED_CLIENT_FIELDS).not.toContain(gesperrt)
    }
  })

  it('trennt Stammdaten und Gesundheitsdaten überschneidungsfrei', () => {
    for (const feld of HEALTH_FIELDS) {
      expect(STAMMDATEN_SET.has(feld)).toBe(false)
    }
    for (const feld of STAMMDATEN_FIELDS) {
      expect(STAMMDATEN_SET.has(feld)).toBe(true)
    }
  })
})

describe('pruefeStammdaten', () => {
  it('lässt eine vollständige, gültige Änderung durch', () => {
    expect(pruefeStammdaten({
      first_name: 'Erika', last_name: 'Mustermann', date_of_birth: '1948-03-12',
      address: 'Hauptstraße 5', zip_code: '60311', city: 'Frankfurt',
      phone: '069 1234567', email: 'erika@example.org',
    }, '2026-08-21')).toBeNull()
  })

  it('lässt ein leeres Objekt durch (nichts zu prüfen)', () => {
    expect(pruefeStammdaten({})).toBeNull()
  })

  it('weist einen leeren Namen ab', () => {
    expect(pruefeStammdaten({ first_name: '   ' })).toMatch(/Vor- und Nachname/)
    expect(pruefeStammdaten({ last_name: '' })).toMatch(/Vor- und Nachname/)
  })

  it('lässt einen NICHT übergebenen Namen unangetastet', () => {
    // Teil-Update: nur die Adresse ändert sich, der Name fehlt im Body.
    expect(pruefeStammdaten({ city: 'Offenbach' })).toBeNull()
  })

  it('weist eine ungültige E-Mail ab, akzeptiert aber Leerung', () => {
    expect(pruefeStammdaten({ email: 'keine-mail' })).toMatch(/E-Mail/)
    expect(pruefeStammdaten({ email: '' })).toBeNull()
    expect(pruefeStammdaten({ email: null })).toBeNull()
  })

  it('weist ein Geburtsdatum im falschen Format ab', () => {
    expect(pruefeStammdaten({ date_of_birth: '12.03.1948' })).toMatch(/JJJJ-MM-TT/)
  })

  it('weist ein Geburtsdatum in der Zukunft ab', () => {
    expect(pruefeStammdaten({ date_of_birth: '2027-01-01' }, '2026-08-21'))
      .toMatch(/Zukunft/)
    // Heute ist zulässig (Neugeborenes).
    expect(pruefeStammdaten({ date_of_birth: '2026-08-21' }, '2026-08-21')).toBeNull()
  })

  it('weist eine PLZ ab, die nicht aus 5 Ziffern besteht', () => {
    expect(pruefeStammdaten({ zip_code: '6031' })).toMatch(/Postleitzahl/)
    expect(pruefeStammdaten({ zip_code: '60311x' })).toMatch(/Postleitzahl/)
    expect(pruefeStammdaten({ zip_code: '60311' })).toBeNull()
  })

  it('prüft weiterhin Mobilität und Angehörigen-E-Mail', () => {
    expect(pruefeStammdaten({ mobility_status: 'schwebend' })).toMatch(/Mobilität/)
    expect(pruefeStammdaten({ mobility_status: 'rollstuhl' })).toBeNull()
    expect(pruefeStammdaten({ next_of_kin_email: 'kaputt' })).toMatch(/Angehörigen/)
  })
})

describe('pruefeStatuswechsel (Deaktivierung)', () => {
  it('akzeptiert alle setzbaren Statuswerte', () => {
    for (const status of SETZBARE_STATUS) {
      const r = pruefeStatuswechsel({ status })
      expect(r.fehler).toBeNull()
      expect(r.status).toBe(status)
    }
  })

  it('weist einen unbekannten Status ab, statt ihn an den DB-CHECK zu geben', () => {
    const r = pruefeStatuswechsel({ status: 'geloescht' })
    expect(r.fehler).toMatch(/Ungültiger Status/)
    expect(r.status).toBeNull()
  })

  it('weist einen fehlenden Status ab', () => {
    expect(pruefeStatuswechsel({}).fehler).toMatch(/erforderlich/)
    expect(pruefeStatuswechsel({ status: '  ' }).fehler).toMatch(/erforderlich/)
  })

  it('kennt "new" NICHT als Ziel eines bewussten Statuswechsels', () => {
    expect(pruefeStatuswechsel({ status: 'new' }).fehler).toMatch(/Ungültiger Status/)
  })

  it('leitet die passende Pipeline-Stufe ab', () => {
    expect(pruefeStatuswechsel({ status: 'inactive' }).pipelineStatus).toBe('ended')
    expect(pruefeStatuswechsel({ status: 'archived' }).pipelineStatus).toBe('ended')
    expect(pruefeStatuswechsel({ status: 'paused' }).pipelineStatus).toBe('paused')
    expect(pruefeStatuswechsel({ status: 'active' }).pipelineStatus).toBe('active')
  })

  it('lässt eine ausdrücklich übergebene Pipeline-Stufe gewinnen', () => {
    const r = pruefeStatuswechsel({ status: 'inactive', pipeline_status: 'paused' })
    expect(r.fehler).toBeNull()
    expect(r.pipelineStatus).toBe('paused')
  })

  it('weist eine unbekannte Pipeline-Stufe ab', () => {
    expect(pruefeStatuswechsel({ status: 'inactive', pipeline_status: 'beendet' }).fehler)
      .toMatch(/pipeline_status/)
  })

  it('bildet für jeden setzbaren Status eine Pipeline-Stufe ab', () => {
    for (const status of SETZBARE_STATUS) {
      expect(PIPELINE_ZU_STATUS[status]).toBeDefined()
    }
  })
})

describe('sperrtEinsaetze', () => {
  it('spiegelt pruefeClientFreigabe exakt', () => {
    // Freigegeben: genau 'aktiv' | 'active' | 'neu'
    expect(sperrtEinsaetze('active')).toBe(false)
    expect(sperrtEinsaetze('aktiv')).toBe(false)
    expect(sperrtEinsaetze('neu')).toBe(false)
    // Gesperrt
    expect(sperrtEinsaetze('inactive')).toBe(true)
    expect(sperrtEinsaetze('paused')).toBe(true)
    expect(sperrtEinsaetze('archived')).toBe(true)
  })

  it('hält den bekannten Vokabelbruch fest: "new" ist gesperrt', () => {
    // pruefeClientFreigabe kennt nur 'neu' (deutsch), die Anlage schreibt
    // aber 'new' (englisch). Ein frisch angelegter Klient ist deshalb für
    // die Einsatzplanung gesperrt. Beschönigen wäre eine Lüge in der UI.
    expect(sperrtEinsaetze('new')).toBe(true)
  })

  it('behandelt fehlenden Status als nicht sperrend', () => {
    expect(sperrtEinsaetze(null)).toBe(false)
    expect(sperrtEinsaetze(undefined)).toBe(false)
  })
})
