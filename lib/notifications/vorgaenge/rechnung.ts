// ═══════════════════════════════════════════════════════════════════════
// Wiederherstellung des Rechnungsversands
// ═══════════════════════════════════════════════════════════════════════
//
// WAS VORHER FEHLTE
// versendeRechnungPerEmail() hat zwar in die Zustellspur geschrieben,
// aber ohne Vorgangsbezug. Der Wiederholungslauf fand deshalb keinen
// Wiederhersteller, liess die Zeile 24 Stunden liegen und schob sie
// dann als „nicht wiederherstellbar" ins Dead Letter. Eine an einem
// Resend-Ausfall gescheiterte Rechnungsmail ging damit NIE raus — und
// genau das sollte der ganze Versandpfad verhindern.
//
// NUR E-MAIL
// Eine Rechnung geht ueber genau einen Kanal raus. In-App und Push
// kennen den Vorgang nicht.
//
// KEINE EIGENE PROTOKOLLIERUNG
// versendeRechnungPerEmail() wird mit `ohneZustellspur` aufgerufen: die
// Protokollzeile schreibt sendeIdempotent() drumherum. Sonst gaebe es
// pro Versuch zwei Zeilen und die Versuchsobergrenze waere nach der
// Haelfte erreicht.
//
// WARUM KEIN `erneutSenden`
// Der Wiederholungslauf soll genau das nachholen, was nicht geklappt
// hat. Scheiterte der Erstversand, ist sent_at leer und der normale Weg
// greift. Ist sent_at gesetzt, war die Mail doch raus — dann meldet
// versendeRechnungPerEmail() 'uebersprungen' und der Vorgang ist
// erledigt. Mit `erneutSenden` wuerde der Lauf dem Kunden die Rechnung
// ein zweites Mal schicken.
// ═══════════════════════════════════════════════════════════════════════

import {
  RECHNUNG_VERSAND_ART,
  versendeRechnungPerEmail,
} from '@/lib/billing/versand/rechnung-versand'
import type { SendeErgebnis } from '@/lib/notifications/retry'
import {
  registriereVorgang,
  type WiederherstellungKontext,
} from '@/lib/notifications/wiederherstellung'

async function stelleWiederHer(kontext: WiederherstellungKontext): Promise<SendeErgebnis> {
  try {
    const ergebnis = await versendeRechnungPerEmail(kontext.admin, {
      invoiceId: kontext.vorgangRef,
      organizationId: kontext.organizationId,
      // Der Lauf ist systemgetrieben, es gibt keine Nutzersitzung. Die
      // Organisation als Urheber ist dasselbe Muster wie im Mahnlauf
      // (app/api/cron/mahnlauf/route.ts).
      actorId: kontext.organizationId,
      ohneZustellspur: true,
    })

    switch (ergebnis.status) {
      case 'versendet':
        return { ok: true }
      case 'uebersprungen':
        // Bereits versendet, nicht festgeschrieben, keine Adresse, kein
        // Schluessel: nichts davon ist ein Fehlversuch. Zaehlt damit
        // nicht gegen die Versuchsobergrenze.
        return { ok: false, uebersprungen: true, fehler: ergebnis.grund }
      default:
        return { ok: false, fehler: ergebnis.grund }
    }
  } catch (err) {
    // versendeRechnungPerEmail() wirft, wenn die Rechnung nicht lesbar
    // oder nicht auffindbar ist. Ein weiterer Versuch findet sie auch
    // nicht — 404 klassifiziert das als dauerhaft.
    const meldung = err instanceof Error ? err.message : String(err)
    if (/nicht gefunden/i.test(meldung)) {
      return { ok: false, fehler: { message: meldung, statusCode: 404 } }
    }
    return { ok: false, fehler: err }
  }
}

registriereVorgang(RECHNUNG_VERSAND_ART, ['email'], stelleWiederHer)
