/**
 * Tests für das KIM/TI-Gerüst (Block 18)
 * @see lib/kim/
 */
import { describe, it, expect } from 'vitest'
import {
  loeseVersionAuf, giltAm, monatsStichtag,
  type KimFormatVersion,
} from '@/lib/kim/versionen'
import {
  validiereKonfiguration, findeAktiveKonfiguration, KIM_FREISCHALTUNGSSTATUS,
  type KimKonfiguration,
} from '@/lib/kim/config'
import {
  validiereKarte, istEinsatzbereit, KIM_KARTENTYP_LABELS,
  type KimKarte,
} from '@/lib/kim/karten'
import { validiereNachricht } from '@/lib/kim/nachrichten'
import { versendeKimNachricht, kimVersandImplementiert, KimSpecFehltError } from '@/lib/kim/versand'
import { AUDIT_ENTITY_TYPES } from '@/lib/billing/core/audit'

// ── Fixtures ────────────────────────────────────────────────────

function version(over: Partial<KimFormatVersion> = {}): KimFormatVersion {
  return {
    id: 'v1',
    bezeichnung: 'Technische Anlage 5 — Version 1.2.0',
    ta_version: '1.2.0',
    gueltig_von: '2027-02-01',
    gueltig_bis: null,
    spec_bestaetigt: false,
    spec_quelle: null,
    hinweis: null,
    ...over,
  }
}

function konfiguration(over: Partial<KimKonfiguration> = {}): KimKonfiguration {
  return {
    id: 'k1',
    organization_id: 'org-1',
    bezeichnung: 'Hauptpostfach',
    postfachadresse: null,
    provider_name: null,
    freischaltungsstatus: 'nicht_beantragt',
    aktiv: false,
    hinweis: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...over,
  }
}

function karte(over: Partial<KimKarte> = {}): KimKarte {
  return {
    id: 'c1',
    organization_id: 'org-1',
    karten_typ: 'smc_b',
    kartennummer: '80276001011699910103',
    inhaber_user_id: null,
    inhaber_name: null,
    status: 'aktiv',
    gueltig_von: '2026-01-01',
    gueltig_bis: '2028-12-31',
    hinweis: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...over,
  }
}

// ── Versionsengine ──────────────────────────────────────────────

describe('KIM/TI Versionsengine', () => {
  it('monatsStichtag erzwingt JJJJ-MM', () => {
    expect(monatsStichtag('2027-02')).toBe('2027-02-01')
    expect(() => monatsStichtag('2027-2')).toThrow(/JJJJ-MM/)
    expect(() => monatsStichtag('Februar 2027')).toThrow(/JJJJ-MM/)
  })

  it('giltAm behandelt offenes Ende als unbegrenzt', () => {
    const offen = version({ gueltig_von: '2027-02-01', gueltig_bis: null })
    expect(giltAm(offen, '2027-02-01')).toBe(true)
    expect(giltAm(offen, '2099-01-01')).toBe(true)
    expect(giltAm(offen, '2027-01-31')).toBe(false)
  })

  it('sperrt, wenn gar keine Version hinterlegt ist', () => {
    const r = loeseVersionAuf([], '2027-02-01')
    expect(r.ok).toBe(false)
    expect(r.sperrgrund).toBe('keine_version_hinterlegt')
  })

  it('sperrt, wenn für den Stichtag keine Version gilt', () => {
    const r = loeseVersionAuf([version({ gueltig_von: '2027-02-01', gueltig_bis: null })], '2026-08-01')
    expect(r.ok).toBe(false)
    expect(r.sperrgrund).toBe('keine_version_gueltig')
  })

  it('sperrt fail-closed, solange die Spec nicht bestätigt ist', () => {
    const r = loeseVersionAuf([version({ spec_bestaetigt: false })], '2027-02-01')
    expect(r.ok).toBe(false)
    expect(r.sperrgrund).toBe('spec_nicht_bestaetigt')
    // Die Version wird trotzdem zurückgemeldet, damit die UI sie anzeigen kann.
    expect(r.version?.ta_version).toBe('1.2.0')
  })

  it('gibt frei, sobald die Spec bestätigt ist', () => {
    const r = loeseVersionAuf(
      [version({ spec_bestaetigt: true, spec_quelle: 'TA5, Stand 02/2027' })],
      '2027-02-01',
    )
    expect(r.ok).toBe(true)
    expect(r.sperrgrund).toBeNull()
  })

  it('nimmt bei mehreren gültigen Kandidaten die neueste Version', () => {
    const alt = version({ id: 'alt', ta_version: '1.1.0', gueltig_von: '2020-01-01', gueltig_bis: null, spec_bestaetigt: true, spec_quelle: 'q' })
    const neu = version({ id: 'neu', ta_version: '1.2.0', gueltig_von: '2027-02-01', gueltig_bis: null, spec_bestaetigt: true, spec_quelle: 'q' })
    const r = loeseVersionAuf([alt, neu], '2027-03-01')
    expect(r.version?.ta_version).toBe('1.2.0')
  })
})

// ── Postfach-Konfiguration ──────────────────────────────────────

describe('KIM Postfach-Konfiguration', () => {
  it('verlangt eine Bezeichnung', () => {
    expect(validiereKonfiguration({ bezeichnung: '' })).toMatch(/Bezeichnung/)
    expect(validiereKonfiguration({ bezeichnung: '   ' })).toMatch(/Bezeichnung/)
  })

  it('prüft die Postfachadresse nur grob (E-Mail-artig), ohne ein KIM-Format vorzugeben', () => {
    expect(validiereKonfiguration({ bezeichnung: 'Hauptpostfach', postfachadresse: 'keine-adresse' })).toMatch(/Postfachadresse/)
    expect(validiereKonfiguration({ bezeichnung: 'Hauptpostfach', postfachadresse: 'praxis@kim.beispiel.de' })).toBeNull()
  })

  it('akzeptiert eine Konfiguration ohne Postfachadresse (noch kein Provider-Vertrag)', () => {
    expect(validiereKonfiguration({ bezeichnung: 'Hauptpostfach' })).toBeNull()
  })

  it('lehnt einen unbekannten Freischaltungsstatus ab', () => {
    expect(validiereKonfiguration({ bezeichnung: 'x', freischaltungsstatus: 'erfunden' as never })).toMatch(/Freischaltungsstatus/)
    expect(KIM_FREISCHALTUNGSSTATUS).toContain('freigeschaltet')
  })

  it('findeAktiveKonfiguration liefert nur die als aktiv markierte', () => {
    const liste = [konfiguration({ id: 'a', aktiv: false }), konfiguration({ id: 'b', aktiv: true })]
    expect(findeAktiveKonfiguration(liste)?.id).toBe('b')
    expect(findeAktiveKonfiguration([konfiguration({ aktiv: false })])).toBeNull()
  })
})

// ── Kartenverwaltung ────────────────────────────────────────────

describe('KIM Kartenverwaltung (eHBA/SMC-B)', () => {
  it('kennt beide Kartentypen', () => {
    expect(KIM_KARTENTYP_LABELS.smc_b).toBeTruthy()
    expect(KIM_KARTENTYP_LABELS.ehba).toBeTruthy()
  })

  it('lehnt einen unbekannten Kartentyp ab', () => {
    expect(validiereKarte({ karten_typ: 'unbekannt' as never })).toMatch(/Kartentyp/)
  })

  it('lehnt Gültig-von nach Gültig-bis ab', () => {
    expect(validiereKarte({ karten_typ: 'smc_b', gueltig_von: '2027-01-01', gueltig_bis: '2026-01-01' })).toMatch(/Gültig-von/)
  })

  it('akzeptiert eine vollständige Karte', () => {
    expect(validiereKarte({ karten_typ: 'ehba', gueltig_von: '2026-01-01', gueltig_bis: '2028-01-01' })).toBeNull()
  })

  it('istEinsatzbereit verlangt Status aktiv UND Gültigkeit am Stichtag', () => {
    expect(istEinsatzbereit(karte({ status: 'aktiv' }), '2027-01-01')).toBe(true)
    expect(istEinsatzbereit(karte({ status: 'beantragt' }), '2027-01-01')).toBe(false)
    expect(istEinsatzbereit(karte({ status: 'aktiv', gueltig_bis: '2026-06-30' }), '2027-01-01')).toBe(false)
    expect(istEinsatzbereit(karte({ status: 'aktiv', gueltig_von: '2027-06-01' }), '2027-01-01')).toBe(false)
  })
})

// ── Nachrichten-Warteschlange ───────────────────────────────────

describe('KIM Nachrichten-Warteschlange', () => {
  it('verlangt einen Betreff', () => {
    expect(validiereNachricht({ betreff: '' })).toMatch(/Betreff/)
  })

  it('prüft die Empfängeradresse nur grob', () => {
    expect(validiereNachricht({ betreff: 'x', empfaenger_adresse: 'keine-adresse' })).toMatch(/Empfängeradresse/)
    expect(validiereNachricht({ betreff: 'x', empfaenger_adresse: 'kasse@kim.beispiel.de' })).toBeNull()
  })

  it('akzeptiert einen Entwurf ohne Empfängeradresse', () => {
    expect(validiereNachricht({ betreff: 'Abrechnung 08/2027' })).toBeNull()
  })
})

// ── Fail-closed-Versand ─────────────────────────────────────────

describe('KIM Versand (fail-closed)', () => {
  it('meldet den Versand als nicht implementiert', () => {
    expect(kimVersandImplementiert()).toBe(false)
  })

  it('verweigert den Versand mit erkennbarem Fehlercode', () => {
    expect(() => versendeKimNachricht({ nachrichtId: 'n1', version: version({ spec_bestaetigt: true, spec_quelle: 'q' }) }))
      .toThrow(KimSpecFehltError)
    try {
      versendeKimNachricht({ nachrichtId: 'n1', version: version({ spec_bestaetigt: true, spec_quelle: 'q' }) })
    } catch (e) {
      const err = e as KimSpecFehltError
      expect(err.code).toBe('KIM_SPEC_FEHLT')
      expect(err.nachrichtId).toBe('n1')
      expect(err.taVersion).toBe('1.2.0')
    }
  })

  it('bleibt gesperrt auch ohne bekannte Version (kein Absturz durch fehlende Version)', () => {
    expect(() => versendeKimNachricht({ nachrichtId: 'n2', version: null })).toThrow(/gesperrt/)
  })

  it('bleibt gesperrt, auch wenn die Version fälschlich als bestätigt markiert ist', () => {
    // Doppelte Sperre: ein versehentliches spec_bestaetigt = true im Register
    // darf keinen echten Versandversuch auslösen.
    expect(() => versendeKimNachricht({
      nachrichtId: 'n3',
      version: version({ spec_bestaetigt: true, spec_quelle: 'irrtum' }),
    })).toThrow(/KIM-Client-Protokoll/)
  })
})

// ── Schema-Konsistenz ───────────────────────────────────────────

describe('KIM Audit-Entity-Typen', () => {
  it('kennt die neuen kim_-Typen (Migration 20260830010000)', () => {
    for (const typ of ['kim_konfiguration', 'kim_formatversion', 'kim_karte', 'kim_nachricht']) {
      expect(AUDIT_ENTITY_TYPES as readonly string[]).toContain(typ)
    }
  })
})
