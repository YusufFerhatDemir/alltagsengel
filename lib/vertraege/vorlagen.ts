// ═══════════════════════════════════════════════════════════════════
// Vertragsvorlagen — Textbausteine für den Dokumentengenerator
// ═══════════════════════════════════════════════════════════════════
//
// ── WARUM DIE VORLAGEN IM CODE STEHEN ─────────────────────────────
// `akten_vertraege` trägt seit jeher die Spalten `vorlage_id` und
// `pdf_url`. Beide sind live durchgehend NULL: eine Vorlagentabelle gibt
// es nicht, und ein PDF hat nie jemand erzeugt. Ein Vertrag existierte
// damit ausschliesslich als Datenbankzeile — und eine Datenbankzeile
// unterschreibt niemand.
//
// Vorlagen als Tabelle anzulegen hiesse DDL, und DDL ist aus dieser
// Anwendung heraus nicht moeglich (42501, service_role hat keine
// Owner-Rechte). Sie stehen deshalb hier. Das ist kein Notbehelf:
// Vertragsklauseln sind versionierter, geprüfter Text — sie gehoeren in
// die Versionsverwaltung, nicht in eine Zeile, die jemand im SQL-Editor
// unbemerkt aendern kann. `vorlage_id` bleibt fuer den Tag frei, an dem
// eine echte Vorlagenverwaltung dazukommt.
//
// ── DIE KLAUSELN SIND ENTWURF, NICHT GEPRUEFT ─────────────────────
// Dies ist Software, kein Rechtsrat. Die Paragraphen unten sind fachlich
// uebliche Bausteine eines Dienstleistungsvertrags — sie sind NICHT
// anwaltlich geprueft. Zwei Punkte sind bei einem Verbrauchervertrag
// besonders heikel und hier bewusst als Platzhalter gefuehrt statt
// ausformuliert:
//
//   · die Widerrufsbelehrung nach §§ 355, 356 BGB (Fernabsatz). Eine
//     fehlerhafte Belehrung laesst die Widerrufsfrist nicht anlaufen —
//     der Vertrag bleibt dann praktisch unbefristet widerruflich.
//   · die Haftungsbegrenzung. Zu weit gefasst ist sie nach § 309 BGB
//     unwirksam, und zwar im Zweifel vollstaendig.
//
// Deshalb das Gate: ohne ausdrueckliche Freigabe traegt jedes erzeugte
// PDF sichtbar den Vermerk ENTWURF und die Vorlage gilt als nicht
// verwendbar. Das Muster ist dasselbe wie bei FIRST_REAL_INVOICE_APPROVED
// — eine Zahl bzw. ein Text, der Aussenwirkung hat, laeuft erst nach
// ausdruecklicher Freigabe scharf.
//
// ── VERGUETUNG WIRD NIE ERFUNDEN ──────────────────────────────────
// Der Stundensatz kommt als Parameter herein und wird nicht geraten.
// Fehlt er, entsteht KEIN Dokument (siehe `vertragsBausteine`). Ein
// Vertrag ohne Vergütungsangabe ist wertlos, ein Vertrag mit geratener
// Vergütung ist gefaehrlich. Die Preishoheit liegt bei
// lib/pricing/quelle.ts und den dort genannten Tabellen.
//
// Diese Datei hat KEINE Importe — sie ist Text und Regel, sonst nichts.
// ═══════════════════════════════════════════════════════════════════

/** Vertragsarten, für die eine Vorlage hinterlegt ist. */
export const VORLAGEN_TYPEN = ['dienstleistungsvertrag', 'betreuungsvertrag'] as const
export type VorlagenTyp = (typeof VORLAGEN_TYPEN)[number]

/**
 * Ist die Vertragsvorlage juristisch freigegeben?
 *
 * Fail-closed: alles ausser der ausdruecklichen '1' heisst nein. Ohne
 * Freigabe entsteht weiterhin ein PDF — aber sichtbar als ENTWURF
 * gekennzeichnet, damit niemand es versehentlich versendet.
 */
export function vorlageFreigegeben(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERTRAGSVORLAGE_FREIGEGEBEN === '1'
}

/** Die Felder, die eine Vorlage füllt. */
export interface VertragsDaten {
  /** Vollständiger Name des Auftraggebers (Kunde). */
  auftraggeber: string
  /** Anschrift des Auftraggebers, mehrzeilig erlaubt. */
  auftraggeberAnschrift?: string | null
  vertragsnummer?: string | null
  vertragsbeginn?: string | null
  vertragsende?: string | null
  kuendigungsfristTage?: number | null
  autoVerlaengerung?: boolean
  /**
   * Stundensatz in Euro. PFLICHT — ohne ihn wird kein Dokument gebaut.
   * Herkunft: service_pricing bzw. billing_tariffs über den
   * Preis-Resolver, NIE eine Zahl aus dieser Datei.
   */
  stundensatzEuro: number
  /** Woher der Satz stammt — erscheint als Fussnote im Vertrag. */
  verguetungsQuelle: string
}

export interface Baustein {
  /** Überschrift, z. B. "§ 3 Vergütung". */
  titel: string
  /** Absätze. Leere Einträge werden übersprungen. */
  absaetze: string[]
}

/** Der Hinweis, der auf jedem nicht freigegebenen Dokument steht. */
export const ENTWURF_VERMERK =
  'ENTWURF — nicht zur Verwendung. Diese Vertragsvorlage ist noch nicht '
  + 'juristisch geprüft und freigegeben.'

function euroText(betrag: number): string {
  return betrag.toFixed(2).replace('.', ',') + ' €'
}

function datumText(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

/**
 * Baut die Paragraphen des Vertrags.
 *
 * Wirft, wenn die Vergütung fehlt oder unplausibel ist — lieber kein
 * Dokument als eines mit einer geratenen Zahl darin.
 */
export function vertragsBausteine(typ: VorlagenTyp, d: VertragsDaten): Baustein[] {
  if (!Number.isFinite(d.stundensatzEuro) || d.stundensatzEuro <= 0) {
    throw new Error(
      'Für den Vertrag liegt kein gültiger Stundensatz vor. Es wurde KEIN Dokument '
      + 'erzeugt — ein Vertrag ohne Vergütungsangabe ist nicht verwendbar, und eine '
      + 'geratene Zahl wäre bindend. Der Satz stammt aus service_pricing bzw. '
      + 'billing_tariffs (siehe lib/pricing/quelle.ts).',
    )
  }
  if (!d.auftraggeber?.trim()) {
    throw new Error('Für den Vertrag fehlt der Name des Auftraggebers. Es wurde KEIN Dokument erzeugt.')
  }

  const frist = d.kuendigungsfristTage ?? 14
  const istKasse = typ === 'betreuungsvertrag'

  const gegenstand: Baustein = {
    titel: '§ 1 Vertragsgegenstand',
    absaetze: [
      'Alltagsengel erbringt für den Auftraggeber Leistungen der Alltagsbegleitung '
      + 'und hauswirtschaftlichen Entlastung. Die Leistungen werden von qualifizierten '
      + 'Betreuungskräften im häuslichen Umfeld des Auftraggebers erbracht.',
      istKasse
        // §45a ist NICHT anerkannt — das gehoert in den Vertrag, nicht ins Kleingedruckte.
        // Ein Betreuungsvertrag, der eine Kassenerstattung verspricht, die es
        // nicht gibt, waere eine Zusage ins Blaue hinein.
        ? 'Die Anerkennung als Angebot zur Unterstützung im Alltag nach § 45a SGB XI '
          + 'befindet sich derzeit im Anerkennungsverfahren. Eine Abrechnung gegenüber '
          + 'der Pflegekasse ist erst nach Erteilung des Bescheides möglich. Bis dahin '
          + 'werden die Leistungen als Privatleistung abgerechnet.'
        : 'Die Leistungen werden als Privatleistung erbracht und unmittelbar gegenüber '
          + 'dem Auftraggeber abgerechnet.',
    ],
  }

  const umfang: Baustein = {
    titel: '§ 2 Leistungsumfang und Durchführung',
    absaetze: [
      'Art, Umfang und zeitliche Lage der Leistungen werden zwischen den Parteien '
      + 'einvernehmlich festgelegt und in der Einsatzplanung dokumentiert.',
      'Die erbrachten Leistungen werden je Einsatz in einem Leistungsnachweis '
      + 'festgehalten. Der Auftraggeber bestätigt die Erbringung durch Unterschrift; '
      + 'die Unterschrift ist Voraussetzung für die Abrechnung.',
      'Alltagsengel wählt die eingesetzte Betreuungskraft aus. Ein Anspruch auf eine '
      + 'bestimmte Person besteht nicht; bei Verhinderung wird nach Möglichkeit Ersatz '
      + 'gestellt.',
    ],
  }

  const verguetung: Baustein = {
    titel: '§ 3 Vergütung',
    absaetze: [
      `Die Vergütung beträgt ${euroText(d.stundensatzEuro)} je Stunde. `
      + 'Abgerechnet wird nach tatsächlich geleisteter Zeit auf Grundlage der '
      + 'unterschriebenen Leistungsnachweise.',
      'Die Abrechnung erfolgt monatlich. Rechnungen sind ohne Abzug innerhalb von '
      + '14 Tagen ab Rechnungsdatum zur Zahlung fällig.',
      istKasse
        ? 'Soweit und sobald eine Kostenübernahme durch die Pflegekasse besteht, kann '
          + 'die Abrechnung im Rahmen des Entlastungsbetrages nach § 45b SGB XI in Höhe '
          + 'von derzeit 131 € monatlich erfolgen. Ein darüber hinausgehender Betrag ist '
          + 'vom Auftraggeber selbst zu tragen.'
        : '',
    ],
  }

  const laufzeit: Baustein = {
    titel: '§ 4 Laufzeit und Kündigung',
    absaetze: [
      d.vertragsende
        ? `Der Vertrag beginnt am ${datumText(d.vertragsbeginn)} und endet am ${datumText(d.vertragsende)}.`
        : `Der Vertrag beginnt am ${datumText(d.vertragsbeginn)} und läuft auf unbestimmte Zeit.`,
      `Der Vertrag kann von beiden Seiten mit einer Frist von ${frist} Tagen gekündigt werden. `
      + 'Die Kündigung bedarf der Textform.',
      d.autoVerlaengerung
        ? 'Wird der Vertrag nicht fristgerecht gekündigt, verlängert er sich um den '
          + 'jeweils vereinbarten Zeitraum.'
        : '',
      'Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt für beide '
      + 'Seiten unberührt.',
    ],
  }

  const mitwirkung: Baustein = {
    titel: '§ 5 Mitwirkung des Auftraggebers',
    absaetze: [
      'Der Auftraggeber gewährt der Betreuungskraft zu den vereinbarten Zeiten Zutritt '
      + 'und stellt die für die Leistungserbringung erforderlichen Mittel bereit.',
      'Änderungen und Absagen von Einsätzen sind rechtzeitig mitzuteilen. Bei Absagen, '
      + 'die nicht mindestens 24 Stunden vorher erfolgen, kann die vereinbarte Zeit in '
      + 'Rechnung gestellt werden.',
      'Umstände, die für die Betreuung erheblich sind — insbesondere gesundheitliche '
      + 'Veränderungen —, sind mitzuteilen.',
    ],
  }

  // Haftung und Widerruf sind die beiden Stellen, an denen eine ungeprüfte
  // Formulierung echten Schaden anrichtet. Sie stehen hier bewusst als
  // Verweis, nicht als ausformulierte Klausel.
  const haftung: Baustein = {
    titel: '§ 6 Haftung',
    absaetze: [
      'Alltagsengel haftet nach den gesetzlichen Bestimmungen. Eine hiervon abweichende '
      + 'Haftungsbegrenzung ist derzeit nicht vereinbart.',
    ],
  }

  const datenschutz: Baustein = {
    titel: '§ 7 Datenschutz',
    absaetze: [
      'Die im Rahmen des Vertrages erhobenen personenbezogenen Daten werden ausschließlich '
      + 'zur Durchführung des Vertrages verarbeitet. Es gelten die gesetzlichen '
      + 'Aufbewahrungsfristen.',
      'Der Auftraggeber kann jederzeit Auskunft über die zu seiner Person gespeicherten '
      + 'Daten verlangen sowie deren Berichtigung oder Löschung.',
    ],
  }

  const widerruf: Baustein = {
    titel: '§ 8 Widerrufsrecht',
    absaetze: [
      'Als Verbraucher steht dem Auftraggeber ein gesetzliches Widerrufsrecht zu, wenn '
      + 'der Vertrag außerhalb von Geschäftsräumen oder im Fernabsatz geschlossen wurde.',
      'Die Widerrufsbelehrung nach §§ 355, 356 BGB ist diesem Vertrag als gesonderte '
      + 'Anlage beizufügen.',
    ],
  }

  const schluss: Baustein = {
    titel: '§ 9 Schlussbestimmungen',
    absaetze: [
      'Änderungen und Ergänzungen dieses Vertrages bedürfen der Textform.',
      'Sollte eine Bestimmung unwirksam sein, bleibt die Wirksamkeit der übrigen '
      + 'Bestimmungen unberührt.',
    ],
  }

  return [gegenstand, umfang, verguetung, laufzeit, mitwirkung, haftung, datenschutz, widerruf, schluss]
    .map(b => ({ ...b, absaetze: b.absaetze.filter(a => a.trim() !== '') }))
}

/** Überschrift des Dokuments je Vertragsart. */
export const VORLAGEN_TITEL: Record<VorlagenTyp, string> = {
  dienstleistungsvertrag: 'Dienstleistungsvertrag über Alltagsbegleitung',
  betreuungsvertrag: 'Betreuungsvertrag',
}

/** Gibt es für diese Vertragsart eine Vorlage? */
export function istVorlagenTyp(typ: string | null | undefined): typ is VorlagenTyp {
  return VORLAGEN_TYPEN.includes(typ as VorlagenTyp)
}
