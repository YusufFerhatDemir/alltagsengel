// ═══════════════════════════════════════════════════════════════════════
// Mandanten-Eindeutigkeit — global oder je Organisation?
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (Block 46, 14.09.2026)
//
// `invoices` traegt live
//
//     invoices_invoice_number_key  UNIQUE (invoice_number)
//
// — OHNE `organization_id`. Die Nummer kommt aus
// `public.next_billing_number()`, und dieser Zaehler ist ausdruecklich
// JE MANDANT gefuehrt:
//
//     INSERT INTO billing_number_sequences (organization_id, prefix, year, …)
//     ON CONFLICT (organization_id, prefix, year) DO UPDATE …
//     RETURN p_prefix || '-' || p_year || '-' || LPAD(v_next, 5, '0')
//
// Die zurueckgegebene Nummer enthaelt den Mandanten NICHT. Der zweite
// Mandant erzeugt damit als erste Rechnung erneut `RE-2026-00001` — und
// laeuft in eine Unique-Verletzung. Das ist kein Einmalfehler: die RPC
// bricht ab, der Zaehler faellt mit zurueck, der naechste Versuch erzeugt
// dieselbe Nummer. Der zweite Mandant kann NIE eine Rechnung stellen.
//
// Dasselbe Muster traegt `caregivers_initials_key UNIQUE (initials)`: ein
// Handzeichen wie „M.S." gehoert zu einer Person, nicht zum Schema. Der
// zweite Mandant kann keine Pflegekraft anlegen, deren Handzeichen
// irgendwo sonst schon vergeben ist — und erfaehrt als Begruendung den
// Constraint-Namen.
//
// Bewiesen wird das NICHT durch einen Schreibversuch gegen die
// Produktion, sondern aus den Definitionen: ein UNIQUE-Index ueber eine
// Spalte IST globale Eindeutigkeit, der Zaehler ist nachweislich je
// Mandant, und die Nummer traegt keinen Mandantenteil.
//
// ── WAS HIER KEIN BEFUND IST ──────────────────────────────────────────
// Die meisten UNIQUE-Indexe ohne `organization_id` sind harmlos, weil
// ihre fuehrende Spalte ein Fremdschluessel auf eine bereits
// mandantengebundene Zeile ist: `(client_id, year)` kann ueber Mandanten
// hinweg gar nicht kollidieren, weil derselbe `client_id` nur in EINER
// Organisation existiert. Wer diese mitmeldet, erzeugt eine Liste, die
// niemand mehr liest.
//
// Und einige sind ABSICHTLICH global — eine Landesregel gilt fuer alle,
// ein Kfz-Kennzeichen ist es von Natur aus, eine Newsletter-Abmeldung
// soll ueberall wirken. Die stehen namentlich in ABSICHTLICH_GLOBAL,
// jeweils mit Begruendung.
// ═══════════════════════════════════════════════════════════════════════

export interface UniqueIndexZeile {
  tabelle: string
  index: string
  /** Spalten in Schluesselreihenfolge. */
  spalten: string[]
  /**
   * Diejenigen Schluesselspalten, die ein Fremdschluessel auf eine Tabelle
   * MIT `organization_id` sind — aus `pg_constraint` gelesen, nicht
   * geraten. Eine solche Spalte bindet die Zeile bereits an einen
   * Mandanten.
   *
   * Bewusst aus dem Schema und nicht aus einer Namensliste: ein erster
   * Entwurf fuehrte `client_id`, `invoice_id` und ein Dutzend weiterer
   * Namen von Hand und meldete daraufhin `assessment_id`, `visite_id`
   * und `protokoll_id` als Befund — alles Fremdschluessel, alle harmlos.
   * Eine Liste, die man pflegen muss, meldet irgendwann das Falsche.
   */
  gebundenUeber: string[]
  /** Enthaelt der Schluessel die eigene `id` (UUID, kollidiert nie)? */
  eigeneId?: boolean
}

export type Einstufung =
  /** Fuehrende Spalte ist ein Fremdschluessel auf eine mandantengebundene Zeile. */
  | 'ueber_fremdschluessel_gebunden'
  /** Absichtlich global — Begruendung in ABSICHTLICH_GLOBAL. */
  | 'absichtlich_global'
  /** Wartet auf eine Migration, die den Mandanten aufnimmt. */
  | 'migration_wartet'
  /** Neu und unbewertet — der einzige Ausgang, der den Lauf rot faerbt. */
  | 'befund'

export interface Bewertung {
  zeile: UniqueIndexZeile
  einstufung: Einstufung
  begruendung: string
}

/** Absichtlich global — jeweils mit dem Grund, warum das richtig ist. */
export const ABSICHTLICH_GLOBAL: Readonly<Record<string, string>> = {
  'billing_landesregeln.uq_landesregel_global':
    'Eine Landesregel ist Gesetz und gilt fuer jeden Mandanten gleich — der Indexname sagt das selbst.',
  'newsletter_subscribers.newsletter_subscribers_email_key':
    'Eine Abmeldung muss ueberall wirken; eine Adresse zweimal zu fuehren hiesse, sie einmal weiter anzuschreiben.',
  'coach_freischaltcodes.coach_freischaltcodes_code_hash_key':
    'Ein Freischaltcode ist ein Geheimnis. Zweimal derselbe Code waere zweimal derselbe Schluessel.',
  'mis_vehicles.mis_vehicles_plate_key':
    'Ein Kfz-Kennzeichen ist ausserhalb der Anwendung eindeutig vergeben.',
  'email_campaign_logs.email_campaign_logs_provider_id':
    'Die Kennung stammt vom Versanddienst und ist dort global vergeben.',
  'notfall_info.notfall_info_user_id_key':
    'Die Notfallkarte gehoert zum Menschen, nicht zum Mandanten.',
  'location_sharing_settings.location_sharing_settings_user_id_key':
    'Die Standortfreigabe ist eine Entscheidung der Person ueber sich selbst.',
  'krankenfahrt_providers.krankenfahrt_providers_user_id_key':
    'Ein Fahrdienst-Konto gehoert zur Person, nicht zum Mandanten.',
  'angehoerigen_zugaenge.unique_user_client':
    'Der Zugang haengt am Klienten, und der ist bereits mandantengebunden.',
  'fcm_tokens.fcm_tokens_user_id_token_key':
    'Ein Push-Token gehoert zum Geraet der Person.',
  'fcm_tokens.fcm_tokens_user_token_uniq':
    'Inhaltlich dieselbe Aussage wie fcm_tokens_user_id_token_key: das Push-Token '
    + 'gehoert zum Geraet der Person. Beide Indexe stehen live doppelt nebeneinander — '
    + 'kein Mandantenproblem, aber doppelte Schreibkosten.',
  'onboarding_progress.uq_onboarding_progress_user_typ':
    'Ein Bewerbungsablauf gehoert zur Person, bevor es einen Mandanten gibt.',
  'kim_attachments.kim_attachments_path_unique':
    'Ein Speicherpfad ist im Bucket global und traegt den Mandanten im Pfad.',
  'billing_tarif_belege.billing_tarif_belege_dateipfad_key':
    'Ebenso ein Speicherpfad im Bucket: er ist dort global vergeben und traegt '
    + 'den Mandanten bereits im Pfad.',
  'invoices.idx_invoices_idempotency':
    'Der Idempotenzschluessel wird aus Mandant, Klient, Zeitraum und Topf gebildet und traegt den Mandanten damit in sich.',
  'invoices.idx_invoices_idempotency_key_unique':
    'Inhaltlich dieselbe Aussage wie idx_invoices_idempotency — derselbe partielle '
    + 'Index auf denselben Schluessel, live zweimal angelegt. Kein Mandantenproblem, '
    + 'aber doppelte Schreibkosten auf dem Rechnungsweg.',
  'abrechnungslaeufe.idx_abrechnungslaeufe_idempotency':
    'Ebenso ein Idempotenzschluessel: er wird aus den Merkmalen des Laufs gebildet '
    + 'und traegt den Mandanten damit in sich.',
  'dta_fehlercode_katalog.uq_dta_fehlercode_katalog':
    'Der Fehlercode-Katalog der Kassen ist fuer alle derselbe.',
  'wound_photos.wp_dateipfad_unique':
    'Ein Speicherpfad im Bucket ist global und traegt den Mandanten im Pfad.',
  'whatsapp_conversations.whatsapp_conversations_wa_msg_id_key':
    'Die Nachrichtenkennung vergibt Meta, nicht diese Anwendung.',
  'email_entwuerfe.uq_email_entwuerfe_bezug':
    '`bezug_id` ist ein polymorpher Verweis (die Tabelle steht in `bezug_tabelle`), '
    + 'deshalb gibt es keinen Fremdschluessel, den das Schema kennen koennte. Der Wert '
    + 'ist die UUID einer bereits mandantengebundenen Zeile und kollidiert nicht.',
  'notification_delivery_log.uq_notification_delivery_log_erfolg':
    '`correlation_id` ist die UUID eines Vorgangs, nicht ein von Menschen vergebener '
    + 'Wert — zwei Mandanten erzeugen sie nicht beide.',
}

/**
 * Wartet auf eine Migration.
 *
 * Ein Eintrag hier faerbt den Lauf NICHT rot — sonst bliebe er
 * dauerhaft rot, bis Yusuf die Migration eingespielt hat, und ein
 * wirklich neuer Befund ginge darin unter. Verschwindet der Index aus
 * der Live-Antwort, meldet `veraltet()` den Eintrag als erledigt.
 */
export const MIGRATION_WARTET: Readonly<Record<string, string>> = {
  'invoices.invoices_invoice_number_key':
    'Migration 20261205000000: UNIQUE (organization_id, invoice_number). '
    + 'Bis dahin kann der zweite Mandant KEINE Rechnung stellen.',
  'caregivers.caregivers_initials_key':
    'Migration 20261205000000: UNIQUE (organization_id, initials). '
    + 'Bis dahin ist ein Handzeichen fuer alle Mandanten zusammen vergeben.',
  'leistungspreise.leistungspreise_bundesland_leistungsart_gueltig_ab_key':
    'Migration 20261205000000: UNIQUE (organization_id, bundesland, leistungsart, gueltig_ab). '
    + 'Bis dahin kann nur EIN Mandant einen Preis je Land und Leistungsart fuehren.',
  'abrechnungslaeufe.abrechnungslaeufe_abrechnungsmonat_kostentraeger_ik_key':
    'Migration 20261205000000: ersatzlos gestrichen — `idx_lauf_dedup` traegt '
    + 'dieselbe Regel bereits mandantenbezogen und fachlich genauer.',
  'abrechnung_zertifikate.abrechnung_zertifikate_ik_nummer_typ_key':
    'Migration 20261205000000: UNIQUE (organization_id, ik_nummer, typ). '
    + 'Bis dahin kann nur EIN Mandant ein Zertifikat je IK fuehren.',
  'security_watchlist.security_watchlist_user_id_key':
    'Migration 20261205000000: UNIQUE (organization_id, user_id). Ein Konto kann '
    + 'Mitglied mehrerer Organisationen sein; bis dahin kann nur EINE davon es '
    + 'ueberwachen — und die zweite bekaeme als Begruendung den Constraint-Namen.',
  'mis_purchase_orders.mis_purchase_orders_po_number_key':
    'Migration 20261205000000: UNIQUE (organization_id, po_number). Eine '
    + 'Bestellnummer vergibt jedes Haus fuer sich. Tabelle ist live leer.',
  'mis_quality_processes.mis_quality_processes_process_id_key':
    'Migration 20261205000000: UNIQUE (organization_id, process_id). Eine '
    + 'Prozesskennung vergibt jedes Haus fuer sich. Tabelle ist live leer.',
}

export const schluessel = (z: UniqueIndexZeile): string => `${z.tabelle}.${z.index}`

/** Bewertet eine Zeile aus der Live-Abfrage. */
export function bewerte(zeile: UniqueIndexZeile): Bewertung {
  const k = schluessel(zeile)

  if (zeile.eigeneId) {
    return {
      zeile,
      einstufung: 'ueber_fremdschluessel_gebunden',
      begruendung:
        'Der Schluessel enthaelt die eigene `id` — eine UUID kollidiert ueber '
        + 'Mandanten hinweg nicht.',
    }
  }

  const bindend = zeile.gebundenUeber[0]
  if (bindend) {
    return {
      zeile,
      einstufung: 'ueber_fremdschluessel_gebunden',
      begruendung:
        `\`${bindend}\` ist ein Fremdschluessel auf eine Tabelle mit `
        + '`organization_id` — die Zeile haengt damit schon an einem Mandanten, '
        + 'und eine Kollision ueber Mandanten hinweg ist ausgeschlossen.',
    }
  }

  if (k in ABSICHTLICH_GLOBAL) {
    return { zeile, einstufung: 'absichtlich_global', begruendung: ABSICHTLICH_GLOBAL[k] }
  }

  if (k in MIGRATION_WARTET) {
    return { zeile, einstufung: 'migration_wartet', begruendung: MIGRATION_WARTET[k] }
  }

  return {
    zeile,
    einstufung: 'befund',
    begruendung:
      'Der Schluessel traegt weder `organization_id` noch eine Spalte, die die Zeile '
      + 'bereits an einen Mandanten bindet. Zwei Mandanten koennen denselben Wert '
      + 'erzeugen, und der zweite bekommt eine Unique-Verletzung.',
  }
}

export function bewerteAlle(zeilen: readonly UniqueIndexZeile[]): Bewertung[] {
  return zeilen.map(bewerte)
}

/**
 * Eintraege aus MIGRATION_WARTET, die live nicht mehr vorkommen.
 *
 * Eine Warteliste, die niemand leert, wird zur Legende: sie behauptet
 * eine Luecke, die es nicht mehr gibt.
 */
export function veraltet(zeilen: readonly UniqueIndexZeile[]): string[] {
  const live = new Set(zeilen.map(schluessel))
  return Object.keys(MIGRATION_WARTET).filter(k => !live.has(k))
}
