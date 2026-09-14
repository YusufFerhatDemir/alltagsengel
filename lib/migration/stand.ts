// ═══════════════════════════════════════════════════════════════════════
// Wartende Migrationen — was sie bewirken sollen, und ob sie es tun
// ═══════════════════════════════════════════════════════════════════════
//
// WARUM ES DIESE DATEI GIBT (Block 47, 14.09.2026)
//
// Sechs Migrationen liegen im Repo und sind NICHT angewendet. DDL ist aus
// der Anwendung heraus nicht moeglich (42501), sie gehen deshalb durch
// den SQL-Editor. Bis hierher gab es keine Moeglichkeit zu MESSEN, ob das
// geschehen ist:
//
//   * `supabase_migrations.schema_migrations` liegt in einem Schema, das
//     PostgREST nicht ausliefert — das Verzeichnis der Datenbank ist von
//     aussen nicht lesbar.
//   * Ein Apply ueber den Dienstschluessel meldet HTTP 204 auch dann,
//     wenn es nichts bewirkt hat (Rechte fuer GRANT/REVOKE fehlen dem
//     service_role). „Kein Fehler" ist hier kein Beleg.
//   * Zweimal hat sich in diesem Projekt herausgestellt, dass eine als
//     „offen" gefuehrte Migration laengst live war — und einmal das
//     Gegenteil.
//
// Deshalb fragt diese Datei nicht nach dem Eintrag im Verzeichnis,
// sondern nach der WIRKUNG: existiert die Policy, steht der Constraint,
// laesst der CHECK den neuen Wert zu. Das ist die Frage, auf die es
// ankommt — ein Verzeichniseintrag ohne Wirkung waere die schlechtere
// Auskunft.
//
// TEILWEISE IST EIN EIGENER ZUSTAND
// Eine Migration mit acht Anweisungen kann zur Haelfte durchgelaufen
// sein. „Angewendet" und „offen" sind dafuer beide falsch, und gerade
// dieser Fall ist der gefaehrliche: er sieht im SQL-Editor aus wie
// Erfolg. Deshalb gibt es ihn hier als dritte Antwort.
//
// RESTRICTIVE WIRD MITGEPRUEFT
// Permissive Policies sind ODER-verknuepft. Ein permissiver Mandantenzaun
// neben `is_admin()` bewirkt deshalb NICHTS. Wer nur nach dem Namen
// fragt, bekaeme fuer einen wirkungslosen Zaun ein Haekchen.
// ═══════════════════════════════════════════════════════════════════════

export type WirkungsArt = 'policy' | 'constraint'

export interface Wirkung {
  art: WirkungsArt
  tabelle: string
  /** Name der Policy bzw. des Constraints. */
  name: string
  /** Nur fuer Policies: muss sie RESTRICTIVE sein? */
  restriktiv?: boolean
  /** Nur fuer Constraints: Zeichenkette, die in der Definition stehen muss. */
  enthaelt?: string
  /** Was diese eine Anweisung bewirkt — in einem Satz. */
  zweck: string
}

export interface WartendeMigration {
  datei: string
  ruecknahme: string
  titel: string
  /** Was heute NICHT geht, solange sie fehlt. */
  ohneSie: string
  /** Die einzelnen messbaren Wirkungen. */
  wirkungen: Wirkung[]
  /** Prueflauf, der nach dem Einspielen die Wirkung bestaetigt. */
  pruefung?: string
}

const ZAUN = (tabelle: string): Wirkung => ({
  art: 'policy',
  tabelle,
  name: `${tabelle}_org_fence`,
  restriktiv: true,
  zweck: `Mandantenzaun auf \`${tabelle}\` — RESTRICTIVE, sonst wirkungslos neben is_admin().`,
})

/**
 * Reihenfolge = Anwendungsreihenfolge.
 *
 * Sie ist nach Nummern sortiert und enthaelt keine Abhaengigkeiten
 * untereinander — jede laesst sich einzeln einspielen und einzeln
 * zuruecknehmen. Das ist Absicht: eine Kette, die nur ganz oder gar nicht
 * geht, ist im SQL-Editor schwerer zu handhaben.
 */
export const WARTENDE_MIGRATIONEN: readonly WartendeMigration[] = [
  {
    datei: '20261105000000_audit_action_lead_follow_up.sql',
    ruecknahme: '20261105000001_rollback_audit_action_lead_follow_up.sql',
    titel: 'Audit-Luecke: `lead_follow_up_lauf` fehlt im CHECK',
    ohneSie:
      '`mis_audit_log.action` hat einen CHECK. Ein unbekannter Wert laesst den '
      + 'Insert lautlos scheitern — die Nachfass-Laeufe des Lead-Funnels stehen '
      + 'dann in keinem Protokoll. `logAuditEventOrWarn` meldet bis dahin eine '
      + '„AUDIT-LUECKE" ins Log: sichtbar, aber eben nur im Log.',
    wirkungen: [{
      art: 'constraint',
      tabelle: 'mis_audit_log',
      name: 'mis_audit_log_action_check',
      enthaelt: 'lead_follow_up_lauf',
      zweck: 'Der CHECK laesst den Wert `lead_follow_up_lauf` zu.',
    }],
  },
  {
    datei: '20261115000000_org_fence_drei_blinde_tabellen.sql',
    ruecknahme: '20261115000001_rollback_org_fence_drei_blinde_tabellen.sql',
    titel: 'Mandantenzaun fuer drei org-blinde Tabellen',
    ohneSie:
      'Die drei Tabellen tragen `organization_id`, nennen sie aber in keiner '
      + 'Policy. Ihre Admin-Policy ist damit mandantenblind: eine Verwaltung '
      + 'saehe die E-Mail-Entwuerfe, den Content-Stand und die '
      + 'Sicherheits-Ueberwachung eines FREMDEN Mandanten.',
    wirkungen: [
      ZAUN('email_entwuerfe'),
      ZAUN('marketing_content_status'),
      ZAUN('security_watchlist'),
    ],
    pruefung: 'npm run verify:mandantenzaun',
  },
  {
    datei: '20261120000000_kunde_pflege_massnahmen_select.sql',
    ruecknahme: '20261120000001_rollback_kunde_pflege_massnahmen_select.sql',
    titel: 'Kundenbindung fuer `pflege_massnahmen`',
    ohneSie:
      '/kunde/pflegedoku zeigt den Massnahmenplan HEUTE ohne Inhalt. Als '
      + 'einzige der drei Pflegedoku-Tabellen hat sie keine Kundenbindung, und '
      + 'PostgREST beantwortet eine RLS-Verweigerung mit `200 []` statt mit '
      + 'einem Fehler — die Kundin sieht eine leere Seite, keine Meldung.',
    wirkungen: [{
      art: 'policy',
      tabelle: 'pflege_massnahmen',
      name: 'kunde_pflege_massnahmen_select',
      zweck: 'Die Kundin darf die Massnahmen ihres eigenen Klienten lesen.',
    }],
    pruefung: 'npm run verify:portal-bindung',
  },
  {
    datei: '20261125000000_engel_caregivers_select_own.sql',
    ruecknahme: '20261125000001_rollback_engel_caregivers_select_own.sql',
    titel: 'Die Pflegekraft darf ihren eigenen Datensatz lesen',
    ohneSie:
      'Keine der fuenf Policies auf `caregivers` bindet die Pflegekraft an '
      + 'ihre eigene Zeile, und die Rolle `engel` traegt keine Berechtigung. '
      + 'Das `.single()` in /engel/medikamente, /engel/pflegedoku/verlauf und '
      + '/engel/einsaetze findet deshalb HEUTE nie eine Zeile.',
    wirkungen: [{
      art: 'policy',
      tabelle: 'caregivers',
      name: 'engel_caregivers_select_own',
      zweck: 'Die Pflegekraft liest ihren eigenen Datensatz (`user_id = auth.uid()`).',
    }],
    pruefung: 'npm run verify:portal-bindung',
  },
  {
    datei: '20261130000000_service_records_dauer_pflicht.sql',
    ruecknahme: '20261130000001_rollback_service_records_dauer_pflicht.sql',
    titel: 'Ohne Einsatzdauer nicht abrechenbar',
    ohneSie:
      '`duration_minutes` ist GENERATED und bleibt NULL, wenn die Zeiten '
      + 'fehlen — genau so legt /admin/leistungsnachweis-upload Nachweise an. '
      + '`create_invoice_draft_atomic` rechnet dann mit '
      + '`COALESCE(duration_minutes, 60)` eine volle Stunde, die niemand '
      + 'erfasst hat. Der Anwendungscode ist bis dahin der einzige Riegel.',
    wirkungen: [{
      art: 'constraint',
      tabelle: 'service_records',
      name: 'service_records_dauer_vor_abrechnung',
      zweck: 'Kein `complete`/`signed`/`invoiced` ohne Dauer; Entwuerfe bleiben erlaubt.',
    }],
  },
  {
    datei: '20261205000000_mandanten_eindeutigkeit.sql',
    ruecknahme: '20261205000001_rollback_mandanten_eindeutigkeit.sql',
    titel: 'Eindeutigkeit je Mandant statt global',
    ohneSie:
      'Die Rechnungsnummer ist global eindeutig, der Zaehler laeuft je '
      + 'Mandant. Der ZWEITE Mandant erzeugt erneut `RE-2026-00001`, laeuft in '
      + 'eine Unique-Verletzung, der Zaehler faellt mit der Transaktion '
      + 'zurueck — er koennte NIE eine Rechnung stellen. Dasselbe beim '
      + 'Handzeichen der Pflegekraft.',
    wirkungen: [
      { art: 'constraint', tabelle: 'invoices', name: 'invoices_invoice_number_org_key',
        zweck: 'Rechnungsnummer je Mandant eindeutig.' },
      { art: 'constraint', tabelle: 'caregivers', name: 'caregivers_initials_org_key',
        zweck: 'Handzeichen je Mandant eindeutig.' },
      { art: 'constraint', tabelle: 'leistungspreise',
        name: 'leistungspreise_org_bundesland_leistungsart_gueltig_ab_key',
        zweck: 'Leistungspreis je Mandant, Land und Leistungsart.' },
      { art: 'constraint', tabelle: 'abrechnung_zertifikate',
        name: 'abrechnung_zertifikate_org_ik_typ_key',
        zweck: 'Abrechnungs-Zertifikat je Mandant und IK.' },
      { art: 'constraint', tabelle: 'security_watchlist', name: 'security_watchlist_org_user_key',
        zweck: 'Ein Konto kann in mehreren Organisationen ueberwacht werden.' },
      { art: 'constraint', tabelle: 'mis_purchase_orders',
        name: 'mis_purchase_orders_org_po_number_key',
        zweck: 'Bestellnummer je Mandant.' },
      { art: 'constraint', tabelle: 'mis_quality_processes',
        name: 'mis_quality_processes_org_process_id_key',
        zweck: 'Prozesskennung je Mandant.' },
    ],
    pruefung: 'npm run verify:mandanten-eindeutigkeit',
  },
]

// ---------------------------------------------------------------------------
// Bewertung
// ---------------------------------------------------------------------------

export type MigrationsStand = 'angewendet' | 'teilweise' | 'offen'

export interface LiveWirkung {
  art: WirkungsArt
  tabelle: string
  name: string
  /** Policies: ist sie RESTRICTIVE? Constraints: die Definition. */
  restriktiv?: boolean
  definition?: string
}

export const wirkungsSchluessel = (w: { art: WirkungsArt; tabelle: string; name: string }): string =>
  `${w.art}:${w.tabelle}.${w.name}`

/**
 * Ist diese eine Wirkung live vorhanden UND wirksam?
 *
 * „Vorhanden" allein genuegt nicht: ein permissiver Zaun traegt denselben
 * Namen und bewirkt nichts, und ein CHECK kann stehen, ohne den neuen
 * Wert zuzulassen.
 */
export function wirkungVorhanden(
  erwartet: Wirkung,
  live: ReadonlyMap<string, LiveWirkung>,
): boolean {
  const l = live.get(wirkungsSchluessel(erwartet))
  if (!l) return false
  if (erwartet.restriktiv && l.restriktiv !== true) return false
  if (erwartet.enthaelt && !(l.definition ?? '').includes(erwartet.enthaelt)) return false
  return true
}

export function standVon(
  migration: WartendeMigration,
  live: ReadonlyMap<string, LiveWirkung>,
): MigrationsStand {
  const da = migration.wirkungen.filter(w => wirkungVorhanden(w, live)).length
  if (da === 0) return 'offen'
  return da === migration.wirkungen.length ? 'angewendet' : 'teilweise'
}

export function fehlendeWirkungen(
  migration: WartendeMigration,
  live: ReadonlyMap<string, LiveWirkung>,
): Wirkung[] {
  return migration.wirkungen.filter(w => !wirkungVorhanden(w, live))
}

// ---------------------------------------------------------------------------
// Dispatch-Text
// ---------------------------------------------------------------------------

/**
 * Die Anwendungsanweisung fuer den SQL-Editor — aus DEMSELBEN Katalog
 * erzeugt, gegen den anschliessend geprueft wird.
 *
 * Getrennt gepflegt waeren es zwei Wahrheiten, und die zweite waere nach
 * der ersten Aenderung falsch. Ein Test haelt die eingecheckte Datei
 * gegen diese Funktion.
 */
export function dispatchText(): string {
  const z: string[] = []
  z.push('# Dispatch: sechs wartende Migrationen')
  z.push('')
  z.push('> **Erzeugt aus `lib/migration/stand.ts`.** Nicht von Hand ändern —')
  z.push('> `npm run migrations:dispatch` schreibt die Datei neu, ein Test hält sie dagegen.')
  z.push('')
  z.push('DDL ist aus der Anwendung heraus nicht möglich (42501). Diese sechs')
  z.push('Migrationen gehen deshalb durch den Supabase-SQL-Editor.')
  z.push('')
  z.push('**Nach jedem Schritt messen:** `npm run verify:migrationsstand`.')
  z.push('Der Lauf fragt nicht das Migrations-Verzeichnis, sondern die *Wirkung* —')
  z.push('ein Apply ohne Rechte meldet HTTP 204 und bewirkt nichts.')
  z.push('')
  z.push('Die sechs sind **voneinander unabhängig**. Jede lässt sich einzeln')
  z.push('einspielen und einzeln zurücknehmen; die Reihenfolge unten ist die')
  z.push('nach Nummern, keine Abhängigkeitskette.')
  z.push('')

  WARTENDE_MIGRATIONEN.forEach((m, i) => {
    z.push(`## ${i + 1}. ${m.titel}`)
    z.push('')
    z.push(`**Datei:** \`supabase/migrations/${m.datei}\``)
    z.push(`**Rücknahme:** \`supabase/migrations/${m.ruecknahme}\``)
    z.push('')
    z.push('**Ohne sie:**')
    z.push('')
    z.push(m.ohneSie)
    z.push('')
    z.push(`**Messbare Wirkung (${m.wirkungen.length}):**`)
    z.push('')
    for (const w of m.wirkungen) {
      const art = w.art === 'policy'
        ? `Policy \`${w.name}\` auf \`${w.tabelle}\`${w.restriktiv ? ' (RESTRICTIVE)' : ''}`
        : `Constraint \`${w.name}\` auf \`${w.tabelle}\``
      z.push(`- ${art} — ${w.zweck}`)
    }
    z.push('')
    if (m.pruefung) {
      z.push(`**Zusätzlich danach:** \`${m.pruefung}\``)
      z.push('')
    }
  })

  z.push('## Wenn etwas schiefgeht')
  z.push('')
  z.push('`npm run verify:migrationsstand` unterscheidet drei Antworten:')
  z.push('')
  z.push('- **angewendet** — jede Wirkung ist da.')
  z.push('- **offen** — keine.')
  z.push('- **teilweise** — ein Teil der Anweisungen ist durchgelaufen. Das ist der')
  z.push('  gefährliche Fall: im SQL-Editor sieht er aus wie Erfolg. Der Lauf nennt')
  z.push('  dann namentlich, welche Wirkung fehlt.')
  z.push('')
  z.push('Eine Rücknahme kann **scheitern**, sobald Daten entstanden sind, die der')
  z.push('alte, engere Zustand nicht zulässt — bei `20261205000000` etwa, sobald ein')
  z.push('zweiter Mandant eine Rechnung gestellt hat. Das ist kein Fehler der Datei,')
  z.push('sondern der Beleg, dass die Migration gebraucht wurde.')
  z.push('')
  return z.join('\n')
}
