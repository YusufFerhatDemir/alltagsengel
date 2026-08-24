// ═══════════════════════════════════════════════════════════════
// Welle 5k — Gemischte reine Funktionen
// ═══════════════════════════════════════════════════════════════
//
// doku-perioden: validateJahrMonat, monatsGrenzen
// pflegegrad: pflegegradVon, PFLEGEGRAD_SPALTEN
// datev-config: isDatevConfigComplete
// kontenrahmen: getKonto, getUStSchluessel
// html: esc (XSS-Schutz)
// personal/types: assertErlaubt, assertPlausibleZeiten
// pilot/schritte: KETTEN_SCHRITTE, schrittHref
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { validateJahrMonat, monatsGrenzen } from '../pflege/doku-perioden'
import { pflegegradVon, PFLEGEGRAD_SPALTEN } from '../clients/pflegegrad'
import { isDatevConfigComplete } from '../billing/datev/datev-config'
import { getKonto, getUStSchluessel } from '../billing/datev/kontenrahmen'
import { esc } from '../notifications/html'
import { assertErlaubt, assertPlausibleZeiten, VERTRAGSSTATUS_WERTE, SCHULUNGSART_WERTE, DIENSTPLAN_STATUS_WERTE } from '../personal/types'
import { KETTEN_SCHRITTE, schrittHref } from '../pilot/schritte'

// ---------------------------------------------------------------------------
// validateJahrMonat
// ---------------------------------------------------------------------------

describe('validateJahrMonat', () => {
  test('gültige Werte → kein Fehler', () => {
    assert.doesNotThrow(() => validateJahrMonat(2026, 1))
    assert.doesNotThrow(() => validateJahrMonat(2026, 12))
    assert.doesNotThrow(() => validateJahrMonat(2020, 6))
    assert.doesNotThrow(() => validateJahrMonat(2099, 12))
  })

  test('Jahr < 2020 → Fehler', () => {
    assert.throws(() => validateJahrMonat(2019, 1), /2020/)
  })

  test('Jahr > 2099 → Fehler', () => {
    assert.throws(() => validateJahrMonat(2100, 1), /2099/)
  })

  test('Monat < 1 → Fehler', () => {
    assert.throws(() => validateJahrMonat(2026, 0), /Monat/)
  })

  test('Monat > 12 → Fehler', () => {
    assert.throws(() => validateJahrMonat(2026, 13), /Monat/)
  })

  test('Float-Werte → Fehler', () => {
    assert.throws(() => validateJahrMonat(2026.5, 1))
    assert.throws(() => validateJahrMonat(2026, 1.5))
  })

  test('NaN / Infinity → Fehler', () => {
    assert.throws(() => validateJahrMonat(NaN, 1))
    assert.throws(() => validateJahrMonat(2026, Infinity))
  })
})

// ---------------------------------------------------------------------------
// monatsGrenzen
// ---------------------------------------------------------------------------

describe('monatsGrenzen', () => {
  test('Januar 2026 → 01.01. bis 01.02.', () => {
    const { von, bis } = monatsGrenzen(2026, 1)
    assert.ok(von.startsWith('2026-01-01'))
    assert.ok(bis.startsWith('2026-02-01'))
  })

  test('Dezember 2026 → 01.12. bis 01.01.2027 (Jahreswechsel)', () => {
    const { von, bis } = monatsGrenzen(2026, 12)
    assert.ok(von.startsWith('2026-12-01'))
    assert.ok(bis.startsWith('2027-01-01'))
  })

  test('Februar Schaltjahr 2024 → 01.02. bis 01.03.', () => {
    const { von, bis } = monatsGrenzen(2024, 2)
    assert.ok(von.startsWith('2024-02-01'))
    assert.ok(bis.startsWith('2024-03-01'))
  })

  test('von < bis (immer)', () => {
    for (let m = 1; m <= 12; m++) {
      const { von, bis } = monatsGrenzen(2026, m)
      assert.ok(new Date(von) < new Date(bis), `Monat ${m}: von >= bis`)
    }
  })

  test('ungültige Werte → Fehler (delegiert an validateJahrMonat)', () => {
    assert.throws(() => monatsGrenzen(2019, 1))
    assert.throws(() => monatsGrenzen(2026, 0))
  })

  test('ISO-Format', () => {
    const { von } = monatsGrenzen(2026, 6)
    // Muss ein gültiges ISO-Datum sein
    assert.ok(!isNaN(new Date(von).getTime()))
  })
})

// ---------------------------------------------------------------------------
// pflegegradVon
// ---------------------------------------------------------------------------

describe('pflegegradVon', () => {
  test('care_level als Zahl → direkt', () => {
    assert.equal(pflegegradVon({ care_level: 3 }), 3)
  })

  test('care_level als String → konvertiert', () => {
    assert.equal(pflegegradVon({ care_level: '2' }), 2)
  })

  test('care_level null, pflegegrad vorhanden → Fallback', () => {
    assert.equal(pflegegradVon({ care_level: null, pflegegrad: 4 }), 4)
  })

  test('beide null → null', () => {
    assert.equal(pflegegradVon({ care_level: null, pflegegrad: null }), null)
  })

  test('null/undefined Input → null', () => {
    assert.equal(pflegegradVon(null), null)
    assert.equal(pflegegradVon(undefined), null)
  })

  test('leeres Objekt → null', () => {
    assert.equal(pflegegradVon({}), null)
  })

  test('Wert außerhalb 1-5 → null', () => {
    assert.equal(pflegegradVon({ care_level: 0 }), null)
    assert.equal(pflegegradVon({ care_level: 6 }), null)
    assert.equal(pflegegradVon({ care_level: -1 }), null)
  })

  test('leerer String → null', () => {
    assert.equal(pflegegradVon({ care_level: '' }), null)
  })

  test('care_level hat Vorrang vor pflegegrad', () => {
    assert.equal(pflegegradVon({ care_level: 2, pflegegrad: 4 }), 2)
  })

  test('PFLEGEGRAD_SPALTEN ist definiert', () => {
    assert.ok(PFLEGEGRAD_SPALTEN.includes('care_level'))
    assert.ok(PFLEGEGRAD_SPALTEN.includes('pflegegrad'))
  })
})

// ---------------------------------------------------------------------------
// isDatevConfigComplete
// ---------------------------------------------------------------------------

describe('isDatevConfigComplete', () => {
  const vollstaendig = {
    beraternummer: '12345',
    mandantennummer: '67890',
    kontenrahmen: 'SKR03' as const,
    wjBeginn: '01-01',
    sachkontenlaenge: 4,
    naechsteDebitorennummer: 10000,
    erzeugerKuerzel: 'AE',
  }

  test('vollständig → ok=true, fehlend=[]', () => {
    const { ok, fehlend } = isDatevConfigComplete(vollstaendig)
    assert.equal(ok, true)
    assert.equal(fehlend.length, 0)
  })

  test('ohne Beraternummer → fehlend enthält "Beraternummer"', () => {
    const { ok, fehlend } = isDatevConfigComplete({ ...vollstaendig, beraternummer: '' })
    assert.equal(ok, false)
    assert.ok(fehlend.includes('Beraternummer'))
  })

  test('ohne Mandantennummer → fehlend enthält "Mandantennummer"', () => {
    const { ok, fehlend } = isDatevConfigComplete({ ...vollstaendig, mandantennummer: '' })
    assert.equal(ok, false)
    assert.ok(fehlend.includes('Mandantennummer'))
  })

  test('beide fehlen → 2 Einträge', () => {
    const { ok, fehlend } = isDatevConfigComplete({ ...vollstaendig, beraternummer: '', mandantennummer: '' })
    assert.equal(ok, false)
    assert.equal(fehlend.length, 2)
  })
})

// ---------------------------------------------------------------------------
// getKonto + getUStSchluessel
// ---------------------------------------------------------------------------

describe('getKonto', () => {
  test('SKR03 erloesePflege → 8120', () => {
    const konto = getKonto('SKR03', 'erloesePflege')
    assert.equal(konto.konto, '8120')
    assert.ok(konto.bezeichnung.length > 0)
  })

  test('SKR04 erloesePflege → 4120', () => {
    assert.equal(getKonto('SKR04', 'erloesePflege').konto, '4120')
  })

  test('SKR03 bank → 1200', () => {
    assert.equal(getKonto('SKR03', 'bank').konto, '1200')
  })

  test('SKR04 bank → 1800', () => {
    assert.equal(getKonto('SKR04', 'bank').konto, '1800')
  })

  test('alle Schlüssel liefern Werte für beide Rahmen', () => {
    const schluessel = ['erloesePflege', 'erloese19', 'sonstigeErloese', 'mahngebuehren', 'bank', 'forderungen', 'nebenkostenGeldverkehr'] as const
    for (const s of schluessel) {
      assert.ok(getKonto('SKR03', s).konto, `SKR03.${s} fehlt`)
      assert.ok(getKonto('SKR04', s).konto, `SKR04.${s} fehlt`)
    }
  })
})

describe('getUStSchluessel', () => {
  test('steuerfrei → 0', () => {
    assert.equal(getUStSchluessel(true), 0)
  })

  test('steuerpflichtig → 3', () => {
    assert.equal(getUStSchluessel(false), 3)
  })
})

// ---------------------------------------------------------------------------
// esc (HTML-Escaping — XSS-Schutz)
// ---------------------------------------------------------------------------

describe('esc', () => {
  test('& → &amp;', () => {
    assert.equal(esc('A & B'), 'A &amp; B')
  })

  test('< → &lt;', () => {
    assert.equal(esc('<script>'), '&lt;script&gt;')
  })

  test('" → &quot;', () => {
    assert.equal(esc('a "test"'), 'a &quot;test&quot;')
  })

  test('kombiniert: alle Zeichen', () => {
    assert.equal(esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;')
  })

  test('normaler Text unverändert', () => {
    assert.equal(esc('Hallo Welt'), 'Hallo Welt')
  })

  test('leerer String → leerer String', () => {
    assert.equal(esc(''), '')
  })

  test('Umlaute bleiben erhalten', () => {
    assert.equal(esc('Ärztlicher Befund'), 'Ärztlicher Befund')
  })

  test('XSS-Vektor wird neutralisiert', () => {
    const xss = '<img src=x onerror="alert(1)">'
    const escaped = esc(xss)
    assert.ok(!escaped.includes('<'))
    assert.ok(!escaped.includes('>'))
  })
})

// ---------------------------------------------------------------------------
// assertErlaubt
// ---------------------------------------------------------------------------

describe('assertErlaubt', () => {
  test('gültiger Wert → kein Fehler', () => {
    assert.doesNotThrow(() => assertErlaubt('aktiv', VERTRAGSSTATUS_WERTE, 'status'))
  })

  test('ungültiger Wert → Fehler mit Feldname', () => {
    assert.throws(
      () => assertErlaubt('fantasie' as any, VERTRAGSSTATUS_WERTE, 'status'),
      /status/
    )
  })

  test('null → kein Fehler (optional)', () => {
    assert.doesNotThrow(() => assertErlaubt(null, VERTRAGSSTATUS_WERTE, 'status'))
  })

  test('undefined → kein Fehler (optional)', () => {
    assert.doesNotThrow(() => assertErlaubt(undefined, VERTRAGSSTATUS_WERTE, 'status'))
  })

  test('funktioniert mit allen Enum-Arrays', () => {
    assert.doesNotThrow(() => assertErlaubt('pflichtschulung', SCHULUNGSART_WERTE, 'art'))
    assert.doesNotThrow(() => assertErlaubt('geplant', DIENSTPLAN_STATUS_WERTE, 'status'))
  })

  test('Fehlermeldung enthält ungültigen Wert', () => {
    assert.throws(
      () => assertErlaubt('xyz' as any, VERTRAGSSTATUS_WERTE, 'feld'),
      /xyz/
    )
  })
})

// ---------------------------------------------------------------------------
// assertPlausibleZeiten
// ---------------------------------------------------------------------------

describe('assertPlausibleZeiten', () => {
  test('gültige Werte → kein Fehler', () => {
    assert.doesNotThrow(() => assertPlausibleZeiten({ istMinuten: 480, pauseMinuten: 30 }))
  })

  test('istMinuten = 0 → Fehler (muss > 0)', () => {
    assert.throws(() => assertPlausibleZeiten({ istMinuten: 0 }), /größer als 0/)
  })

  test('istMinuten negativ → Fehler', () => {
    assert.throws(() => assertPlausibleZeiten({ istMinuten: -10 }))
  })

  test('istMinuten > 1440 → Fehler', () => {
    assert.throws(() => assertPlausibleZeiten({ istMinuten: 1441 }), /1440/)
  })

  test('istMinuten = 1440 → gültig (genau 24h)', () => {
    assert.doesNotThrow(() => assertPlausibleZeiten({ istMinuten: 1440 }))
  })

  test('pauseMinuten negativ → Fehler', () => {
    assert.throws(() => assertPlausibleZeiten({ pauseMinuten: -1 }), /negativ/)
  })

  test('pauseMinuten = 0 → gültig', () => {
    assert.doesNotThrow(() => assertPlausibleZeiten({ pauseMinuten: 0 }))
  })

  test('pauseMinuten > 1440 → Fehler', () => {
    assert.throws(() => assertPlausibleZeiten({ pauseMinuten: 1441 }), /1440/)
  })

  test('leeres Objekt → kein Fehler (alle optional)', () => {
    assert.doesNotThrow(() => assertPlausibleZeiten({}))
  })

  test('NaN istMinuten → Fehler', () => {
    assert.throws(() => assertPlausibleZeiten({ istMinuten: NaN }))
  })

  test('Infinity pauseMinuten → Fehler', () => {
    assert.throws(() => assertPlausibleZeiten({ pauseMinuten: Infinity }))
  })
})

// ---------------------------------------------------------------------------
// KETTEN_SCHRITTE + schrittHref
// ---------------------------------------------------------------------------

describe('KETTEN_SCHRITTE', () => {
  test('13 Schritte definiert', () => {
    assert.equal(KETTEN_SCHRITTE.length, 13)
  })

  test('aufsteigende Nummerierung 1-13', () => {
    for (let i = 0; i < KETTEN_SCHRITTE.length; i++) {
      assert.equal(KETTEN_SCHRITTE[i].nr, i + 1)
    }
  })

  test('alle IDs eindeutig', () => {
    const ids = KETTEN_SCHRITTE.map(s => s.id)
    assert.equal(new Set(ids).size, ids.length)
  })

  test('alle haben href', () => {
    for (const s of KETTEN_SCHRITTE) {
      assert.ok(s.href.startsWith('/'), `Schritt ${s.id}: href fehlt/ungültig`)
    }
  })

  test('erster Schritt = kunde, letzter = datev', () => {
    assert.equal(KETTEN_SCHRITTE[0].id, 'kunde')
    assert.equal(KETTEN_SCHRITTE[12].id, 'datev')
  })
})

describe('schrittHref', () => {
  test('ersetzt {clientId}', () => {
    assert.equal(schrittHref('/admin/clients/{clientId}', 'abc-123'), '/admin/clients/abc-123')
  })

  test('ohne Platzhalter → unverändert', () => {
    assert.equal(schrittHref('/admin/budgets', 'abc-123'), '/admin/budgets')
  })

  test('leere clientId', () => {
    assert.equal(schrittHref('/admin/clients/{clientId}', ''), '/admin/clients/')
  })
})
