/**
 * Kette 13 — Feiertagskatalog gefuellt halten.
 *
 * `billing_feiertage` war live LEER (0 Zeilen), obwohl
 * `lib/billing/core/feiertage.ts` die Daten fuer alle 16 Bundeslaender
 * berechnen kann und sowohl `istFeiertag()` als auch die SQL-Rechenwege der
 * Abrechnung (u. a. `20260807120000_tariff_model_hardening.sql`) gegen genau
 * diese Tabelle pruefen. Es fehlte schlicht der Befuellungs-Job:
 * `importiereFeiertage()` hatte ausser den Tests keinen einzigen Aufrufer
 * (Lueckenanalyse Bereich 7, P2).
 *
 * WAS DIESE KETTE NICHT TUT — und bewusst nicht tun darf:
 * Sie schreibt ausschliesslich FEIERTAGSDATEN (Datum, Bezeichnung,
 * Bundesland). Sie fasst keinen Zuschlagssatz an. Alle
 * `zuschlag_feiertag_prozent` in `billing_tariffs` stehen auf 0 und bleiben
 * es, bis sie aus einer Verguetungsvereinbarung belegt eingetragen werden.
 * Ein gefuellter Feiertagskatalog aendert deshalb heute keinen einzigen
 * Rechnungsbetrag — er sorgt nur dafuer, dass der Feiertag ueberhaupt
 * erkannt wird, sobald ein belegter Satz vorliegt.
 *
 * ABDECKUNG: laufendes und Folgejahr, alle 16 Bundeslaender. Der Katalog
 * ist mandantenuebergreifend (keine organization_id), die Kette laeuft
 * deshalb pro Lauf nur einmal wirksam — die uebrigen Organisationen finden
 * die Zeilen bereits vor und melden sie als `vorhanden`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { importiereFeiertage } from '@/lib/billing/core/feiertage'
import { BUNDESLAND_CODES } from '@/lib/expansion/types'
import { logger } from '@/lib/logger'
const log = logger.child('feiertage-pflege')

export interface FeiertagePflegeErgebnis {
  jahre: number[]
  importiert: number
  vorhanden: number
  fehler: string[]
}

/**
 * Stellt sicher, dass der Feiertagskatalog fuer die angegebenen Jahre
 * vollstaendig ist. Ohne `jahre` werden laufendes und Folgejahr gepflegt —
 * das Folgejahr mit Absicht, damit ein Einsatz am 1. Januar nicht erst nach
 * dem Jahreswechsel als Feiertag erkannt wird.
 *
 * Fehlertolerant je Jahr: schlaegt ein Jahr fehl (z. B. weil die Tabelle in
 * einer Umgebung fehlt), wird das benannt, die uebrigen laufen weiter.
 */
export async function pflegeFeiertagskatalog(
  supabase: SupabaseClient,
  jahre?: number[],
  heute: Date = new Date(),
): Promise<FeiertagePflegeErgebnis> {
  const aktuellesJahr = heute.getFullYear()
  const zuPflegen = jahre && jahre.length > 0 ? jahre : [aktuellesJahr, aktuellesJahr + 1]

  const ergebnis: FeiertagePflegeErgebnis = {
    jahre: zuPflegen,
    importiert: 0,
    vorhanden: 0,
    fehler: [],
  }

  for (const jahr of zuPflegen) {
    try {
      const r = await importiereFeiertage(supabase, jahr, [...BUNDESLAND_CODES])
      ergebnis.importiert += r.importiert
      ergebnis.vorhanden += r.vorhanden
      ergebnis.fehler.push(...r.fehler.map(f => `${jahr}: ${f}`))
    } catch (err) {
      const meldung = `${jahr}: ${(err as Error).message}`
      ergebnis.fehler.push(meldung)
      log.error(`Feiertagsimport fehlgeschlagen — ${meldung}`)
    }
  }

  return ergebnis
}
