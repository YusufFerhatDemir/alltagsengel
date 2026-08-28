/**
 * Track 13, Befund B3 — Abmelde-Token fuer den Newsletter.
 *
 * Der Befund war: `GET /api/newsletter/unsubscribe?email=<adresse>` hat
 * ohne jeden Nachweis abgemeldet. Diese Suite prueft den Nachweis selbst;
 * die Route ist in unsubscribe-route.test.ts an der Reihe.
 *
 * Jede Sperre steht hier zusammen mit ihrer GEGENPROBE: eine Pruefung,
 * die nur zeigt, dass etwas abgelehnt wird, waere auch dann gruen, wenn
 * das Modul ausnahmslos `false` zurueckgibt — und ein Abmeldelink, der
 * niemals funktioniert, ist der schlimmere Fehler (Art. 21 DSGVO: der
 * Widerspruch darf nicht erschwert werden).
 */
import { describe, it, expect } from 'vitest'
import {
  abmeldeLink,
  abmeldeSchluessel,
  erzeugeAbmeldeToken,
  normalisiereAdresse,
  pruefeAbmeldeToken,
} from '@/lib/newsletter/abmelde-token'

const ENV_EIGEN = { NEWSLETTER_ABMELDE_SECRET: 'x'.repeat(32) } as unknown as NodeJS.ProcessEnv
const ENV_ABGELEITET = { SUPABASE_SERVICE_ROLE_KEY: 'y'.repeat(40) } as unknown as NodeJS.ProcessEnv
const ENV_LEER = {} as unknown as NodeJS.ProcessEnv

describe('normalisiereAdresse', () => {
  it('macht Grossschreibung und Leerraum unerheblich', () => {
    expect(normalisiereAdresse('  Max@Example.COM ')).toBe('max@example.com')
  })

  it('vertraegt null und undefined ohne zu werfen', () => {
    expect(normalisiereAdresse(undefined as unknown as string)).toBe('')
    expect(normalisiereAdresse(null as unknown as string)).toBe('')
  })
})

describe('erzeugeAbmeldeToken', () => {
  it('ist stabil — derselbe Eingang ergibt denselben Wert', () => {
    const a = erzeugeAbmeldeToken('max@example.com', ENV_EIGEN)
    const b = erzeugeAbmeldeToken('max@example.com', ENV_EIGEN)
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('behandelt Gross-/Kleinschreibung als dieselbe Adresse', () => {
    // Die Tabelle speichert kleingeschrieben und traegt einen UNIQUE-Index.
    // Ein Token, das an der Schreibweise haengt, brauchte fuer dieselbe
    // Zeile mehrere gueltige Werte.
    expect(erzeugeAbmeldeToken('Max@Example.com', ENV_EIGEN))
      .toBe(erzeugeAbmeldeToken('max@example.com', ENV_EIGEN))
  })

  it('ergibt fuer verschiedene Adressen verschiedene Token', () => {
    expect(erzeugeAbmeldeToken('a@example.com', ENV_EIGEN))
      .not.toBe(erzeugeAbmeldeToken('b@example.com', ENV_EIGEN))
  })

  it('ergibt unter einem anderen Schluessel ein anderes Token', () => {
    expect(erzeugeAbmeldeToken('max@example.com', ENV_EIGEN))
      .not.toBe(erzeugeAbmeldeToken('max@example.com', ENV_ABGELEITET))
  })
})

describe('abmeldeSchluessel', () => {
  it('nimmt den eigenen Schluessel, wenn er da ist', () => {
    expect(abmeldeSchluessel(ENV_EIGEN)).toBe('x'.repeat(32))
  })

  it('leitet aus dem Dienstschluessel ab, statt ihn selbst zu verwenden', () => {
    const abgeleitet = abmeldeSchluessel(ENV_ABGELEITET)
    expect(abgeleitet).not.toBe('y'.repeat(40))
    expect(abgeleitet).toMatch(/^[0-9a-f]{64}$/)
  })

  it('bevorzugt den eigenen Schluessel vor der Ableitung', () => {
    const beide = { ...ENV_EIGEN, ...ENV_ABGELEITET } as unknown as NodeJS.ProcessEnv
    expect(abmeldeSchluessel(beide)).toBe('x'.repeat(32))
  })

  it('wirft, wenn gar keine Quelle da ist', () => {
    expect(() => abmeldeSchluessel(ENV_LEER)).toThrow(/Kein Schluessel/)
  })

  it('ignoriert einen zu kurzen eigenen Schluessel und weicht auf die Ableitung aus', () => {
    const env = { NEWSLETTER_ABMELDE_SECRET: 'kurz', ...ENV_ABGELEITET } as unknown as NodeJS.ProcessEnv
    expect(abmeldeSchluessel(env)).toBe(abmeldeSchluessel(ENV_ABGELEITET))
  })
})

describe('pruefeAbmeldeToken', () => {
  it('GEGENPROBE: das richtige Token wird angenommen', () => {
    // Ohne diese Pruefung waere ein Modul, das ausnahmslos `false` liefert,
    // ebenfalls gruen — und die Abmeldung dauerhaft unmoeglich.
    const token = erzeugeAbmeldeToken('max@example.com', ENV_EIGEN)
    expect(pruefeAbmeldeToken('max@example.com', token, ENV_EIGEN)).toBe(true)
  })

  it('GEGENPROBE: auch in abweichender Schreibweise', () => {
    const token = erzeugeAbmeldeToken('max@example.com', ENV_EIGEN)
    expect(pruefeAbmeldeToken('  MAX@Example.COM ', token, ENV_EIGEN)).toBe(true)
  })

  it('weist das Token einer ANDEREN Adresse ab', () => {
    // Genau der Befund: wer eine Adresse kennt, soll sie nicht abmelden
    // koennen, nur weil er irgendein gueltiges Token besitzt.
    const fremd = erzeugeAbmeldeToken('opfer@example.com', ENV_EIGEN)
    expect(pruefeAbmeldeToken('taeter@example.com', fremd, ENV_EIGEN)).toBe(false)
  })

  it('weist ein fehlendes Token ab', () => {
    expect(pruefeAbmeldeToken('max@example.com', '', ENV_EIGEN)).toBe(false)
    expect(pruefeAbmeldeToken('max@example.com', undefined, ENV_EIGEN)).toBe(false)
    expect(pruefeAbmeldeToken('max@example.com', null, ENV_EIGEN)).toBe(false)
  })

  it('weist ein Token falschen Typs ab, ohne zu werfen', () => {
    expect(pruefeAbmeldeToken('max@example.com', 42, ENV_EIGEN)).toBe(false)
    expect(pruefeAbmeldeToken('max@example.com', { t: 'x' }, ENV_EIGEN)).toBe(false)
  })

  it('weist ein Token falscher Laenge ab, ohne zu werfen', () => {
    // timingSafeEqual wirft bei ungleich langen Puffern — die
    // Laengenpruefung davor ist keine Kosmetik.
    expect(pruefeAbmeldeToken('max@example.com', 'ab', ENV_EIGEN)).toBe(false)
    expect(pruefeAbmeldeToken('max@example.com', 'f'.repeat(200), ENV_EIGEN)).toBe(false)
  })

  it('weist ein Token unter fehlendem Schluessel ab, statt zu werfen', () => {
    const token = erzeugeAbmeldeToken('max@example.com', ENV_EIGEN)
    expect(pruefeAbmeldeToken('max@example.com', token, ENV_LEER)).toBe(false)
  })

  it('weist ein unter anderem Schluessel erzeugtes Token ab', () => {
    const token = erzeugeAbmeldeToken('max@example.com', ENV_ABGELEITET)
    expect(pruefeAbmeldeToken('max@example.com', token, ENV_EIGEN)).toBe(false)
  })

  it('weist ein um ein Zeichen abweichendes Token ab', () => {
    const token = erzeugeAbmeldeToken('max@example.com', ENV_EIGEN)
    const verdreht = (token[0] === 'a' ? 'b' : 'a') + token.slice(1)
    expect(pruefeAbmeldeToken('max@example.com', verdreht, ENV_EIGEN)).toBe(false)
  })
})

describe('abmeldeLink', () => {
  it('enthaelt Adresse und passendes Token', () => {
    const link = abmeldeLink('Max@Example.com', 'https://alltagsengel.care', ENV_EIGEN)
    const url = new URL(link)
    expect(url.pathname).toBe('/api/newsletter/unsubscribe')
    expect(url.searchParams.get('email')).toBe('max@example.com')
    expect(pruefeAbmeldeToken('max@example.com', url.searchParams.get('token'), ENV_EIGEN)).toBe(true)
  })

  it('vertraegt einen Basis-URL mit Schrägstrich am Ende', () => {
    const link = abmeldeLink('max@example.com', 'https://alltagsengel.care/', ENV_EIGEN)
    expect(link).not.toContain('care//api')
  })

  it('kodiert Sonderzeichen der Adresse', () => {
    const link = abmeldeLink('a+b@example.com', 'https://alltagsengel.care', ENV_EIGEN)
    expect(link).toContain('a%2Bb%40example.com')
    // Und der Rueckweg stimmt trotzdem.
    expect(new URL(link).searchParams.get('email')).toBe('a+b@example.com')
  })
})
