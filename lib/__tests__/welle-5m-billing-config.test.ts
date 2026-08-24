// ═══════════════════════════════════════════════════════════════
// Welle 5m — Billing-Core + Config + Leistungsarten + Kunde
// ═══════════════════════════════════════════════════════════════
//
// xml-escape:          escapeXml, formatCiiDate, formatAmount, formatQuantity
// status-machine:      isTransitionAllowed, getAllowedTransitions,
//                      isTerminalStatus, isValidInvoiceStatus,
//                      validateTransition, isCorrectionTransitionAllowed,
//                      validateCorrectionTransition
// tarif-verifizierung: istTarifStatus, normalisiereStatus, istPrivattarif,
//                      bewerteAbrechenbarkeit, anforderungFuerStatus,
//                      pruefeStatusaenderung, pruefeBelegDatei,
//                      sanitizeBelegDateiname, berechneKennzahlen
// leistungsarten:      normalisiereLeistungsart, tarifLeistungsart,
//                      bekannteLeistungsarten
// budget-constants:    budgetVersionFuerJahr, budgetVersionFuerJahrOderNull,
//                      BudgetVersionFehltError, BUDGET_VERSIONEN
// kunde/leistungen:    budgetTypeLabel, serviceTypeLabel, fmtDuration
// coach/freigabe:      istAktiveFreigabe, normalisiereEmail
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// ── xml-escape ──
import { escapeXml, formatCiiDate, formatAmount, formatQuantity } from '../billing/xrechnung/xml-escape'

// ── status-machine ──
import {
  isTransitionAllowed,
  getAllowedTransitions,
  isTerminalStatus,
  isValidInvoiceStatus,
  validateTransition,
  isCorrectionTransitionAllowed,
  validateCorrectionTransition,
  INVOICE_STATUS_LABELS,
} from '../billing/core/status-machine'

// ── tarif-verifizierung ──
import {
  istTarifStatus,
  normalisiereStatus,
  istPrivattarif,
  bewerteAbrechenbarkeit,
  anforderungFuerStatus,
  pruefeStatusaenderung,
  pruefeBelegDatei,
  sanitizeBelegDateiname,
  berechneKennzahlen,
  QUELLE_MIN_LAENGE,
} from '../billing/core/tarif-verifizierung'

// ── leistungsarten ──
import {
  normalisiereLeistungsart,
  tarifLeistungsart,
  bekannteLeistungsarten,
  TARIF_LEISTUNGSARTEN,
} from '../billing/leistungsarten'

// ── budget-constants ──
import {
  budgetVersionFuerJahr,
  budgetVersionFuerJahrOderNull,
  BudgetVersionFehltError,
  BUDGET_VERSIONEN,
  ENTLASTUNG_MONATLICH_EUR,
  ENTLASTUNG_JAEHRLICH_EUR,
  VP_KZP_KOMBINIERT_EUR,
} from '../config/budget-constants'

// ── kunde/leistungen ──
import { budgetTypeLabel, serviceTypeLabel, fmtDuration, MONTH_NAMES } from '../kunde/leistungen'

// ── coach/freigabe ──
import { istAktiveFreigabe, normalisiereEmail, EMPFAENGER_ROLLEN } from '../coach/freigabe'


// ═══════════════════════════════════════════════════════════════
// XML Escape (XRechnung)
// ═══════════════════════════════════════════════════════════════

describe('escapeXml', () => {
  test('& < > " \' → Entities', () => {
    assert.equal(escapeXml('A & B < "C" > \'D\''), 'A &amp; B &lt; &quot;C&quot; &gt; &apos;D&apos;')
  })

  test('normaler Text → unverändert', () => {
    assert.equal(escapeXml('Alltagsbegleitung'), 'Alltagsbegleitung')
  })

  test('null → leerer String', () => {
    assert.equal(escapeXml(null), '')
  })

  test('undefined → leerer String', () => {
    assert.equal(escapeXml(undefined), '')
  })

  test('Zahl → String', () => {
    assert.equal(escapeXml(42), '42')
  })
})

describe('formatCiiDate', () => {
  test('ISO-Datum → YYYYMMDD', () => {
    assert.equal(formatCiiDate('2026-08-24'), '20260824')
  })

  test('Date-Objekt', () => {
    assert.equal(formatCiiDate(new Date(2026, 0, 15)), '20260115')
  })

  test('null → leerer String', () => {
    assert.equal(formatCiiDate(null), '')
  })

  test('ungültig → leerer String', () => {
    assert.equal(formatCiiDate('kein-datum'), '')
  })
})

describe('formatAmount', () => {
  test('131.5 → "131.50"', () => {
    assert.equal(formatAmount(131.5), '131.50')
  })

  test('null → "0.00"', () => {
    assert.equal(formatAmount(null), '0.00')
  })

  test('undefined → "0.00"', () => {
    assert.equal(formatAmount(undefined), '0.00')
  })
})

describe('formatQuantity', () => {
  test('ganzzahlig: 5 → "5"', () => {
    assert.equal(formatQuantity(5), '5')
  })

  test('dezimal: 1.5 → "1.5"', () => {
    assert.equal(formatQuantity(1.5), '1.5')
  })

  test('trailing zeros entfernt: 2.1000 → "2.1"', () => {
    assert.equal(formatQuantity(2.1), '2.1')
  })

  test('null → "0"', () => {
    assert.equal(formatQuantity(null), '0')
  })
})

// ═══════════════════════════════════════════════════════════════
// Status-Machine
// ═══════════════════════════════════════════════════════════════

describe('isTransitionAllowed', () => {
  test('entwurf → geprueft: erlaubt', () => {
    assert.equal(isTransitionAllowed('entwurf', 'geprueft'), true)
  })

  test('entwurf → bezahlt: verboten', () => {
    assert.equal(isTransitionAllowed('entwurf', 'bezahlt'), false)
  })

  test('bezahlt → entwurf: verboten (Terminal)', () => {
    assert.equal(isTransitionAllowed('bezahlt', 'entwurf'), false)
  })

  test('strittig → bezahlt: erlaubt', () => {
    assert.equal(isTransitionAllowed('strittig', 'bezahlt'), true)
  })
})

describe('getAllowedTransitions', () => {
  test('entwurf → [geprueft, storniert]', () => {
    const t = getAllowedTransitions('entwurf')
    assert.ok(t.includes('geprueft'))
    assert.ok(t.includes('storniert'))
    assert.equal(t.length, 2)
  })

  test('bezahlt → [] (Terminal)', () => {
    assert.deepEqual(getAllowedTransitions('bezahlt'), [])
  })
})

describe('isTerminalStatus', () => {
  test('bezahlt, akzeptiert, storniert, abgeschrieben → true', () => {
    for (const s of ['bezahlt', 'akzeptiert', 'storniert', 'abgeschrieben'] as const) {
      assert.equal(isTerminalStatus(s), true, `${s} soll Terminal sein`)
    }
  })

  test('entwurf, geprueft → false', () => {
    assert.equal(isTerminalStatus('entwurf'), false)
    assert.equal(isTerminalStatus('geprueft'), false)
  })
})

describe('isValidInvoiceStatus', () => {
  test('bekannte Status → true', () => {
    assert.equal(isValidInvoiceStatus('entwurf'), true)
    assert.equal(isValidInvoiceStatus('bezahlt'), true)
  })

  test('unbekannt → false', () => {
    assert.equal(isValidInvoiceStatus('fantasie'), false)
  })
})

describe('validateTransition', () => {
  test('gültiger Übergang → kein Fehler', () => {
    assert.doesNotThrow(() => validateTransition('entwurf', 'geprueft'))
  })

  test('Terminal → wirft', () => {
    assert.throws(() => validateTransition('bezahlt', 'entwurf'), /kann nicht mehr/)
  })

  test('ungültiger Übergang → wirft mit erlaubten Status', () => {
    assert.throws(() => validateTransition('entwurf', 'bezahlt'), /Erlaubt/)
  })
})

describe('isCorrectionTransitionAllowed', () => {
  test('entwurf → freigegeben: erlaubt', () => {
    assert.equal(isCorrectionTransitionAllowed('entwurf', 'freigegeben'), true)
  })

  test('verarbeitet → entwurf: verboten', () => {
    assert.equal(isCorrectionTransitionAllowed('verarbeitet', 'entwurf'), false)
  })
})

describe('validateCorrectionTransition', () => {
  test('gültig → kein Fehler', () => {
    assert.doesNotThrow(() => validateCorrectionTransition('entwurf', 'freigegeben'))
  })

  test('ungültig → wirft', () => {
    assert.throws(() => validateCorrectionTransition('entwurf', 'verarbeitet'))
  })
})

// ═══════════════════════════════════════════════════════════════
// Tarif-Verifizierung
// ═══════════════════════════════════════════════════════════════

describe('istTarifStatus', () => {
  test('verified/unverified/blocked → true', () => {
    assert.equal(istTarifStatus('verified'), true)
    assert.equal(istTarifStatus('unverified'), true)
    assert.equal(istTarifStatus('blocked'), true)
  })

  test('andere Werte → false', () => {
    assert.equal(istTarifStatus('fantasy'), false)
    assert.equal(istTarifStatus(null), false)
    assert.equal(istTarifStatus(42), false)
  })
})

describe('normalisiereStatus', () => {
  test('verified → verified', () => {
    assert.equal(normalisiereStatus('verified'), 'verified')
  })

  test('null → unverified (fail-closed)', () => {
    assert.equal(normalisiereStatus(null), 'unverified')
  })

  test('Müll → unverified', () => {
    assert.equal(normalisiereStatus('abc'), 'unverified')
  })
})

describe('istPrivattarif', () => {
  test('billing_tariffs + privat → true', () => {
    assert.equal(istPrivattarif({ quellTabelle: 'billing_tariffs', rechtsgrundlage: 'privat' }), true)
  })

  test('billing_tariffs + §45a → false', () => {
    assert.equal(istPrivattarif({ quellTabelle: 'billing_tariffs', rechtsgrundlage: '§45a' }), false)
  })

  test('leistungspreise → immer false (Kassenpreis)', () => {
    assert.equal(istPrivattarif({ quellTabelle: 'leistungspreise', rechtsgrundlage: 'privat' }), false)
  })
})

describe('bewerteAbrechenbarkeit', () => {
  test('blocked → nie abrechenbar', () => {
    const r = bewerteAbrechenbarkeit({ quellTabelle: 'billing_tariffs', tarifStatus: 'blocked' })
    assert.equal(r.abrechenbar, false)
  })

  test('Kassentarif verified → abrechenbar', () => {
    const r = bewerteAbrechenbarkeit({ quellTabelle: 'billing_tariffs', tarifStatus: 'verified', rechtsgrundlage: '§45a' })
    assert.equal(r.abrechenbar, true)
  })

  test('Kassentarif unverified → nicht abrechenbar', () => {
    const r = bewerteAbrechenbarkeit({ quellTabelle: 'billing_tariffs', tarifStatus: 'unverified', rechtsgrundlage: '§45a' })
    assert.equal(r.abrechenbar, false)
  })

  test('Privattarif unverified → abrechenbar (Privatpreise frei)', () => {
    const r = bewerteAbrechenbarkeit({ quellTabelle: 'billing_tariffs', tarifStatus: 'unverified', rechtsgrundlage: 'privat' })
    assert.equal(r.abrechenbar, true)
  })

  test('Privattarif blocked → nicht abrechenbar', () => {
    const r = bewerteAbrechenbarkeit({ quellTabelle: 'billing_tariffs', tarifStatus: 'blocked', rechtsgrundlage: 'privat' })
    assert.equal(r.abrechenbar, false)
  })
})

describe('anforderungFuerStatus', () => {
  test('verified Kassentarif → Quelle + Beleg', () => {
    const r = anforderungFuerStatus('verified', { quellTabelle: 'billing_tariffs', rechtsgrundlage: '§45a' })
    assert.equal(r.quelleErforderlich, true)
    assert.equal(r.belegErforderlich, true)
  })

  test('verified Privattarif → Quelle, kein Beleg', () => {
    const r = anforderungFuerStatus('verified', { quellTabelle: 'billing_tariffs', rechtsgrundlage: 'privat' })
    assert.equal(r.quelleErforderlich, true)
    assert.equal(r.belegErforderlich, false)
  })

  test('blocked → Quelle (Begründung), kein Beleg', () => {
    const r = anforderungFuerStatus('blocked', { quellTabelle: 'billing_tariffs' })
    assert.equal(r.quelleErforderlich, true)
    assert.equal(r.belegErforderlich, false)
  })

  test('unverified → nichts', () => {
    const r = anforderungFuerStatus('unverified', { quellTabelle: 'billing_tariffs' })
    assert.equal(r.quelleErforderlich, false)
    assert.equal(r.belegErforderlich, false)
  })
})

describe('pruefeStatusaenderung', () => {
  test('gültige Freigabe → ok', () => {
    const r = pruefeStatusaenderung({
      zielStatus: 'verified',
      quelle: 'Vergütungsvereinbarung AOK Hessen 2026',
      belegId: 'beleg-123',
      quellTabelle: 'billing_tariffs',
      rechtsgrundlage: '§45a',
    })
    assert.equal(r.ok, true)
  })

  test('ungültiger Status → Fehler', () => {
    const r = pruefeStatusaenderung({
      zielStatus: 'fantasy',
      quellTabelle: 'billing_tariffs',
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.ok(r.fehler.includes('Ungültiger Status'))
  })

  test('Quelle zu kurz → Fehler', () => {
    const r = pruefeStatusaenderung({
      zielStatus: 'verified',
      quelle: 'abc',
      belegId: 'beleg-1',
      quellTabelle: 'billing_tariffs',
      rechtsgrundlage: '§45a',
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.ok(r.fehler.includes(`${QUELLE_MIN_LAENGE}`))
  })

  test('Kassentarif ohne Beleg → Fehler', () => {
    const r = pruefeStatusaenderung({
      zielStatus: 'verified',
      quelle: 'Vergütungsvereinbarung AOK',
      quellTabelle: 'billing_tariffs',
      rechtsgrundlage: '§45a',
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.ok(r.fehler.includes('Primärbeleg'))
  })

  test('Beleg bei nicht-verified → Fehler', () => {
    const r = pruefeStatusaenderung({
      zielStatus: 'blocked',
      quelle: 'Sperrbegründung hier',
      belegId: 'beleg-x',
      quellTabelle: 'billing_tariffs',
    })
    assert.equal(r.ok, false)
    if (!r.ok) assert.ok(r.fehler.includes('nur mit dem Status'))
  })
})

describe('pruefeBelegDatei', () => {
  test('gültige PDF → ok', () => {
    const r = pruefeBelegDatei({ type: 'application/pdf', size: 500_000 })
    assert.equal(r.ok, true)
  })

  test('falscher Typ → Fehler', () => {
    const r = pruefeBelegDatei({ type: 'text/html', size: 100 })
    assert.equal(r.ok, false)
  })

  test('leere Datei → Fehler', () => {
    const r = pruefeBelegDatei({ type: 'application/pdf', size: 0 })
    assert.equal(r.ok, false)
  })

  test('zu groß → Fehler', () => {
    const r = pruefeBelegDatei({ type: 'application/pdf', size: 25 * 1024 * 1024 })
    assert.equal(r.ok, false)
    if (!r.ok) assert.ok(r.fehler.includes('20 MB'))
  })
})

describe('sanitizeBelegDateiname', () => {
  test('Umlaute → ASCII', () => {
    assert.equal(sanitizeBelegDateiname('Ärztlicher-Befund.pdf'), 'aerztlicher-Befund.pdf')
  })

  test('Sonderzeichen → _', () => {
    assert.equal(sanitizeBelegDateiname('Datei (1).pdf'), 'Datei__1_.pdf')
  })

  test('max 100 Zeichen', () => {
    assert.ok(sanitizeBelegDateiname('a'.repeat(200)).length <= 100)
  })

  test('leerer Name → "beleg"', () => {
    assert.equal(sanitizeBelegDateiname(''), 'beleg')
  })
})

describe('berechneKennzahlen', () => {
  const zeilen = [
    { quellTabelle: 'billing_tariffs' as const, tarifStatus: 'verified', rechtsgrundlage: '§45a', belegId: 'b1' },
    { quellTabelle: 'billing_tariffs' as const, tarifStatus: 'verified', rechtsgrundlage: '§45a', belegId: null },
    { quellTabelle: 'billing_tariffs' as const, tarifStatus: 'unverified', rechtsgrundlage: '§45a' },
    { quellTabelle: 'billing_tariffs' as const, tarifStatus: 'blocked', rechtsgrundlage: 'privat' },
    { quellTabelle: 'billing_tariffs' as const, tarifStatus: 'unverified', rechtsgrundlage: 'privat' },
  ]

  test('gesamt = 5', () => {
    assert.equal(berechneKennzahlen(zeilen).gesamt, 5)
  })

  test('verified = 2', () => {
    assert.equal(berechneKennzahlen(zeilen).verified, 2)
  })

  test('verifiziertOhneBeleg = 1 (nur Kassentarife)', () => {
    assert.equal(berechneKennzahlen(zeilen).verifiziertOhneBeleg, 1)
  })

  test('abrechenbar = 3 (2 verified Kasse + 1 unverified Privat)', () => {
    assert.equal(berechneKennzahlen(zeilen).abrechenbar, 3)
  })
})

// ═══════════════════════════════════════════════════════════════
// Leistungsarten
// ═══════════════════════════════════════════════════════════════

describe('normalisiereLeistungsart', () => {
  test('Kleinschreibung + Umlaute', () => {
    assert.equal(normalisiereLeistungsart('Hauswirtschaftliche Unterstützung'), 'hauswirtschaftliche unterstuetzung')
  })

  test('Leerzeichen um / entfernt', () => {
    assert.equal(normalisiereLeistungsart('Betreuung / Gesellschaft'), 'betreuung/gesellschaft')
  })

  test('ß → ss', () => {
    assert.equal(normalisiereLeistungsart('Straßenbegleitung'), 'strassenbegleitung')
  })
})

describe('tarifLeistungsart', () => {
  test('kanonischer Schlüssel → direkt', () => {
    assert.equal(tarifLeistungsart('alltagsbegleitung'), 'alltagsbegleitung')
  })

  test('Alias: Haushaltshilfe → hauswirtschaft', () => {
    assert.equal(tarifLeistungsart('Haushaltshilfe'), 'hauswirtschaft')
  })

  test('Alias: Arztbegleitung → begleitservice', () => {
    assert.equal(tarifLeistungsart('Arztbegleitung'), 'begleitservice')
  })

  test('Alias: Betreuung / Gesellschaft → betreuung_45a', () => {
    assert.equal(tarifLeistungsart('Betreuung / Gesellschaft'), 'betreuung_45a')
  })

  test('Alias: Spaziergang / Mobilität → alltagsbegleitung', () => {
    assert.equal(tarifLeistungsart('Spaziergang / Mobilität'), 'alltagsbegleitung')
  })

  test('unbekannt → null', () => {
    assert.equal(tarifLeistungsart('Körperpflege'), null)
  })

  test('null → null', () => {
    assert.equal(tarifLeistungsart(null), null)
  })
})

describe('bekannteLeistungsarten', () => {
  test('enthält kanonische + Aliase', () => {
    const alle = bekannteLeistungsarten()
    assert.ok(alle.includes('alltagsbegleitung'))
    assert.ok(alle.includes('haushaltshilfe'))
    assert.ok(alle.length > TARIF_LEISTUNGSARTEN.length)
  })

  test('sortiert', () => {
    const alle = bekannteLeistungsarten()
    const sorted = [...alle].sort()
    assert.deepEqual(alle, sorted)
  })
})

// ═══════════════════════════════════════════════════════════════
// Budget-Constants
// ═══════════════════════════════════════════════════════════════

describe('budgetVersionFuerJahr', () => {
  test('2025 → 131 €/Monat', () => {
    const v = budgetVersionFuerJahr(2025)
    assert.equal(v.entlastungMonatlich, 131)
    assert.equal(v.entlastungJaehrlich, 1572)
  })

  test('2024 → 125 €/Monat (alte Werte)', () => {
    const v = budgetVersionFuerJahr(2024)
    assert.equal(v.entlastungMonatlich, 125)
  })

  test('2026 → gleiche Version wie 2025 (offen bis 9999)', () => {
    const v = budgetVersionFuerJahr(2026)
    assert.equal(v.entlastungMonatlich, 131)
    assert.equal(v.vpKzpKombiniert, 3539)
  })

  test('2023 → wirft BudgetVersionFehltError', () => {
    assert.throws(() => budgetVersionFuerJahr(2023), (e: unknown) => e instanceof BudgetVersionFehltError)
  })

  test('Float → wirft', () => {
    assert.throws(() => budgetVersionFuerJahr(2025.5))
  })

  test('NaN → wirft', () => {
    assert.throws(() => budgetVersionFuerJahr(NaN))
  })
})

describe('budgetVersionFuerJahrOderNull', () => {
  test('gültiges Jahr → Version', () => {
    assert.ok(budgetVersionFuerJahrOderNull(2025))
  })

  test('ungültiges Jahr → null', () => {
    assert.equal(budgetVersionFuerJahrOderNull(2010), null)
  })
})

describe('Budget-Konstanten', () => {
  test('ENTLASTUNG_MONATLICH = 131', () => {
    assert.equal(ENTLASTUNG_MONATLICH_EUR, 131)
  })

  test('ENTLASTUNG_JAEHRLICH = 1572', () => {
    assert.equal(ENTLASTUNG_JAEHRLICH_EUR, 1572)
  })

  test('VP_KZP_KOMBINIERT = 3539', () => {
    assert.equal(VP_KZP_KOMBINIERT_EUR, 3539)
  })

  test('BUDGET_VERSIONEN hat mindestens 2 Einträge', () => {
    assert.ok(BUDGET_VERSIONEN.length >= 2)
  })

  test('kein Zeitraum-Overlap in BUDGET_VERSIONEN', () => {
    for (let i = 1; i < BUDGET_VERSIONEN.length; i++) {
      assert.ok(BUDGET_VERSIONEN[i].gueltigAb > BUDGET_VERSIONEN[i - 1].gueltigAb)
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// Kunde / Leistungen
// ═══════════════════════════════════════════════════════════════

describe('budgetTypeLabel', () => {
  test('entlastung → §45b SGB XI', () => {
    assert.ok(budgetTypeLabel('entlastung').includes('§45b'))
  })

  test('unbekannt → Rohwert', () => {
    assert.equal(budgetTypeLabel('fantasy'), 'fantasy')
  })

  test('null → Strich', () => {
    assert.equal(budgetTypeLabel(null), '—')
  })
})

describe('serviceTypeLabel', () => {
  test('alltagsbegleitung → Alltagsbegleitung', () => {
    assert.equal(serviceTypeLabel('alltagsbegleitung'), 'Alltagsbegleitung')
  })

  test('null → Leistung (Default)', () => {
    assert.equal(serviceTypeLabel(null), 'Leistung')
  })
})

describe('fmtDuration', () => {
  test('90 → "1 Std 30 Min"', () => {
    assert.equal(fmtDuration(90), '1 Std 30 Min')
  })

  test('45 → "45 Min"', () => {
    assert.equal(fmtDuration(45), '45 Min')
  })

  test('120 → "2 Std"', () => {
    assert.equal(fmtDuration(120), '2 Std')
  })

  test('0 → Strich', () => {
    assert.equal(fmtDuration(0), '—')
  })

  test('null → Strich', () => {
    assert.equal(fmtDuration(null), '—')
  })
})

describe('MONTH_NAMES', () => {
  test('12 Monate', () => {
    assert.equal(MONTH_NAMES.length, 12)
  })

  test('Januar..Dezember', () => {
    assert.equal(MONTH_NAMES[0], 'Januar')
    assert.equal(MONTH_NAMES[11], 'Dezember')
  })
})

// ═══════════════════════════════════════════════════════════════
// Coach / Freigabe
// ═══════════════════════════════════════════════════════════════

describe('istAktiveFreigabe', () => {
  test('widerrufen_am null → aktiv', () => {
    assert.equal(istAktiveFreigabe({ widerrufen_am: null }), true)
  })

  test('widerrufen_am gesetzt → inaktiv', () => {
    assert.equal(istAktiveFreigabe({ widerrufen_am: '2026-08-01T10:00:00Z' }), false)
  })
})

describe('normalisiereEmail', () => {
  test('gültige E-Mail → lowercase + trimmed', () => {
    assert.equal(normalisiereEmail('  Test@Example.COM  '), 'test@example.com')
  })

  test('ungültig (kein @) → null', () => {
    assert.equal(normalisiereEmail('keine-mail'), null)
  })

  test('leer → null', () => {
    assert.equal(normalisiereEmail(''), null)
  })

  test('null → null', () => {
    assert.equal(normalisiereEmail(null), null)
  })

  test('number → null', () => {
    assert.equal(normalisiereEmail(42), null)
  })

  test('zu lang (>254) → null', () => {
    assert.equal(normalisiereEmail('a'.repeat(250) + '@b.de'), null)
  })
})

describe('EMPFAENGER_ROLLEN', () => {
  test('enthält angehoerig + pflegedienst', () => {
    assert.ok(EMPFAENGER_ROLLEN.includes('angehoerig'))
    assert.ok(EMPFAENGER_ROLLEN.includes('pflegedienst'))
  })
})
