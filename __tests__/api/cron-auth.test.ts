// ═══════════════════════════════════════════════════════════════════════
// Cron-Bearer-Prüfung (lib/api/cron-auth.ts)
//
// Dieses Modul ist die einzige Sperre vor allen Automatisierungs-Endpunkten
// (Mahnlauf, Zustellungs-Retry, Fristen-Warnung, IndexNow …). Es existiert,
// weil derselbe Vergleich vorher achtmal ausgeschrieben dastand und zwei
// Kopien den Null-Riegel NICHT hatten: ohne gesetztes CRON_SECRET lautete
// der erwartete Header wörtlich "Bearer undefined" — den kann jeder senden.
//
// Getestet wird deshalb vor allem, was NICHT durchkommen darf. Die Suite
// war bis hierher nicht vorhanden; das Modul hatte keinen einzigen Test.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  pruefeCronGeheimnis,
  istCronGeheimnis,
  cronAuthHeader,
} from '@/lib/api/cron-auth'

const GEHEIMNIS = 'zR7-echtes-cron-geheimnis-fuer-den-test'

const urspruenglich = process.env.CRON_SECRET

function anfrage(authHeader?: string): Request {
  return new Request('https://alltagsengel.care/api/cron/mahnlauf', {
    headers: authHeader === undefined ? {} : { authorization: authHeader },
  })
}

beforeEach(() => {
  process.env.CRON_SECRET = GEHEIMNIS
})

afterEach(() => {
  if (urspruenglich === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = urspruenglich
})

// ---------------------------------------------------------------------------

describe('pruefeCronGeheimnis — der berechtigte Fall', () => {
  it('lässt den korrekten Bearer-Header durch (null = kein Abweisungs-Response)', () => {
    expect(pruefeCronGeheimnis(anfrage(`Bearer ${GEHEIMNIS}`))).toBeNull()
  })
})

describe('pruefeCronGeheimnis — fail-closed ohne gesetztes Geheimnis', () => {
  it('weist ab, wenn CRON_SECRET nicht gesetzt ist — auch ohne Header', async () => {
    delete process.env.CRON_SECRET
    const antwort = pruefeCronGeheimnis(anfrage())
    expect(antwort?.status).toBe(401)
  })

  it('weist "Bearer undefined" ab — der Header, der ohne Null-Riegel gepasst hätte', async () => {
    delete process.env.CRON_SECRET
    expect(pruefeCronGeheimnis(anfrage('Bearer undefined'))?.status).toBe(401)
  })

  it('weist bei leerem CRON_SECRET auch den leeren Bearer ab', () => {
    process.env.CRON_SECRET = ''
    expect(pruefeCronGeheimnis(anfrage('Bearer '))?.status).toBe(401)
    expect(pruefeCronGeheimnis(anfrage('Bearer'))?.status).toBe(401)
  })
})

describe('pruefeCronGeheimnis — abgelehnte Header', () => {
  const faelle: Array<[string, string | undefined]> = [
    ['gar kein Header', undefined],
    ['leerer Header', ''],
    ['falsches Geheimnis', 'Bearer falsch'],
    ['Geheimnis ohne Bearer-Präfix', GEHEIMNIS],
    ['falsche Groß-/Kleinschreibung des Präfixes', `bearer ${GEHEIMNIS}`],
    ['anderes Schema', `Basic ${GEHEIMNIS}`],
    ['Präfix stimmt, Geheimnis abgeschnitten', `Bearer ${GEHEIMNIS.slice(0, -1)}`],
    ['Geheimnis mit angehängtem Zeichen', `Bearer ${GEHEIMNIS}x`],
    ['Geheimnis mit führendem Leerzeichen', `Bearer  ${GEHEIMNIS}`],
    ['zweites Token angehängt', `Bearer ${GEHEIMNIS} extra`],
  ]

  for (const [bezeichnung, header] of faelle) {
    it(`weist ab: ${bezeichnung}`, () => {
      const antwort = pruefeCronGeheimnis(anfrage(header))
      expect(antwort, bezeichnung).not.toBeNull()
      expect(antwort?.status).toBe(401)
    })
  }

  it('Rand-Leerraum im Header ist KEINE Umgehung — er wird schon vom Header-Objekt entfernt', () => {
    // Festgehalten, damit niemand daraus einen Modulfehler liest: `Bearer x\n`
    // erreicht die Prüfung bereits als `Bearer x`. Die Normalisierung macht
    // die Request/Headers-Implementierung, nicht dieses Modul.
    const mitUmbruch = anfrage(`Bearer ${GEHEIMNIS}\n`)
    expect(mitUmbruch.headers.get('authorization')).toBe(`Bearer ${GEHEIMNIS}`)
    expect(pruefeCronGeheimnis(mitUmbruch)).toBeNull()
  })

  it('antwortet mit einem generischen Text — ohne Hinweis auf das Geheimnis', async () => {
    const antwort = pruefeCronGeheimnis(anfrage('Bearer falsch'))!
    const koerper = await antwort.json()
    expect(koerper).toEqual({ error: 'Unauthorized' })
    expect(JSON.stringify(koerper)).not.toContain(GEHEIMNIS)
  })
})

describe('istCronGeheimnis — Rohvergleich für eigene Header', () => {
  it('akzeptiert den exakten Wert ohne Bearer-Präfix', () => {
    expect(istCronGeheimnis(GEHEIMNIS)).toBe(true)
  })

  it('ist fail-closed bei fehlendem Geheimnis und bei leeren Eingaben', () => {
    expect(istCronGeheimnis(null)).toBe(false)
    expect(istCronGeheimnis(undefined)).toBe(false)
    expect(istCronGeheimnis('')).toBe(false)

    delete process.env.CRON_SECRET
    expect(istCronGeheimnis(GEHEIMNIS)).toBe(false)
    expect(istCronGeheimnis('')).toBe(false)
  })

  it('akzeptiert NICHT die Bearer-Form (das ist die Aufgabe der anderen Funktion)', () => {
    expect(istCronGeheimnis(`Bearer ${GEHEIMNIS}`)).toBe(false)
  })

  it('lehnt ein Präfix des Geheimnisses ab (Längenprüfung vor timingSafeEqual)', () => {
    // timingSafeEqual wirft bei ungleich langen Puffern — ohne die
    // Längenprüfung davor wäre das hier eine Exception statt eines false,
    // und die Route liefe in einen 500er statt in eine saubere Abweisung.
    expect(() => istCronGeheimnis(GEHEIMNIS.slice(0, 5))).not.toThrow()
    expect(istCronGeheimnis(GEHEIMNIS.slice(0, 5))).toBe(false)
  })

  it('verträgt Mehrbyte-Zeichen ohne zu werfen', () => {
    process.env.CRON_SECRET = 'geheim-äöü-✓'
    expect(istCronGeheimnis('geheim-äöü-✓')).toBe(true)
    expect(istCronGeheimnis('geheim-aou-x')).toBe(false)
  })
})

describe('cronAuthHeader — der Header für interne Selbstaufrufe', () => {
  it('erzeugt einen Header, den die eigene Prüfung akzeptiert', () => {
    expect(pruefeCronGeheimnis(anfrage(cronAuthHeader()))).toBeNull()
  })

  it('erzeugt ohne gesetztes Geheimnis einen Header, der NICHT durchkommt', () => {
    // Der Selbstaufruf soll dann scheitern, statt versehentlich eine
    // offene Tür zu benutzen.
    delete process.env.CRON_SECRET
    const header = cronAuthHeader()
    expect(header).toBe('Bearer ')
    expect(pruefeCronGeheimnis(anfrage(header))?.status).toBe(401)
  })
})
