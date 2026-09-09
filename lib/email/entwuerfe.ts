import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
import { logger } from '@/lib/logger'
import { vorlageFinden, vorlageRendern } from './templates'

const log = logger.child('email:entwuerfe')

/**
 * Entwürfe anlegen — der einzige Weg, auf dem ein Auslöser E-Mails erzeugt.
 *
 * DIE REGEL, DIE DIESES MODUL DURCHSETZT
 * Auslöser senden nicht. Ein Wartelisten-Eintrag oder eine eingegangene
 * Bewerbung legt hier einen Entwurf ab; gesendet wird ausschließlich über
 * den Knopf in der Verwaltung (POST /api/email/send, modus='senden').
 *
 * Deshalb gibt es in dieser Datei bewusst KEINEN Aufruf von Resend. Wer
 * später automatisches Senden einbauen will, muss dafür an eine andere
 * Stelle greifen — und merkt dabei, dass er eine Entscheidung trifft.
 */

/** Tabelle fehlt: Migration 20261101000000 ist nicht angewendet. */
const TABELLE_FEHLT = 'PGRST205'
/** Es gibt bereits einen Entwurf dieser Vorlage zu diesem Vorgang. */
const DUPLIKAT = '23505'

export interface EntwurfEingabe {
  vorlageId: string
  empfaengerEmail: string | null
  empfaengerName: string | null
  /** 'waitlist_customers' | 'lead_inquiries' | 'manuell' */
  bezugTabelle: string
  bezugId: string | null
  werte: Record<string, string>
}

export type EntwurfErgebnis =
  | { ok: true; angelegt: boolean }
  | { ok: false; grund: 'tabelle_fehlt' | 'vorlage_unbekannt' | 'fehler'; meldung: string }

/**
 * Legt einen Entwurf an. Bricht NICHT den aufrufenden Vorgang ab.
 *
 * Ein Wartelisten-Eintrag darf nicht daran scheitern, dass die
 * Entwurfstabelle noch nicht steht — die Vormerkung selbst ist das
 * Wertvolle. Fehler werden deshalb protokolliert und zurückgegeben, aber
 * der Aufrufer entscheidet, ob sie ihn interessieren.
 */
export async function entwurfAnlegen(eingabe: EntwurfEingabe): Promise<EntwurfErgebnis> {
  const vorlage = vorlageFinden(eingabe.vorlageId)
  if (!vorlage) {
    return { ok: false, grund: 'vorlage_unbekannt', meldung: `Unbekannte Vorlage: ${eingabe.vorlageId}` }
  }

  const gerendert = vorlageRendern(vorlage, eingabe.werte)

  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('email_entwuerfe').insert({
      organization_id: DEFAULT_ORG_ID,
      vorlage_id: vorlage.id,
      empfaenger_email: eingabe.empfaengerEmail,
      empfaenger_name: eingabe.empfaengerName,
      bezug_tabelle: eingabe.bezugTabelle,
      bezug_id: eingabe.bezugId,
      werte: eingabe.werte,
      betreff: gerendert.betreff,
      rumpf_html: gerendert.rumpfHtml,
      status: 'entwurf',
    })

    if (error) {
      // Schon vorhanden ist kein Fehler: der Teil-Unique-Index hat genau
      // das verhindert, wofür er da ist — ein zweiter Entwurf zum selben
      // Vorgang.
      if (error.code === DUPLIKAT) return { ok: true, angelegt: false }

      if (error.code === TABELLE_FEHLT) {
        log.error('email_entwuerfe fehlt — Migration 20261101000000 ist nicht angewendet.')
        return {
          ok: false,
          grund: 'tabelle_fehlt',
          meldung: 'Tabelle email_entwuerfe steht noch nicht (Migration 20261101000000).',
        }
      }

      log.errorWithException('Entwurf konnte nicht angelegt werden', error)
      return { ok: false, grund: 'fehler', meldung: error.message }
    }

    return { ok: true, angelegt: true }
  } catch (err: any) {
    log.errorWithException('Entwurf konnte nicht angelegt werden', err)
    return { ok: false, grund: 'fehler', meldung: err?.message || 'Unerwarteter Fehler.' }
  }
}

/**
 * Bequemer Aufruf für Auslöser: legt an und schluckt das Ergebnis.
 *
 * Bewusst `void`: Der Auslöser (Formularabsendung) soll durchlaufen, auch
 * wenn der Entwurf scheitert. Das Protokoll hält fest, was passiert ist —
 * eine Vormerkung wegen eines fehlenden Entwurfs abzulehnen wäre die
 * falsche Reihenfolge.
 */
export async function entwurfAnlegenOhneAbbruch(eingabe: EntwurfEingabe): Promise<void> {
  const ergebnis = await entwurfAnlegen(eingabe)
  if (!ergebnis.ok) {
    log.warn(`Entwurf ${eingabe.vorlageId} nicht angelegt: ${ergebnis.meldung}`)
  }
}

/** Erster Vorname aus einem vollen Namen — für die Anrede in den Vorlagen. */
export function vornameAus(name: string | null | undefined): string {
  if (!name) return ''
  return name.trim().split(/\s+/)[0] ?? ''
}
