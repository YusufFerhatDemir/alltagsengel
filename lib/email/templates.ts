import { esc } from '@/lib/notifications/html'

/**
 * Vorlagenkatalog der automatisierten Kommunikation.
 *
 * Quelle: docs/onboarding/AUTOMATISIERTE_KOMMUNIKATION.md (15 Vorlagen).
 * Betreffzeilen und Aufbau sind von dort übernommen.
 *
 * ── ZWEI ABWEICHUNGEN VON DER QUELLE, BEIDE ABSICHTLICH ────────────────
 *
 * 1. § 45b-AUSSAGE ENTSCHÄRFT (Vorlage `warteliste_welcome`)
 *    Die Quelle schreibt: „Mit einem anerkannten Pflegegrad übernimmt Ihre
 *    Pflegekasse die Kosten über den Entlastungsbetrag von 131 Euro pro
 *    Monat." Das ist eine Zusage der Kostenübernahme — und die setzt die
 *    Anerkennung nach § 45a SGB XI voraus, die aussteht. Hier steht
 *    stattdessen der Anspruch (der besteht unabhängig von uns) plus der
 *    Verfahrensstand.
 *
 * 2. DOMAIN KORRIGIERT
 *    Die Quelle nennt in jeder Fußzeile `alltagsengel.de`. Die betriebene
 *    Domain ist `alltagsengel.care` — dieselbe, auf die auch der Absender
 *    lautet. Ein Link ins Leere in jeder Mail wäre teurer als die
 *    Abweichung von der Vorlage.
 *
 * ── AUFBAU ────────────────────────────────────────────────────────────
 * Jede Vorlage liefert NUR den Rumpf. Anrede, Kopf und Fußzeile kommen aus
 * wrapEmailTemplate() in lib/notifications.ts — so ändert sich das Layout
 * an genau einer Stelle.
 *
 * Alle eingesetzten Werte laufen durch esc(). Eine Vorlage ist HTML; ein
 * Name mit einem spitzen Winkel darin wäre sonst eine Lücke.
 */

export type Zielgruppe = 'kunde' | 'bewerber' | 'intern'

export interface VorlagenFeld {
  key: string
  label: string
  /** Ohne Wert wird die Vorlage nicht gesendet — fail-closed. */
  pflicht?: boolean
  /** Vorbelegung im Admin-Formular. */
  beispiel?: string
}

export interface EmailVorlage {
  id: string
  /** Nummer aus dem Konzeptpapier — erleichtert den Abgleich. */
  quelle: string
  name: string
  zielgruppe: Zielgruppe
  betreff: (v: Record<string, string>) => string
  felder: VorlagenFeld[]
  /** Rumpf als HTML. */
  rumpf: (v: Record<string, string>) => string
}

const FELD_VORNAME: VorlagenFeld = { key: 'vorname', label: 'Vorname', pflicht: true }

/** Kurzer Absatz. */
const p = (inhalt: string) => `<p style="margin:0 0 14px;line-height:1.6;">${inhalt}</p>`

/** Aufzählung. */
const ul = (punkte: string[]) =>
  `<ul style="margin:0 0 14px;padding-left:20px;line-height:1.6;">`
  + punkte.map(t => `<li style="margin-bottom:8px;">${t}</li>`).join('')
  + `</ul>`

/** Nummerierte Schritte. */
const ol = (punkte: string[]) =>
  `<ol style="margin:0 0 14px;padding-left:20px;line-height:1.6;">`
  + punkte.map(t => `<li style="margin-bottom:8px;">${t}</li>`).join('')
  + `</ol>`

/** Hervorgehobener Kasten — für Termine, Fristen, Hinweise. */
const kasten = (inhalt: string) =>
  `<div style="background:rgba(201,150,60,0.08);border-radius:12px;padding:16px 18px;margin:0 0 16px;">${inhalt}</div>`

/**
 * Der Verfahrenshinweis. Steht in JEDER Vorlage, die den
 * Entlastungsbetrag erwähnt — ein Satz an einer Stelle, damit er nicht in
 * einer Vorlage vergessen wird.
 */
const ANERKENNUNG =
  'Alltagsengel befindet sich aktuell im Anerkennungsverfahren nach § 45a SGB XI. '
  + 'Nach erfolgter Anerkennung können berechtigte Pflegebedürftige Leistungen über '
  + 'den Entlastungsbetrag nach § 45b SGB XI abrechnen.'

const ENTLASTUNGSBETRAG_ABSATZ =
  p('Zum Hintergrund: Pflegebedürftigen mit Pflegegrad steht nach § 45b SGB XI '
    + 'grundsätzlich ein monatlicher Entlastungsbetrag von <strong>131 €</strong> zur '
    + 'Verfügung — bereits ab Pflegegrad 1.')
  + p(`<em>${ANERKENNUNG}</em>`)

const FRAGEN =
  p('Haben Sie Fragen? Schreiben Sie uns einfach an '
    + '<a href="mailto:info@alltagsengel.care" style="color:#C9963C;">info@alltagsengel.care</a> — '
    + 'wir melden uns bei Ihnen.')

export const EMAIL_VORLAGEN: EmailVorlage[] = [
  // ── 1. Kunden-Kommunikation ─────────────────────────────────────────
  {
    id: 'kunde_welcome_neukunde',
    quelle: '1.1',
    name: 'Welcome — Neukunde (nach Vertragsschluss)',
    zielgruppe: 'kunde',
    betreff: () => 'Willkommen bei Alltagsengel — Ihre Alltagsbegleitung startet bald',
    felder: [FELD_VORNAME],
    rumpf: v =>
      p(`herzlich willkommen bei Alltagsengel! Wir freuen uns sehr, dass Sie sich für uns entschieden haben.`)
      + p('So geht es weiter:')
      + ol([
        'Wir suchen eine Alltagsbegleitung, die zu Ihnen passt.',
        'Sie erhalten eine Vorstellung Ihrer Begleitperson per E-Mail.',
        'Beim ersten Termin lernen Sie sich in Ruhe kennen — ohne Zeitdruck.',
      ])
      + p('Sie behalten dieselbe Bezugsperson. Wenn einmal etwas dazwischenkommt, lassen sich Termine unkompliziert verschieben.')
      + ENTLASTUNGSBETRAG_ABSATZ
      + FRAGEN,
  },
  {
    id: 'warteliste_welcome',
    quelle: '1.2',
    name: 'Welcome — Wartelisten-Anmeldung',
    zielgruppe: 'kunde',
    betreff: () => 'Willkommen bei Alltagsengel — Ihr Platz ist gesichert',
    felder: [FELD_VORNAME],
    rumpf: () =>
      p('vielen Dank für Ihre Vormerkung bei Alltagsengel! Ihr Platz auf unserer Warteliste ist gesichert.')
      + p('<strong>Was das für Sie bedeutet:</strong>')
      + ul([
        'Sie gehören zu den Ersten, die von uns hören, sobald wir in Ihrer Region starten.',
        'Sie erhalten nützliche Informationen rund um Alltagsbegleitung und den Entlastungsbetrag.',
        'Ihre Vormerkung ist völlig unverbindlich — Sie können sich jederzeit abmelden.',
      ])
      + p('Kurz zu uns: Alltagsengel bringt geschulte Alltagsbegleiter zu Ihnen nach Hause. '
        + 'Ob Einkaufen, Arztbesuche, Spaziergänge oder einfach Gesellschaft — wir sind für Sie da.')
      + ENTLASTUNGSBETRAG_ABSATZ
      + FRAGEN,
  },
  {
    id: 'kunde_begleiter_vorstellung',
    quelle: '1.3',
    name: 'Begleiter-Vorstellung',
    zielgruppe: 'kunde',
    betreff: v => `Ihr Alltagsbegleiter steht fest — lernen Sie ${v.begleiter_vorname || '[Vorname]'} kennen`,
    felder: [
      FELD_VORNAME,
      { key: 'begleiter_vorname', label: 'Vorname der Begleitperson', pflicht: true },
      { key: 'begleiter_text', label: 'Kurzvorstellung', pflicht: true,
        beispiel: 'begleitet seit drei Jahren ältere Menschen im Alltag und kennt Ihren Stadtteil gut.' },
      { key: 'erster_termin', label: 'Erster Termin (Datum/Uhrzeit)' },
    ],
    rumpf: v =>
      p('wir haben eine Alltagsbegleitung für Sie gefunden.')
      + kasten(`<strong>${esc(v.begleiter_vorname || '')}</strong><br>${esc(v.begleiter_text || '')}`)
      + (v.erster_termin
        ? p(`Ihr erster gemeinsamer Termin: <strong>${esc(v.erster_termin)}</strong>.`)
        : p('Für den ersten Termin melden wir uns telefonisch bei Ihnen.'))
      + p('Beim ersten Treffen geht es nur ums Kennenlernen — was Sie brauchen, besprechen Sie in Ruhe miteinander.')
      + FRAGEN,
  },
  {
    id: 'kunde_zufriedenheit',
    quelle: '1.4',
    name: 'Zufriedenheitsabfrage (nach 4 Wochen)',
    zielgruppe: 'kunde',
    betreff: () => 'Wie zufrieden sind Sie mit Alltagsengel?',
    felder: [FELD_VORNAME],
    rumpf: () =>
      p('Ihre Alltagsbegleitung läuft nun seit etwa vier Wochen. Wir möchten wissen, wie es Ihnen damit geht.')
      + ul([
        'Passt die Chemie mit Ihrer Begleitperson?',
        'Stimmen die Zeiten und der Rhythmus?',
        'Gibt es etwas, das wir besser machen können?',
      ])
      + p('Eine kurze Rückmeldung genügt — ein, zwei Sätze reichen völlig. '
        + 'Wenn etwas nicht passt, ändern wir es.')
      + FRAGEN,
  },

  // ── 2. Bewerber-Kommunikation ───────────────────────────────────────
  {
    id: 'bewerber_eingang',
    quelle: '2.1',
    name: 'Bestätigung — Bewerbungseingang',
    zielgruppe: 'bewerber',
    betreff: () => 'Ihre Bewerbung bei Alltagsengel — vielen Dank!',
    felder: [FELD_VORNAME, { key: 'nachname', label: 'Nachname' }],
    rumpf: () =>
      p('vielen Dank für Ihre Bewerbung bei Alltagsengel! Wir freuen uns über Ihr Interesse, '
        + 'als Alltagsbegleitung Teil unseres Teams zu werden.')
      + p('<strong>So geht es weiter:</strong>')
      + ol([
        'Wir sichten Ihre Unterlagen innerhalb von 5 Werktagen.',
        'Bei positiver Vorauswahl laden wir Sie zu einem persönlichen Gespräch ein (ca. 45–60 Minuten).',
        'Im Gespräch lernen wir uns kennen und besprechen alles Weitere.',
      ])
      + p('Falls wir noch Unterlagen von Ihnen benötigen, melden wir uns rechtzeitig.')
      + FRAGEN,
  },
  {
    id: 'bewerber_einladung',
    quelle: '2.2',
    name: 'Einladung zum Vorstellungsgespräch',
    zielgruppe: 'bewerber',
    betreff: () => 'Einladung zum Vorstellungsgespräch bei Alltagsengel',
    felder: [
      FELD_VORNAME,
      { key: 'termin', label: 'Termin (Datum und Uhrzeit)', pflicht: true },
      { key: 'ort', label: 'Ort oder Videolink', pflicht: true, beispiel: 'Videogespräch, Link folgt' },
    ],
    rumpf: v =>
      p('Ihre Unterlagen haben uns überzeugt — wir würden Sie gerne persönlich kennenlernen.')
      + kasten(`<strong>Termin:</strong> ${esc(v.termin || '')}<br><strong>Wo:</strong> ${esc(v.ort || '')}`)
      + p('Das Gespräch dauert etwa 45 bis 60 Minuten. Sie brauchen nichts vorzubereiten — '
        + 'wir möchten Sie kennenlernen und Ihre Fragen beantworten.')
      + p('Passt der Termin nicht? Schreiben Sie uns kurz, wir finden einen anderen.')
      + FRAGEN,
  },
  {
    id: 'bewerber_zusage',
    quelle: '2.3',
    name: 'Zusage nach Vorstellungsgespräch',
    zielgruppe: 'bewerber',
    betreff: () => 'Herzlichen Glückwunsch — willkommen im Team von Alltagsengel!',
    felder: [FELD_VORNAME],
    rumpf: () =>
      p('wir freuen uns sehr: Sie passen zu uns, und wir würden gerne mit Ihnen zusammenarbeiten.')
      + p('<strong>Die nächsten Schritte:</strong>')
      + ol([
        'Wir senden Ihnen die Vertragsunterlagen zu.',
        'Sie reichen die noch fehlenden Nachweise ein (u. a. erweitertes Führungszeugnis).',
        'Danach starten Sie mit Ihrer Einarbeitung und den ersten Einsätzen.',
      ])
      + p('Wir melden uns in den nächsten Tagen mit allen Unterlagen bei Ihnen.')
      + FRAGEN,
  },
  {
    id: 'bewerber_absage',
    quelle: '2.4',
    name: 'Absage nach Screening',
    zielgruppe: 'bewerber',
    betreff: () => 'Ihre Bewerbung bei Alltagsengel',
    felder: [FELD_VORNAME],
    rumpf: () =>
      p('vielen Dank, dass Sie sich bei Alltagsengel beworben haben, und für das Vertrauen, '
        + 'das Sie uns damit entgegengebracht haben.')
      + p('Wir haben uns diesmal für eine andere Bewerbung entschieden. Das ist keine Bewertung '
        + 'Ihrer Person — es hat sich schlicht ein Profil ergeben, das aktuell näher an dem liegt, '
        + 'was wir gerade suchen.')
      + p('Gerne behalten wir Ihre Unterlagen für künftige Stellen, wenn Sie einverstanden sind. '
        + 'Schreiben Sie uns dazu einfach kurz zurück.')
      + p('Wir wünschen Ihnen für Ihren weiteren Weg alles Gute.'),
  },

  // ── 3. Erinnerungen ─────────────────────────────────────────────────
  {
    id: 'kunde_unterlagen_1',
    quelle: '3.1',
    name: 'Fehlende Unterlagen — Kunde (1. Erinnerung)',
    zielgruppe: 'kunde',
    betreff: () => 'Kurze Erinnerung — fehlende Unterlagen für Ihre Alltagsbegleitung',
    felder: [FELD_VORNAME, { key: 'unterlagen', label: 'Welche Unterlagen fehlen', pflicht: true }],
    rumpf: v =>
      p('wir möchten mit Ihrer Alltagsbegleitung starten — dafür fehlt uns noch eine Kleinigkeit:')
      + kasten(esc(v.unterlagen || ''))
      + p('Sie können uns die Unterlagen ganz einfach per E-Mail schicken. '
        + 'Wenn Ihnen etwas unklar ist, rufen wir Sie gerne an.')
      + FRAGEN,
  },
  {
    id: 'kunde_unterlagen_2',
    quelle: '3.2',
    name: 'Fehlende Unterlagen — Kunde (2. Erinnerung)',
    zielgruppe: 'kunde',
    betreff: () => 'Erinnerung — Ihre Alltagsbegleitung wartet auf Sie',
    felder: [FELD_VORNAME, { key: 'unterlagen', label: 'Welche Unterlagen fehlen', pflicht: true }],
    rumpf: v =>
      p('Ihre Alltagsbegleitung ist vorbereitet — wir warten nur noch auf diese Unterlagen:')
      + kasten(esc(v.unterlagen || ''))
      + p('Falls etwas dazwischengekommen ist oder Sie Unterstützung beim Zusammenstellen brauchen: '
        + 'Sagen Sie uns kurz Bescheid, wir helfen gerne.')
      + FRAGEN,
  },
  {
    id: 'kunde_unterlagen_3',
    quelle: '3.3',
    name: 'Fehlende Unterlagen — Kunde (3. und letzte Erinnerung)',
    zielgruppe: 'kunde',
    betreff: () => 'Letzte Erinnerung — Ihre Vormerkung bei Alltagsengel',
    felder: [FELD_VORNAME, { key: 'unterlagen', label: 'Welche Unterlagen fehlen', pflicht: true }],
    rumpf: v =>
      p('wir haben Ihnen bereits zweimal geschrieben und möchten uns ein letztes Mal melden. '
        + 'Uns fehlen weiterhin:')
      + kasten(esc(v.unterlagen || ''))
      + p('Wenn wir bis auf Weiteres nichts von Ihnen hören, legen wir Ihren Vorgang vorerst zur Seite. '
        + 'Das ist kein Problem — melden Sie sich einfach, wenn es bei Ihnen wieder passt. '
        + 'Ihre Daten bleiben so lange gespeichert, wie Sie es wünschen.')
      + FRAGEN,
  },
  {
    id: 'bewerber_unterlagen',
    quelle: '3.4',
    name: 'Fehlende Unterlagen — Bewerber',
    zielgruppe: 'bewerber',
    betreff: () => 'Kurze Erinnerung — fehlende Unterlagen für Ihre Bewerbung',
    felder: [FELD_VORNAME, { key: 'unterlagen', label: 'Welche Unterlagen fehlen', pflicht: true }],
    rumpf: v =>
      p('wir möchten Ihre Bewerbung weiter bearbeiten — dafür fehlen uns noch:')
      + kasten(esc(v.unterlagen || ''))
      + p('Schicken Sie uns die Unterlagen einfach per E-Mail zurück. '
        + 'Wenn etwas davon schwierig zu beschaffen ist, sagen Sie uns Bescheid — '
        + 'oft gibt es einen einfacheren Weg.')
      + FRAGEN,
  },

  // ── 4. Wartelisten-Updates ──────────────────────────────────────────
  {
    id: 'warteliste_meilenstein',
    quelle: '4.1',
    name: 'Meilenstein-Update',
    zielgruppe: 'kunde',
    betreff: v => `${v.anzahl || '[Anzahl]'} Familien vertrauen auf Alltagsengel — Sie gehören dazu!`,
    felder: [FELD_VORNAME, { key: 'anzahl', label: 'Erreichte Anzahl', pflicht: true, beispiel: '100' }],
    rumpf: v =>
      p(`ein kurzes Update: <strong>${esc(v.anzahl || '')}</strong> Menschen haben sich inzwischen `
        + 'auf unserer Warteliste vorgemerkt — Sie sind einer davon.')
      + p('Das hilft uns konkret: Je mehr Vormerkungen aus einer Region kommen, desto eher '
        + 'können wir dort starten. Ihre Anmeldung ist damit mehr als eine Notiz auf einer Liste.')
      + p('Wir melden uns, sobald es bei Ihnen losgeht.')
      + FRAGEN,
  },
  {
    id: 'warteliste_regionalstart',
    quelle: '4.2',
    name: 'Regionale Start-Ankündigung',
    zielgruppe: 'kunde',
    betreff: v => `Es ist soweit — Alltagsengel startet in ${v.region || '[Region]'}!`,
    felder: [FELD_VORNAME, { key: 'region', label: 'Region', pflicht: true, beispiel: 'Maintal' }],
    rumpf: v =>
      p(`wir starten in <strong>${esc(v.region || '')}</strong> — und Sie stehen auf der Liste.`)
      + p('<strong>So geht es weiter:</strong>')
      + ol([
        'Wir rufen Sie in den nächsten Tagen an und besprechen, was Sie brauchen.',
        'Wir suchen eine Alltagsbegleitung, die zu Ihnen passt.',
        'Beim ersten Termin lernen Sie sich in Ruhe kennen.',
      ])
      + p('Sie müssen nichts tun — wir melden uns bei Ihnen. Und selbstverständlich bleibt alles '
        + 'unverbindlich, bis Sie sich entscheiden.')
      + ENTLASTUNGSBETRAG_ABSATZ
      + FRAGEN,
  },
  {
    id: 'warteliste_quartal',
    quelle: '4.3',
    name: 'Quartals-Update',
    zielgruppe: 'kunde',
    betreff: () => 'Neuigkeiten von Alltagsengel — Ihr Quartals-Update',
    felder: [
      FELD_VORNAME,
      { key: 'neuigkeiten', label: 'Was gibt es Neues', pflicht: true,
        beispiel: 'Wir haben unser Einsatzgebiet um Maintal und Bad Vilbel erweitert.' },
    ],
    rumpf: v =>
      p('ein kurzes Update von uns — Sie stehen auf unserer Warteliste, und wir halten Sie auf dem Laufenden.')
      + kasten(esc(v.neuigkeiten || ''))
      + p('Ihre Vormerkung bleibt unverändert bestehen. Sobald wir in Ihrer Region starten, '
        + 'hören Sie von uns.')
      + ENTLASTUNGSBETRAG_ABSATZ
      + FRAGEN,
  },

  // ── 4. Stufenwechsel der beiden Trichter ────────────────────────────
  //
  // Diese Vorlagen gehoeren zu den Stufen aus `lib/kunde/pipeline.ts` und
  // `lib/bewerbung/pipeline.ts`. Jede beantwortet die Frage, die auf genau
  // dieser Stufe beim Empfaenger entsteht — und keine andere.
  //
  // Sie werden NICHT automatisch versendet. Es gibt sie, damit die
  // Verwaltung an der Stufe einen fertigen Entwurf hat, statt jedes Mal neu
  // zu formulieren.

  {
    id: 'kunde_erstgespraech_termin',
    quelle: 'F-1',
    name: 'Bestätigung — Termin für das Erstgespräch',
    zielgruppe: 'kunde',
    betreff: () => 'Ihr Beratungstermin bei Alltagsengel',
    felder: [
      FELD_VORNAME,
      { key: 'termin', label: 'Termin (Datum und Uhrzeit)', pflicht: true },
      { key: 'ort', label: 'Ort oder Telefon', pflicht: true, beispiel: 'bei Ihnen zu Hause' },
    ],
    rumpf: v =>
      p('vielen Dank für Ihr Vertrauen — wir haben den Termin für Ihr Erstgespräch notiert.')
      + kasten(`<strong>Termin:</strong> ${esc(v.termin || '')}<br><strong>Wo:</strong> ${esc(v.ort || '')}`)
      + p('Im Gespräch klären wir in Ruhe, welche Unterstützung im Alltag hilft, '
        + 'zu welchen Zeiten und wie oft. Das dauert etwa eine Stunde.')
      + p('<strong>Wenn Sie mögen, legen Sie bereit:</strong>')
      + ul([
        'den Pflegegrad-Bescheid, falls vorhanden',
        'den Namen Ihrer Pflegekasse',
        'Ihre Fragen — es gibt keine unpassenden',
      ])
      + p('Nichts davon ist Voraussetzung. Wenn etwas fehlt, klären wir es gemeinsam.')
      + p('Passt der Termin doch nicht? Sagen Sie uns kurz Bescheid, wir finden einen anderen.')
      + FRAGEN,
  },
  {
    id: 'kunde_erstgespraech_erinnerung',
    quelle: 'F-2',
    name: 'Erinnerung — Erstgespräch morgen',
    zielgruppe: 'kunde',
    betreff: () => 'Erinnerung: unser Gespräch morgen',
    felder: [
      FELD_VORNAME,
      { key: 'termin', label: 'Termin (Datum und Uhrzeit)', pflicht: true },
      { key: 'ort', label: 'Ort oder Telefon', pflicht: true },
    ],
    rumpf: v =>
      p('nur eine kurze Erinnerung an unser Gespräch.')
      + kasten(`<strong>Termin:</strong> ${esc(v.termin || '')}<br><strong>Wo:</strong> ${esc(v.ort || '')}`)
      + p('Sollte etwas dazwischenkommen, genügt eine kurze Nachricht — wir verschieben '
        + 'den Termin gerne.')
      + FRAGEN,
  },
  {
    id: 'kunde_angebot',
    quelle: 'F-3',
    name: 'Status — Leistungs- und Kostenvorschlag',
    zielgruppe: 'kunde',
    betreff: () => 'Ihr Vorschlag von Alltagsengel',
    felder: [
      FELD_VORNAME,
      { key: 'umfang', label: 'Umfang', pflicht: true, beispiel: '2 Stunden pro Woche, dienstags vormittags' },
      { key: 'stundensatz', label: 'Stundensatz', pflicht: true, beispiel: 'siehe beigefügter Vorschlag' },
    ],
    rumpf: v =>
      p('nach unserem Gespräch haben wir Ihnen einen Vorschlag zusammengestellt.')
      + kasten(`<strong>Umfang:</strong> ${esc(v.umfang || '')}<br><strong>Kosten:</strong> ${esc(v.stundensatz || '')}`)
      + ENTLASTUNGSBETRAG_ABSATZ
      + p('Schauen Sie in Ruhe darüber. Wenn etwas nicht passt — Zeiten, Umfang, '
        + 'Aufgaben —, ändern wir das gerne.')
      + p('Melden Sie sich einfach, wenn Sie einverstanden sind oder Fragen haben.')
      + FRAGEN,
  },
  {
    id: 'kunde_vertrag',
    quelle: 'F-4',
    name: 'Status — Vertrag zur Unterschrift',
    zielgruppe: 'kunde',
    betreff: () => 'Ihre Vertragsunterlagen von Alltagsengel',
    felder: [FELD_VORNAME],
    rumpf: () =>
      p('wir freuen uns, dass Sie sich für Alltagsengel entschieden haben.')
      + p('<strong>Die nächsten Schritte:</strong>')
      + ol([
        'Sie erhalten die Vertragsunterlagen von uns.',
        'Sie schauen sie durch und unterschreiben, was passt.',
        'Wir stellen Ihnen Ihre Alltagsbegleitung persönlich vor.',
      ])
      + p('Lassen Sie sich Zeit beim Lesen. Was unklar ist, erklären wir Ihnen — '
        + 'am Telefon oder bei einem weiteren Besuch.')
      + FRAGEN,
  },
  {
    id: 'kunde_absage',
    quelle: 'F-5',
    name: 'Status — Anfrage kann nicht bedient werden',
    zielgruppe: 'kunde',
    betreff: () => 'Ihre Anfrage bei Alltagsengel',
    felder: [
      FELD_VORNAME,
      { key: 'grund', label: 'Grund in einem Satz', pflicht: true,
        beispiel: 'in Ihrer Region derzeit keine freie Begleitung' },
    ],
    rumpf: v =>
      p('vielen Dank für Ihre Anfrage und Ihr Vertrauen.')
      + p(`Leider können wir Ihnen im Moment kein Angebot machen: ${esc(v.grund || '')}.`)
      + p('Das tut uns leid — gerade weil Sie sich an uns gewandt haben.')
      + p('Wenn Sie möchten, melden wir uns, sobald sich das ändert. Schreiben Sie uns '
        + 'dazu einfach kurz zurück.')
      + FRAGEN,
  },
  {
    id: 'bewerber_probearbeit',
    quelle: 'F-6',
    name: 'Einladung zur Probearbeit',
    zielgruppe: 'bewerber',
    betreff: () => 'Ihre Probearbeit bei Alltagsengel',
    felder: [
      FELD_VORNAME,
      { key: 'termin', label: 'Termin (Datum und Uhrzeit)', pflicht: true },
      { key: 'treffpunkt', label: 'Treffpunkt', pflicht: true },
      { key: 'begleitung', label: 'Wer begleitet', beispiel: 'eine erfahrene Kollegin' },
    ],
    rumpf: v =>
      p('das Gespräch hat uns gefallen — jetzt möchten wir Sie im Alltag erleben, '
        + 'und Sie uns.')
      + kasten(`<strong>Termin:</strong> ${esc(v.termin || '')}<br>`
        + `<strong>Treffpunkt:</strong> ${esc(v.treffpunkt || '')}`
        + (v.begleitung ? `<br><strong>Begleitung:</strong> ${esc(v.begleitung)}` : ''))
      + p('Sie begleiten einen regulären Einsatz und sehen, wie unsere Arbeit aussieht. '
        + 'Sie müssen nichts allein machen und nichts vorbereiten.')
      + p('<strong>Bitte mitbringen:</strong>')
      + ul([
        'bequeme Kleidung und feste Schuhe',
        'Ihren Personalausweis',
        'Ihre Fragen',
      ])
      + p('Im Anschluss sprechen wir kurz darüber, wie es für Sie war.')
      + FRAGEN,
  },
  {
    id: 'bewerber_erinnerung',
    quelle: 'F-7',
    name: 'Erinnerung — Termin morgen',
    zielgruppe: 'bewerber',
    betreff: () => 'Erinnerung: Ihr Termin bei Alltagsengel morgen',
    felder: [
      FELD_VORNAME,
      { key: 'termin', label: 'Termin (Datum und Uhrzeit)', pflicht: true },
      { key: 'ort', label: 'Ort oder Videolink', pflicht: true },
    ],
    rumpf: v =>
      p('nur eine kurze Erinnerung an unseren Termin.')
      + kasten(`<strong>Termin:</strong> ${esc(v.termin || '')}<br><strong>Wo:</strong> ${esc(v.ort || '')}`)
      + p('Sollte etwas dazwischenkommen, schreiben Sie uns kurz — wir finden einen '
        + 'neuen Termin.')
      + FRAGEN,
  },
]

const NACH_ID = new Map(EMAIL_VORLAGEN.map(v => [v.id, v]))

export function vorlageFinden(id: unknown): EmailVorlage | null {
  return typeof id === 'string' ? NACH_ID.get(id) ?? null : null
}

export function vorlagenFuer(zielgruppe: Zielgruppe): EmailVorlage[] {
  return EMAIL_VORLAGEN.filter(v => v.zielgruppe === zielgruppe)
}

export interface GerenderteMail {
  betreff: string
  rumpfHtml: string
  fehlendeFelder: string[]
}

/**
 * Rendert eine Vorlage.
 *
 * Fehlende Pflichtfelder werden GEMELDET statt stillschweigend als leere
 * Stelle eingesetzt. Eine Einladung ohne Termin wäre sonst eine Mail, die
 * beim Empfänger eine Lücke hinterlässt — und niemand merkt es vorher.
 */
/**
 * Eine Betreffzeile ist EINE Zeile.
 *
 * ── WARUM DER RIEGEL HIER STEHT UND NICHT BEIM VERSENDER ──────────────
 * Am 13.09.2026 nachgemessen: ein Zeilenumbruch in einem Vorlagenfeld
 * landete unverändert im Betreff. Aus dem Vornamen „Anna" plus Umbruch
 * plus „Bcc: …" wurde ein Betreff mit einem Umbruch mittendrin.
 *
 * Ob daraus beim Versand ein eigener Header wird, entscheidet dann die
 * Bibliothek des Anbieters. Genau das ist der Punkt: ein Riegel, der davon
 * abhängt, wie ein fremdes SDK seine Eingaben kodiert, ist keiner. Und ein
 * mehrzeiliger Betreff ist auch ohne Angriff schon kaputt.
 *
 * Nur der Betreff wird einzeilig gemacht. Rumpffelder dürfen Umbrüche
 * behalten — eine Kurzvorstellung mit zwei Absätzen ist erwünscht, und im
 * HTML sind Umbrüche harmlos (escaped wird dort ohnehin).
 */
export function einzeiligerBetreff(wert: string): string {
  return wert
    .replace(/[\r\n\t\f\v\u0085\u2028\u2029]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
}

export function vorlageRendern(
  vorlage: EmailVorlage,
  werte: Record<string, string>,
): GerenderteMail {
  const sauber: Record<string, string> = {}
  for (const [k, v] of Object.entries(werte)) {
    // Steuerzeichen ausserhalb von Tab und Umbruch entstehen in keiner
    // Eingabe absichtlich — weder im Betreff noch im Rumpf.
    if (typeof v === 'string') {
      sauber[k] = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
    }
  }

  const fehlendeFelder = vorlage.felder
    .filter(f => f.pflicht && !sauber[f.key])
    .map(f => f.label)

  return {
    betreff: einzeiligerBetreff(vorlage.betreff(sauber)),
    rumpfHtml: vorlage.rumpf(sauber),
    fehlendeFelder,
  }
}
