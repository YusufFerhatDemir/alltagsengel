# MASTER-ABSCHLUSSBERICHT 24.08.2026 / 20:00

## Phase 5 — Delta-Check beider Repos, GO/NO-GO

Vorgänger: Abschlussbericht Phase 4.5 (24.08.2026 / 14:00, Commit `58931d2`).

**Belegstufen in diesem Bericht.** `IMPLEMENTIERT` = Code liegt im Repo.
`GETESTET` = automatisierter Test läuft grün. `CI-GRÜN` = GitHub-Actions-Lauf
auf genau diesem Commit ist `success`. `DEPLOYED` = Commit ist auf `main`
gepusht. `LIVE_VERIFIZIERT` = gegen die Produktions-Datenbank oder die
Live-API gemessen. `EXTERN_BLOCKIERT` = nur Yusuf kann es lösen.

---

## 1. Ausgangsstand (Phase 4.5, 24.08. / 14:00)

- Alltagsengel `45f7364`, ChairMatch `6776def`.
- 4 Migrationen Alltagsengel + 3 ChairMatch live eingespielt.
- Alltagsengel: vitest 4498, `test:unit` 794. ChairMatch: 487 Tests, **kein CI-Workflow**.
- Offen: 28 kritische Module ohne Tests (P1), CAMT nie produktiv gelaufen (P1),
  `tsconfig` schloss `hooks/**` aus (P2), 58 Env-Variablen ohne Validierung (P2).
- Extern blockiert: `RECHNUNGSVERSAND_AUTOMATISCH`, `MAHNVERSAND_AUTOMATISCH`
  (Vercel), `CRON_SECRET` (GitHub Repo Secrets).

---

## 2. Was seit dem letzten Bericht geändert wurde

### Alltagsengel — 4 Commits

| Commit | Inhalt |
|---|---|
| `6013ba0` | P0-Blocker, zentrale ENV-Validierung (`lib/env/`, 746 Z. Register, 265 Z. Prüfung), `instrumentation.ts`-Hook, `docs/ENV_KONFIGURATION.md`, `tsconfig`-Ausschluss von `hooks/**` entfernt |
| `6049fd7` | Security-Delta: Cron-Bearer fail-closed + Konstantzeit (`lib/api/cron-auth.ts`, 9 Aufrufstellen), Pfad-Traversal im DTA-Rückläufer-Upload, DATEV-CSV-Escaping, CAMT-Größenriegel |
| `78e94b1` | Befundbericht `docs/SECURITY_DELTA_PHASE5_2026-08-24.md` |
| `2c834cc` | CAMT-Produktionsreife (Dublettensperre App + Migration), Mahnversand-Route, Audit, Matching-Engine, Rücklastschrift; 3 neue PGlite-E2E-Suiten (1981 Z.) |

Damit sind **zwei der vier offenen Punkte aus Phase 4.5 geschlossen**:
`tsconfig`/`hooks` (P2) und die fehlende Env-Validierung (P2).

### ChairMatch — 2 Commits

| Commit | Inhalt |
|---|---|
| `30622cd` | **CI-Workflow neu angelegt** (`.github/workflows/ci.yml`), Preis-/Compliance-Schema-Analyse (`docs/PREIS_SCHEMA.md`, Migration + Seed-Template), Legacy-Cleanup (`index.html`, `supabase.min.js` entfernt), `/admin/pricing` meldet die Schema-Lücke ehrlich |
| `1706c5d` | `actions/checkout` + `setup-node` auf v5 (Node-20-Deprecation) |

Der Satz aus dem 14:00-Bericht — „ChairMatch hat keinen Test-Workflow" — gilt
nicht mehr. Die 487 Tests laufen jetzt in CI.

---

## 3. Alltagsengel — Status

| Nachweis | Ergebnis |
|---|---|
| **CODE** | HEAD `2c834cc`, Arbeitsbaum sauber (0 uncommitted) |
| Typecheck | `npx tsc --noEmit` → **Exit 0, 0 Fehler** |
| **TEST** vitest | **4827 passed / 38 skipped** (233 Dateien passed, 1 skipped) — Exit 0 |
| **TEST** node:test | `npm run test:unit` → **800/800**, 10 Suiten, 0 fail — Exit 0 |
| lint:forbidden | 24471 Dateien (FULL), **0 verbotene Strings** — Exit 0 |
| **CI** | Lauf `32720738035` auf `2c834cc` = **success** (6m49s) |
| **LIVE** | `GET alltagsengel.care/api/health` → **HTTP 200**, `"version":"2c834cc"` = HEAD; 5/5 Checks `pass` (app, database, profiles, bookings, organizations) |

Die beiden CI-Läufe davor (`6049fd7`, `78e94b1`) stehen auf `cancelled` — sie
wurden vom jeweils nächsten Push abgelöst, nicht durch einen Fehler beendet.

### Live-Sicherheitslage (gegen Produktion gemessen)

| Prüfpunkt | Wert |
|---|---|
| RLS auf `public`-Tabellen | **308/308** aktiv |
| anon-Schreibrechte | **0** (INSERT/UPDATE/DELETE/TRUNCATE) |
| `org_fence`-Policies | **244**, davon **244 RESTRICTIVE** |
| Policies mit `FROM profiles`-Subquery in `public` | 1 |

### Live-Datenbestand

`organizations` 6 · `clients` 4 · `bookings` 10 · `service_records` 30 ·
`invoices` 3 · `payments` 0 · `zahlungseingaenge` 0 · `camt_imports` 0 ·
`notification_delivery_log` 0 · `invoice_email_log` 0.

Das ist der entscheidende Zahlenblock: **die Geldpfade sind gebaut und
getestet, aber leer.** Kein Zahlungseingang, kein CAMT-Import, keine
protokollierte Zustellung.

---

## 4. ChairMatch — Status

| Nachweis | Ergebnis |
|---|---|
| **CODE** | HEAD `1706c5d`; `STATUS.md` modifiziert (siehe Abschnitt 7) |
| Typecheck | `npx tsc --noEmit` → **Exit 0, 0 Fehler** |
| **TEST** | vitest **487/487** (20 Dateien) — Exit 0 |
| **CI** | `32717373786` (`1706c5d`) und `32717268679` (`30622cd`) = **success**; `pages-build-deployment` ebenfalls grün |
| **LIVE** | `https://www.chairmatch.de/` → **HTTP 200**; Apex `chairmatch.de` → **308** (Redirect auf www, erwartet) |
| **LIVE Schema** | `./scripts/schema-probe.sh` → **Exit 0**, „Live-Schema deckt sich mit `src/test/live-schema.ts`" (22 Relationen) |

---

## 5. Mac-Speicher

Gemessen am Ende dieser Phase:

```
/                        228Gi   12Gi used   31Gi avail   28%
/System/Volumes/Data     228Gi  168Gi used   31Gi avail   85%
Container Free Space:    33,3 GB
```

**Ehrlichkeitsvermerk:** In dieser Session wurde **keine Vorher-Messung**
vorgenommen. Die im Auftrag genannte Spanne „30 → 32 GB" kann daher nicht aus
eigener Messung bestätigt werden. Belegt ist nur der Endstand: **33,3 GB frei**.

---

## 6. Migrationen

Geprüft wurde der **Delta-Umfang** — die in Phase 5 hinzugekommene Migration
sowie die vier aus Phase 4.5, die der 14:00-Bericht als live meldete. Ein
Vollabgleich aller 356 Migrationsdateien gegen Produktion war nicht Teil
dieses Laufs und wird hier auch nicht behauptet.

### Alltagsengel — live nachgeprüft

| Migration | Live-Beleg | Status |
|---|---|---|
| `20261001000000_mahnqueue_retry_dead_letter` | `dunning_email_queue` trägt `versuche`, `letzter_versuch_am`, `naechster_versuch_ab`; Status-CHECK enthält `aufgegeben`; beide Indexe vorhanden | **LIVE** |
| `20261001010000_vpkzp_mandantenpaarung` | Trigger `trg_vpkzp_mandantenpaarung` vorhanden | **LIVE** |
| `20261002000000_least_privilege_delta_phase4` | anon-Schreibrechte = 0 | **LIVE** |
| `20261002000002_billing_landesregeln_mandantenzaun` | Policy `org_fence_billing_landesregeln` vorhanden | **LIVE** |
| **`20261003000000_camt_buchungsdublette`** | Index `uq_zahlungseingaenge_org_buchungshash` **existiert nicht** | **PENDING** |

### ChairMatch — live nachgeprüft

| Migration | Live-Beleg | Status |
|---|---|---|
| `20260525_analytics_events` | `analytics_events` → HTTP 200 | **LIVE** |
| `20260824_newsletter_schema_repair` | `newsletter_campaigns` → HTTP 200 | **LIVE** |
| `20260824_schema_drift_repair` | `visit_logs` → HTTP 401 (existiert, RLS greift) | **LIVE** |
| **`20260824_pricing_schema`** | `protect_pricing.risk_level` / `.day_price_cents` / `.active` und `compliance_plans.plan_type` / `.price_cents` → **42703, Spalte fehlt** | **PENDING** |

`supabase/migrations/_OFFEN_2026-08-24.sql` ist **veraltet** — die drei darin
gebündelten Migrationen sind inzwischen live. Die Datei suggeriert offene
Arbeit, wo keine mehr ist.

---

## 7. Commits & Arbeitsbaum

**Alltagsengel Phase 5:** `6013ba0`, `6049fd7`, `78e94b1`, `2c834cc` — plus der
Bericht dieses Laufs.
Arbeitsbaum: **sauber**, 0 uncommitted Dateien.

**ChairMatch Phase 5:** `30622cd`, `1706c5d`.
Arbeitsbaum: **`STATUS.md` modifiziert.** Diese Datei wird von
`scripts/status.sh` bei jedem `./deploy.sh` neu geschrieben und trägt im Kopf
den Hinweis „Nicht manuell editieren". Der Diff besteht ausschließlich aus
Zeitstempel und HEAD-Zeile des letzten Deploys. **Gehört keinem anderen Task
und wurde nicht committet** — beim nächsten ChairMatch-Deploy schreibt das
Skript sie ohnehin neu.

---

## 8. Tests

| Suite | Phase 4.5 | Phase 5 | Delta |
|---|---|---|---|
| Alltagsengel vitest | 4498 | **4827** | +329 |
| Alltagsengel `test:unit` (node:test) | 794 | **800** | +6 |
| ChairMatch vitest | 487 | **487** | ±0 |
| **Summe grün** | 5779 | **6114** | **+335** |

Rot: **0**. Skipped: 38 (vitest Alltagsengel) + 1 Testdatei.

Neu in Phase 5: Env-Register- und Env-Prüfungstests, `cron-auth`-Tests,
DATEV-Format-Tests (mit dokumentierter Gegenprobe gegen den alten Code), sowie
drei PGlite-E2E-Suiten — CAMT-Pipeline (961 Z.), Gutschrift/Korrektur/
Mahnleiter (438 Z.), Mahnversand-Route (582 Z.).

---

## 9. CI

| Repo | Workflow | Commit | Ergebnis |
|---|---|---|---|
| Alltagsengel | `CI` | `2c834cc` (HEAD) | **success** |
| Alltagsengel | `Zustellung Retry` | schedule 11:14 | **success** |
| Alltagsengel | `Uptime Monitor` | schedule 11:00 | **success** |
| ChairMatch | `CI` | `1706c5d` (HEAD) | **success** |
| ChairMatch | `pages-build-deployment` | `1706c5d` | **success** |

---

## 10. Live-Verifikation

- **Alltagsengel Health:** HTTP 200, `version` = `2c834cc` = HEAD. Der
  ausgelieferte Stand ist der committete Stand — nicht nur „gepusht", sondern
  nachweislich ausgerollt.
- **ChairMatch:** HTTP 200 auf `www`, sauberer 308 vom Apex.
- **Resend:** `scripts/verify-resend.mjs` → Key gültig (HTTP 200),
  `alltagsengel.care` `status=verified`, Region `eu-west-1`, DKIM/SPF stehen.
- **Produktions-DB Alltagsengel:** 9 Struktur- und 8 Bestandsabfragen über das
  lesende Orakel (jede Abfrage in einem zurückgerollten `DO`-Block).
- **Produktions-DB ChairMatch:** 8 Spaltenproben per PostgREST.

---

## 11. Gefundene echte Bugs (Phase 5)

| Schwere | Befund | Wirkung |
|---|---|---|
| **P1** | Cron-Bearer fail-**open**: `/api/cron/drip` und `/api/cron/indexnow` verglichen ohne Null-Riegel. Ohne gesetztes `CRON_SECRET` lautete der Vergleichswert wörtlich `"Bearer undefined"` | Jeder Fremde konnte beide Cron-Läufe auslösen. Fünf der sieben Routen hatten den Riegel — eine kopierte Prüfung ist gedriftet |
| **P1** | Pfad-Traversal im DTA-Rückläufer-Upload: Storage-Schlüssel aus ungefiltertem Dateinamen | Ein Name mit `../` verlässt die Organisationsablage. Einzige der 10 Upload-Routen ohne Bereinigung |
| **P2** | DATEV-CSV: `escapeText` kürzte **nach** dem Verdoppeln der Anführungszeichen | Ein Paar auf der Grenze 60 wurde zerschnitten; das übrige `"` beendet das Feld und verschiebt die Buchungszeile in falsche Spalten. Auslöser: ein Klientenname aus dem Kundenformular |
| **P2** | DATEV-CSV ohne Formel-Riegel (`= + - @`) | CSV-Injection in `KOST1`, `KOST2`, `belegnummer`, Kopfzeile |
| **P2** | CAMT-Import und DTA-Upload ohne Größenriegel | Datei wurde vollständig in den Serverless-Speicher gezogen, bevor der Bucket sie ablehnen konnte |
| **P2** | `getPublicUrl()` auf privatem Bucket, Ergebnis als `quelldatei_url` persistiert | Beleg-Link, der nie auflöst |
| **P1** | **CAMT-Dublettensperre nur auf Dateiebene.** Banken schneiden Auszüge überlappend (camt.054-Avis, dann camt.053 derselben Periode) — der Dateihash ist dann ein anderer | Jede bereits verbuchte Zahlung wurde ein zweites Mal angelegt, gematcht und einer Rechnung zugeordnet |

### Nebenbefund an den Prüfmitteln

`__tests__/security/anon-schreibpfade.test.ts` kannte als Guard-Muster nur den
Literal-String `CRON_SECRET` und hätte die umgestellten Routen als ungeschützt
gemeldet. Muster nachgezogen. — Das ist die immer gleiche Falle: ein Test, der
auf einen Literal prüft statt auf die Wirkung, bricht beim ersten Refactoring.

---

## 12. Behobene Bugs

Alle sieben Befunde aus Abschnitt 11 sind **IMPLEMENTIERT + GETESTET +
CI-GRÜN + DEPLOYED**.

Zusätzlich **LIVE_VERIFIZIERT**: 30 Anfragen gegen `alltagsengel.care` mit
`Bearer undefined` / `Bearer ` / `Bearer falsch` / ohne Header → **alle 401**.

Der CAMT-Fix hat zwei Hälften: die App-Prüfung ist live, die **DB-Sperre nicht**
(Abschnitt 6). Bei zwei gleichzeitigen Importläufen kann eine Vorab-Abfrage die
Dublette prinzipiell nicht abfangen — dafür ist der UNIQUE-Index da.

---

## 13. Offene P0

**Keine.**

Die drei Anwärter wurden geprüft und abgeräumt: RLS ist auf 308/308 aktiv,
anon-Schreibrechte stehen auf 0, `org_fence` ist auf allen 244 Policies
RESTRICTIVE.

---

## 14. Offene P1

| # | Befund | Wo | Warum offen |
|---|---|---|---|
| P1-1 | **`20261003000000_camt_buchungsdublette` nicht eingespielt** | Supabase-SQL-Editor | Kein DDL-Zugang aus der Session. Bis dahin schützt nur die App-Prüfung — nicht gegen parallele Importläufe |
| P1-2 | **CAMT-Pfad ist in Produktion nie gelaufen** (`camt_imports` = 0, `zahlungseingaenge` = 0) | Produktion | Der erste Echtlauf gehört begleitet. Ein Zahlungsimport, der zum ersten Mal auf echte Bankdaten trifft, ist kein Routinevorgang |
| P1-3 | **Zustellung ist live unbewiesen** (`notification_delivery_log` = 0, `invoice_email_log` = 0) | Produktion | Resend ist nachweislich funktionsfähig, aber es ist noch keine einzige Mail über die protokollierte Kette gegangen |
| P1-4 | 28 kritische Module weiterhin ohne Tests | `lib/` | Bestand aus Phase 4.5, in Phase 5 nicht angegangen |
| P1-5 | **ChairMatch `20260824_pricing_schema` nicht eingespielt** | Supabase-SQL-Editor | `/admin/pricing` kann ohne die Spalten nicht arbeiten; die Seite meldet die Lücke seit `30622cd` ehrlich, statt leere Preise anzuzeigen |

---

## 15. Offene P2 / P3

Aus `docs/SECURITY_DELTA_PHASE5_2026-08-24.md`, **live nachgeprüft**:

| # | Befund | Live-Befund dieses Laufs |
|---|---|---|
| P2-a | 5 Storage-Buckets ohne `file_size_limit` **und** ohne MIME-Allowlist | **bestätigt**: `abrechnung`, `documents`, `mis-documents`, `service-proofs`, `verordnungen`. Zusätzlich `kim-attachments` ohne MIME-Allowlist (mit Größenlimit) |
| P2-b | 3 `dta-dateien`-Storage-Policies per `EXISTS (SELECT 1 FROM profiles …)` statt `is_admin()`, org-blind | **bestätigt**: `Admins can upload/read/delete dta files`. Realer horizontaler Pfad zwischen Admins verschiedener Organisationen |
| P2-c | 7 Tabellen mit `organization_id` ohne `org_fence`-Policy | offen (Tiefenschutz, kein Lesepfad ohne Org-Bedingung gefunden) |
| **P2-d** | *„`state_waitlist` INSERT-Policy ohne `WITH CHECK`"* | **NICHT REPRODUZIERBAR — Befund zurückgenommen.** Die Policy `state_waitlist_insert` trägt live ein vollständiges `WITH CHECK` (E-Mail-Format, `notified_at IS NULL`, `user_id = auth.uid()`, `state_flag(...) = true`) |
| P2-e | Lange signierte URLs (30 Tage Rechnungs-PDF, 7 Tage Leistungsnachweis) | offen — bewusste Abwägung, gehört ins Versandkonzept |
| P2-f | Keine Inhaltsprüfung bei Uploads (MIME wird nur behauptet), keine AV-Anbindung | offen — braucht externe Beschaffung |
| P3-a | `lib/file-upload-validation.ts` hat null Aufrufer | offen — entweder verdrahten oder löschen |
| P3-b | `sanitizeFileName()` in 6 Kopien mit drei verschiedenen Regeln | offen — genau diese Vervielfältigung hat P1-2 verursacht |
| P3-c | ChairMatch `_OFFEN_2026-08-24.sql` ist veraltet | **neu** — Datei zeigt erledigte Arbeit als offen |

P2-d ist die wichtigste Zeile dieses Abschnitts: **ein Befund aus dem
Vorbericht hält der Live-Gegenprobe nicht stand.** Er wird hiermit gestrichen.

---

## 16. Externe Blocker

| Blocker | Ort | Stand |
|---|---|---|
| ~~`CRON_SECRET` fehlt~~ | GitHub Repo Secrets | **GELÖST** — gesetzt am 24.08. um 10:23:35Z. Workflow `Zustellung Retry` läuft seither planmäßig (`success` um 10:45, 10:46, 11:14) |
| `RECHNUNGSVERSAND_AUTOMATISCH` nicht gesetzt | Vercel Projekt-Env | **offen** |
| `MAHNVERSAND_AUTOMATISCH` nicht gesetzt | Vercel Projekt-Env | **offen** |
| `20261003000000_camt_buchungsdublette` | Supabase-SQL-Editor | **offen** |
| ChairMatch `20260824_pricing_schema` | Supabase-SQL-Editor | **offen** |
| ChairMatch Preise (Risikostufen, Beträge) | Geschäftsentscheidung | **offen** — darf nicht aus Anzeigecode geraten werden |
| §45a-Bescheid Hessen, Kassentarife | Behörde / Kassen | **offen** (Bestand) |

Zu den beiden Vercel-Flags: aus dieser Session ist die Vercel-Projekt-Env
**nicht direkt lesbar**. Was messbar ist: `invoice_email_log` und
`notification_delivery_log` stehen live auf 0 — das ist mit „Automatik aus"
vereinbar, aber kein Beweis für den Zustand des Flags. Diese Zeile ist bewusst
als unverifiziert markiert und nicht als bestätigt.

---

## 17. Security

**Ergebnis: keine offene KRITISCH- oder P0-Lücke.**

Bestätigt gegen Produktion — RLS 308/308; anon-Schreibrechte 0; anon liest
331 Relationen, davon 6 bewusst öffentlich und **0 ungewollte Zeilen**;
0 `SECURITY DEFINER`-Funktionen für `anon` ausführbar; `org_fence` 244/244
RESTRICTIVE; 13 Storage-Buckets alle `public: false`; alle 44 service-role-
Fundstellen serverseitig; Webhook-Signaturen fail-closed (Stripe, Coach-Stripe,
WhatsApp mit `timingSafeEqual`).

**Broken Access Control:** horizontal (Mandant A → B) kein Weg gefunden —
**Ausnahme P2-b** (DTA-Storage, org-blind). Vertikal (User → Admin) kein Weg
gefunden. IDOR: geprüfte ID-Routen filtern über `auth.ctx.organizationId`,
nicht allein über die Pfad-ID.

Geschlossen in Phase 5: 2 × P1, 4 × P2 (Abschnitt 11/12).

---

## 18. Resend / Retry

**Resend — LIVE_VERIFIZIERT funktionsfähig, aber ungenutzt.**
Key gültig, Domain `alltagsengel.care` `status=verified`, DKIM/SPF stehen. In
Phase 4.5 wurden 5 Routen mit unkontrolliertem SDK-Aufruf geschlossen; ein
Regressionstest scannt `app/` und `lib/`. Gemessen: `invoice_email_log` = 0.
Der Weg trägt — es geht nur nichts darüber, solange die zwei Vercel-Flags
nicht gesetzt sind.

**Retry — jetzt scharf.**
`dunning_email_queue` trägt live `versuche`, `letzter_versuch_am`,
`naechster_versuch_ab`, den Endzustand `aufgegeben` und beide Retry-Indexe.
Mit dem gesetzten `CRON_SECRET` feuert der Workflow `Zustellung Retry`
tatsächlich — drei erfolgreiche Läufe belegt. Das ist die eigentliche
Verbesserung dieser Phase: der Wiederholungsweg war gebaut, aber bis heute
Vormittag nie gestartet.

---

## 19. CAMT — NOT_READY

**Bewertung: NOT_READY für den unbegleiteten Produktivbetrieb.**

| Kriterium | Stand |
|---|---|
| Parser gehärtet (Rücklastschrift, Sammelbuchung, PDNG, SHA-256-Hash, Fail-Closed statt 0,00 €) | ✅ IMPLEMENTIERT + GETESTET |
| Dublettensperre App-seitig | ✅ DEPLOYED |
| Größenriegel 20 MB | ✅ DEPLOYED |
| E2E-Suite `camt-pipeline-pglite.test.ts` (961 Z., echtes Postgres) | ✅ GETESTET |
| **Dublettensperre DB-seitig (UNIQUE-Index)** | ❌ **PENDING** |
| **Echtlauf in Produktion** | ❌ **nie** (`camt_imports` = 0) |

Die zwei roten Zeilen hängen zusammen: ohne den UNIQUE-Index sind zwei
gleichzeitige Importläufe nicht abgesichert, und ohne einen einzigen Echtlauf
gibt es keinen Beleg, dass ein reales Bankformat den Parser passiert.
`READY` wird daraus, wenn die Migration eingespielt ist **und** ein erster,
begleiteter Import gelaufen ist.

---

## 20. GO / NO-GO

### ALLTAGSENGEL — **CONDITIONAL GO**

| Nachweis | Stand |
|---|---|
| CODE | ✅ Typecheck 0 Fehler, `lint:forbidden` 0 Treffer, Arbeitsbaum sauber |
| TEST | ✅ 5627 Tests grün (4827 vitest + 800 node:test), 0 rot |
| CI | ✅ `success` auf HEAD |
| LIVE | ✅ Health 200, ausgelieferte Version = HEAD, 5/5 Checks pass |

**Bedingungen:**

1. `20261003000000_camt_buchungsdublette` im Supabase-SQL-Editor einspielen —
   **vor** dem ersten CAMT-Import, nicht danach.
2. Erster CAMT-Import **begleitet** fahren; Ergebnis gegen `zahlungseingaenge`
   und `payments` gegenprüfen, bevor der Weg unbeaufsichtigt läuft.
3. `RECHNUNGSVERSAND_AUTOMATISCH` und `MAHNVERSAND_AUTOMATISCH` in Vercel
   bewusst setzen — erst dann geht Post an Kunden raus.
4. P2-b (DTA-Storage-Policies, org-blind) schließen, bevor ein zweiter Mandant
   DTA-Dateien ablegt. Solange nur eine Organisation produktiv arbeitet, ist
   der Pfad theoretisch.
5. Bucket-Limits für die 5 Buckets aus P2-a setzen (20 MB + MIME-Allowlist).

**Kein NO-GO,** weil kein P0 offen ist und der ausgelieferte Stand live
nachweisbar der geprüfte Stand ist. **Kein volles GO,** weil die Geldpfade
zwar getestet, aber in Produktion leer sind — getestet ist nicht gelaufen.

### CHAIRMATCH — **CONDITIONAL GO**

| Nachweis | Stand |
|---|---|
| CODE | ✅ Typecheck 0 Fehler |
| TEST | ✅ 487/487 grün |
| CI | ✅ `success` auf HEAD (Workflow in dieser Phase erstmals angelegt) |
| LIVE | ✅ HTTP 200, Live-Schema deckt sich mit der Testquelle (Exit 0) |

**Bedingungen:**

1. `20260824_pricing_schema.sql` einspielen — bis dahin ist `/admin/pricing`
   funktionsunfähig (die Seite sagt das inzwischen ehrlich).
2. Preise als Geschäftsentscheidung festlegen und über
   `supabase/seed/pricing.seed.template.sql` einspielen. Die Beträge aus
   `20260310` sind Entwurfswerte und gelten **nicht**.
3. `_OFFEN_2026-08-24.sql` aufräumen — sie zeigt erledigte Arbeit als offen.
4. Service-Role-Key bleibt tot (Bestand aus Phase 4.5).

---

## 21. Nächste empfohlene Phase

**Phase 6 — Erstbetrieb der Geldpfade, begleitet.**

Der Befund dieser Phase in einem Satz: *das System ist gebaut, geprüft und
ausgerollt — aber die Pfade, an denen Geld hängt, sind leer.* `payments` = 0,
`camt_imports` = 0, `invoice_email_log` = 0. Weitere Testarbeit an diesen
Modulen bringt jetzt weniger als ein einziger echter Durchlauf.

Reihenfolge:

1. **Zwei Migrationen einspielen** (Alltagsengel CAMT-Index, ChairMatch
   Pricing). Beide sind additiv, idempotent, ohne `DROP`.
2. **Ein echter Rechnungsversand** an einen realen Empfänger, mit
   `invoice_email_log` als Gegenprobe. Danach erst Flag umlegen.
3. **Ein echter CAMT-Import** einer realen Bankdatei, begleitet, mit
   Gegenprüfung von `zahlungseingaenge` und `payments`.
4. **P2-b schließen**, bevor ein zweiter Mandant DTA-Dateien ablegt.
5. **Erst danach** die 28 ungetesteten Module (P1-4) angehen — sie sind der
   größte verbleibende Testschuldenblock, aber sie blockieren keinen Umsatz.

Was in Phase 6 **nicht** getan werden sollte: weitere Härtung an CAMT oder am
Versandweg ohne einen Echtlauf dazwischen. Beide Wege sind inzwischen dreimal
verschärft worden, ohne dass je Produktionsdaten durchgelaufen sind — jede
weitere Runde härtet gegen Annahmen statt gegen Beobachtungen.

---

*Erstellt 24.08.2026, 20:00 — Alltagsengel*
