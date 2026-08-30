// ═══════════════════════════════════════════════════════════════════════════
// KAMPAGNEN-VORLAGEN
//
// ── WARUM DIE VORLAGEN IM CODE STEHEN UND NICHT NUR IN DER DATENBANK ───────
// `email_templates` gibt es, damit sich ein Text ohne Deployment
// nachbessern laesst. Der KATALOG steht trotzdem hier: eine Vorlage, die
// nur in der Datenbank existiert, hat keinen Review, keinen Test und keine
// Historie. Bei Post an die gesamte Kundschaft ist das zu wenig.
//
// Der Katalog ist die Quelle, die Tabelle der Ablageort. `synchronisiere-
// Vorlagen()` schreibt den Katalog in die Tabelle; von Hand geaenderte
// Texte in der Tabelle haben beim Rendern Vorrang, damit eine Korrektur
// im Betrieb nicht beim naechsten Deployment verschwindet.
//
// ── ZWEI REGELN, DIE JEDE VORLAGE EINHALTEN MUSS ───────────────────────────
//  1. ABSENDER IST „ALLTAGSENGEL". Kein persoenlicher Name, in keiner
//     Unterschrift, in keinem Fliesstext. Das ist die
//     Kundenkommunikations-Regel des Projekts und gilt fuer JEDE
//     Kundenrichtung.
//  2. JEDE WERBEMAIL TRAEGT EINEN ABMELDELINK. Der Platzhalter
//     {{abmeldelink}} ist Pflicht; `pruefeVorlage()` weist eine Vorlage
//     ohne ihn ab. Eine Werbemail ohne Abmeldemoeglichkeit ist ein
//     Verstoss gegen Art. 21 DSGVO, und zwar bei jedem einzelnen
//     Empfaenger.
//
// ── DER BETRAG KOMMT AUS DER KONSTANTEN ────────────────────────────────────
// Der Entlastungsbetrag nach § 45b SGB XI steht NIRGENDS als Zahl im Text,
// sondern kommt aus ENTLASTUNG_MONATLICH_EUR (lib/config/budget-constants.ts,
// aktuell 131 €/Monat seit 01.01.2025). Der alte Wert 125 € steht dort als
// Vorgaengerversion und wird nicht mehr gezogen. Eine Werbemail mit einem
// veralteten Betrag waere eine irrefuehrende Angabe gegenueber Menschen,
// die danach ihre Leistung planen.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { ENTLASTUNG_MONATLICH_EUR } from '@/lib/config/budget-constants'
import type { ConsentTyp, MarketingKontakt, Zielgruppe } from './typen'

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care'

export interface Vorlage {
  templateKey: string
  name: string
  zielgruppe: Zielgruppe
  consentTyp: ConsentTyp
  betreff: string
  /** HTML mit Platzhaltern. {{abmeldelink}} ist Pflicht. */
  html: string
  /** Welches Segment diese Vorlage meint. Rein informativ für die Oberfläche. */
  empfohlenesSegment?: string
}

/** Die Platzhalter, die `rendere()` ersetzt. */
export interface VorlagenWerte {
  anrede: string
  abmeldelink: string
  entlastungsbetrag: string
  siteUrl: string
}

// ───────────────────────────────────────────────────────────────────────────
// Rahmen
// ───────────────────────────────────────────────────────────────────────────

/**
 * Der gemeinsame Rahmen jeder Mail.
 *
 * Tabellenloses, inline gestyltes HTML mit fester Breite — dieselbe Bauart
 * wie die Willkommensmail des Newsletters, damit beide Mails vom selben
 * Absender auch gleich aussehen.
 */
function rahmen(inhalt: string): string {
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F2EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="text-align:center;padding:16px 0">
    <img src="${SITE}/icon-192x192.png" width="50" height="50" alt="Alltagsengel" style="border-radius:10px">
  </div>
  <div style="background:#ffffff;border-radius:16px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.05)">
${inhalt}
    <p style="color:#888;font-size:13px;margin-top:24px">Herzliche Grüße<br><strong>Ihr Team von Alltagsengel</strong></p>
  </div>
  <div style="text-align:center;padding:16px 0;font-size:11px;color:#999;line-height:1.6">
    Alltagsengel UG (haftungsbeschränkt)<br>
    <a href="${SITE}/impressum" style="color:#999">Impressum</a> &middot;
    <a href="${SITE}/datenschutz" style="color:#999">Datenschutz</a> &middot;
    <a href="{{abmeldelink}}" style="color:#999;text-decoration:underline">Abmelden</a>
  </div>
</div>
</body></html>`
}

const knopf = (text: string, ziel: string): string =>
  `<div style="text-align:center;margin:24px 0">
      <a href="${ziel}" style="display:inline-block;background:#C9963C;color:#1A1612;padding:12px 32px;border-radius:10px;font-weight:700;text-decoration:none;font-size:15px">${text}</a>
    </div>`

const h = (text: string): string =>
  `    <h2 style="color:#1A1612;font-size:22px;margin:0 0 12px">${text}</h2>`
const p = (text: string): string =>
  `    <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 14px">${text}</p>`
const liste = (punkte: string[]): string =>
  `    <ul style="color:#444;font-size:15px;line-height:1.8;padding-left:20px;margin:0 0 14px">${punkte
    .map((x) => `<li>${x}</li>`)
    .join('')}</ul>`

// ───────────────────────────────────────────────────────────────────────────
// Der Katalog
// ───────────────────────────────────────────────────────────────────────────

export const VORLAGEN: readonly Vorlage[] = [
  // ═══ KUNDSCHAFT ═════════════════════════════════════════════════════════
  {
    templateKey: 'kunde_willkommen_1',
    name: 'Willkommensserie 1/3 — Ankommen',
    zielgruppe: 'kunde',
    consentTyp: 'newsletter',
    empfohlenesSegment: 'kunden_neu_30t',
    betreff: 'Willkommen bei Alltagsengel',
    html: rahmen(
      h('Schön, dass Sie da sind') +
        p('{{anrede}}') +
        p(
          'wir freuen uns, dass Sie zu Alltagsengel gefunden haben. In den nächsten Tagen zeigen wir Ihnen in drei kurzen E-Mails, wie Sie das Meiste aus Ihrer Unterstützung im Alltag herausholen.',
        ) +
        p('Heute zum Einstieg: was ein Alltagsengel für Sie tun kann.') +
        liste([
          'Begleitung zu Terminen, Einkäufen und Spaziergängen',
          'Hilfe im Haushalt und bei der Organisation des Alltags',
          'Gesellschaft, Gespräche und ein verlässlicher Besuch',
        ]) +
        knopf('Leistungen ansehen', `${SITE}/leistungen`),
    ),
  },
  {
    templateKey: 'kunde_willkommen_2',
    name: 'Willkommensserie 2/3 — Entlastungsbetrag',
    zielgruppe: 'kunde',
    consentTyp: 'newsletter',
    empfohlenesSegment: 'kunden_neu_30t',
    betreff: 'So finanzieren Sie Ihre Unterstützung',
    html: rahmen(
      h('{{entlastungsbetrag}} € im Monat, die Ihnen zustehen') +
        p('{{anrede}}') +
        p(
          'wer einen anerkannten Pflegegrad hat, bekommt von der Pflegekasse den Entlastungsbetrag nach § 45b SGB XI: <strong>{{entlastungsbetrag}} € pro Monat</strong>. Dieses Geld ist ausdrücklich für Unterstützung im Alltag gedacht — genau dafür, was ein Alltagsengel tut.',
        ) +
        liste([
          'Gilt ab Pflegegrad 1',
          'Nicht genutztes Guthaben wird übertragen und verfällt erst zum 30. Juni des Folgejahres',
          'Wir rechnen auf Wunsch direkt mit Ihrer Pflegekasse ab — Sie zahlen nichts aus eigener Tasche',
        ]) +
        knopf('Entlastungsbetrag verstehen', `${SITE}/entlastungsbetrag`),
    ),
  },
  {
    templateKey: 'kunde_willkommen_3',
    name: 'Willkommensserie 3/3 — Erste Buchung',
    zielgruppe: 'kunde',
    consentTyp: 'newsletter',
    empfohlenesSegment: 'kunden_neu_30t',
    betreff: 'Bereit für den ersten Termin?',
    html: rahmen(
      h('In drei Schritten zum ersten Termin') +
        p('{{anrede}}') +
        p('Sie haben alles beisammen. So geht es weiter:') +
        liste([
          '<strong>Bedarf angeben</strong> — wann und wobei Sie Unterstützung möchten',
          '<strong>Engel auswählen</strong> — wir schlagen Ihnen passende Personen aus Ihrer Nähe vor',
          '<strong>Termin bestätigen</strong> — Sie bekommen die Zusage schriftlich',
        ]) +
        p('Wenn etwas unklar ist, schreiben Sie uns einfach zurück. Wir melden uns.') +
        knopf('Termin anfragen', `${SITE}/buchen`),
    ),
  },
  {
    templateKey: 'kunde_entlastungsbetrag',
    name: 'Entlastungsbetrag-Info',
    zielgruppe: 'kunde',
    consentTyp: 'produktinfo',
    empfohlenesSegment: 'kunden_ohne_buchung',
    betreff: 'Ihr Entlastungsbetrag: {{entlastungsbetrag}} € im Monat',
    html: rahmen(
      h('Lassen Sie {{entlastungsbetrag}} € im Monat nicht liegen') +
        p('{{anrede}}') +
        p(
          'viele Menschen mit Pflegegrad wissen nicht, dass ihnen monatlich <strong>{{entlastungsbetrag}} €</strong> für Unterstützung im Alltag zustehen — der Entlastungsbetrag nach § 45b SGB XI.',
        ) +
        p(
          'Das Guthaben sammelt sich an, wenn Sie es nicht nutzen. Zum <strong>30. Juni</strong> des Folgejahres verfällt der Übertrag aus dem Vorjahr allerdings endgültig.',
        ) +
        liste([
          'Wir rechnen direkt mit Ihrer Pflegekasse ab',
          'Keine Vorkasse, keine Zuzahlung im Rahmen des Betrags',
          'Sie entscheiden, wofür die Stunden verwendet werden',
        ]) +
        knopf('Guthaben prüfen lassen', `${SITE}/kontakt`),
    ),
  },
  {
    templateKey: 'kunde_buchungserinnerung',
    name: 'Buchungserinnerung',
    zielgruppe: 'kunde',
    consentTyp: 'produktinfo',
    empfohlenesSegment: 'kunden_ohne_buchung',
    betreff: 'Ihr Termin ist noch nicht gebucht',
    html: rahmen(
      h('Möchten Sie einen Termin vereinbaren?') +
        p('{{anrede}}') +
        p(
          'Sie haben sich bei uns registriert, aber noch keinen Termin gebucht. Falls Sie noch unsicher sind oder Fragen offen sind — wir helfen gern weiter.',
        ) +
        p('Ein erster Termin ist unverbindlich und dauert meist ein bis zwei Stunden.') +
        knopf('Termin anfragen', `${SITE}/buchen`),
    ),
  },
  {
    templateKey: 'kunde_reaktivierung_30',
    name: 'Reaktivierung nach 30 Tagen',
    zielgruppe: 'kunde',
    consentTyp: 'produktinfo',
    empfohlenesSegment: 'kunden_inaktiv_30t',
    betreff: 'Wie geht es Ihnen?',
    html: rahmen(
      h('Wir haben länger nichts von Ihnen gehört') +
        p('{{anrede}}') +
        p(
          'seit Ihrem letzten Termin ist etwas Zeit vergangen. Falls Sie wieder Unterstützung brauchen, sind wir da — mit denselben vertrauten Gesichtern, wenn Sie möchten.',
        ) +
        knopf('Neuen Termin anfragen', `${SITE}/buchen`),
    ),
  },
  {
    templateKey: 'kunde_reaktivierung_60',
    name: 'Reaktivierung nach 60 Tagen',
    zielgruppe: 'kunde',
    consentTyp: 'produktinfo',
    empfohlenesSegment: 'kunden_inaktiv_60t',
    betreff: 'Ihr Entlastungsbetrag wartet',
    html: rahmen(
      h('{{entlastungsbetrag}} € im Monat bleiben ungenutzt') +
        p('{{anrede}}') +
        p(
          'seit rund zwei Monaten hatten Sie keinen Termin bei uns. In dieser Zeit sind weitere <strong>{{entlastungsbetrag}} € pro Monat</strong> an Entlastungsbetrag aufgelaufen, die Ihnen zustehen.',
        ) +
        p('Der Übertrag aus dem Vorjahr verfällt zum 30. Juni. Bis dahin lässt er sich vollständig nutzen.') +
        knopf('Termin vereinbaren', `${SITE}/buchen`),
    ),
  },
  {
    templateKey: 'kunde_reaktivierung_90',
    name: 'Reaktivierung nach 90 Tagen',
    zielgruppe: 'kunde',
    consentTyp: 'produktinfo',
    empfohlenesSegment: 'kunden_inaktiv_90t',
    betreff: 'Sollen wir uns melden?',
    html: rahmen(
      h('Wollen wir in Kontakt bleiben?') +
        p('{{anrede}}') +
        p(
          'seit drei Monaten hatten Sie keinen Termin. Das ist völlig in Ordnung — Bedarf ändert sich.',
        ) +
        p(
          'Wenn Sie von uns nichts mehr hören möchten, melden Sie sich unten mit einem Klick ab. Wenn Sie wieder Unterstützung brauchen, sind wir weiterhin für Sie da.',
        ) +
        knopf('Ich brauche wieder Unterstützung', `${SITE}/buchen`),
    ),
  },
  {
    templateKey: 'kunde_empfehlung',
    name: 'Empfehlungsprogramm',
    zielgruppe: 'kunde',
    consentTyp: 'produktinfo',
    empfohlenesSegment: 'kunden_engagement_hoch',
    betreff: 'Kennen Sie jemanden, der Unterstützung braucht?',
    html: rahmen(
      h('Empfehlen Sie uns weiter') +
        p('{{anrede}}') +
        p(
          'Sie nutzen unsere Unterstützung regelmäßig — darüber freuen wir uns. Viele Menschen in Ihrem Umfeld wissen gar nicht, dass ihnen ähnliche Leistungen zustehen.',
        ) +
        p(
          'Wenn Sie uns weiterempfehlen, hinterlegen wir für Sie und die empfohlene Person jeweils eine Gutschrift auf dem Kundenkonto.',
        ) +
        knopf('Empfehlungslink ansehen', `${SITE}/empfehlen`),
    ),
  },

  // ═══ ENGEL ══════════════════════════════════════════════════════════════
  {
    templateKey: 'engel_registrierung_abgeschlossen',
    name: 'Registrierung abgeschlossen',
    zielgruppe: 'engel',
    consentTyp: 'engel_einsaetze',
    empfohlenesSegment: 'engel_neu_30t',
    betreff: 'Ihre Registrierung als Alltagsengel ist abgeschlossen',
    html: rahmen(
      h('Willkommen im Team') +
        p('{{anrede}}') +
        p(
          'Ihre Registrierung ist abgeschlossen. Bevor wir Ihnen Einsätze vorschlagen können, fehlen noch zwei Dinge:',
        ) +
        liste([
          '<strong>Verfügbarkeit hinterlegen</strong> — an welchen Tagen und zu welchen Zeiten Sie können',
          '<strong>Führungszeugnis einreichen</strong> — gesetzlich vorgeschrieben, bevor der erste Einsatz möglich ist',
        ]) +
        knopf('Profil vervollständigen', `${SITE}/engel/profil`),
    ),
  },
  {
    templateKey: 'engel_profil_vervollstaendigen',
    name: 'Profil vervollständigen',
    zielgruppe: 'engel',
    consentTyp: 'engel_einsaetze',
    empfohlenesSegment: 'engel_profil_unvollstaendig',
    betreff: 'Noch ein Schritt bis zum ersten Einsatz',
    html: rahmen(
      h('Ihr Profil ist fast fertig') +
        p('{{anrede}}') +
        p(
          'in Ihrem Profil fehlen noch Angaben. Ohne sie können wir Ihnen keine Einsätze zuordnen — die Zuteilung läuft über Ihre hinterlegten Zeiten und Ihr Einsatzgebiet.',
        ) +
        liste([
          'Wochentage und Uhrzeiten, an denen Sie verfügbar sind',
          'Ihr Einsatzgebiet (Postleitzahl und Umkreis)',
          'Qualifikationen und Erfahrung, falls vorhanden',
        ]) +
        knopf('Jetzt ergänzen', `${SITE}/engel/profil`),
    ),
  },
  {
    templateKey: 'engel_fuehrungszeugnis',
    name: 'Führungszeugnis-Erinnerung',
    zielgruppe: 'engel',
    consentTyp: 'engel_einsaetze',
    empfohlenesSegment: 'engel_ohne_fuehrungszeugnis',
    betreff: 'Ihr Führungszeugnis',
    html: rahmen(
      h('Führungszeugnis fehlt oder läuft aus') +
        p('{{anrede}}') +
        p(
          'für die Arbeit mit pflegebedürftigen Menschen brauchen wir ein gültiges erweitertes Führungszeugnis. In Ihrem Profil ist derzeit keines hinterlegt oder das vorhandene läuft in den nächsten Wochen aus.',
        ) +
        liste([
          'Beantragung beim Bürgeramt Ihrer Stadt',
          'Die Kosten übernehmen wir nach Vorlage des Belegs',
          'Ohne gültiges Zeugnis können wir Ihnen keine Einsätze zuweisen',
        ]) +
        knopf('Dokument hochladen', `${SITE}/engel/dokumente`),
    ),
  },
  {
    templateKey: 'engel_einsaetze_region',
    name: 'Verfügbare Einsätze in Ihrer Region',
    zielgruppe: 'engel',
    consentTyp: 'engel_einsaetze',
    empfohlenesSegment: 'engel_verfuegbar',
    betreff: 'Neue Einsätze in Ihrer Nähe',
    html: rahmen(
      h('Es gibt Anfragen in Ihrer Region') +
        p('{{anrede}}') +
        p(
          'in Ihrem Einsatzgebiet liegen derzeit offene Anfragen. Wer zuerst zusagt, bekommt den Einsatz — die Übersicht in Ihrem Profil ist immer aktuell.',
        ) +
        knopf('Offene Einsätze ansehen', `${SITE}/engel/einsaetze`),
    ),
  },
  {
    templateKey: 'engel_reaktivierung',
    name: 'Reaktivierung inaktiver Engel',
    zielgruppe: 'engel',
    consentTyp: 'engel_einsaetze',
    empfohlenesSegment: 'engel_inaktiv_60t',
    betreff: 'Sind Sie wieder verfügbar?',
    html: rahmen(
      h('Wir haben länger nichts von Ihnen gehört') +
        p('{{anrede}}') +
        p(
          'seit Ihrem letzten Einsatz ist einige Zeit vergangen. Falls sich Ihre Verfügbarkeit geändert hat, können Sie sie jederzeit im Profil anpassen — auch für einzelne Wochen.',
        ) +
        p('Wenn Sie derzeit pausieren möchten, ist das ebenso in Ordnung. Sagen Sie uns einfach Bescheid.') +
        knopf('Verfügbarkeit anpassen', `${SITE}/engel/profil`),
    ),
  },
  {
    templateKey: 'engel_onboarding_1',
    name: 'Onboarding-Serie 1/2 — Wie ein Einsatz abläuft',
    zielgruppe: 'engel',
    consentTyp: 'engel_einsaetze',
    empfohlenesSegment: 'engel_neu_30t',
    betreff: 'So läuft Ihr erster Einsatz ab',
    html: rahmen(
      h('Der erste Einsatz — was Sie erwartet') +
        p('{{anrede}}') +
        liste([
          '<strong>Zusage</strong> — Sie sehen die Anfrage im Profil und sagen zu',
          '<strong>Vor Ort</strong> — Sie stellen sich vor, klären den Bedarf und beginnen',
          '<strong>Nachweis</strong> — Sie erfassen die Zeit und lassen den Leistungsnachweis unterschreiben',
        ]) +
        p(
          'Der unterschriebene Nachweis ist die Grundlage Ihrer Vergütung. Ohne ihn lässt sich der Einsatz nicht abrechnen.',
        ) +
        knopf('Zum Leitfaden', `${SITE}/engel/leitfaden`),
    ),
  },
  {
    templateKey: 'engel_onboarding_2',
    name: 'Onboarding-Serie 2/2 — Abrechnung und Vergütung',
    zielgruppe: 'engel',
    consentTyp: 'engel_einsaetze',
    empfohlenesSegment: 'engel_neu_30t',
    betreff: 'Abrechnung und Vergütung — kurz erklärt',
    html: rahmen(
      h('Wie und wann Sie Ihr Geld bekommen') +
        p('{{anrede}}') +
        liste([
          'Zeiterfassung direkt nach dem Einsatz, im Profil oder in der App',
          'Unterschrift der betreuten Person auf dem Leistungsnachweis',
          'Abrechnung monatlich, Auszahlung im Folgemonat',
        ]) +
        p(
          'Fehlt eine Unterschrift, bleibt der Einsatz offen und wird nicht abgerechnet. Das ist keine Formalie: die Unterschrift ist der Nachweis gegenüber der Pflegekasse.',
        ) +
        knopf('Zur Zeiterfassung', `${SITE}/engel/zeiten`),
    ),
  },
]

const NACH_KEY = new Map(VORLAGEN.map((v) => [v.templateKey, v]))

/** Vorlage zum Schluessel. Wirft bei unbekanntem Schluessel (fail-closed). */
export function vorlageAus(templateKey: string): Vorlage {
  const v = NACH_KEY.get(templateKey)
  if (!v) {
    throw new Error(
      `Unbekannte Vorlage '${templateKey}'. Zulässig: ${VORLAGEN.map((x) => x.templateKey).join(', ')}`,
    )
  }
  return v
}

export function istVorlagenKey(wert: unknown): wert is string {
  return typeof wert === 'string' && NACH_KEY.has(wert)
}

// ───────────────────────────────────────────────────────────────────────────
// Prüfen und Rendern
// ───────────────────────────────────────────────────────────────────────────

export interface VorlagenBefund {
  ok: boolean
  fehler: string[]
}

/**
 * Prueft eine Vorlage, BEVOR sie verschickt wird.
 *
 * Die drei Regeln sind keine Stilfragen:
 *   — ohne {{abmeldelink}} ist die Mail nach Art. 21 DSGVO angreifbar,
 *   — ein persoenlicher Name im Absender verstoesst gegen die
 *     Kundenkommunikations-Regel des Projekts,
 *   — ein hart geschriebener Betrag von 125 € ist eine falsche Angabe,
 *     seit der Entlastungsbetrag 131 € betraegt.
 */
export function pruefeVorlage(vorlage: Pick<Vorlage, 'betreff' | 'html'>): VorlagenBefund {
  const fehler: string[] = []

  if (!vorlage.html.includes('{{abmeldelink}}')) {
    fehler.push('Vorlage enthält keinen {{abmeldelink}} — eine Werbemail ohne Abmeldemöglichkeit ist unzulässig.')
  }

  // 125 € als Entlastungsbetrag: veraltet seit 01.01.2025.
  if (/125\s*(?:€|EUR|Euro)/i.test(vorlage.html)) {
    fehler.push(
      `Vorlage nennt 125 € als Entlastungsbetrag. Gültig sind ${ENTLASTUNG_MONATLICH_EUR} € — den Platzhalter {{entlastungsbetrag}} verwenden.`,
    )
  }

  if (!vorlage.betreff.trim()) fehler.push('Kein Betreff.')

  return { ok: fehler.length === 0, fehler }
}

/**
 * Ersetzt die Platzhalter.
 *
 * Bewusst KEINE allgemeine Vorlagensprache: nur die vier Werte aus
 * `VorlagenWerte`. Eine Vorlagensprache, die beliebige Ausdruecke
 * auswertet, waere in einer Mail an die gesamte Kundschaft eine
 * Ausfuehrungsstelle fuer alles, was jemand ins Vorlagenfeld schreibt.
 */
export function rendere(text: string, werte: VorlagenWerte): string {
  return text
    .replace(/\{\{anrede\}\}/g, werte.anrede)
    .replace(/\{\{abmeldelink\}\}/g, werte.abmeldelink)
    .replace(/\{\{entlastungsbetrag\}\}/g, werte.entlastungsbetrag)
    .replace(/\{\{siteUrl\}\}/g, werte.siteUrl)
}

/**
 * Anrede aus dem Kontakt.
 *
 * Ohne Namen die neutrale Form. „Hallo Frau/Herr [Nachname]" braucht eine
 * Geschlechtsangabe, die im Verteiler nicht durchgaengig vorliegt; eine
 * geratene Anrede ist schlimmer als eine neutrale.
 */
export function anredeFuer(kontakt: MarketingKontakt): string {
  const name = kontakt.anzeigename.trim()
  return name ? `Hallo ${name},` : 'Hallo,'
}

/** Alle Werte für einen Kontakt zusammenstellen. */
export function werteFuer(kontakt: MarketingKontakt, abmeldelink: string): VorlagenWerte {
  return {
    anrede: anredeFuer(kontakt),
    abmeldelink,
    entlastungsbetrag: String(ENTLASTUNG_MONATLICH_EUR),
    siteUrl: SITE,
  }
}

/**
 * Textteil aus dem HTML.
 *
 * Grob, aber ausreichend: Werbepost ohne Textteil landet bei strengen
 * Filtern haeufiger im Spam, und der Abmeldelink muss auch dort stehen.
 *
 * ── WARUM LINKS EIGENS BEHANDELT WERDEN ────────────────────────────────
 * Ein blosses Strippen aller Tags loescht die ZIELE mit: aus
 * `<a href="…/abmeldung">Abmelden</a>` wird das nackte Wort „Abmelden".
 * Der Textteil truege dann keinen einzigen Abmeldelink mehr — und genau
 * er ist die Fassung, die strenge Filter und Textclients anzeigen. Eine
 * Werbemail, deren Textteil keine Abmeldemoeglichkeit enthaelt, ist bei
 * jedem Empfaenger, der sie so sieht, ein Verstoss gegen Art. 21 DSGVO.
 *
 * Deshalb wird jeder Anker VOR dem Strippen zu `Text (Ziel)` aufgeloest.
 */
export function textTeilAus(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // Anker zuerst: Beschriftung behalten, Ziel in Klammern dahinter.
    .replace(
      /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_treffer, ziel: string, beschriftung: string) => {
        const text = beschriftung.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        return text ? `${text} (${ziel})` : ziel
      },
    )
    // Bilder tragen im Textteil nichts bei — der alt-Text waere hier nur
    // Rauschen („Alltagsengel" unter jeder Mail).
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&middot;/g, '·')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ───────────────────────────────────────────────────────────────────────────
// Ablage in der Datenbank
// ───────────────────────────────────────────────────────────────────────────

/**
 * Schreibt fehlende Vorlagen aus dem Katalog in `email_templates`.
 *
 * ÜBERSCHREIBT NICHTS. Eine im Betrieb nachgebesserte Formulierung darf
 * beim nächsten Deployment nicht stillschweigend zurückgestempelt werden —
 * dieselbe Klasse Fehler wie bei den Monatsabschlüssen und den
 * Bonusberechnungen, wo ein Upsert Endzustände zurücksetzte.
 *
 * Wer eine Vorlage im Katalog ÄNDERT und die Änderung auch in der Tabelle
 * haben will, entfernt dort die Zeile und lässt sie neu anlegen. Das ist
 * bewusst ein Handgriff und kein Automatismus.
 */
export async function synchronisiereVorlagen(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<{ angelegt: number; vorhanden: number; uebersprungen: string[] }> {
  const { data: bestand, error: lesefehler } = await supabase
    .from('email_templates')
    .select('template_key')
    .eq('organization_id', organizationId)

  if (lesefehler) throw new Error(`Vorlagen nicht lesbar: ${lesefehler.message}`)

  const vorhandeneKeys = new Set(
    ((bestand ?? []) as Array<{ template_key: string }>).map((z) => z.template_key),
  )

  // Eine Vorlage mit Befund wird NICHT abgelegt. Sie stünde sonst als
  // auswählbare Option in der Oberfläche, obwohl sie nicht versandfähig ist.
  const uebersprungen: string[] = []
  const fehlende = VORLAGEN.filter((v) => {
    if (vorhandeneKeys.has(v.templateKey)) return false
    const befund = pruefeVorlage(v)
    if (!befund.ok) {
      uebersprungen.push(`${v.templateKey}: ${befund.fehler.join(' ')}`)
      return false
    }
    return true
  })

  if (fehlende.length === 0) {
    return { angelegt: 0, vorhanden: vorhandeneKeys.size, uebersprungen }
  }

  const { error } = await supabase.from('email_templates').insert(
    fehlende.map((v) => ({
      organization_id: organizationId,
      template_key: v.templateKey,
      name: v.name,
      zielgruppe: v.zielgruppe,
      consent_type: v.consentTyp,
      betreff: v.betreff,
      html: v.html,
      text_teil: textTeilAus(v.html),
      aktiv: true,
    })),
  )

  if (error) throw new Error(`Vorlagen nicht anlegbar: ${error.message}`)
  return { angelegt: fehlende.length, vorhanden: vorhandeneKeys.size, uebersprungen }
}
