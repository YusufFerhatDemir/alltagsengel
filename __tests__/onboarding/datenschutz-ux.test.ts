/**
 * Datenschutz-Härtung und Tippflächen
 *
 * Diese Tests lesen Quelltext. Für die geprüften Eigenschaften ist das
 * der richtige Weg: es sind keine Logikfehler, sondern Zusagen über die
 * Form des Codes — „hier steht kein Speicherpfad", „hier ist nichts
 * kleiner als 48 Pixel". Genau solche Zusagen erodieren still.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { TIPPFLAECHE_MIN } from '@/components/onboarding/masse'

const wurzel = process.cwd()
const lies = (...teile: string[]) => readFileSync(join(wurzel, ...teile), 'utf8')

function dateienUnter(pfad: string, endung = '.tsx'): string[] {
  const treffer: string[] = []
  for (const name of readdirSync(join(wurzel, pfad))) {
    const voll = join(pfad, name)
    if (statSync(join(wurzel, voll)).isDirectory()) treffer.push(...dateienUnter(voll, endung))
    else if (name.endsWith(endung)) treffer.push(voll)
  }
  return treffer
}

const ONBOARDING_DATEIEN = [
  ...dateienUnter('components/onboarding'),
  ...dateienUnter('app/onboarding'),
]

const ONBOARDING_SERVER = [
  ...dateienUnter('lib/onboarding', '.ts'),
  ...dateienUnter('app/api/onboarding', '.ts'),
  ...dateienUnter('app/api/admin/onboarding', '.ts'),
]

describe('RLS auf onboarding_progress', () => {
  const migration = lies('supabase', 'migrations', '20261026000000_onboarding_progress.sql')

  it('hat genau drei Policies: eigene, Admin, Mandantengrenze', () => {
    const policies = [...migration.matchAll(/CREATE POLICY (\w+)/g)].map(m => m[1]).sort()
    expect(policies).toEqual([
      'onboarding_progress_admin', 'onboarding_progress_eigene', 'org_fence_onboarding_progress',
    ])
  })

  it('bindet die eigene Zeile an auth.uid() — lesend UND schreibend', () => {
    // Ohne WITH CHECK könnte jemand eine Zeile auf eine fremde user_id
    // umschreiben und sie damit übernehmen.
    expect(migration).toMatch(/USING \(user_id = auth\.uid\(\)\)/)
    expect(migration).toMatch(/WITH CHECK \(user_id = auth\.uid\(\)\)/)
  })

  it('setzt die Mandantengrenze RESTRICTIVE', () => {
    expect(migration).toMatch(/org_fence_onboarding_progress[\s\S]{0,200}AS RESTRICTIVE/)
  })

  it('entzieht anon jeden Zugriff', () => {
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.onboarding_progress FROM anon/)
  })

  it('aktiviert RLS überhaupt', () => {
    expect(migration).toMatch(/ALTER TABLE public\.onboarding_progress ENABLE ROW LEVEL SECURITY/)
  })
})

describe('Keine personenbezogenen Daten in Logs', () => {
  it('nutzt nirgends console.*', () => {
    // console landet ungefiltert im Vercel-Log und wird nicht sanitisiert.
    for (const datei of [...ONBOARDING_DATEIEN, ...ONBOARDING_SERVER]) {
      expect(lies(datei), datei).not.toMatch(/\bconsole\.(log|info|warn|error|debug)\b/)
    }
  })

  it('schreibt keine Adressen, Namen oder Telefonnummern ins Log', () => {
    // Geprüft wird der Inhalt der log.*-Aufrufe, nicht die ganze Datei:
    // `recipient` als Variablenname ist in Ordnung, im Logeintrag nicht.
    for (const datei of ONBOARDING_SERVER) {
      const quelle = lies(datei)
      const aufrufe = [...quelle.matchAll(/log\.\w+\([\s\S]{0,400}?\)\n/g)].map(m => m[0])
      for (const aufruf of aufrufe) {
        expect(aufruf, `${datei}: ${aufruf.slice(0, 80)}`)
          .not.toMatch(/\b(email|recipient|nachname|vorname|telefon|adresse)\s*[,:}]/)
      }
    }
  })
})

describe('Dokumente nur über signierte URLs', () => {
  const upload = lies('app', 'api', 'onboarding', 'dokumente', 'route.ts')
  const abruf = lies('app', 'api', 'admin', 'onboarding', 'dokument', 'route.ts')

  it('der Upload gibt den Speicherpfad NICHT zurück', () => {
    // Der Pfad verrät Mandanten- und Personen-IDs.
    expect(upload).toMatch(/nicht zurueckgegeben|nicht zurückgegeben/)
    expect(upload).toMatch(/return NextResponse\.json\(\{ ok: true, art, dateiname: sicher \}\)/)
  })

  it('der Abruf erzeugt eine signierte URL statt eines Pfads', () => {
    expect(abruf).toContain('createSignedUrl')
    expect(abruf).not.toMatch(/getPublicUrl/)
  })

  it('die Signatur ist kurzlebig', () => {
    const treffer = abruf.match(/GUELTIG_SEKUNDEN = (\d+)/)
    const sekunden = Number(treffer?.[1] ?? 0)
    expect(sekunden).toBeGreaterThan(0)
    expect(sekunden).toBeLessThanOrEqual(900)
  })

  it('prüft den Mandanten beim Abruf', () => {
    // Der Storage kennt keine Mandantengrenze — die Zeile muss sie tragen.
    expect(abruf).toMatch(/\.eq\('organization_id', auth\.ctx\.organizationId\)/)
  })

  it('unterscheidet „gibt es nicht" nicht von „fremder Mandant"', () => {
    expect(abruf).toMatch(/Unterlage nicht gefunden/)
  })

  it('baut den Speicherpfad aus der Sitzung, nicht aus dem Formular', () => {
    expect(upload).toMatch(/onboarding\/\$\{organizationId\}\/\$\{user\.id\}/)
  })
})

describe('Tippflächen', () => {
  it('nichts ist kleiner als die Untergrenze', () => {
    for (const datei of ONBOARDING_DATEIEN) {
      const quelle = lies(datei)
      for (const treffer of quelle.matchAll(/minHeight: (\d+)/g)) {
        expect(Number(treffer[1]), `${datei}: minHeight ${treffer[1]}`)
          .toBeGreaterThanOrEqual(TIPPFLAECHE_MIN)
      }
    }
  })

  it('die Untergrenze liegt bei mindestens 48 Pixeln', () => {
    expect(TIPPFLAECHE_MIN).toBeGreaterThanOrEqual(48)
  })

  it('der Wizard nutzt volle Breite für den Hauptknopf', () => {
    // Auf dem Telefon liegt er damit unter dem Daumen.
    expect(lies('components', 'onboarding', 'Wizard.tsx')).toMatch(/width: '100%'/)
  })
})

describe('Mobile Darstellung', () => {
  it('die Abläufe begrenzen die Breite statt fester Pixelbreiten', () => {
    for (const seite of ['bewerber', 'kunde', 'angehoerige']) {
      const quelle = lies('app', 'onboarding', seite, 'page.tsx')
      expect(quelle, seite).toMatch(/maxWidth: \d+/)
      expect(quelle, seite).toMatch(/margin: '0 auto'/)
    }
  })

  it('der Assistent passt auf schmale Bildschirme', () => {
    // Ohne min()/calc() ragt das Panel auf dem Telefon aus dem Bild.
    expect(lies('components', 'onboarding', 'OnboardingAssistent.tsx'))
      .toMatch(/min\(380px, calc\(100vw - 32px\)\)/)
  })
})
