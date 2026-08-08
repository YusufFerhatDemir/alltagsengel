/**
 * Versand-Guard — letzte Sperre vor einer echten Übermittlung an die Kasse.
 *
 * WARUM ES DIESE DATEI GIBT
 * `sendePerSFTP()` und `pruefeAntworten()` in transport.ts haben derzeit
 * KEINEN einzigen Aufrufer: es existiert weder eine API-Route noch ein Job,
 * der eine Datei tatsächlich an eine Datenannahmestelle überträgt. Solange
 * das so ist, kann nichts versehentlich hinausgehen.
 *
 * Sobald jemand diesen Pfad verdrahtet, ist die naheliegende Reihenfolge
 * "erst senden, dann prüfen" — genau der Fehler, der eine unvollständige
 * Lieferung bei der Kasse und damit eine fehlerhafte Forderung erzeugt.
 * `pruefeVersandbereitschaft()` ist die Sperre, die davor sitzt: sie wirft,
 * statt einen Wahrheitswert zurückzugeben, damit ein vergessener
 * If-Zweig nicht zum stillen Versand führt.
 *
 * Die Prüfung ist bewusst strenger als der Pre-Flight: der Pre-Flight bewertet
 * einen Abrechnungslauf, dieser Guard bewertet zusätzlich die Betriebsmittel
 * (Zertifikat, Transportweg, Freischaltung) zum Zeitpunkt des Sendens.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ermittleReadiness } from './readiness'

export class VersandGesperrtError extends Error {
  readonly gruende: string[]

  constructor(gruende: string[]) {
    super(
      `VERSAND_GESPERRT: ${gruende.length} Voraussetzung(en) nicht erfüllt — ` +
      `es wurde nichts übermittelt und es entsteht keine Forderung. ` +
      `Offen: ${gruende.join(' · ')}`,
    )
    this.name = 'VersandGesperrtError'
    this.gruende = gruende
  }
}

/**
 * Wirft `VersandGesperrtError`, wenn die Organisation nicht versandbereit ist.
 *
 * Kehrt nur zurück, wenn KEIN Readiness-Punkt rot ist. Gelbe Punkte
 * (z. B. ein bald ablaufendes Zertifikat) blockieren nicht — sie sind
 * Vorwarnungen, kein Hindernis für die aktuelle Lieferung.
 *
 * @throws VersandGesperrtError
 */
export async function pruefeVersandbereitschaft(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<void> {
  const readiness = await ermittleReadiness(supabase, organizationId)

  // Der Erstversand-Punkt ist per Definition rot, solange nie gesendet wurde —
  // er darf den ersten Versand nicht selbst verhindern.
  const blocker = readiness.punkte.filter(p => p.ampel === 'rot' && p.id !== 'erstversand')

  if (blocker.length > 0) {
    throw new VersandGesperrtError(blocker.map(p => `${p.label}${p.hinweis ? ` (${p.hinweis})` : ''}`))
  }
}
