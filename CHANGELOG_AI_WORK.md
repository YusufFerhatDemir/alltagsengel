# CHANGELOG: AI Work Sessions

Chronologische Dokumentation aller KI-gestuetzten Arbeitssitzungen.

---

## 2026-08-23 | Session: Master-Track 8 — P6-Signup abgeschaltet, RESEND geprueft, zweiter P2-Durchgang

Damit sind **alle 8 Master-Tracks abgeschlossen.** Die beiden zuletzt offenen
Punkte waren CEO-Aktionen im Browser — beide sind erledigt bzw. so weit
geprueft, wie das Dashboard es hergibt. Dazu ein zweiter Durchgang durch die
Lueckenanalyse: zwei P2-Befunde geschlossen, drei als laengst erledigt
korrigiert.

### 1. P6-Legacy `vlrviyrgggzhayepfmop`: Signup DEAKTIVIERT

Der einzige verbliebene Hebel aus dem P6-Security-Check ist zu. Im
Supabase-Dashboard des Legacy-Projekts wurde „Allow new users to sign up"
auf OFF gestellt und gespeichert.

- Vorher: `disable_signup=false` + `mailer_autoconfirm=true` — jeder konnte auf
  dem unbeobachteten Projekt ein **sofort aktives** Konto anlegen.
- Nachher: kein Selbstregistrierungsweg mehr; `mailer_autoconfirm` ist ohne
  Signup wirkungslos.
- P6 ist damit ein reiner `DECOMMISSION_CANDIDATE`. Die eigentliche Abschaltung
  steht weiter aus — sie ist ab jetzt Aufraeumen, kein Sicherheitspunkt.
- **Grenze:** verifiziert ist die Dashboard-Einstellung, **nicht** ein
  fehlgeschlagener Registrierungsversuch gegen die Auth-API. Ein solcher
  Gegentest wurde nicht gefahren.

### 2. `RESEND_API_KEY` auf Vercel: vorhanden, Gueltigkeit ungeprueft

Die Variable **existiert** in Vercel Production (angelegt 19.03.2026). Sie
traegt dort allerdings das Kennzeichen „Needs Attention", und das Dashboard
zeigt den Wert naturgemaess nicht an.

- **Was das heisst:** die frueheren Formulierungen „Key fehlt" waren falsch —
  gesetzt ist er. Ob er *gueltig* ist, ist damit aber nicht belegt.
- **Was es nicht heisst:** dass Rechnungen jetzt zugestellt werden. Belegt ist
  Zustellung erst, wenn ein Versand mit gesetztem `sent_at` in
  `invoice_email_log` steht. Bis dahin gilt: Kette gebaut, nicht zustellend.
- **Naechster Schritt** (kein Code): einen realen Rechnungsversand ausloesen
  und den Eintrag in `invoice_email_log` lesen. Bleibt er auf `uebersprungen`
  oder meldet er einen Fehler, ist der Schluessel unbrauchbar.

### 3. Bereich 3 (P2): Konfliktanzeige in der Einsatzplanung

Befund: „Kalender und Schedule enthalten keinerlei Konflikt-/
Ueberschneidungslogik; ein Konflikt aeussert sich erst als Datenbankfehler beim
Speichern."

Der DB-Trigger `check_assignment_overlap` (Migration 20260808200000) fing die
Doppelbelegung einer Betreuungskraft bereits ab — aber erst beim INSERT und mit
einer Meldung voller UUIDs, die der Fehler-Sanitizer zu Recht verschluckt. Der
Planende sah nur „Fehler beim Speichern".

- **Neu:** `lib/einsatzplanung/konflikte.ts` — reine Pruefregel, bewusst frei
  von Server-Importen, damit **dieselbe** Funktion serverseitig blockt und
  clientseitig markiert. Zwei Implementierungen derselben Regel waeren genau
  die Drift, die Trigger und Oberflaeche auseinanderlaufen laesst.
- **Semantik deckungsgleich zum Trigger:** gleiches Datum, echte
  Zeitueberlappung (Beruehrung an den Raendern zaehlt nicht), Status
  `STORNIERT`/`cancelled`/`NO_SHOW` zaehlen nicht mit. `HH:MM` und `HH:MM:SS`
  werden ueber Minuten verglichen — ein String-Vergleich laege bei
  `'10:00'` gegen `'10:00:00'` falsch.
- **`POST`/`PATCH /api/einsatzplanung`** melden jetzt 409 mit Klartext
  („… hat am 01.09.2026 bereits einen Einsatz von 10:00–12:00 bei …").
- **Bewusst KEIN `force_override`** fuer die Mitarbeiter-Doppelbelegung: der
  Trigger blockiert sie ohnehin. Ein angebotener Uebersteuerungsweg waere eine
  Zusage, die die Datenbank nicht einhaelt.
- **Zusaetzlich erkannt, aber nur Warnung:** zwei Kraefte gleichzeitig bei
  demselben Klienten. Den Fall kennt der Trigger nicht, und er ist fachlich
  nicht immer falsch (Doppelbesetzung beim Transfer).
- **Kalender** (`/admin/kalender`): betroffene Einsaetze bekommen einen
  Rahmen und eine Textmarke „Konflikt" plus eine Kennzahl „Zeitkonflikte".
  Bewusst **kein neues Emoji** — das Warnzeichen bleibt eindeutig dem Ausfall
  vorbehalten.
- **Serien bleiben ungeprueft:** ohne `assignment_date` gibt es kein Datum, das
  sich pruefen liesse. Steht so in der Antwort, statt stillschweigend zu
  fehlen.
- Tests: `__tests__/einsatzplanung/konflikte.test.ts` (24).

### 4. Bereich 14 (P2, zwei Befunde): Audit-Gesamtsicht + Export

Befunde: „Vier getrennte Audit-Spuren ohne gemeinsame Sicht" und „Kein Export
der Audit-Spur fuer eine Pruefung."

- `/admin/ops-audit` fuehrte bisher nur **zwei** der vier Spuren zusammen
  (`ops_aktivitaetslog`, `billing_audit_trail`). Ergaenzt sind
  **`mis_audit_log`** (Administration, 436 Aufrufstellen) und
  **`wf_audit_log`** (Workflow) — inklusive Filter und Label in der
  Oberflaeche.
- **Jede Quelle wird einzeln auf `organization_id` gefenced**, mit
  Regressionstest auf die Anzahl der Fences. Ohne das waere die gemeinsame
  Sicht ein Mandantenleck.
- Zeilen ohne `organization_id` (Altbestand in `mis_audit_log` vor Migration
  20260822010000) fallen heraus. Gewollt: ein mandantenloser Eintrag gehoert in
  keine Mandantensicht.
- **CSV-Export** ueber `?format=csv`: Semikolon-getrennt mit BOM (sonst zerlegt
  deutsches Excel die Umlaute und schiebt alles in eine Spalte), mit
  Entschaerfung von `=`, `+`, `-`, `@` am Zellenanfang gegen CSV-Injection —
  Audit-Details stammen teils aus Freitext, das ist ein echter Pfad.
- Der Export **protokolliert sich selbst** (`data_export`). Sonst waere er die
  einzige Aktion im System, die keine Spur hinterlaesst — ausgerechnet die,
  die Daten heraustraegt.
- **Grenze:** je Quelle werden 500 Zeilen geholt, dann gefiltert. Beim
  aktuellen Live-Bestand (9 + 6 + 78) irrelevant; bei wachsendem Bestand ist
  der Export **kein** vollstaendiger Jahresauszug.
- Die **Aufbewahrungsfrist wurde nicht neu erfunden** — sie steht seit
  `5e8ff5a` im Loeschkonzept (10 Jahre, § 257 HGB / DSGVO Art. 30) und wird in
  der Oberflaeche nur zitiert.
- Tests: `__tests__/analytics/audit-gesamtsicht.test.ts` (22).

### 5. Korrigiert — der Bericht war veraltet, angefasst wurde nichts

| Befund | Tatsaechlicher Stand |
|---|---|
| Kundenstammdaten nach Anlage nur teilweise editierbar (Bereich 1, **P1**) | bereits `8392730`: `ALLOWED_CLIENT_FIELDS` deckt Name, Adresse, PLZ, Ort, Telefon, E-Mail, Geburtsdatum ab; `StammdatenEditor` bedient sie |
| Keine Deaktivierung / Beendigung der Betreuung (Bereich 1, **P1**) | bereits `8392730`: `PATCH /api/admin/clients/[id]/status` + `lib/clients/status.ts` |
| Jahresuebertrag nur manuell, ohne Oberflaeche und ohne Cron (Bereich 5, **P1**) | bereits `8392730`: Knopf in `/admin/budgets`, Cron `/api/cron/jahresuebertrag` am 01.01. in `vercel.json` |
| Keine dokumentierte Aufbewahrungsfrist der Audit-Spur (Bereich 14) | bereits `5e8ff5a`: `docs/LOESCHKONZEPT.md` Abschnitt 3.6 |

Drei davon standen als **P1** in der Statusliste — der Bericht ueberzeichnete
den offenen Rest also messbar.

### 6. Bewusst NICHT angefasst

- **6-/8-Wochen-Grenze fuer VP/KZP** (Bereich 6, P2): waere Code, aber die
  Fristen sind Rechtsanwendung. Hoechstdauer, Vorpflegezeit und die Wirkung des
  gemeinsamen Jahresbetrags seit 01.07.2025 haengen zusammen; eine hier
  gesetzte Zahl waere geraten — dieselbe Sorte Platzhalter, die bei den
  Tarifen bewusst gesperrt bleibt.
- **Sammelrechnungslauf ueber alle Kunden** (Bereich 5, P2): ein Lauf, der
  massenhaft Rechnungen erzeugt, gehoert nicht in einen Durchgang ohne
  Live-Gegenprobe. Bei 4 Kunden ausserdem ohne Nutzen.
- **Benachrichtigungs-Log / Zustellkontrolle** (Bereich 11, P2): braucht eine
  neue Tabelle, also Migration + Live-Apply — beides steht hier nicht zur
  Verfuegung.
- Unveraendert offen: Feldhistorie im Audit-Trail, Rollen PDL/QM/Buchhaltung,
  GPS in der ausgelieferten App, Kassenwechsel-Historie, Serientermin-Pflege.

### Unveraendert

§ 45b-/VP-Tarife bleiben `blocked`/`unverified`, 35 EUR/h bleibt gesperrt.
Keine der Aenderungen fasst einen Preis oder einen Tarifstatus an.
`COACH_DIPA_MODUS` bleibt `false`, Entlastungsbetrag bleibt 131 EUR/Monat.

### Nachweis

- **CODE:** 2 neue Bibliotheken (`lib/einsatzplanung/konflikte.ts`,
  `konflikte-server.ts`), 4 geaenderte Dateien, 2 neue Testdateien.
- **TEST:** 46 neue Tests, alle gruen. `tsc --noEmit` 0 Fehler.
- **LIVE:** keine Migration, kein Apply erforderlich.

---

## 2026-08-23 | Session: Master-Track 7 — technisch selbst loesbare P2/P3-Items

Delta-Durchgang durch `docs/FUNKTIONALE_LUECKENANALYSE.md` nach P2/P3-Befunden,
die ohne CEO-Aktion, ohne externen Bescheid und ohne DDL-Zugang schliessbar
sind. **Sechs geschlossen, vier als bereits erledigt gegengeprueft** (der
Bericht fuehrte sie noch als offen), der Rest bleibt begruendet liegen.

Baseline: `b5f0810`. Keine Migration, kein Live-Apply noetig — alle sechs
Aenderungen sind reiner Anwendungscode.

### Geschlossen

**1. Angehoerigenportal war serverseitig ungeschuetzt** (Bereich 13, P2)
`/angehoerige` stand weder im Middleware-Matcher noch in
`PROTECTED_PREFIXES` und hatte keinen `ROLE_ACCESS`-Eintrag — der Schutz
haftete allein am Client-Guard in `app/angehoerige/layout.tsx`, also an Code,
der die Seite erst nach dem Ausliefern wieder wegnimmt. `proxy.ts` fuehrt den
Bereich jetzt wie `/admin`, `/kunde`, `/engel`, `/fahrer` und `/mis`:
fail-closed, Rolle `angehoerige` plus `admin`/`superadmin` — exakt die
Rollenmenge, die `lib/angehoerige/api-auth.ts` und der Layout-Guard ohnehin
schon pruefen. Keine Rechteerweiterung, nur die fehlende serverseitige Kante.

**2. Login-Weiterleitung las eine manipulierbare Rollenquelle** (Bereich 13, P2)
`app/auth/login/page.tsx` bestimmte die Zielseite aus `user_metadata.role` —
genau die Quelle, die `proxy.ts` als selbst editierbar verwirft. Fuer die
Zugriffskontrolle war das folgenlos (die Middleware entscheidet), aber wer nur
`profiles.role` gesetzt hatte, landete auf `/kunde/home` statt im eigenen
Portal. Jetzt dieselbe Hierarchie wie in der Middleware: `app_metadata.role` →
`profiles.role`. Die Rolle `angehoerige` fuehrt neu direkt ins
Angehoerigenportal.

**3. Leistungsnachweis-CRUD schrieb keinen Audit-Eintrag** (Bereich 14, P2)
Bei 30 live erfassten Nachweisen standen 0 zugehoerige Zeilen in
`mis_audit_log` — `/api/leistungsnachweis/crud` rief schlicht nie
`logAuditEvent()`. Fuer Abrechnungsunterlagen nach SGB XI ist die
Nachvollziehbarkeit jeder Aenderung Pflicht. Alle fuenf Schreibpfade
protokollieren jetzt ueber das Pflichtmuster `logAuditEventOrWarn()`:
erfasst, bestaetigt, unterschrieben, storniert, geaendert.
Beim generischen Update werden `geaenderte_felder` festgehalten, nicht die
Werte davor — dieselbe Tiefe wie im uebrigen System. Eine echte Feldhistorie
fehlt projektweit und wird hier **nicht vorgetaeuscht**; sie bleibt als
eigener Befund offen.

**4. `billing_feiertage` war leer und hatte keinen Befuellungs-Job** (Bereich 7, P2)
`importiereFeiertage()` konnte die Feiertage aller 16 Bundeslaender berechnen,
hatte aber ausser den Tests **keinen einzigen Aufrufer** — die Tabelle stand
live auf 0 Zeilen, obwohl `istFeiertag()` und die SQL-Rechenwege der
Abrechnung dagegen pruefen. Neu: `lib/automation/feiertage-pflege.ts` als
Kette 13 der taeglichen Automatisierung, laufendes plus Folgejahr, alle 16
Laender.
**Wichtig — es wird kein Preis angefasst:** die Kette schreibt ausschliesslich
Feiertagsdaten (Datum, Bezeichnung, Bundesland). Alle
`zuschlag_feiertag_prozent` stehen auf 0 und bleiben es, bis sie aus einer
Verguetungsvereinbarung belegt eingetragen werden. Ein gefuellter Katalog
aendert deshalb heute **keinen einzigen Rechnungsbetrag**.
Nebenbefund mitgefixt: `importiereFeiertage()` zaehlte JEDEN Fehler als
`skipped` — eine fehlende Tabelle, eine RLS-Ablehnung und eine harmlose
Dublette sahen identisch aus. Nur die Unique-Verletzung gilt jetzt als
„vorhanden", alles andere landet benannt in `fehler`.

**5. Keine Terminerinnerung an Kunden oder Angehoerige** (Bereich 11, P2)
Erinnerungen liefen ausschliesslich nach innen (fehlende Nachweise, fehlende
Unterschriften, ablaufende Fristen — an Mitarbeiter, PDL, Admin). Der Kunde
bekam nie ein „Ihr Termin morgen um 10 Uhr". Neu:
`lib/automation/termin-erinnerung.ts` als Kette 12 — In-App-Benachrichtigung
am Vortag an den Kunden (`clients.user_id`) und an jeden aktiven
Angehoerigen-Zugang, mit Dublettenschutz je (Einsatz, Empfaenger) und
portalrichtigem Link.
Bewusst **kein E-Mail-Versand**: der laeuft ueber Resend und ist ohne
`RESEND_API_KEY` still wirkungslos — eine Terminerinnerung, die unbemerkt
nicht rausgeht, ist schlechter als keine.
**Live-Vorbehalt:** `clients.user_id` ist bei allen vier Live-Klienten NULL
(bekannter Befund aus Bereich 3). Die Kette meldet das als `ohneEmpfaenger` —
laut statt still — und erinnert ohne weitere Aenderung, sobald die
Verknuepfung Kundenprofil ↔ Klientendatensatz steht.

**6. `kombinations_abschlag_prozent` wurde nie gelesen** (Bereich 7, P3)
Die Spalte existiert seit `20260806200000`, `calculateLineTotal()` ignorierte
sie. Live steht sie ueberall auf 0, heute aendert das also nichts — aber
sobald jemand einen belegten Abschlag im Tarif hinterlegt haette, waere er
**still** verschwunden und die Position zum vollen Satz abgerechnet worden.
Jetzt fail-closed nach Projektmuster: fuehrt der Tarif einen Abschlag, muss
der Aufrufer ueber `istKombination` sagen, ob die Position zu einer
Kombination gehoert — sonst wirft die Berechnung. Eine Heuristik (etwa
`menge > 1`) waere eine erfundene Abrechnungsregel gewesen.
`snapshotPrice()` sagt ebenfalls ab, solange `invoice_line_snapshots` keine
Abschlagsspalte hat: lieber kein Beleg als ein unvollstaendiger.

### Gegengeprueft — Bericht war veraltet, nichts angefasst

| Befund | Tatsaechlicher Stand |
|---|---|
| Abwesenheit wird in der Einsatzplanung nicht geprueft (B-03, P2) | **Bereits geschlossen** in `8392730` — `pruefeCaregiverVerfuegbarkeit()` laeuft in POST und PATCH von `/api/einsatzplanung`, Abwesenheit blockt mit 422 |
| Verfuegbarkeitsfenster ohne Wirkung in der Planung (B-03, P2) | **Bereits geschlossen** in `8392730` — warnt (blockt bewusst nicht) |
| Kein Wiedervorlage-/Statuswechsel-Workflow (B-01, P2) | **Bereits geschlossen** in `8392730` — `PATCH /api/admin/clients/[id]/status`, verdrahtet in `app/admin/clients/[id]/page.tsx` |
| Keine automatische Erinnerung vor Ablauf einer Qualifikation (B-02, P2) | **War nie offen** — Kette 2 (`warneVorFristablauf`) warnt bei 30/14/7 Tagen ueber `sammleFristen` → `caregiver_qualifications`, Kette 3 eskaliert nach Ablauf |
| `ALLTAGSENGEL_IK` fehlt in `.env.example` (IK-Abschnitt, P2) | **Bereits geschlossen** in `e588416` — dokumentierter Block ab Zeile 222 |

### Bewusst NICHT angefasst

- **§45b-/VP-Tarife** bleiben `blocked`/`unverified`, 35 €/h bleibt gesperrt.
  Keine der sechs Aenderungen fasst einen Preis oder einen Tarifstatus an.
- **`COACH_DIPA_MODUS`** unveraendert `false`.
- **Entlastungsbetrag** unveraendert 131 €/Monat.
- P2/P3-Befunde mit echtem Umfang (Feldhistorie, PDF-Export der
  Dokumentation, Rollen PDL/QM/Buchhaltung, Sammelrechnungslauf,
  Serientermin-Pflege, Kassenwechsel-Historie, gemeinsame Audit-Sicht) sind
  keine „kleinen Fixes" und wurden nicht angefangen, um sie nicht halb zu
  hinterlassen.

### Dreifach-Nachweis

**CODE/COMMIT**
- `proxy.ts` — `/angehoerige` in Matcher, `PROTECTED_PREFIXES`, `ROLE_ACCESS`, `ROLE_HOME`
- `app/auth/login/page.tsx` — Rollenquelle `app_metadata` → `profiles`
- `app/api/leistungsnachweis/crud/route.ts` — 5 Audit-Aufrufe
- `lib/billing/core/feiertage.ts` — `importiereFeiertage()` mit benannten Fehlern
- `lib/billing/core/price-resolver.ts` — Kombinationsabschlag fail-closed
- `lib/automation/feiertage-pflege.ts` (neu), `lib/automation/termin-erinnerung.ts` (neu)
- `lib/automation/index.ts` — Ketten 12 + 13 verdrahtet

**CI/TEST** (lokal vollstaendig nachgefahren)
- `npx tsc --noEmit`: 0 Fehler
- `npx vitest run`: **3553 passed, 38 skipped, 0 rot** (186 Dateien) — vorher
  3515; **+38 neue Tests** in 5 neuen Dateien
- `npm run test:unit` (node:test): 794 passed, 0 fail
- `npm run lint:forbidden`: 24 328 Dateien, 0 Treffer
- `scripts/ci-secret-scan.sh`, `scripts/ci-ik-check.sh`: Exit 0
- `npm run build` (Turbopack, CI-Platzhalter-ENVs): Exit 0

**LIVE**
- Kein Live-Apply erforderlich — keine Migration in diesem Track.
- `billing_feiertage` wird beim ersten Lauf der taeglichen Automatisierung
  in Produktion befuellt; bis dahin bleibt die Tabelle leer. Das ist der
  einzige Punkt dieses Tracks, dessen Wirkung erst mit dem naechsten
  Cron-Lauf sichtbar wird — nachpruefbar ueber die Kette
  `feiertage_katalog` in der Antwort von `/api/admin/automatisierung`.

---

## 2026-08-23 | Session: Master-Tracks 1-6 — zwei Migrationen live, P6 geprueft, Buchungskette an Live-Daten gemessen

Sechs von acht Master-Tracks abgeschlossen. Zwei Migrationen stehen erstmals
nicht mehr als „wartet auf Apply", sondern sind live angewendet und
gegengeprueft. Zwei Punkte bleiben als **CEO-Aktion** offen — beide brauchen ein
Dashboard-Login, das aus der Session nicht erreichbar ist.

### Track 1: P6 Legacy Security Check (`vlrviyrgggzhayepfmop`)
Tiefenpruefung zum Befund vom 22.08. **Ergebnis: geringe reale Exposition** —
die Einstufung von gestern wird damit praezisiert, nicht widerrufen.

- **RLS auf allen Tabellen aktiv**, keine Storage-Buckets, 10 E-Mail-Nutzer.
- **anon-SELECT nur auf Marktplatz-Katalogdaten** (`categories`, `services`,
  `reviews`, `rental_options`, `staff`) — by design fuer den oeffentlichen
  Marktplatz, kein PII dahinter. Der oeffentlich lesbare anon-Key aus
  `index_legacy.html` kommt also nicht weiter als bis zu diesen Katalogzeilen.
- **Offen bleibt genau ein Hebel:** `disable_signup=false` +
  `mailer_autoconfirm=true`. Jeder kann auf dem unbeobachteten Projekt ein
  sofort aktives Konto anlegen.
- **CEO-AKTION:** Signup im Supabase-Dashboard deaktivieren. Erst danach ist
  P6 ein reiner `DECOMMISSION_CANDIDATE` ohne Live-Flaeche.

### Track 2: ChairMatch-Migration LIVE angewendet (`pwdbjqfpgumyfktbfswg`)
Blocker 14 der Delta-Analyse geschlossen. Angewendet via Supabase-MCP als
`20260823112716_persistence_uploads_rentals` (Repo-Datei:
`supabase/migrations/20260821_persistence_uploads_rentals.sql`).

- **4 neue Tabellen:** `tenant_profiles` (8 Spalten), `payout_accounts` (7),
  `user_uploads` (12), `rental_requests` (15).
- **7 neue Spalten auf `rental_equipment`:** `price_per_hour_cents`,
  `price_per_week_cents`, `available_days`, `available_from`, `available_to`,
  `features`, `updated_at`.
- **Storage-Bucket `cm-uploads`** angelegt, **private**.
- **IBAN-Spalte `REVOKED`** fuer `anon` und `authenticated` — Auszahlungsdaten
  sind ausschliesslich ueber den Server-Pfad lesbar, nicht ueber PostgREST.
- **Alle RLS-Policies aktiv, SELECT-only** (defense in depth): geschrieben wird
  weiterhin nur ueber `getSupabaseAdmin()` in authentifizierten Routen, der
  Browser hat keinen Schreibweg.
- Damit antworten `/api/me/tenant-profile`, `/api/me/salon`, `/api/me/listing`,
  `/api/me/payout-account`, `/api/uploads`, `/api/rental-requests` und das
  `rental_equipment`-CRUD nicht mehr mit 500 — der Umbau aus `ebf14e2` ist ab
  jetzt funktionsfaehig.
- **STATUS: LIVE_VERIFIED**

### Track 3: `invoice_email_log` LIVE angewendet (`nnwyktkqibdjxgimjyuq`)
- **Timestamp-Mismatch geklaert:** `20260923` war ein Tippfehler im Dateinamen,
  der Migrationsinhalt war korrekt. Datei im Repo auf
  `20260823000000_invoice_email_log.sql` umbenannt (Rollback entsprechend
  `20260823000001`), Referenzen in `lib/billing/versand/rechnung-versand.ts`
  und `docs/FUNKTIONALE_LUECKENANALYSE.md` nachgezogen. Die Abhaengigkeiten der
  Migration (`organizations`, `invoices`, `is_admin()`, `current_org_id()`)
  liegen alle vor dem neuen Datum — die Reihenfolge bleibt sauber.
- **Live angewendet:** `invoice_email_log` mit 15 Spalten.
- **RLS aktiv, beide Policies:** `invoice_email_log_admin` (PERMISSIVE, ueber
  `is_admin()`) **und** `org_fence_invoice_email_log` (RESTRICTIVE, ueber
  `organization_id = current_org_id()`). Die RESTRICTIVE greift zusaetzlich zur
  Admin-Policy, nicht statt ihrer.
- Damit hat der Rechnungsversand seine Versuchshistorie: jeder Versand mit
  Empfaenger, Betreff, Ergebnis, Fehlertext und Versuchszaehler.
- **STATUS: LIVE_VERIFIED**

### Track 4: RESEND/Vercel — Code steht, Key fehlt
Code-Analyse von `lib/billing/versand/rechnung-versand.ts` und
`lib/billing/dunning/mahn-versand.ts`: beide lesen `RESEND_API_KEY`.

- **Kein stiller Fehlschlag ohne Key:** es wird ein Eintrag mit Status
  `uebersprungen` in `invoice_email_log` geschrieben und `invoices.sent_at`
  bleibt leer, damit spaeter nachversendet wird.
- **CEO-AKTION:** `RESEND_API_KEY` in Vercel Production setzen. Bis dahin
  verlaesst weder eine Rechnung noch eine Mahnung das System — die Kette ist
  vollstaendig gebaut, aber ohne Zustellkanal.

### Track 5: Supabase Key Dependency Map — bereits erledigt
Kein neuer Aufwand: `f8ad0ae` ist deployed, die Schluessel-Abstraktion
(`scripts/lib/supabase-keys.mjs` mit `envWert()`/`apiHeaders()`) steht.
**Keine Rotation noetig** bis zur Abkuendigung der Legacy-Keys Ende 2026 —
Punkt 7 in Track 5 bleibt bewusst `BLOCKED_BY_RISK` statt „offen".

### Track 6: Buchungskette gegen Live-Daten (Delta-Check)
Erste Messung der Kette aus `de4623b` an echten Zeilen statt an Testdaten.

| Stufe | Live-Bestand |
|-------|--------------|
| `assignments` | 5 aktiv |
| `service_records` | 30 — 2 `draft`, 13 `signed`, 15 `invoiced` |
| `invoice_items` | 15 |
| `invoices` | 3 — 1 `sent`, 1 `paid`, 1 `disputed` |
| `payments` | 0 (Zuordnung laeuft ueber `payment_allocations`) |

- **Keine gebrochenen Verweise, keine verwaisten Datensaetze.** Jede Stufe
  haengt an der vorherigen.
- Die **13 signierten Nachweise ohne Rechnung sind kein Defekt**, sondern der
  normale Zwischenstand: unterschrieben, noch nicht abgerechnet.
- `payments = 0` deckt sich mit Track 4: ohne Versand keine Zahlung.
- **STATUS: VERIFIZIERT**

### Nicht angefasst
Keine Preise, keine Tarif-Zuordnungen. §45b-Tarife bleiben `blocked`/
`unverified` — daran aendert keiner der sechs Tracks etwas.

### Offen: 2 CEO-Aktionen
| # | Aktion | Wo |
|---|--------|-----|
| 1 | Signup deaktivieren (`disable_signup=true`) | Supabase-Dashboard, Projekt `vlrviyrgggzhayepfmop` |
| 2 | `RESEND_API_KEY` setzen | Vercel Production |

---

## 2026-08-22 | Session: Phase-2-Abschluss — ChairMatch-Persistenz + Tracks 4-6 nachdokumentiert

Nachtrag fuer die vier Commits, die in den bisherigen Eintraegen fehlten
(ea67b5b, e588416, 8392730 im Hauptrepo, ebf14e2 in `/Users/work/chairmatch`),
plus Aktualisierung des Statusreports auf HEAD `3c29b00`.

### Track 4: P6 Legacy Security Check (ea67b5b)
Auftrag war „P6 NICHT loeschen, ZUERST vollstaendig pruefen". Ergebnis:
`docs/P6_LEGACY_SECURITY_CHECK.md` (210 Zeilen), read-only + non-destruktive
Write-Probes, keine Secret-Werte im Dokument (nur Typ, Ref, Fundort, HTTP-Codes).

- **Zwei Aussagen der Dependency-Map widerlegt:** P6 (`vlrviyrgggzhayepfmop`) ist
  nicht „keine aktive Nutzung". Es existiert ein live erreichbares
  GitHub-Pages-Deployment, das die Legacy-SPA mit **hartkodiertem anon-JWT**
  ausfuehrt und zur Laufzeit gegen die lebende P6-Datenbank verbindet.
- Der Key steht getrackt im **oeffentlichen** Repo
  (`index_legacy.html:199-200`), ueber `raw.githubusercontent.com` mit HTTP 200
  abrufbar, gueltig bis 2036.
- **Auth-Flaeche offen:** `disable_signup=false` + `mailer_autoconfirm=true` —
  jeder kann auf dem unbeobachteten Projekt Konten anlegen, die sofort aktiv
  sind. SMS-Provider Twilio konfiguriert (Kostenhebel ueber `/otp`).
- Einstufung: `DECOMMISSION_CANDIDATE` mit akuter, sofort schliessbarer
  Live-Exposition. P5 (`uwmjqckhjkgukhzeidyw`) als Karteileiche bestaetigt.
- `docs/SUPABASE_KEY_DEPENDENCY_MAP.md` entsprechend korrigiert.

### Track 5: Supabase publishable/secret Migration vorbereitet (e588416)
Die Umstellung ist **additiv** — neuer Name zuerst, Legacy-Name als Fallback.
Es wurde nichts rotiert und nichts abgeschaltet.

- **`scripts/lib/supabase-keys.mjs`** — zentraler Helfer (`envWert()`,
  `apiHeaders()`) fuer alle Verifikations-Skripte. 24 Skripte umgestellt.
- **Die Falle, die der Helfer schliesst:** `Authorization: Bearer <key>` ist bei
  den neuen Keys verboten — sie sind keine JWTs, die API antwortet „Invalid
  JWT". Ein Sicherheitsskript liest das als „kein Zugriff moeglich" und meldet
  gruen, **ohne geprueft zu haben**. `apiHeaders()` setzt den Bearer-Header
  deshalb nur bei Legacy-JWTs.
- **`scripts/verify-publishable-key.mjs`** — Diagnoseskript, das misst, ob
  Supabase die neuen Keys auf diesem Projekt schon annimmt.
- Regressionstest `__tests__/security/supabase-key-migration.test.ts` sperrt
  rohe Bearer-Header in `scripts/*.mjs`. **Dieser Test war anschliessend rot**
  (siehe naechster Eintrag) — er schlug auf dem Diagnoseskript an, wo der
  Header Absicht ist.
- **Nicht geloest:** das Logout-Problem bei Rotation. Das haengt an den
  JWT-signing-keys, nicht an den API-Keys. Punkt 7 in Track 5 bleibt
  `BLOCKED_BY_RISK`.

### Track 6: 7 kleine Fixes aus der Lueckenanalyse (8392730)
- **Kundenstammdaten editierbar** (`lib/clients/stammdaten.ts`,
  `app/api/admin/clients/[id]/route.ts`) — nach der Anlage waren nur Teilfelder
  aenderbar.
- **Klienten-Statuswechsel** (`lib/clients/status.ts` +
  `app/api/admin/clients/[id]/status/route.ts`) mit erlaubten Uebergaengen.
- **Verfuegbarkeitspruefung in der Einsatzplanung**
  (`app/api/einsatzplanung/route.ts`) — Doppelbelegung wird abgewiesen.
- **Budget-Uebersicht** unter `/admin/budgets`.
- **Jahresuebertrag als Cron** (`app/api/cron/jahresuebertrag/route.ts`,
  in `vercel.json` verdrahtet).
- **Zahlungs-Route gehaertet** (`app/api/billing/payments/route.ts`).
- 2 neue Testdateien (Stammdaten-Status, Verfuegbarkeitspruefung).

### ChairMatch Track 3: localStorage → DB (ebf14e2, separates Repo)
**45 Dateien, +4172/-386.** Schliesst die Befunde 8-13 der Delta-Analyse in
einem Zug — alle sechs hatten dieselbe Ursache: der Browser war die
Speicherschicht.

- **Persistenz:** `MeinBereichSubPage.tsx` schreibt gegen vier neue
  authentifizierte Routen (`/api/me/tenant-profile`, `/api/me/salon`,
  `/api/me/listing`, `/api/me/payout-account`) statt in `localStorage`.
  Betroffen: Mieter-Profil/-Radius, Salon-Beschreibung/-Zeiten,
  Inserat-Ausstattung/-Preise/-Verfuegbarkeit, Auszahlungskonten.
- **Uploads:** `UploadField.tsx` laedt ueber `/api/uploads` in Supabase Storage
  statt Data-URLs im Browser zu halten.
- **Miet-Flow angeschlossen:** `/inserat/[id]/anfragen` → `/api/rental-requests`,
  neue Seite `/rentals/[id]/buchen` → `/api/rental-bookings`,
  Vermieter-Antwort unter `/vermieter/mein-inserat/anfragen`.
- **`rental_equipment`-CRUD:** `/api/rental-equipment` (+ `[id]`) und
  `/vermieter/mein-inserat/inserate` — der Vermieter kann Stuehle anlegen.
- **`createNotification()`:** von 0 auf 12 Aufrufstellen.
- **Zugriffsmodell unveraendert:** der Browser schreibt nie direkt; jeder
  Schreibpfad laeuft ueber `getSupabaseAdmin()` in einer Route mit
  Auth-Pruefung. Die neuen Policies erlauben `SELECT` nur auf die eigene Zeile,
  kein INSERT/UPDATE/DELETE fuer anon/authenticated.

> **Blocker:** `supabase/migrations/20260821_persistence_uploads_rentals.sql`
> ist **nicht angewendet** — sie braucht den Supabase-SQL-Editor. Bis dahin
> antworten die neuen Routen mit 500. Das ist Absicht: die Migration faellt
> bewusst nicht still auf localStorage zurueck.
>
> **Offen geblieben:** die Mietanfrage erzeugt eine In-App-Benachrichtigung,
> aber keine E-Mail an den Vermieter (`src/lib/email.ts` wird in
> `/api/rental-requests` nicht aufgerufen).

### Nicht angefasst
Keine Preise, keine Tarif-Zuordnungen. §45b-Tarife bleiben `blocked`/
`unverified`.

### CI
| Commit | Beschreibung | Status |
|--------|-------------|--------|
| ea67b5b | Track 4: P6 Legacy Security Check | **DEPLOYED** |
| e588416 | Track 5: Supabase publishable/secret Migration | **DEPLOYED** |
| 8392730 | Track 6: 7 kleine Fixes aus der Lueckenanalyse | **DEPLOYED** |
| ebf14e2 | ChairMatch Track 3: localStorage → DB (separates Repo) | **DEPLOYED** — Migration wartet auf Apply |

---

## 2026-08-22 | Session: CI wieder gruen (roter Track-5-Test geschlossen)

CI war seit e588416 rot, zuletzt auf f4048df. Ursache war **ein einziger Test**
— nicht mehrere: 180 von 181 Testdateien waren gruen, Typecheck war gruen, und
der Production-Build lief im E2E-Job durch. Rot war ausschliesslich der Schritt
„Unit tests (vitest)".

### Ursache
`__tests__/security/supabase-key-migration.test.ts` scannt `scripts/*.mjs` nach
rohen `Authorization: Bearer`-Headern. Grund: die neuen Supabase-Keys
(`sb_publishable_…`) sind keine JWTs — als Bearer geschickt antwortet die API
„Invalid JWT", was ein Sicherheitsskript wie „kein Zugriff" liest und still
gruen meldet.

Getroffen hat der Scan `scripts/verify-publishable-key.mjs:85`. Dort ist der
Header **Absicht**: Test 2 des Diagnoseskripts schickt `apikey` + identischen
`Authorization: Bearer`, weil genau das der Aufrufweg von supabase-js ohne
Session ist. Der Lauf misst, ob Supabase diese Kombination annimmt. Ohne den
Header misst das Skript nichts mehr.

### Fix
- Ausnahmeliste `BEARER_AUSNAHMEN` im Test — benannt und im Code begruendet,
  statt eines zweiten anonymen `grep -v`. Enthaelt den Header-Helfer
  `scripts/lib/supabase-keys.mjs` und das Diagnoseskript.
- **Zusatztest gegen tote Ausnahmen:** faellt, sobald ein Eintrag auf eine nicht
  existierende Datei zeigt. Eine Ausnahme fuer eine geloeschte oder umbenannte
  Datei filtert sonst spaeter still einen echten Treffer weg, wenn der Pfad neu
  vergeben wird.
- Die Sperre bleibt fuer jedes andere Skript scharf. Aufgeweicht wurde nichts:
  ausgenommen sind nur der Helfer, der den Header definiert, und ein Skript ohne
  Produktivwirkung, dessen Zweck das Messen dieses Headers ist.

### Verifikation (lokal, jeder CI-Schritt einzeln, Exit-Code geprueft)
| Schritt | Ergebnis |
|---------|----------|
| `npm run typecheck` | Exit 0, 0 Fehler |
| `npx vitest run` | Exit 0 — 3515/3553 gruen, 38 skipped, **0 rot** |
| `npm run test:unit` (node:test) | Exit 0 |
| `scripts/ci-secret-scan.sh` | Exit 0 |
| `scripts/ci-ik-check.sh` | Exit 0 |
| `npm run lint:forbidden` | Exit 0 |
| `npm run build` (CI-Platzhalter-ENVs, 4 GB Heap) | Exit 0 |

tsc und vitest liefen strikt nacheinander (OOM-Regel). Kein Schritt endete auf
einer Pipeline — jeder Exit-Code wurde direkt gelesen.

### Verifikation auf GitHub (nachgetragen 22.08.2026 13:14)
Run **32569458523** auf `3c29b00`: `conclusion: success`, Dauer 6m12s, beide
Jobs gruen („Typecheck, Lint, Tests, Build" und „E2E — PflegeCoach (DiPA QS-05)
+ Barrierefreiheit (BITV B-13)"). Der Vorlauf **32556332992** auf `f4048df` war
`failure` — derselbe eine Test. Damit ist der Fix nicht nur lokal, sondern auf
der CI selbst bestaetigt.

### Nicht angefasst
Keine Preise, keine Migrationen, keine Produktivlogik. Geaendert wurden nur die
Testdatei und drei Statusdokumente.

---

## 2026-08-22 | Session: Tracks 1 + 2 — Buchungskette, Rechnungs- und Mahnversand, Zahlungserfassung

Aufraeumen und Deploy der 29 uncommitteten Dateien aus den vorangegangenen
Code-Tasks (Typecheck war blockiert, weil parallele tsc-Laeufe kollidierten).

### Track 1: Buchung → Einsatz → Leistungsnachweis (de4623b)
Befund 10 der Lueckenanalyse: eine angenommene Buchung setzte ausschliesslich
`bookings.status='accepted'`. Einsatzplanung, Leistungsnachweis und Abrechnung
sahen den Termin nie.

- **`lib/bookings/einsatz-kette.ts`** — Bruecke aus der Marktplatz-Welt
  (`profiles`/`angels`) in die Betriebs-Welt (`clients`/`caregivers`/
  `assignments`/`service_records`). Legt Einsatz (`GEPLANT`) + Nachweis-Entwurf
  (`draft`/`ENTWURF`/`OFFEN`) an.
- **Fail-closed an sechs Stellen:** kein Tarif fuer die Leistungsart, kein
  Klienten-Datensatz, kein Mitarbeiter-Datensatz, fehlende Client- oder
  Einsatzfreigabe, Budget-Block, Doppelbelegung. Kein Ausweichen auf
  'sonstige', kein automatisches Anlegen von clients/caregivers.
- **Keine Preise:** `service_records.amount` bleibt leer, der Betrag entsteht
  erst im Rechnungslauf ueber den verifizierten Tarif. `duration_minutes`
  bleibt ungesetzt (GENERATED-Spalte).
- **`POST /api/bookings/respond`** baut die Kette NACH dem optimistic lock —
  so gibt es unter parallelen Requests genau einen Gewinner. Reisst die Kette,
  geht die Buchung auf `pending` zurueck. `force_override` nur fuer Admins,
  mit Audit-Eintrag und Begruendung.
- Engel-UI: 409 **mit** `code` (z. B. DOPPELBELEGUNG) zeigt jetzt den echten
  Grund statt „bereits beantwortet".
- 20 Tests: `__tests__/e2e/buchung-einsatz-kette.test.ts`

### Track 2: Rechnungsversand + Mahnversand + Zahlungserfassung (79e7e0e)
Befunde 11, 12 und 13: Rechnungen wurden erzeugt und als PDF abgelegt,
erreichten den Kunden aber nie; die `dunning_email_queue` hatte seit ihrer
Einfuehrung keinen Konsumenten; Zahlungen konnten nur per CAMT-Import
erfasst werden.

- **`lib/pdf/rechnung-paket.ts`** — der Belegpaket-Aufbau (495 Zeilen) aus
  `generate-pdf/route.ts` herausgeloest. Die Route ist jetzt nur noch Auth +
  Audit-Trail; der Versand erzeugt dieselben Bytes ohne HTTP-Umweg.
- **`lib/billing/versand/rechnung-versand.ts`** + `POST /api/billing/invoices/
  [id]/versenden` — Belegpaket + E-Mail an den Klienten, idempotent ueber
  `invoices.sent_at`, Nachversand nur mit `erneutSenden: true`.
- **`lib/notifications.ts`**: `sendRawEmail()` mit Anhaengen und freiem HTML
  (Rechnungen brauchen ihre eigene Anrede statt des „Hallo {name}"-Templates).
  Absender bleibt konstant „Alltagsengel" — nie ein persoenlicher Name.
- **`freezeInvoice(..., { autoVersand })`** — opt-in, die Route setzt das Flag
  nur bei `RECHNUNGSVERSAND_AUTOMATISCH='1'`. Ein Versandfehler kippt die
  Festschreibung NICHT.
- **`lib/billing/dunning/mahn-versand.ts`** + `POST /api/billing/dunning/versand`
  — erster Konsument der `dunning_email_queue`, Mahnungs-PDF als Anhang.
  Mahnlauf-Cron und `/admin/mahnwesen` zeigen den Versandzustand.
- **`components/admin/ZahlungErfassenDialog.tsx`** + `lib/admin/betrag.ts` —
  manuelle Zahlungserfassung aus `/admin/forderungen`.
- **Migration `20260823000000_invoice_email_log.sql`** — Zustellprotokoll je
  Versuch (Empfaenger, Betreff, Ergebnis, Fehlertext, Zaehler), `is_admin()`-
  Policy + RESTRICTIVE `org_fence`. Rollback als `20260823000001`.
  **Wartet auf manuelles Live-Apply.**
- 29 Tests (13 Rechnungsversand, 8 Mahnversand, 8 Zahlungserfassung)

### Fail-closed-Verhalten des Versands
Ohne `RESEND_API_KEY` wird **nicht** geworfen und **nicht** als erledigt
markiert: der Versuch landet als `uebersprungen` im Protokoll, `sent_at`
bleibt leer, damit nach dem Setzen des Keys nachversendet wird.

### Nicht angefasst
§45b-Tarife bleiben `blocked`/`unverified`. Es wurden keine Preise, keine
Tarif-Zuordnungen und keine Testdaten angelegt. `BUCHUNG_ZU_ERFASSUNG` bildet
nur Schreibvarianten bereits entschiedener Leistungen ab ('Haushalt' →
'haushaltshilfe'); Buchungsleistungen ohne entschiedenen Tarif ('Freizeit',
'Apotheke', 'Aktivitaeten', 'Krankenfahrdienst', 'Hygienebox') laufen
fail-closed in `KEINE_TARIFZUORDNUNG`.

### Verifikation
| Pruefung | Ergebnis |
|----------|----------|
| `npx tsc --noEmit` | 0 Fehler |
| Neue Tests (4 Dateien) | 49/49 gruen |
| Regression Billing + Touren + Bookings (46 Dateien) | 989 gruen, 22 skipped |
| Volle Suite (181 Dateien) | 3513 gruen, 38 skipped, **1 rot** |

Der rote Test ist `__tests__/security/supabase-key-migration.test.ts` und
stammt aus **e588416 (Track 5)**, nicht aus Track 1/2: der Regressionsscan
schlaegt auf `scripts/verify-publishable-key.mjs:85` an, wo der
`Authorization: Bearer`-Header Absicht ist (das Skript prueft genau diesen
Fall). Nicht eigenmaechtig gefixt, weil der Fix eine Sicherheitspruefung
aufweicht — Entscheidung liegt beim CEO.

### CI
| Commit | Beschreibung | Status |
|--------|-------------|--------|
| de4623b | Track 1: Buchung → Einsatz → Nachweis | **DEPLOYED** |
| 79e7e0e | Track 2: Rechnungs-/Mahnversand + Zahlungserfassung | **DEPLOYED** |

---

## 2026-08-22 | Session: Phase 2 — Dependency Map, Funktionale Lueckenanalyse, ChairMatch Delta

### Track E: Supabase Key Dependency Map
- **6 Projekte** kartiert (2 mehr als erwartet: P5 Staging verwaist, P6 Legacy lebt)
- Alle Projekte im Legacy-JWT-Modell: anon + service_role nicht einzeln rotierbar
- P1 Alltagsengel-Repo sauber: 0 hartkodierte JWTs, 0 Production-Secrets in GitHub
- 3 hartkodierte Keys in ausgelagerten Repos (efy-care, chairmatch mobile, chairmatch legacy)
- Rotationsbewertung: P2 ROTATE_SAFE, P1/P3/P4 BLOCKED_BY_RISK (Legacy-JWT)
- Empfehlung: Migration auf `publishable`/`secret`-Keys vor jeder Rotation
- Commit: f8ad0ae

### Track F: Funktionale Lueckenanalyse (Alltagsengel)
- **14 Bereiche** systematisch geprueft mit Zeilenreferenzen
- Live-Daten-Inventar: 4 Kunden, 30 Nachweise, 3 Rechnungen, 0 Zahlungen
- **Top-Befunde:**
  1. §45b-Tarife 8/9 `blocked`, VP/KZP 0/4 verifiziert → keine Kassenabrechnung
  2. Buchung → Einsatz → Nachweis: Kette nicht verbunden
  3. Mahnungen erzeugt aber nie versendet (Queue ohne Konsument)
  4. Rechnungszustellung fehlt (kein E-Mail, nur Portal)
  5. Offline-Erfassung nur im nicht ausgelieferten Expo-Projekt
- IK-Nummer 460629986 in Prod-DB gesetzt und funktionsfaehig
- Empfohlene Reihenfolge: 7 klein → 3 mittel → 2 gross
- Commit: b3564d2

### Track G: ChairMatch Delta + Gaps
- HEAD unveraendert seit c0e6af6, 231/231 Tests gruen, tsc 0 Fehler
- Production live: 50 User, 16 Salons, 1 Buchung, 48 Bewertungen
- **9 funktionale Luecken** gefunden:
  1. MeinBereichSubPage speichert in localStorage statt DB (9 Seiten)
  2. Bild-Uploads verlassen Browser nicht
  3. Mietanfrage wird nie zugestellt
  4. Gesamter Miet-Flow abgeklemmt (API hat 0 Aufrufer)
  5. rental_equipment kein CRUD (Vermieter kann keinen Stuhl anlegen)
  6. createNotification() hat 0 Aufrufer
  7. Stripe-Webhook benachrichtigt niemanden
  8. Kein Reminder-Cron
  9. Stripe-Env in Vercel ungeklaert
- Commit: 24e67e9

### CI
| Commit | Beschreibung | Status |
|--------|-------------|--------|
| f8ad0ae | Supabase Key Dependency Map | **DEPLOYED** |
| 24e67e9 | ChairMatch Delta-Analyse | **DEPLOYED** |
| b3564d2 | Funktionale Lueckenanalyse | **DEPLOYED** |

---

## 2026-08-21 | Session: Parallel-Tracks A-D (Error Sanitizer, WCAG, ChairMatch E2E, ChairMatch i18n)

### Track A: Error Sanitizer + Logging Final Check
- **195 echte Leak-Punkte** gefunden und behoben (statt geschaetzter ~15)
- `UserFacingError`-Klasse + `apiErrorResponse()` fuer fail-closed Error-Handling
- 32 lib-Dateien, ~140 Validierungs-Throws auf UserFacingError migriert
- DB-Fehler jetzt 500 statt 400, Correlation-ID beibehalten
- Structured Logging Delta: 0 console.* in Prod, keine Secrets/PII in Logs
- 10 neue Tests (25/25 gruen)

### Track B: WCAG Focus-Management + Tastaturzugang (2. Durchgang)
- 34 Dialoge mit Fokus-Trap, ESC-Close, Focus-Return implementiert
- Klickbare Elemente ohne Tastaturzugang: 121 → 1 (Rest = stopPropagation-Guards)
- 10 zusaetzliche Modale entdeckt die im 1. Durchgang fehlten
- axe-core Laufzeit-Pruefung integriert
- Focus-Ring Kontrast-Fix auf Gold-Hintergruenden
- docs/BARRIEREFREIHEIT_AUDIT.md aktualisiert (2. Durchgang)

### Track C: ChairMatch E2E Tests (im separaten Repo /chairmatch)
- 174 neue Tests: Booking (55), Payment (39), Auth (35), Permissions (30), Error Cases (15)
- In-Memory Supabase + Stripe-Mock Test-Harness
- **3 Produktionsfehler gefunden und behoben:**
  1. Statuswechsel-Bug (Case-Sensitivity PENDING/pending)
  2. Login-Rate-Limit wirkungslos (throw in eigenem try/catch)
  3. isBusinessOwnerOrAbove() gab fuer jede Rolle true zurueck (Stripe Connect offen)
- vitest-Konfiguration repariert (231 Tests gesamt gruen)

### Track D: ChairMatch i18n (Landing-Pages)
- 39 HTML-Dateien, 1477 deutsche Text-Knoten inventarisiert
- i18n-Runtime (500 Zeilen, 0 Abhaengigkeiten) mit data-i18n-Attributen
- de.json + en.json Kataloge (479 Keys, volle Paritaet)
- 24 Stadtseiten + Index + FAQ + Blog-Index = 100% Abdeckung
- Intl.DateTimeFormat + Intl.NumberFormat fuer Datums-/Waehrungsformatierung
- Regressionsbarriere: chairmatch-i18n-check.mjs
- **Nebenbefund behoben:** submitLead() zeigte "Danke!" auch bei POST-Fehler

### CI
| Run | Commit | Status |
|-----|--------|--------|
| b344329 | Error Sanitizer | **DEPLOYED** (scoped) |
| ad23806 | WCAG Focus | **DEPLOYED** |
| c9d603a | ChairMatch i18n | **DEPLOYED** |
| c0e6af6 | ChairMatch E2E | **DEPLOYED** (separates Repo) |

---

## 2026-08-21 | Session: BITV/WCAG Barrierefreiheit

### Durchgefuehrt
- Barrierefreiheit-Audit gegen WCAG 2.1 AA
- 2 Farbtokens (--ink4, --ink5) auf AA-Kontrast gehoben (758 Stellen)
- Banner-Komponente als Live-Region (295 Stellen)
- 15x kopierter Field-Wrapper div→label (201 Felder)
- 11 Icon-Buttons mit aria-label versehen
- 21 Dialoge mit role="dialog" + aria-modal
- 90 onClick-Elemente auf Tastaturzugang umgestellt
- lib/a11y.ts mit klickbar() Helfer erstellt
- docs/BARRIEREFREIHEIT_AUDIT.md erstellt

### CI
| Run | Commit | Status |
|-----|--------|--------|
| #321 | a903ec3 | **GRUEN** (4m 48s) |

---

## 2026-08-21 | Session: Structured Logger Vollmigration

### Durchgefuehrt
- 234 weitere Dateien von console.log/error/warn auf Structured Logger migriert
- Codemod-basierte Migration mit Klammer-Balancing-Parser
- Neue Modul-Logger erstellt (engelLogger, kundeLogger, apiLogger etc.)
- Produktionscode durchgehend auf JSON-Logging in Production

### CI
| Run | Commit | Status |
|-----|--------|--------|
| #320 | 96f6632 | **GRUEN** (5m 51s) |

---

## 2026-08-21 | Session: Typecheck-Fix nach as-any Cleanup

### Durchgefuehrt

**as-any Cleanup Typecheck-Regression behoben**
- 34 Typecheck-Fehler in 13 Dateien gefixt (CI #316/#317 waren rot)
- Zentraler Helfer `lib/supabase/join.ts` erstellt: `one<T>(relation)` loest PostgREST Array/Objekt-Mehrdeutigkeit bei FK-Joins
- 12 Dateien auf `one()` migriert statt `as any` zurueckzuholen
- 4 weitere Fixes: roleBadge-Signatur, bestaetigt-Typ erweitert, NoteMessage.is_internal ergaenzt, Capacitor addListener-Typ
- Lokal verifiziert: tsc 0 Fehler, 3403 vitest passed, 794 node:test, Build OK

### CI
| Run | Commit | Status |
|-----|--------|--------|
| #316 | ee5453b | CANCELLED (Typecheck failed, superseded) |
| #317 | 14c5851 | FAILED (Typecheck, partieller Fix) |
| #318 | 49503a3 | **GRUEN** (6m 13s) |

### Commits
| Commit | Beschreibung |
|--------|-------------|
| ee5453b | as-any Cleanup: ~90 Produktions-Casts entfernt |
| 14c5851 | as-any Cleanup: Typecheck-Fehler in mahnung (partiell) |
| 49503a3 | fix: Typecheck-Fehler aus as-any Cleanup behoben |

---

## 2026-08-21 | Session: Projekt-Status-Initialisierung

### Durchgefuehrt
- **MASTER_PROJECT_STATUS.md** erstellt: Konsolidierter Status aller 7 Tracks + Betriebssystem-Roadmap
- **CHANGELOG_AI_WORK.md** erstellt (diese Datei)
- Git-Log-Analyse: Keine Commits nach bf149da (HEAD), letzter CI-Lauf #302 gruen (3389/3389)
- Quelldokumente ausgewertet:
  - FINAL_FINAL_GO_LIVE_REPORT_2026-08-21.md
  - docs/FINALER_RESTSTATUS.md (2029 Tests, 12.08.2026)
  - docs/MASTER_STATUS_REPORT_2026-08-19.md (8 Tracks, 3091+ Tests)
  - docs/GO_LIVE_45A_HESSEN_FINAL_2026-08-19.md (Hessen-Checkliste)
  - Memory-Dateien (parallel-tracks, betriebssystem, master-prompt-strategie, business-models, improvements)

### Erkenntnisse
- **GO-Status** bestaetigt fuer: Alltagsengel Core (technisch), ChairMatch, CI/DevOps, Security
- **BLOCKED (extern)** verbleiben: Elektronische Abrechnung, DiPA/PflegeCoach, §302/KIM
- **2 echte §45b-Startblocker**: §45a Anerkennung (Frist 31.08), Tarifverifizierung
- **2 MEDIUM Security-Findings** offen (SEPA Platzhalter, Loeschkonzept) -- kein Startblocker
- **ChairMatch P0**: `ignoreBuildErrors: true` und hardcodierter anon-Key muessen noch entfernt werden

### Commits
| Commit | Beschreibung |
|--------|-------------|
| 3ab6c7c | MASTER_PROJECT_STATUS + CHANGELOG initialisiert |

---

## 2026-08-21 | Session: P0/P1 Fixes (ChairMatch + Error Sanitizer)

### Durchgefuehrt

**ChairMatch P0 #1: ignoreBuildErrors**
- Bereits in frueherer Session entfernt — kein erneuter Fix noetig
- Verifiziert: next.config.ts Zeile 74 bestaetigt clean typecheck

**ChairMatch P0 #2: Hardcodierter Supabase Anon-Key**
- 30 HTML-Dateien in chairmatch-landing/ bereinigt (index, 22 Stadtseiten, 3 Blog, 2 Ads)
- Hardcodierte URL + Key durch `window.__SUPABASE_URL` / `window.__SUPABASE_ANON_KEY` ersetzt
- `generate-config.sh` + `supabase-config.example.js` erstellt
- `.gitignore` ergaenzt (js/supabase-config.js)
- `forbidden-strings.json` um Guard `hardcoded-supabase-key-in-html` erweitert
- Lint: 24.252 Dateien gescannt, 0 Violations

**Alltagsengel P1: API Error Sanitizer**
- `lib/api/error-sanitizer.ts` erstellt: safeApiError() + withErrorSanitizer() HOF
- 37 kritische API-Routen migriert (25 Billing, 2 Admin, 10 DTA)
- Correlation-ID (UUID) fuer jede Error-Response, Full-Error nur server-seitig geloggt
- 18 Tests in `__tests__/api/error-sanitizer.test.ts`
- ~180 weitere Routen koennen inkrementell migriert werden

### CI
| Run | Commit | Status |
|-----|--------|--------|
| #305 | cfb6c88 | GRUEN (5m 26s) |
| #306 | 9a2b464 | IN PROGRESS |

### Commits
| Commit | Beschreibung |
|--------|-------------|
| cfb6c88 | P0-Security: Hardcodierte Supabase-Anon-Keys aus 30 ChairMatch-Landing-Dateien entfernt |
| 9a2b464 | Security: API Error Sanitizer - verhindert Leaking von Stack-Traces (37 kritische Routen) |
| 5e8ff5a | docs: Löschkonzept erstellt — DSGVO-konformes Datenaufbewahrungskonzept |
| 311d3a0 | API Error Sanitizer: 166 weitere Routen migriert (gesamt 202/217) |
| aa280e6 | Error Boundaries pro Route-Segment: SharedErrorContent + 10 error.tsx |
| 6de1254 | P1 Security: MFA/TOTP für Admin-Konten — Einrichtung, Prüfung, AAL2-Guards, 15 Tests |
| 193076e | Structured Logging (lib/logger.ts, 12 Tests) + DSFA Alltagsengel (Selbstbewertung §45b) |
| 0e0a1aa | Monitoring: Health-Endpoint, Metrics-Buffer, Admin-Dashboard, Uptime-GitHub-Action, 6 Tests |
