/**
 * Drei-Wege-Abgleich für das Vokabular der Evaluation:
 * DB-CHECK ↔ Fachwerte im Code ↔ Beschriftungen der Oberfläche.
 *
 * WARUM DAS EINEN EIGENEN FALL BRAUCHT: Die Oberfläche baut ihre beiden
 * Auswahlfelder aus `ZIELERREICHUNG_WERTE` bzw. `EVALUATION_FOLGERUNG_WERTE`
 * und schlägt zu jedem Wert die Beschriftung in `PFLEGE_ZIELERREICHUNG` bzw.
 * `PFLEGE_EVALUATION_FOLGERUNG` nach
 * (app/admin/pflegedoku/massnahmenplan/[id]/page.tsx). Fehlt dort ein
 * Eintrag, gibt es keinen Fehler und keine Warnung:
 *
 *   • im Auswahlfeld entsteht ein Eintrag ohne Beschriftung — die
 *     Pflegefachkraft kann eine fachliche Aussage nicht mehr treffen, ohne
 *     dass irgendwo etwas rot wird;
 *   • in der Historie fällt `statusMeta()` auf den Rohwert zurück und zeigt
 *     „nicht_beurteilbar" statt „Nicht beurteilbar".
 *
 * Beides sieht nach einem Darstellungsfehler aus und ist doch eine Lücke im
 * Fachvokabular. Genau solche Abweichungen bleiben ohne Abgleich stehen.
 *
 * Der CHECK wird aus der MIGRATIONSDATEI gelesen, nicht aus einer
 * nachgebauten Liste: eine Nachbildung bewiese, dass zwei Abschriften
 * übereinstimmen, nicht dass die Datenbank den Wert annimmt.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EVALUATION_FOLGERUNG_WERTE,
  ZIELERREICHUNG_WERTE,
} from '@/lib/pflege/types'
import {
  PFLEGE_EVALUATION_FOLGERUNG,
  PFLEGE_ZIELERREICHUNG,
  statusMeta,
} from '@/lib/admin/ops'

const MIGRATION = join(
  process.cwd(), 'supabase', 'migrations',
  '20260829185500_pflege_massnahmen_evaluation.sql',
)

/** Die Werte einer `CHECK (spalte IN ('a','b',…))`-Bedingung. */
function checkWerte(spalte: string): string[] {
  const sql = readFileSync(MIGRATION, 'utf8')
  const muster = new RegExp(`CHECK\\s*\\(\\s*${spalte}\\s+IN\\s*\\(([^)]*)\\)`, 'gi')
  const treffer = [...sql.matchAll(muster)]
  if (treffer.length === 0) throw new Error(`Kein CHECK auf ${spalte} in der Migration`)
  return [...treffer[treffer.length - 1][1].matchAll(/'([^']+)'/g)].map(m => m[1])
}

const FAELLE = [
  {
    name: 'Zielerreichung',
    spalte: 'zielerreichung',
    werte: ZIELERREICHUNG_WERTE as string[],
    beschriftungen: PFLEGE_ZIELERREICHUNG,
  },
  {
    name: 'Folgerung',
    spalte: 'folgerung',
    werte: EVALUATION_FOLGERUNG_WERTE as string[],
    beschriftungen: PFLEGE_EVALUATION_FOLGERUNG,
  },
] as const

describe.each(FAELLE)('$name — DB, Code und Oberfläche halten dasselbe Vokabular', (fall) => {
  it('führt jeden Wert, den der CHECK zulässt', () => {
    for (const wert of checkWerte(fall.spalte)) {
      expect(fall.werte, `"${wert}" steht im CHECK, aber nicht im Code`).toContain(wert)
    }
  })

  it('führt umgekehrt keinen Wert, den die Datenbank ablehnen würde', () => {
    // Die andere Richtung ist die gefährlichere: ein Wert, den nur der Code
    // kennt, steht in der Oberfläche zur Auswahl und läuft beim Speichern
    // am CHECK auf — die Beurteilung ist dann getippt und nicht gespeichert.
    const erlaubt = checkWerte(fall.spalte)
    for (const wert of fall.werte) {
      expect(erlaubt, `"${wert}" steht zur Auswahl, wird von der Datenbank aber abgelehnt`)
        .toContain(wert)
    }
  })

  it('hat zu jedem Wert eine Beschriftung für die Oberfläche', () => {
    for (const wert of fall.werte) {
      const meta = fall.beschriftungen[wert]
      expect(meta, `Beschriftung für "${wert}" fehlt — das Auswahlfeld zeigt einen leeren Eintrag`)
        .toBeDefined()
      expect(meta.label.trim().length, `Beschriftung für "${wert}" ist leer`).toBeGreaterThan(0)
      // Die Beschriftung darf nicht der Rohwert sein: dann sähe der
      // Rückfall von statusMeta() wie eine gepflegte Beschriftung aus.
      expect(meta.label, `Beschriftung für "${wert}" ist nur der Rohwert`).not.toBe(wert)
    }
  })

  it('trägt umgekehrt keine Beschriftung ohne Fachwert', () => {
    for (const wert of Object.keys(fall.beschriftungen)) {
      expect(fall.werte, `Beschriftung "${wert}" gehört zu keinem gültigen Wert`).toContain(wert)
    }
  })

  it('statusMeta liefert für jeden Wert die gepflegte Beschriftung, nicht den Rückfall', () => {
    for (const wert of fall.werte) {
      const meta = statusMeta(fall.beschriftungen, wert)
      expect(meta.label).toBe(fall.beschriftungen[wert].label)
    }
    // Die Farbe wird hier ausdruecklich NICHT gegen den Rueckfallwert
    // geprueft: `#999` ist im Haus die neutrale Farbe und bewusst vergeben
    // (`nicht_beurteilbar`, wie auch `PFLEGE_MASSNAHME_STATUS.geplant`).
    // Eine solche Pruefung haette eine gepflegte Entscheidung als Luecke
    // gemeldet — und um das zu beheben, haette jemand die Farbe geaendert.
    // Ob ein Eintrag fehlt, sagt die Beschriftung, nicht die Farbe.
  })
})

describe('Zielerreichung und Folgerung bleiben getrennt', () => {
  it('teilen keinen einzigen Wert', () => {
    // Wären sie deckungsgleich, wäre die Trennung in zwei Angaben nur
    // scheinbar: „was ist mit dem ZIEL" und „was folgt daraus" sind
    // verschiedene Fragen. Eine abgebrochene Maßnahme kann ihr Ziel
    // erreicht haben, eine laufende es verfehlen.
    const gemeinsam = (ZIELERREICHUNG_WERTE as string[])
      .filter(w => (EVALUATION_FOLGERUNG_WERTE as string[]).includes(w))
    expect(gemeinsam).toEqual([])
  })

  it('kennt „nicht_beurteilbar" als eigene Feststellung, nicht als Lücke', () => {
    // Der Wert ist der Grund, warum das Feld NOT NULL sein darf: „konnte
    // nicht beurteilt werden" ist eine Aussage und kein fehlender Eintrag.
    expect(ZIELERREICHUNG_WERTE as string[]).toContain('nicht_beurteilbar')
    expect(checkWerte('zielerreichung')).toContain('nicht_beurteilbar')
  })
})
