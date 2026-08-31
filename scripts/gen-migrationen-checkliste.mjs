#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 * Erzeugt docs/MIGRATIONEN_APPLY_CHECKLISTE.md
 * ═══════════════════════════════════════════════════════════════════════
 *
 * WARUM GENERIERT UND NICHT VON HAND GESCHRIEBEN
 *
 * Die Checkliste enthaelt den vollstaendigen SQL-Text jeder Migration —
 * damit im SQL-Editor nur noch kopiert werden muss und keine Datei
 * geoeffnet werden braucht. Von Hand gepflegt waere das eine ZWEITE Kopie
 * derselben Anweisungen. Genau diese Konstellation ist hier schon
 * schiefgegangen: `docs/MIGRATION_LEDGER.md` war eine von Hand gefuehrte
 * Liste und stimmte an fuenf Stellen nicht — in BEIDE Richtungen.
 *
 * Deshalb: der SQL-Text kommt aus `supabase/migrations/*.sql`, die
 * Verifikationsabfrage aus `scripts/lib/migrationen-katalog.mjs` (derselbe
 * Katalog, den `npm run check:migrationen` misst). Nur Reihenfolge, Zweck,
 * Abhaengigkeit und Rollback-Risiko stehen hier — das ist die
 * Entscheidung, die diese Datei beitraegt.
 *
 * ── DIE REIHENFOLGE IST NACH RISIKO GEORDNET, NICHT NACH TECHNIK ──────
 *
 * Geprueft: keine der acht Migrationen setzt eine andere der acht voraus.
 * Sie sind technisch unabhaengig und koennten in jeder Reihenfolge laufen.
 * Die hier festgelegte Ordnung folgt deshalb dem Schaden, den ein Abbruch
 * in der Mitte hinterliesse: zuerst die drei Unveraenderlichkeits-Riegel
 * der Pflegeakte (HOCH — solange sie fehlen, ist eine abgesetzte
 * Medikation aenderbar), dann die Lesepolicies, dann der Rest.
 *
 * Aufruf:  npm run gen:migrationen-checkliste
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { KATALOG } from './lib/migrationen-katalog.mjs'

const MIGRATIONEN = 'supabase/migrations'
const ZIEL = 'docs/MIGRATIONEN_APPLY_CHECKLISTE.md'

/**
 * Die Reihenfolge samt Begruendung. Das ist der Teil, den kein Werkzeug
 * ableiten kann — Risiko ist eine fachliche Einschaetzung.
 */
const SCHRITTE = [
  {
    datei: '20261010000000_medikamente_abgesetzt_sperre_db',
    zweck:
      'Sperrt ein Medikament mit status=\'abgesetzt\' auch DATENBANKSEITIG gegen inhaltliche '
      + 'Aenderung. Bisher verweigerte das nur lib/medikamente/medikamente.ts — wer an dem Modul '
      + 'vorbeischreibt (PostgREST, Dienstschluessel, Import), konnte Name, Wirkstoff, Dosierung und '
      + 'Einnahmezeiten eines abgesetzten Medikaments unveraendert durchschreiben.',
    risiko: 'HOCH',
    risikoText:
      'Solange sie fehlt, ist die Medikation eines abgesetzten Praeparats nachtraeglich aenderbar, '
      + 'ohne dass irgendetwas dagegenhaelt. Das ist der sicherheitskritischste der acht Punkte.',
    unveraenderlichkeit: 'MEDIKAMENTE',
    abhaengigkeit: 'Tabelle public.medikamente (20260806…). Keine der anderen sieben.',
    erwartet: 'Funktion prevent_locked_medikament_edit() + Trigger trg_locked_medikament auf medikamente',
    rollbackRisiko:
      'GERING. Der Trigger schreibt nichts und aendert keine Zeile; ein DROP TRIGGER stellt den '
      + 'Zustand von vorher exakt wieder her. Die Migration ist idempotent (CREATE OR REPLACE).',
  },
  {
    datei: '20261010000002_wund_kindtabellen_sperre_db',
    zweck:
      'Verhindert neue Verlaufsdaten (Assessment, Verbandwechsel, Foto) zu einer Wunde, die bereits '
      + 'als \'abgeheilt\' markiert ist — datenbankseitig. Die drei Kindtabellen hatten bisher gar '
      + 'keinen Trigger; die Pruefung lag allein in lib/wunden/*.ts, und der Aufrufer musste den '
      + 'Wundstatus selbst mitgeben.',
    risiko: 'HOCH',
    risikoText:
      'Eine abgeschlossene Wunddokumentation ist nachtraeglich erweiterbar. Bei einer Pflegeakte ist '
      + 'genau das der Punkt, an dem Dokumentation ihren Beweiswert verliert.',
    unveraenderlichkeit: 'WUNDDOKUMENTATION',
    abhaengigkeit:
      'Tabellen wounds, wound_assessments, wound_treatments, wound_photos. Keine der anderen sieben.',
    erwartet:
      'Funktion prevent_wound_child_edit_when_healed() + die drei Trigger trg_locked_wound_assessment, '
      + 'trg_locked_wound_treatment, trg_locked_wound_photo',
    rollbackRisiko:
      'GERING. Reine Trigger, keine Datenaenderung. DROP TRIGGER stellt den Vorzustand her.',
  },
  {
    datei: '20261010000004_pflege_verlauf_backdating_sperre_db',
    zweck:
      'Weist einen neuen Verlaufseintrag ab, dessen Eintragsdatum in eine bereits ABGESCHLOSSENE '
      + 'Dokumentationsperiode faellt. Der bestehende Trigger trg_locked_verlauf blockt nur UPDATEs '
      + 'auf gesperrten Zeilen — das rueckwirkende INSERT eines neuen, unversperrten Eintrags war offen.',
    risiko: 'HOCH',
    risikoText:
      'Rueckdatierung in einen abgeschlossenen Monat. Betrifft unmittelbar die Beweiskraft der '
      + 'Pflegedokumentation gegenueber Kostentraeger und Pruefinstanz.',
    unveraenderlichkeit: 'RUECKDATIERUNGS-SCHUTZ',
    abhaengigkeit:
      'Tabellen pflege_verlauf und pflege_doku_perioden. Keine der anderen sieben.',
    erwartet: 'Funktion prevent_backdated_verlauf_insert() + Trigger trg_verlauf_periode_offen',
    rollbackRisiko:
      'GERING, mit einer Einschraenkung im WIRKUNGSUMFANG (nicht im Rollback): der Trigger laeuft als '
      + 'SECURITY INVOKER, und pflege_doku_perioden ist per RLS nur fuer admin/superadmin lesbar. Fuer '
      + 'einen RLS-gebundenen Engel-Insert liefert die interne Abfrage daher leer und die Pruefung '
      + 'greift nicht. Fuer den Dienstschluessel-Insert — den eigentlichen Befund — greift sie. Das ist '
      + 'in der Migration dokumentiert und kein Fehler des Rollbacks.',
  },
  {
    datei: '20261022000000_rk_lesepolicies_verwaltungsrollen',
    zweck:
      '24 Lesepolicies rk_<tabelle>_lesen, je FOR SELECT TO authenticated mit '
      + 'darf(\'<recht>\') AND organization_id = current_org_id(). Ohne sie liefern 48 Seite/Rolle-Paare '
      + 'den Rollen pdl, qm und buchhaltung null Zeilen — nicht wegen einer Sperre, sondern weil '
      + 'keine Policy dort eine Berechtigung auswertet.',
    risiko: 'MITTEL (Funktion, nicht Sicherheit)',
    risikoText:
      'Kein Sicherheitsrisiko — die Wirkung ist zu STRENG, nicht zu locker. Aber drei Rollen sehen '
      + 'live leere Seiten, wo sie arbeiten sollen. Das ist der groesste Funktionsblocker der acht.',
    abhaengigkeit:
      'rollen_matrix() muss die verwendeten Rechte kennen (bonus.verwalten, sicherheit.lesen, '
      + 'marketing.verwalten — alle drei stehen live) sowie darf() und current_org_id(). '
      + 'Keine der anderen sieben.',
    erwartet: 'die 24 Policies rk_<tabelle>_lesen',
    rollbackRisiko:
      'GERING. Nur Policies, keine Datenaenderung. Ein DROP POLICY nimmt Sicht weg, gibt aber nie '
      + 'welche dazu — ein Rollback kann hier also nichts oeffnen.',
  },
  {
    datei: '20261008000000_vitalwerte_plausibilitaet_db_check',
    zweck:
      'Legt vier Funktionen vitals_plausibel_min/max/_sekundaer an und setzt die CHECKs auf '
      + 'vital_signs typabhaengig neu. Bisher steht dort nur value >= 0 — ein Blutdruck von 4000 oder '
      + 'ein Puls von 0,5 wird von der Datenbank angenommen, sobald ein Schreibweg an '
      + 'validierePlausibilitaet() vorbeikommt.',
    risiko: 'MITTEL',
    risikoText:
      'Datenqualitaet, nicht Sicherheit. Die Plausibilitaetsgrenzen leben sonst nur in TypeScript.',
    abhaengigkeit: '20260818010100_vitalwerte.sql (steht live). Keine der anderen sieben.',
    erwartet: 'die vier Funktionen vitals_plausibel_*',
    rollbackRisiko:
      'GERING, aber die EINZIGE der acht mit einem Bestandsvorbehalt: die CHECKs werden NOT VALID '
      + 'angelegt und danach validiert. Ein Bestandsverstoss bricht die Migration NICHT ab, sondern '
      + 'meldet sich als WARNING — kein stiller Durchlauf, aber auch kein Abbruch. Wenn eine WARNING '
      + 'erscheint, bitte den Text mitschicken: dann stehen unplausible Werte im Bestand, und die '
      + 'sind fachlich zu klaeren.',
  },
  {
    datei: '20261009000000_pflege_massnahmenplaene_ein_aktiver_plan',
    zweck:
      'Eindeutiger Teilindex: je Klient hoechstens EIN Massnahmenplan im Status \'aktiv\'. '
      + 'freigebenPlan() loest den alten und aktiviert den neuen in zwei getrennten UPDATEs ohne '
      + 'Sperrschutz — bei zwei gleichzeitigen Freigaben koennen zwei Plaene aktiv werden. Live steht '
      + 'nur ein GEWOEHNLICHER Teilindex, der nichts erzwingt.',
    risiko: 'MITTEL',
    risikoText:
      'Welcher Plan der gueltige Versorgungsplan ist, wird uneindeutig.',
    abhaengigkeit: 'Tabelle pflege_massnahmenplaene. Keine der anderen sieben.',
    erwartet: 'eindeutiger Index uq_pflege_massnahmenplaene_ein_aktiver_plan',
    vorpruefung: {
      text:
        'DIESE EINE braucht eine Vorpruefung. Legt der Index sich nicht an, gibt es bereits mehrere '
        + 'aktive Plaene je Klient. Die sind fachlich zu klaeren (welcher gilt?) — NICHT blind einen '
        + 'davon umschalten. Vorher ausfuehren; kommt eine Zeile zurueck, hier abbrechen und melden:',
      sql:
        'SELECT organization_id, client_id, count(*)\n'
        + '  FROM public.pflege_massnahmenplaene\n'
        + " WHERE status = 'aktiv'\n"
        + ' GROUP BY organization_id, client_id\n'
        + 'HAVING count(*) > 1;',
    },
    rollbackRisiko:
      'GERING. DROP INDEX. Der Index aendert keine Zeile — er verhindert nur kuenftige Doppelungen.',
  },
  {
    datei: '20261021000004_is_internal_staff_ohne_buero',
    zweck:
      'Entfernt die Rolle \'buero\' aus is_internal_staff(). Der CHECK auf profiles.role laesst den '
      + 'Wert nicht zu, ROLLEN_MATRIX kennt ihn nicht, live traegt ihn kein Konto — der Eintrag ist '
      + 'heute wirkungslos.',
    risiko: 'NIEDRIG heute — HOCH bei der naechsten CHECK-Erweiterung',
    risikoText:
      'Eine gestellte Falle: wer den CHECK eines Tages um eine Bueroverwaltung erweitert, gibt dieser '
      + 'Rolle in DERSELBEN Minute Zugriff auf alles hinter is_internal_staff() — unter anderem die '
      + 'Verordnungen — und zwar ohne einen einzigen Eintrag in ROLLEN_MATRIX. Der Fehler entstuende '
      + 'an einer Stelle und wirkte an einer ganz anderen, Monate spaeter.',
    abhaengigkeit: 'Funktion is_internal_staff(). Keine der anderen sieben.',
    erwartet: "is_internal_staff() nennt 'buero' nicht mehr",
    rollbackRisiko:
      'GERING. CREATE OR REPLACE FUNCTION auf eine Funktion ohne Zustand. Der Rollback setzt den '
      + 'alten Rumpf zurueck — und damit die Falle wieder ein.',
  },
  {
    datei: '20261021000002_secdef_trigger_revoke',
    zweck:
      'Zieht EXECUTE von PUBLIC/anon/authenticated fuer sechs SECURITY-DEFINER-Triggerfunktionen '
      + 'zurueck. Sie sind nicht durch einen Fehler entstanden, sondern durch die Vorgabe von '
      + 'Postgres: jede neue Funktion in public bekommt EXECUTE fuer PUBLIC.',
    risiko: 'NIEDRIG',
    risikoText:
      'Ehrlich: nicht schlimm. Alle sechs geben trigger zurueck und nehmen keine Argumente. PostgREST '
      + 'stellt solche Funktionen gar nicht als RPC bereit, und Postgres verweigert den Direktaufruf '
      + 'ohnehin. Ueber die oeffentliche Schnittstelle war hier nichts aufrufbar. Der Wert liegt in '
      + 'der Tiefenstaffelung — der Schutz haengt sonst allein an einer Eigenschaft von PostgREST, '
      + 'die niemand uns zugesagt hat.',
    abhaengigkeit: 'Die sechs genannten Funktionen muessen existieren. Keine der anderen sieben.',
    erwartet: 'keine SECURITY-DEFINER-Triggerfunktion mehr fuer anon ausfuehrbar (erwartet: 0)',
    rollbackRisiko:
      'GERING. Reine Rechteaenderung, keine Datenaenderung. ACHTUNG: ein REVOKE wirkt nur, wenn er '
      + 'als Eigentuemer laeuft — ueber den Dienstschluessel meldet Supabase HTTP 204 OHNE Wirkung. '
      + 'Genau deshalb muss dieser Schritt im SQL-Editor als postgres laufen.',
  },
]

const katalogEintrag = (datei) => KATALOG.find(k => k.datei === datei)

const zeilen = []
const z = (s = '') => zeilen.push(s)

const heute = new Date().toISOString().slice(0, 10)

z('# Migrationen anwenden — Checkliste für den Supabase-SQL-Editor')
z()
z(`**Erzeugt:** ${heute} · **Generiert von** \`npm run gen:migrationen-checkliste\``)
z('· **Gemessen mit** `npm run check:migrationen`')
z()
z('> Diese Datei wird GENERIERT. Der SQL-Text stammt aus `supabase/migrations/*.sql`,')
z('> die Verifikationsabfrage aus `scripts/lib/migrationen-katalog.mjs`. Nicht von Hand')
z('> ändern — sonst driftet sie von den echten Migrationen ab, und genau das ist mit')
z('> `docs/MIGRATION_LEDGER.md` schon passiert (an fünf Stellen, in beide Richtungen).')
z()
z('---')
z()
z('## Vorab — drei Dinge, die den Ablauf bestimmen')
z()
z('**1. Es muss der SQL-Editor sein, angemeldet als `postgres`.**')
z('Über den Dienstschlüssel scheitert jedes DDL am Eigentümer (`42501`,')
z('`must be owner of table …`). Bei Schritt 8 ist das besonders tückisch: ein `REVOKE`')
z('ohne Eigentümerrecht meldet **HTTP 204, also Erfolg — ohne jede Wirkung**.')
z()
z('**2. Die Reihenfolge ist nach RISIKO geordnet, nicht nach Technik.**')
z('Geprüft: keine der acht Migrationen setzt eine andere der acht voraus. Sie sind')
z('technisch unabhängig. Die Ordnung folgt dem Schaden, den ein Abbruch in der Mitte')
z('hinterließe — zuerst die drei Unveränderlichkeits-Riegel der Pflegeakte.')
z()
z('**3. Jeder Block ist in `BEGIN; … COMMIT;` geklammert.**')
z('Nur `20261008000000` bringt eine eigene Transaktion mit; die anderen sieben nicht.')
z('Ohne Klammer wäre ein Abbruch in der Mitte ein halb angewendeter Schritt. Kein')
z('`CREATE INDEX CONCURRENTLY` in den acht Dateien — die Klammer ist also überall')
z('zulässig (geprüft).')
z()
z('---')
z()
z('## Übersicht')
z()
z('| # | Migration | Risiko, solange sie fehlt | Was sie hinterlässt |')
z('|---|---|---|---|')
for (const [i, s] of SCHRITTE.entries()) {
  const marke = s.unveraenderlichkeit ? ` **[${s.unveraenderlichkeit}]**` : ''
  z(`| ${i + 1} | \`${s.datei}\`${marke} | ${s.risiko} | ${s.erwartet} |`)
}
z()
z('Drei davon sind die Unveränderlichkeits- und Rückdatierungs-Riegel der Pflegeakte')
z('und stehen deshalb ganz vorn: **Medikamente** (Schritt 1), **Wunddokumentation**')
z('(Schritt 2), **Rückdatierungs-Schutz** (Schritt 3).')
z()
z('### Bestandslage — gemessen 2026-08-31, live')
z()
z('| Tabelle | Zeilen live | Betrifft |')
z('|---|---|---|')
z('| `medikamente` | **0** (davon 0 abgesetzt) | Schritt 1 |')
z('| `wounds` | **0** (davon 0 abgeheilt) | Schritt 2 |')
z('| `vital_signs` | **0** | Schritt 5 |')
z('| `pflege_massnahmenplaene`, Klienten mit >1 aktivem Plan | **0** | Schritt 6 (Vorprüfung) |')
z()
z('Das ändert die Dringlichkeit nicht, aber es ändert das Anwendungsrisiko, und beides')
z('gehört gesagt. **Kein bestehender Datensatz ist heute betroffen** — die drei')
z('HOCH-Risiken sind vorausschauend, nicht akut: es gibt derzeit keine abgesetzte')
z('Medikation und keine abgeheilte Wunde, die jemand nachträglich ändern könnte.')
z()
z('Umgekehrt heißt das: **jetzt ist der günstigste Zeitpunkt.** Alle vier Schritte')
z('laufen gegen leere Tabellen — kein Bestandsverstoß, kein Backfill, keine fachliche')
z('Klärung. Die Vorprüfung in Schritt 6 ist bereits gefahren und liefert 0 Zeilen.')
z('Sobald der erste echte Pflegefall dokumentiert ist, ist beides nicht mehr wahr.')
z()
z('---')
z()

for (const [i, s] of SCHRITTE.entries()) {
  const nr = i + 1
  const k = katalogEintrag(s.datei)
  const sql = readFileSync(`${MIGRATIONEN}/${s.datei}.sql`, 'utf8').trimEnd()
  const hatEigeneTx = /^BEGIN;/m.test(sql)
  const rollbackDatei = s.datei.replace(/^(\d+)_/, (_m, p) => {
    const n = String(Number(p) + 1).padStart(p.length, '0')
    return `${n}_rollback_`
  })

  z(`## Schritt ${nr} · \`${s.datei}\``)
  z()
  if (s.unveraenderlichkeit) {
    z(`> **${s.unveraenderlichkeit}** — einer der drei Riegel, die die Pflegeakte`)
    z('> unveränderlich machen.')
    z()
  }
  z(`**Zweck.** ${s.zweck}`)
  z()
  z(`**Risiko, solange sie fehlt: ${s.risiko}.** ${s.risikoText}`)
  z()
  z(`**Abhängigkeit.** ${s.abhaengigkeit}`)
  z()
  z(`**Erwartet danach.** ${s.erwartet}`)
  z()
  z(`**Rollback-Risiko.** ${s.rollbackRisiko}`)
  z()
  z(`Rollback-Datei: \`${MIGRATIONEN}/${rollbackDatei}.sql\``)
  z()

  if (s.vorpruefung) {
    z(`### ${nr}a · Vorprüfung — ZUERST ausführen`)
    z()
    z(s.vorpruefung.text)
    z()
    z('```sql')
    z(s.vorpruefung.sql)
    z('```')
    z()
    z(`### ${nr}b · Anwenden`)
    z()
  } else {
    z(`### ${nr}a · Anwenden`)
    z()
  }

  z('```sql')
  if (hatEigeneTx) {
    z('-- Diese Datei bringt BEGIN/COMMIT selbst mit — nicht zusätzlich klammern.')
    z(sql)
  } else {
    z('BEGIN;')
    z()
    z(sql)
    z()
    z('COMMIT;')
  }
  z('```')
  z()
  z(`### ${nr}${s.vorpruefung ? 'c' : 'b'} · Verifikation — beweist, dass es live steht`)
  z()
  if (k) {
    z(`Erwartet: **${k.soll}**${k.mindestens ? ' oder mehr' : ' genau'} — geprüft wird `)
    z(`${k.was}.`)
    z()
    z('```sql')
    z(k.sql.trim() + (k.sql.trim().endsWith(';') ? '' : ';'))
    z('```')
  } else {
    z('_Kein Katalogeintrag gefunden — bitte melden, das ist ein Fehler des Generators._')
  }
  z()
  z('---')
  z()
}

z('## Zum Schluss')
z()
z('Nach dem letzten Schritt beweist **ein** Lauf, dass alle acht stehen:')
z()
z('```')
z('npm run check:migrationen     → erwartet: 32 von 32 live, kein ❌')
z('npm run verify:rls-matrix     → erwartet: 0 harte Befunde UND 0 mittlere')
z('```')
z()
z('Der zweite Lauf ist die eigentliche Gegenprobe für Schritt 4: vor dem Anwenden')
z('meldet er **13 mittlere Befunde** (drei Verwaltungsrollen sehen `bookings`,')
z('`einsatz_absagen`, `kostentraeger_kontakte`, `state_settings` und `verordnungen`')
z('nicht). Bleiben die nach dem Anwenden stehen, ist die Migration zwar durchgelaufen,')
z('greift aber nicht — und das wäre ein neuer Befund.')
z()
z('Beide Läufe kann ein Agent ausführen; dafür ist kein Terminal nötig.')

writeFileSync(ZIEL, zeilen.join('\n') + '\n')
console.log(`${ZIEL} geschrieben — ${SCHRITTE.length} Schritte, ${zeilen.length} Zeilen.`)

const ohneKatalog = SCHRITTE.filter(s => !katalogEintrag(s.datei))
if (ohneKatalog.length) {
  console.error(`WARNUNG: ohne Katalogeintrag: ${ohneKatalog.map(s => s.datei).join(', ')}`)
  process.exit(1)
}
