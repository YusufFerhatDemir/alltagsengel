// ═══════════════════════════════════════════════════════════════════════
// Löschkatalog — welche personenbezogene Zeile bei der endgültigen
// Kontolöschung (Art. 17 DSGVO) verschwindet, und welche bleibt.
// ═══════════════════════════════════════════════════════════════════════
//
// WARUM ES DIESE DATEI GIBT (Track 11):
//
// Die bisherige Löschung stand ausschließlich in der Edge Function
// `supabase/functions/account-hard-delete`. Sie löschte neun Tabellen —
// nicht, weil jemand entschieden hätte, dass es genau diese neun sind,
// sondern weil sie beim Schreiben der Funktion (April 2026) gerade
// bekannt waren. Alles, was seither dazukam (Pflegedokumentation,
// Wunddoku, SIS, Akten, Angehörigenportal, PflegeCoach), stand in keiner
// Liste. Gleichzeitig verschickte die Funktion eine Mail mit dem Satz,
// das Konto und *alle* damit verknüpften Daten seien unwiderruflich
// gelöscht. Diese Aussage war für jeden Pflegekunden unzutreffend:
// `clients.user_id` trägt live `ON DELETE SET NULL`, die Kundenakte mit
// Anschrift, Pflegegrad und Diagnosen bleibt also stehen.
//
// UND SIE MUSS TEILWEISE STEHENBLEIBEN. Art. 17 Abs. 3 lit. b DSGVO
// nimmt Daten aus, deren Aufbewahrung eine rechtliche Verpflichtung
// erfüllt. Für dieses Produkt sind das vor allem:
//   * § 630f Abs. 3 BGB — Pflege-/Behandlungsdokumentation, 10 Jahre
//   * § 147 AO / § 257 HGB — Buchungsbelege, 10 bzw. 6 Jahre
//   * Art. 30/32 DSGVO — der Nachweis der Verarbeitung selbst
//
// Der Fehler war also nie „es wird zu wenig gelöscht". Der Fehler war,
// dass NIRGENDS eine Entscheidung stand. Diese Datei ist die
// Entscheidung: eine Zeile je personenbezogener Spalte, mit Grund.
// `fuehreKontoLoeschungAus` (lib/dsgvo/loeschung.ts) führt genau das aus,
// was hier steht — nichts anderes und nichts weniger.
//
// EINE ZEILE HINZUFÜGEN heißt: entscheiden. Ein neues Modul mit einer
// nutzergebundenen Spalte gehört hier hinein, bevor es in Produktion
// geht. `scripts/verify-loeschkette-live.mjs` hält den Katalog gegen das
// Live-Schema — ein Eintrag auf eine Tabelle oder Spalte, die es nicht
// gibt, fällt dort auf.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Was mit den Zeilen dieser Spalte geschieht, wenn das Konto endgültig
 * gelöscht wird.
 *
 * `loeschen`     — die Zeile wird entfernt.
 * `aufbewahren`  — die Zeile bleibt; der Personenbezug fällt weg, weil
 *                  der Fremdschlüssel auf `auth.users` beim Löschen des
 *                  Kontos `ON DELETE SET NULL` ausführt. Fehlt diese
 *                  Regel am Fremdschlüssel, blockiert die Zeile die
 *                  Löschung — genau das meldet der Lauf dann als
 *                  `blockiert`, statt es zu verschweigen.
 */
export type LoeschEntscheidung = 'loeschen' | 'aufbewahren'

export interface LoeschEintrag {
  tabelle: string
  /** Spalte, über die die Zeile an das Konto gebunden ist. */
  spalte: string
  entscheidung: LoeschEntscheidung
  /** Warum. Bei `aufbewahren` die Rechtsgrundlage samt Frist. */
  begruendung: string
  /**
   * Gesetzt, wenn der Fremdschluessel dieser Spalte live auf NO ACTION
   * steht. Dann faellt der Personenbezug beim Loeschen NICHT von selbst
   * weg — eine vorhandene Zeile blockiert das Loeschen des Kontos in
   * `auth.users` mit einem Fremdschluesselfehler (23503).
   *
   * `fuehreKontoLoeschungAus` prueft diese Tabellen ZUERST und bricht ab,
   * BEVOR irgendetwas geloescht ist. Ohne diese Vorpruefung waere der
   * halb geloeschte Zustand der Normalfall: Nachrichten, Profil und
   * Geraete weg, das Konto aber weiter vorhanden — und ueber den
   * Widerrufslink sogar reaktivierbar.
   *
   * Quelle der Wahrheit ist das Live-Schema; `npm run verify:loeschkette`
   * haelt diese Marken dagegen (Pruefung F) und meldet jede Abweichung
   * in BEIDE Richtungen.
   */
  blockiert?: true
}

/**
 * Der Katalog.
 *
 * Reihenfolge der `loeschen`-Einträge ist die Ausführungsreihenfolge:
 * Kinder vor Eltern. `profiles` und `auth.users` stehen bewusst NICHT
 * im Katalog — sie sind der Abschluss des Laufs und werden in
 * `fuehreKontoLoeschungAus` gesondert behandelt.
 */
export const LOESCHKATALOG: readonly LoeschEintrag[] = [
  // ── Wird gelöscht ────────────────────────────────────────────────
  {
    tabelle: 'notifications', spalte: 'user_id', entscheidung: 'loeschen',
    begruendung: 'Zustellungen an das Konto. Kein Aufbewahrungsgrund; die Zustellspur liegt getrennt in notification_delivery_log.',
  },
  {
    tabelle: 'push_subscriptions', spalte: 'user_id', entscheidung: 'loeschen',
    begruendung: 'Gerätebindung für Web-Push. Ohne Konto gegenstandslos.',
  },
  {
    tabelle: 'fcm_tokens', spalte: 'user_id', entscheidung: 'loeschen',
    begruendung: 'Gerätebindung für nativen Push. Ohne Konto gegenstandslos.',
  },
  {
    tabelle: 'messages', spalte: 'sender_id', entscheidung: 'loeschen',
    begruendung: 'Eigene Nachrichten. Keine Aufbewahrungspflicht — es sind keine Handelsbriefe im Sinne des § 257 HGB.',
  },
  {
    tabelle: 'messages', spalte: 'receiver_id', entscheidung: 'loeschen',
    begruendung: 'Wie sender_id — die zweite Seite derselben Bindung.',
  },
  {
    tabelle: 'chat_messages', spalte: 'sender_id', entscheidung: 'loeschen',
    begruendung: 'Beiträge im Chat. Keine Aufbewahrungspflicht.',
  },
  {
    tabelle: 'documents', spalte: 'user_id', entscheidung: 'loeschen',
    begruendung: 'Vom Konto selbst hochgeladene Dateien. Die Akten der Pflege liegen getrennt in akten_dokumente und hängen am Klienten, nicht am Konto.',
  },
  {
    tabelle: 'angel_availability', spalte: 'angel_id', entscheidung: 'loeschen',
    begruendung: 'Hinterlegte Zeitfenster. Reine Planungsdaten ohne Nachweiswert.',
  },
  {
    tabelle: 'angels', spalte: 'id', entscheidung: 'loeschen',
    begruendung: 'Öffentliches Engel-Profil. Muss verschwinden, sonst bleibt die Person auffindbar.',
  },
  {
    tabelle: 'visitor_locations', spalte: 'user_id', entscheidung: 'loeschen',
    begruendung:
      'Track 13 B4: Seitenweise Bewegungsspur des angemeldeten Kontos in den Portalen (portal, page_path, created_at) '
      + 'zusammen mit ip_address und user_agent. Kein Aufbewahrungsgrund — es ist Reichweitenmessung, kein Beleg und keine Pflegedokumentation. '
      + '„aufbewahren" waere hier eine FALSCHE AUSSAGE: der Fremdschluessel steht zwar auf ON DELETE SET NULL, aber SET NULL entfernt nur das ETIKETT. '
      + 'Die volle IP-Adresse bleibt in derselben Zeile stehen und ist nach Art. 4 Nr. 1 DSGVO selbst ein Personenbezug — die Zeile waere danach '
      + 'pseudonymisiert, nicht geloescht. Live am 28.08.2026: 578 von 3850 Zeilen tragen ein user_id, verteilt auf 38 Konten, davon 284 im Portal „kunde".',
  },
  {
    tabelle: 'page_views', spalte: 'user_id', entscheidung: 'loeschen',
    begruendung:
      'Track 13 B4: Seitenaufrufe des angemeldeten Kontos (path, page_label, referrer, viewed_at) zusammen mit '
      + 'ip_address und user_agent. Kein Aufbewahrungsgrund — Reichweitenmessung, kein Beleg. Wie bei '
      + '[[visitor_locations]] waere „aufbewahren" eine falsche Aussage: der Fremdschluessel auf auth.users steht '
      + 'auf ON DELETE SET NULL und entfernt nur das Etikett, waehrend die volle IP-Adresse in derselben Zeile '
      + 'stehen bleibt. Live am 28.08.2026: 1111 von 8315 Zeilen mit user_id, verteilt auf 43 Konten.',
  },
  {
    tabelle: 'care_recipients', spalte: 'profile_id', entscheidung: 'loeschen',
    begruendung: 'Angaben zur betreuten Person, die das Konto selbst erfasst hat. Betrifft einen Dritten und hat ohne das Konto keinen Träger mehr.',
  },
  {
    tabelle: 'angehoerigen_zugaenge', spalte: 'user_id', entscheidung: 'loeschen',
    begruendung: 'Freigaben, über die dieses Konto Gesundheitsdaten Dritter einsehen durfte. Muss mit dem Konto enden.',
  },
  {
    tabelle: 'coach_users', spalte: 'user_id', entscheidung: 'loeschen',
    begruendung: 'PflegeCoach-Konto. Alles Fachliche hängt per ON DELETE CASCADE daran (Migration 20260819010000).',
  },
  {
    tabelle: 'account_deletion_tokens', spalte: 'user_id', entscheidung: 'loeschen',
    begruendung: 'Widerrufs-Token. Nach dem endgültigen Löschen gegenstandslos.',
  },

  // ── Bleibt bewusst stehen ────────────────────────────────────────
  {
    tabelle: 'clients', spalte: 'user_id', entscheidung: 'aufbewahren',
    begruendung: '§ 630f Abs. 3 BGB: Pflegedokumentation ist 10 Jahre aufzubewahren. Der Kontobezug fällt über ON DELETE SET NULL weg.',
  },
  {
    tabelle: 'caregivers', spalte: 'user_id', entscheidung: 'aufbewahren',
    begruendung: '§ 147 AO und Nachweispflichten gegenüber Kostenträgern (Qualifikation, Einsatzzeiten). Kontobezug fällt über ON DELETE SET NULL weg.',
  },
  {
    tabelle: 'bookings', spalte: 'customer_id', entscheidung: 'aufbewahren',
    begruendung: '§ 147 AO: abrechnungsrelevanter Beleg. Die Migration 20260804400000 hat das bereits entschieden (SET NULL, „Buchungsdaten — erhalten bleiben"); die Edge Function löschte sie trotzdem.',
  },
  {
    tabelle: 'bookings', spalte: 'angel_id', entscheidung: 'aufbewahren',
    begruendung: '§ 147 AO wie customer_id — dieselbe Buchung, andere Seite. Die Migration 20260804400000 zog nur customer_id auf SET NULL; angel_id blieb auf NO ACTION und blockierte damit jede Löschung eines Engel-Kontos. Migration 20261016000000 hat das behoben und ist ANGEWENDET: live steht bookings_angel_id_fkey auf ON DELETE SET NULL (am 29.08.2026 aus pg_constraint gelesen), die Spalte ist nullable. Die Marke `blockiert` ist damit weggefallen — sie stand danach noch im Katalog und ließ Prüfung F auflaufen.',
  },
  {
    tabelle: 'krankenfahrten', spalte: 'customer_id', entscheidung: 'aufbewahren',
    begruendung: '§ 147 AO: Fahrten werden abgerechnet. SET NULL ist gesetzt.',
  },
  {
    tabelle: 'reviews', spalte: 'reviewer_id', entscheidung: 'aufbewahren',
    begruendung: 'Art. 17 Abs. 3 lit. e DSGVO: die Bewertung betrifft überwiegend die bewertete Person und deren Rechte; SET NULL entfernt den Verfasserbezug.',
  },
  {
    tabelle: 'referrals', spalte: 'referrer_id', entscheidung: 'aufbewahren',
    begruendung: '§ 147 AO: Empfehlungsprämien sind abrechnungsrelevant. SET NULL ist gesetzt.',
  },
  {
    tabelle: 'referrals', spalte: 'referred_id', entscheidung: 'aufbewahren',
    begruendung: '§ 147 AO wie referrer_id — dieselbe Empfehlung, andere Seite.',
  },
  {
    tabelle: 'audit_logs', spalte: 'actor_id', entscheidung: 'aufbewahren',
    begruendung: 'Art. 30/32 DSGVO: der Nachweis der Verarbeitung selbst. SET NULL ist gesetzt.',
  },
  {
    tabelle: 'mis_audit_log', spalte: 'actor_id', entscheidung: 'aufbewahren',
    begruendung: 'Art. 30/32 DSGVO wie audit_logs — das Betriebsprotokoll. SET NULL ist gesetzt.',
  },
  {
    tabelle: 'mis_auth_log', spalte: 'user_id', entscheidung: 'aufbewahren',
    begruendung: 'Art. 32 DSGVO: An- und Abmeldungen als Sicherheitsnachweis. SET NULL seit Migration 20260804.',
  },
  {
    tabelle: 'angehoerigen_audit_log', spalte: 'user_id', entscheidung: 'aufbewahren', blockiert: true,
    begruendung: 'Wer wann welche Gesundheitsdaten Dritter eingesehen hat — genau die Nachweispflicht aus Art. 30 DSGVO. ACHTUNG: der Fremdschlüssel steht live auf NO ACTION und blockiert die Löschung; siehe lib/dsgvo/loeschung.ts.',
  },
  {
    tabelle: 'signaturen', spalte: 'signatar_id', entscheidung: 'aufbewahren', blockiert: true,
    begruendung: '§ 630f Abs. 3 BGB und § 147 AO: die Unterschrift trägt den Leistungsnachweis und verliert ihren Beweiswert, wenn der Unterzeichner nicht mehr benannt ist. ACHTUNG: Fremdschlüssel live NO ACTION — blockiert die Löschung.',
  },
]

/** Die Einträge, die der Lauf tatsächlich ausführt. */
export function zuLoeschen(): LoeschEintrag[] {
  return LOESCHKATALOG.filter(e => e.entscheidung === 'loeschen')
}

/**
 * Die Einträge, deren Fremdschlüssel die endgültige Löschung blockiert.
 * Vor jedem Lauf zu prüfen — siehe {@link LoeschEintrag.blockiert}.
 */
export function blockierendeEintraege(): LoeschEintrag[] {
  return LOESCHKATALOG.filter(e => e.blockiert === true)
}

/** Die Einträge, die bewusst stehenbleiben — für die Auskunft an die Person. */
export function zuBehalten(): LoeschEintrag[] {
  return LOESCHKATALOG.filter(e => e.entscheidung === 'aufbewahren')
}

/**
 * Klartext für die Bestätigungsmail: was bleibt und warum.
 *
 * Die alte Mail behauptete, es sei alles gelöscht. Eine unzutreffende
 * Auskunft über den Verbleib der eigenen Daten ist selbst ein Verstoß
 * gegen Art. 12 Abs. 1 DSGVO — also steht hier, was wirklich bleibt.
 */
export function verbleibendeBereiche(): string[] {
  const gesehen = new Set<string>()
  const zeilen: string[] = []
  for (const e of zuBehalten()) {
    if (gesehen.has(e.tabelle)) continue
    gesehen.add(e.tabelle)
    zeilen.push(`${e.tabelle}: ${e.begruendung}`)
  }
  return zeilen
}
