/**
 * ATS-Arbeitsfelder.
 * @see lib/bewerbung/ats-felder.ts
 *
 * Zwei Regeln stehen im Mittelpunkt:
 *  1. Ein unbekannter Wert wird ABGEWIESEN, nicht verworfen.
 *  2. `darfAlsVerifiziertGelten()` ist immer `false` — und zwar aus einem
 *     fachlichen Grund, nicht weil die Funktion unfertig wäre.
 */
import { describe, it, expect } from 'vitest'
import {
  ATS_FELDER, AUS_FORMULAR, FZ_STATUS, MOBILITAET,
  PRIORITAET_MIN, PRIORITAET_MAX,
  pruefeAtsFelder, atsFelderAus, mitAtsFeldern, darfAlsVerifiziertGelten,
  type AtsFelder,
} from '@/lib/bewerbung/ats-felder'
import { mitPipelineStufe, mitPrio, prioUndBlocker, stufeFuerBewerbung } from '@/lib/bewerbung/pipeline'

const JETZT = new Date('2026-09-13T10:00:00Z')

describe('Feldkatalog', () => {
  it('genau fünfzehn Felder', () => {
    expect(ATS_FELDER).toHaveLength(15)
  })

  it('vier davon stammen aus dem Formular und werden hier nicht geschrieben', () => {
    expect([...AUS_FORMULAR].sort()).toEqual(['fuehrerschein', 'qualifikation', 'sprachen', 'verfuegbarkeit'])
    for (const f of AUS_FORMULAR) expect(ATS_FELDER).toContain(f)
  })

  it('Referenzfelder landen NICHT im gespeicherten Objekt — kein zweiter Ort', () => {
    const r = pruefeAtsFelder({
      qualifikation: 'pflegefachkraft', fuehrerschein: 'ja_mit_auto',
      sprachen: ['deutsch'], verfuegbarkeit: ['vormittags'],
      startdatum: '2026-10-01',
    })
    expect(r.fehler).toBeNull()
    expect(r.felder).toEqual({ startdatum: '2026-10-01' })
  })

  it('jeder Katalogwert hat einen Anzeigetext', () => {
    for (const k of [FZ_STATUS, MOBILITAET]) {
      for (const [wert, text] of Object.entries(k)) {
        expect(text.length, wert).toBeGreaterThan(4)
        expect(text).not.toBe(wert)
      }
    }
  })
})

describe('pruefeAtsFelder — Annahme', () => {
  it('nimmt einen vollständigen Satz an', () => {
    const r = pruefeAtsFelder({
      startdatum: '2026-10-01', fzStatus: 'beantragt', fzDatum: '2026-09-05',
      erfahrungJahre: 8, mobilitaet: 'eigenes_auto', stundenProWoche: 20,
      einsatzgebiet: ['Hanau', 'Maintal'], notizen: 'Telefonat 13.09.',
      naechsteAktion: 'Gespräch vereinbaren', letzterKontakt: '2026-09-13T09:00:00Z',
      prioritaet: 1,
    })
    expect(r.fehler).toBeNull()
    expect(r.felder.erfahrungJahre).toBe(8)
    expect(r.felder.einsatzgebiet).toEqual(['Hanau', 'Maintal'])
  })

  it('alles optional — ein leerer Satz ist kein Fehler', () => {
    expect(pruefeAtsFelder({})).toEqual({ felder: {}, fehler: null })
  })

  it('leere Zeichenkette und null zählen als „nicht erhoben"', () => {
    const r = pruefeAtsFelder({ startdatum: '', notizen: null, prioritaet: '' })
    expect(r.fehler).toBeNull()
    expect(r.felder).toEqual({})
  })

  it('doppelte Einsatzorte fallen weg, Reihenfolge bleibt', () => {
    const r = pruefeAtsFelder({ einsatzgebiet: ['Hanau', 'Maintal', 'Hanau'] })
    expect(r.felder.einsatzgebiet).toEqual(['Hanau', 'Maintal'])
  })
})

describe('pruefeAtsFelder — Abweisung statt stiller Verwerfung', () => {
  it.each([
    ['unbekannter FZ-Status', { fzStatus: 'unterwegs' }, /fzStatus/],
    ['unbekannte Mobilität', { mobilitaet: 'hubschrauber' }, /mobilitaet/],
    ['Datum im falschen Format', { startdatum: '01.10.2026' }, /startdatum/],
    ['Priorität zu hoch', { prioritaet: 9 }, /prioritaet/],
    ['Priorität zu niedrig', { prioritaet: 0 }, /prioritaet/],
    ['Erfahrung negativ', { erfahrungJahre: -1 }, /erfahrungJahre/],
    ['Erfahrung unrealistisch', { erfahrungJahre: 99 }, /erfahrungJahre/],
    ['Stunden über 60', { stundenProWoche: 80 }, /stundenProWoche/],
    ['Stunden null', { stundenProWoche: 0 }, /stundenProWoche/],
    ['Nachkommastelle', { prioritaet: 2.5 }, /prioritaet/],
    ['Einsatzgebiet kein Array', { einsatzgebiet: 'Hanau' }, /einsatzgebiet/],
    ['Einsatzgebiet mit Zahl', { einsatzgebiet: ['Hanau', 42] }, /einsatzgebiet/],
    ['Notiz zu lang', { notizen: 'x'.repeat(4001) }, /notizen/],
    ['Objekt statt Text', { naechsteAktion: { $ne: null } }, /naechsteAktion/],
  ])('weist %s ab', (_fall, eingabe, muster) => {
    const r = pruefeAtsFelder(eingabe as Record<string, unknown>)
    expect(r.fehler).toMatch(muster)
    expect(r.felder).toEqual({})
  })

  it('FZ-Datum ohne Status ist eine Angabe über nichts', () => {
    const r = pruefeAtsFelder({ fzDatum: '2026-09-05' })
    expect(r.fehler).toMatch(/fzDatum ohne fzStatus/)
  })

  it('FZ-Datum MIT Status geht durch', () => {
    const r = pruefeAtsFelder({ fzDatum: '2026-09-05', fzStatus: 'eingetroffen' })
    expect(r.fehler).toBeNull()
    expect(r.felder.fzDatum).toBe('2026-09-05')
  })

  it('Fremdfelder landen nicht im Objekt', () => {
    const r = pruefeAtsFelder({ prioritaet: 2, rolle: 'superadmin', organization_id: 'fremd' })
    expect(r.felder).toEqual({ prioritaet: 2 })
  })
})

describe('Ablage im jsonb', () => {
  it('geht verlustfrei hin und zurück', () => {
    const f: AtsFelder = { startdatum: '2026-10-01', prioritaet: 1, einsatzgebiet: ['Hanau'] }
    expect(atsFelderAus(mitAtsFeldern(null, f))).toEqual(f)
  })

  it('lässt Formularangaben, Stufe, Priorität und Blocker unangetastet', () => {
    let daten: unknown = { version: 1, qualifikation: 'pflegehelfer' }
    daten = mitPrio(daten, '1')
    daten = mitPipelineStufe(daten, 'vorstellungsgespraech', JETZT, 'Verwaltung')
    daten = mitAtsFeldern(daten, { startdatum: '2026-10-01', prioritaet: 2 })

    const d = daten as Record<string, unknown>
    expect(d.version).toBe(1)
    expect(d.qualifikation).toBe('pflegehelfer')
    expect(prioUndBlocker(daten).prio).toBe('1')
    expect(stufeFuerBewerbung(daten, 'qualified').stufe).toBe('vorstellungsgespraech')
    expect(atsFelderAus(daten).startdatum).toBe('2026-10-01')
  })

  it('umgekehrt: ein Stufenwechsel löscht die Arbeitsfelder nicht', () => {
    let daten: unknown = mitAtsFeldern(null, { prioritaet: 3, notizen: 'bleibt' })
    daten = mitPipelineStufe(daten, 'kontaktiert', JETZT, null)
    expect(atsFelderAus(daten)).toEqual({ prioritaet: 3, notizen: 'bleibt' })
  })

  it('undefined entfernt ein Feld, statt es auf null zu setzen', () => {
    const daten = mitAtsFeldern(mitAtsFeldern(null, { prioritaet: 1, notizen: 'weg' }),
      { notizen: undefined })
    expect(atsFelderAus(daten)).toEqual({ prioritaet: 1 })
    expect(JSON.stringify(daten)).not.toContain('null')
  })

  it('der letzte leere Satz entfernt den ganzen Zweig', () => {
    const daten = mitAtsFeldern(mitAtsFeldern(null, { prioritaet: 1 }), { prioritaet: undefined })
    expect(daten).not.toHaveProperty('ats')
  })

  it('kaputte Nutzlast ergibt leere Felder, keinen Absturz', () => {
    expect(atsFelderAus({ ats: 'kein Objekt' })).toEqual({})
    expect(atsFelderAus({ ats: ['Liste'] })).toEqual({})
    expect(atsFelderAus(null)).toEqual({})
  })
})

describe('darfAlsVerifiziertGelten', () => {
  it('ist false bei leeren Feldern', () => {
    expect(darfAlsVerifiziertGelten({})).toBe(false)
  })

  it('ist false, auch wenn ALLE fünfzehn Felder gesetzt sind', () => {
    expect(darfAlsVerifiziertGelten({
      startdatum: '2026-10-01', fzStatus: 'eingetroffen', fzDatum: '2026-09-05',
      qualifikation: 'pflegefachkraft', erfahrungJahre: 20, fuehrerschein: 'ja_mit_auto',
      mobilitaet: 'eigenes_auto', verfuegbarkeit: ['flexibel'], stundenProWoche: 40,
      einsatzgebiet: ['Frankfurt'], sprachen: ['deutsch'], notizen: 'alles geprüft',
      letzterKontakt: '2026-09-13T09:00:00Z', naechsteAktion: 'Vertrag', prioritaet: 1,
    })).toBe(false)
  })

  it('„fzStatus = eingetroffen" macht daraus keinen Nachweis', () => {
    // Der Kern: jemand hat das in eine Maske getippt. Ein Dokument liegt
    // deshalb nicht vor. Bei § 45a haengt daran die Einsatzfreigabe.
    expect(darfAlsVerifiziertGelten({ fzStatus: 'eingetroffen', fzDatum: '2026-09-05' })).toBe(false)
  })
})

describe('Grenzen', () => {
  it('Priorität 1 bis 5 sind gültig, die Ränder eingeschlossen', () => {
    for (let p = PRIORITAET_MIN; p <= PRIORITAET_MAX; p++) {
      expect(pruefeAtsFelder({ prioritaet: p }).fehler, `prio ${p}`).toBeNull()
    }
  })
  it('Stunden 1 und 60 sind die Ränder', () => {
    expect(pruefeAtsFelder({ stundenProWoche: 1 }).fehler).toBeNull()
    expect(pruefeAtsFelder({ stundenProWoche: 60 }).fehler).toBeNull()
    expect(pruefeAtsFelder({ stundenProWoche: 61 }).fehler).not.toBeNull()
  })
})
