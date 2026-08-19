# MASTER FINAL RELEASE AUDIT

**Datum:** 19.08.2026
**Ersteller:** Claude (Konsolidierung von 11 Einzelberichten desselben Tages)
**Repositories:** `alltagsengel` (Supabase `nnwyktkqibdjxgimjyuq`) · `chairmatch` (Supabase `pwdbjqfpgumyfktbfswg`)
**Letzter Commit Alltagsengel:** `e8d1a84`
**Letzter Commit ChairMatch:** `fac3eb9`

---

## Vorbemerkung — was dieses Dokument ist und was nicht

Dieses Dokument fasst zusammen, was in den Einzelberichten vom 19.08.2026 **belegt** ist. Es
enthält keine Zahl, die nicht in einem dieser Berichte steht oder in dieser Sitzung selbst
gemessen wurde.

Zwei Messungen stammen aus dieser Sitzung und sind damit die frischesten Werte im Dokument:

* `node scripts/verify-security-fixes-2026-08-19.mjs` → **1 von 7 Prüfungen bestanden**
  (Live-Lauf gegen `nnwyktkqibdjxgimjyuq`, 19.08.2026)
* `npx vitest run` → **3 279 Tests grün / 0 rot / 38 übersprungen**, `npx tsc --noEmit` → **Exit 0**
  (nach dem Budget-Cap-Fix aus dieser Sitzung)

**Die wichtigste Einschränkung vorweg:** Für Alltagsengel warten **drei** Security-Migrationen und
für ChairMatch **zwei** RLS-Migrationen auf eine manuelle Anwendung im Supabase-SQL-Editor. Alles,
was diese Migrationen schließen, ist in Production **weiterhin offen** — unabhängig davon, dass
der zugehörige Code deployed ist. Ein Track mit nicht angewendeter Migration steht deshalb in
diesem Dokument auf **TEILWEISE**, nie auf FERTIG.

---

## 1 · Gesamtstatus-Tabelle — 8 Tracks

| # | Track | Status | Commit | Zusammenfassung |
|---|-------|--------|--------|-----------------|
| **1** | **Kernbetrieb** (§ 45a/§ 45b Hessen) | **TEILWEISE** | `e8d1a84` | Technisch tragfähig: TS 0 Fehler, Build 579 Seiten, 3 279 Tests grün, RLS auf 298 Live-Tabellen mit 872 Policies, 345/385 API-Routen mit Guard. Der Budget-Cap (131 €/Monat) fehlte im Rechnungsweg und ist **in dieser Sitzung geschlossen**. Betrieb bleibt gesperrt durch den fehlenden § 45a-Bescheid (extern). |
| **2** | **Elektronische Kassenabrechnung (EDIFACT, § 105 SGB XI)** | **TEILWEISE** | `6922dc9` | Verarbeitungskette vollständig: PLGA/PLAA, Validator, Auftragsdatei, SECON, Rückläufer-Import. 4 inhaltliche Fehler behoben, davon 2 abweisungsrelevant. 200 Formattests. Übertragung durch 4 externe Blocker gesperrt (ITSG, SFTP, Kassenverträge, Testübertragung). |
| **3** | **DiPA / PflegeCoach** | **TEILWEISE** | Track-3 / `73c9ccc` | 34 von 48 Katalogpunkten erfüllt (Quote 71 %). Von den 14 offenen sind **0 intern durch Programmieren lösbar** — 3 GF-Entscheidung, 5 regulatorisch extern, 6 vertraglich extern. Ein BfArM-Antrag ist derzeit **nicht einreichbar** (3 Eingangsblocker). Betrieb läuft als kostenloses Angebot, `COACH_DIPA_MODUS=false`. |
| **4** | **SGB V / § 302 (häusliche Krankenpflege)** | **TEILWEISE** | `ae2ecf8` | Pipeline gebaut, Generator **absichtlich fail-closed gesperrt** (`SgbVSpecFehltError`), weil die Technische Anlage 1 nicht vorliegt. 4 Lücken geschlossen, durch die die Sperren teilweise wirkungslos waren. 7 externe Blocker. Nie mit echten Daten gelaufen (`sgb_v_laeufe` live leer). |
| **5** | **KIM / Telematikinfrastruktur** | **TEILWEISE** | `ae2ecf8` | Kein TI-Zugang und keiner wird vorgetäuscht. Behoben: simulierte Zustellungen waren in der DB **nicht von echten unterscheidbar** — jetzt `metadata`-Marker + Simulator-Sperre bei `KIM_AKTIV`. 5 externe Blocker. `kim_messages` live leer. |
| **6** | **ChairMatch** | **OFFEN** | `fac3eb9` | **P0 live offen:** 50 Benutzerprofile inkl. aller E-Mail-Adressen, `role` und `totp_secret` sind ohne Login lesbar. Beide Migrationen (`v1`, `v2`) sind committet und **nicht angewendet** — es existiert kein Schreibpfad zur DB (service_role-Key und DB-Passwort rotiert). |
| **7** | **Security / QA** | **TEILWEISE** | `dfe6de0`, `e8d1a84` | Audit abgeschlossen: 0 kritisch/P0, 1 HOCH, 5 MITTEL, 8 NIEDRIG. Code-Fixes deployed (91 neue Tests). Drei Migrationen (HOCH-1, MITTEL-2, MITTEL-5/NIEDRIG-3/-7) **nicht angewendet** — Live-Gegenprobe meldet **1/7**. |
| **8** | **Externe Voraussetzungen** | **FERTIG (als Checkliste)** | `3b939d0` | ~50 Einzelpunkte in 8 Abschnitten, mit Status, Frist und Zuständigkeit. Der Kritische Pfad ist benannt: 4 offene Punkte mit Frist **31.08.2026**. Die Checkliste selbst ist vollständig; die darin gelisteten Aufgaben sind es nicht. |

### Zusammenfassung in einem Satz je Spalte

* **Technisch fertig:** 6 von 8 Tracks (1, 2, 3, 4, 5, 7) — jeweils mit dem Vorbehalt, dass „fertig" den nicht angewendeten DB-Teil ausnimmt.
* **Live wirksam:** Track 8 (Dokument) und die reinen Code-Fixes aus Track 7. Alles andere wartet auf Externe.
* **Akut gefährlich:** genau ein Punkt — der ChairMatch-`profiles`-Leak (Track 6).

---

## 2 · Security-Übersicht

### 2.1 Befundstand Alltagsengel

Ausgangs-Audit (`docs/SECURITY_QA_AUDIT_2026-08-19.md`): **kein P0, kein kritischer Befund**, kein
unauthentifiziertes Leseleck auf personenbezogene Daten, keine hardcodierten Secrets.

| ID | Schwere | Befund | Code-Fix | Live wirksam |
|---|---|---|---|---|
| **HOCH-1** | 🔴 hoch | 82 von 298 Tabellen ohne `organization_id`; bei 52 ist die einzige Admin-Policy ein org-blindes `is_admin()` | ✅ Migration `20260922020000` + Klassifizierung aller 82 Tabellen, 27 PGlite-Tests grün | ❌ **NEIN** — SQL-Editor nötig |
| **MITTEL-1** | 🟠 | `getActiveOrgId()` war fail-open (Stamm-Org bei fehlender Mitgliedschaft *und* bei jeder Exception) | ✅ 3 getrennte Funktionen, 6 zusätzlich gefundene Fail-open-Stellen geschlossen, 30 Tests | ✅ **JA** (reiner Code-Fix) |
| **MITTEL-2** | 🟠 | Analytics ohne Mandantenbezug — aktiver Schema-Drift (`42703`), Besucherdaten aller Mandanten gingen an ein LLM | ✅ Migration `20260922010000` + Org-Filter in `ai-chat`/`track`/`visitor-alert` | ❌ **NEIN** — Fence fehlt live |
| **MITTEL-3** | 🟠 | Pflegenotizen aus dem Browser direkt in `care_notes`, ohne Audit-Eintrag | ✅ Server Action `createCareNoteAction` mit `logAuditEvent`, 15 Tests inkl. Vollscan | ✅ **JA** |
| **MITTEL-4** | 🟠 | Stripe aktiv integriert, fehlte in der Datenschutzerklärung (Art. 13 DSGVO) | ✅ vollständiger Abschnitt ergänzt | ✅ **JA** |
| **MITTEL-5** | 🟠 | `cron_check_ueberfaellige_aufgaben()` für `anon` ausführbar — live per PostgREST als **HTTP 200** bestätigt | ✅ Migration `20260922000000` (REVOKE) | ❌ **NEIN** — heute erneut als HTTP 200 gemessen |
| **NIEDRIG-1** | 🟡 | Admin-Seiten ohne eigenen Server-Guard (RLS + API-Guards tragen) | bewusst offen | — |
| **NIEDRIG-2** | 🟡 | Audit-Abdeckung nicht flächendeckend nachweisbar (255 von 291 Schreibrouten) | bewusst offen — Daueraufgabe | — |
| **NIEDRIG-3** | 🟡 | `page_views`/`visitors`/`visitor_locations` mit `INSERT … WITH CHECK (true)` für `public` | ✅ Route `/api/track/page-view` mit Rate-Limit; Policy-Drop in `20260922010000` | ❌ **NEIN** — heute erneut **HTTP 201** (anon darf schreiben) |
| **NIEDRIG-4** | 🟡 | `.env` bis 2026-04 in der Historie | geprüft: nur öffentliche Werte, kein Handlungsbedarf | — |
| **NIEDRIG-5** | 🟡 | Kein Art.-15-Selbstbedienungs-Export außerhalb PflegeCoach | ✅ `GET /api/user/export`, 13 Quellen, liest nur mit Nutzer-Client | ✅ **JA** |
| **NIEDRIG-6** | 🟡 | Reset-Mail nannte „1 Stunde", der Code erzwingt das nicht | ✅ Text auf belegbare Eigenschaften umgestellt | ✅ **JA** |
| **NIEDRIG-7** | 🟡 | `coach_finde_nutzer_id(text)` für alle Angemeldeten → Mitgliedschafts-Orakel (Art. 9 DSGVO) | ✅ Code auf Service-Role-Client; REVOKE in `20260922000000` | ❌ **NEIN** — REVOKE fehlt live |
| **NIEDRIG-8** | 🟡 | 4 öffentliche Schreibendpunkte ohne Rate-Limit | ✅ Limits ergänzt, `send-reset` zusätzlich pro Ziel-Adresse | ✅ **JA** |

**Bilanz:** 8 von 13 bearbeiteten Befunden sind live geschlossen. **5 hängen an drei Migrationen**,
die nicht angewendet werden konnten.

### 2.2 Warum die Migrationen nicht angewendet sind

Der Repo-Apply-Weg läuft als `service_role`. Diese Rolle hat in diesem Projekt **keine
DDL-Rechte** (`CREATE auf schema public = false`, nicht Mitglied von `postgres`, nicht
Eigentümerin der Tabellen).

Der gefährliche Teil daran, wörtlich aus `docs/SECURITY_FIXES_2026-08-19.md`: **`REVOKE`/`GRANT`
scheitern für einen Nicht-Eigentümer nicht hart**, sondern erzeugen nur eine `WARNING`. Der erste
Apply-Versuch meldete **HTTP 204 = Erfolg**, und der Endpunkt war danach unverändert offen. Es
wurde also Erfolg für eine Sicherheitsmaßnahme gemeldet, die nie stattgefunden hat.

Behoben: `scripts/apply-migration.mjs` bricht jetzt mit Exit 2 ab, wenn die Rolle kein DDL darf.
Neu: `scripts/verify-security-fixes-2026-08-19.mjs` misst den Live-Zustand unabhängig davon, was
ein Apply-Skript behauptet.

Gegenprobe zum naheliegenden Verdacht, frühere REVOKE-Migrationen könnten ebenso still verpufft
sein: die Katalog-Abfrage über **alle** `SECURITY DEFINER`-Funktionen in `public` findet genau
**eine** für `anon` ausführbare Funktion — die aus MITTEL-5. Alle übrigen REVOKEs sind wirksam.

### 2.3 Live-Messung vom 19.08.2026 (diese Sitzung)

```
MITTEL-5 — cron_check_ueberfaellige_aufgaben() gegen anon .......... HTTP 200  → OFFEN
MITTEL-2 — organization_id auf 7 Analytics-Tabellen ................ fehlt bei 7/7 → OFFEN
HOCH-1  — organization_id auf 18 org_fence-Tabellen ................ fehlt bei 18/18 → OFFEN
NIEDRIG-3 — anon-INSERT auf page_views / visitors / visitor_locations  HTTP 201 → OFFEN
Dauerkontrolle SECDEF-Funktionen ................................... ✓ bestanden

1/7 Pruefungen bestanden
```

Die drei Probe-Zeilen, die dabei entstanden, wurden vom Skript unmittelbar wieder gelöscht
(DELETE 204 je Zeile).

---

## 3 · EXTERNAL_BLOCKER — was Yusuf oder Dritte erledigen müssen

### 3.1 Zeitkritisch — Frist 31.08.2026

Der § 45a-Anerkennungsantrag (Aktenzeichen **51.D24.12**, Jugend- und Sozialamt Frankfurt,
Sachbearbeiterin Frau Krause) hat eine Nachreichungsfrist zum **31.08.2026**. Ohne
Anerkennungsbescheid gibt es keine Kostenerstattung des Entlastungsbetrags.

| Punkt | Zuständig | Anmerkung |
|---|---|---|
| **Gewerbeanmeldung** | GF | Von der Behörde ausdrücklich angefordert (§ 9 Abs. 1 Nr. 3a PfluV). Online über frankfurt.de oder Gewerbeamt, Kleyerstr. 86. Auch für die Google-Business-Verifizierung relevant. |
| **Betriebshaftpflicht-Police** | GF | Ausdrücklich angefordert (§ 1 Abs. 1 Nr. 13 PfluV). Online-Abschluss mit 24-h-Deckungszusage möglich. |
| **12 Unterschriften** | GF + Sabrina Martin | 10× GF, 2× Fachkraft. Vorher 5 Datumsfelder eintragen. Positionen in `EINREICHUNGS-CHECKLISTE.md`. |
| **4 Arbeitsvertrag-Felder** | GF + Sabrina Martin | Beschäftigungsbeginn, Wochenstunden, Bruttovergütung, Urlaubsanspruch (Anlage-04). |
| **Anlagenverzeichnis aktualisieren** | GF | Anschreiben listet 12 von 15+ Anlagen; es fehlen ARGE-IK, Arbeitsvertrag, Einverständnis. |
| **Anbieterform klären** | GF | Antrag läuft als Anbieterform II (gewerblich). Bei Form II wäre **Betreuung ausgeschlossen** — nur Entlastung. Mit Frau Krause klären. **UNVERIFIZIERT.** |

Bereits erledigt: erweitertes Führungszeugnis (Papier-Original), IK-Nummer 460629986,
D-U-N-S 316856461, Handelsregisterauszug HRB 140351, alle Konzept- und Erklärungsanlagen als
Entwurf.

### 3.2 Datenbank-Anwendung (blockiert nur an fehlendem Zugang, nicht an Dritten)

| # | Repo | Migration | Wirkung |
|---|---|---|---|
| 1 | alltagsengel | `20260922000000_revoke_anon_cron_funktionen.sql` | MITTEL-5 + NIEDRIG-7 |
| 2 | alltagsengel | `20260922010000_analytics_org_scope.sql` | MITTEL-2 + NIEDRIG-3 |
| 3 | alltagsengel | `20260922020000_hoch1_mandantentrennung.sql` | HOCH-1 |
| 4 | alltagsengel | `20260922030000_persistenter_api_ratelimit.sql` | I-6 / B-2 — persistenter API-Ratelimit (`api_rate_limits` + `api_rate_limit_hit()`) |
| 5 | chairmatch | `20260819_rls_close_gaps.sql` | 3 (leere) Tabellen |
| 6 | chairmatch | `20260819_rls_close_gaps_v2.sql` | **der P0-Fix** — `profiles`, `reviews`, `promo_codes`, `commission_rates`, `totp_secret` |

Reihenfolge für Alltagsengel: 1 → 2 → 3 → 4, Code-Deploy ist bereits erfolgt (`dfe6de0`).
Nr. 4 ist unabhängig von 1–3 und nicht dringlich: ohne sie fällt `lib/rate-limit-persistent.ts`
auf den bisherigen In-Memory-Limiter zurück (mit einmaliger Warnung im Log), der Zustand ist
also nicht schlechter als vor dem Fix — nur eben noch nicht besser.
Gegenprobe danach: `node scripts/verify-security-fixes-2026-08-19.mjs` muss **7/7** melden.

### 3.3 Kassenabrechnung / EDIFACT (Track 2) — für den Start **nicht erforderlich**

| Blocker | Stelle | Sperrt |
|---|---|---|
| ITSG-Zertifikat (PKCS#12) | ITSG Trust Center | SECON-Verschlüsselung → gesamten § 105-Versand |
| DTA-/SFTP-Zugang | jede Datenannahmestelle einzeln (ITSCare, BITMARCK, T-Systems, DDG, DAVASO, ARZ Emmendingen) | Transportweg |
| Kassenverträge / Vergütungsvereinbarung | Landesverbände der Pflegekassen Hessen | Tarifverifizierung. Die 35 €/h-Tarife bleiben `blocked` — sie liegen über den PfluV-Obergrenzen (30 € Betreuung, 25 € Hauswirtschaft) |
| Testübertragung mit Indikator `0` | jeweilige Annahmestelle | Umschaltung auf Echtbetrieb |

### 3.4 SGB V / § 302 (Track 4) — anderes Geschäftsmodell, für den Start nicht erforderlich

7 Blocker, Reihenfolge **EB-2 → EB-3 → EB-1**: Zulassung § 132a SGB V (Landesverbände) →
§ 37-Vergütungsvereinbarung → Technische Anlage 1 zur § 302-Vereinbarung (GKV-Spitzenverband).
Dazu: Datenannahmestellen-Verzeichnis (`sgb_v_routing` ist live **leer** und wird nicht geraten),
§ 302-Fehlerverzeichnis, ITSG-Zertifikat, ggf. separate IK-Nummer.

### 3.5 KIM / TI (Track 5) — für § 45a nicht erforderlich

5 Blocker in fester Reihenfolge: gematik-Zulassung → KIM-Provider-Vertrag → Konnektor-Anbindung
und SMC-B/eHBA → Technische Anlage 5. Erst danach eine echte `IKimProvider`-Implementierung, eine
belegte Testnachricht und zuletzt `KIM_AKTIV=true`.

### 3.6 DiPA (Track 3) — für den Start nicht erforderlich

Siehe Abschnitt 6.

### 3.7 Sonstiges ohne Frist

* SEPA-Gläubiger-ID bei der Bundesbank (kostenfrei). Der aktuelle Wert `DE98ZZZ09999999999` ist ein Platzhalter; die Software erkennt ihn und sperrt den Lastschrifteinzug.
* Google-Business-Profil: Video-Verifizierung offen (Fall 1-0324000041805).
* Steuerberater: DATEV-Berater-/Mandantennummer, Kleinunternehmerstatus § 19 UStG.
* Muster-Kundenvertrag — **UNVERIFIZIERT**, ob vorhanden.

---

## 4 · Intern noch lösbar — was ohne Dritte gemacht werden kann

### 4.1 In dieser Sitzung erledigt

| Punkt | Ergebnis |
|---|---|
| **Budget-Cap im Rechnungsweg (Befund A-1)** | ✅ **Geschlossen.** `lib/billing/core/budget-cap.ts` + Verdrahtung in `createInvoiceDraft()`. 44 neue Tests. Details in Abschnitt 7. |

### 4.2 Offen, aber intern lösbar

| # | Punkt | Quelle | Aufwand |
|---|---|---|---|
| **I-1** | **§ 36 SGB XI (Pflegesachleistung) ist ungedeckelt.** Der neue Budget-Cap begrenzt § 45b und § 42a; für `haeusliche_pflege_36` sind in `lib/config/budget-constants.ts` **keine gesetzlichen Sätze hinterlegt** (der Anspruch ist pflegegradabhängig). Es wurde bewusst kein Betrag erfunden. Die Lücke ist als `UNGEDECKELTE_TOEPFE.sachleistung_36` im Code benannt und getestet. | diese Sitzung | mittel — Sätze je Pflegegrad recherchieren und versioniert eintragen, vor dem ersten Sachleistungsvertrag |
| **I-2** | ✅ **GESCHLOSSEN (Folge-Sitzung 19.08.2026).** `logAuthEvent` nimmt nur noch `action` (Whitelist) und `device` (feste Liste) entgegen; `user_id`/`user_email`/`user_name` kommen aus der Session, `user_agent` aus dem Request-Header, `status` ist serverseitig fix. Caller `app/mis/analytics/page.tsx` angepasst. 8 Tests in `__tests__/security/mis-analytics-audit-identitaet.test.ts` (inkl. Unterschieb-Versuch). ~~**A-2 — `/mis/analytics` schreibt fremdbestimmte Identitäten ins Audit-Log.** `app/mis/analytics/actions.ts` übernimmt `user_id`, `user_email`, `user_name`, `status` unverändert aus dem Client-Body. Die Schwesterfunktion `app/mis/actions.ts:logMISAuthEvent` macht es richtig.~~ | Re-Check A-2 | klein — dem bestehenden Muster folgen |
| **I-3** | ✅ **GESCHLOSSEN (Folge-Sitzung 19.08.2026).** Zentrales Muster `logAuditEventOrWarn()` (fail-soft, aber `await`-et und meldet „AUDIT-LUECKE" auf `console.error`) und `logAuditEventOrThrow()` in `lib/audit-log.ts`. Alle 141 Fundstellen in 55 Dateien umgestellt; die übrigen `logAuditEvent`-Aufrufe sind jetzt durchgängig `await`-et. Regressionstest scannt `app/` und `lib/`. 9 Tests in `__tests__/security/audit-log-luecken.test.ts`. ~~**A-3 — 139× `logAuditEvent(...).catch(() => {})`.** Fällt der Audit-Insert aus, läuft die Geschäftsoperation weiter und niemand erfährt, dass die Spur fehlt. Positiv-Gegenbeispiel im selben Repo: `app/api/einsatzplanung/route.ts` protokolliert den Fehlschlag.~~ | Re-Check A-3 | mittel — mechanisch, aber 139 Stellen; für § 630f BGB / Art. 30 DSGVO relevant |
| **I-4** | ✅ **GESCHLOSSEN (Folge-Sitzung 19.08.2026).** `.catch(() => {})` entfernt, Fehler wird ausgewertet, der Nutzer wird bei Fehlschlag mit `ok: false` gemeldet und **vor** `auth.admin.deleteUser` abgebrochen (sonst wären die Dokumente verwaist). Kommentar korrigiert. 6 Tests in `__tests__/security/hard-delete-und-lint-gate.test.ts`; der Alt-Test `__tests__/cleanup-documents-table.test.ts`, der das `.catch` noch **forderte**, wurde umgedreht. ~~**A-4 — DSGVO-Hard-Delete verschluckt das Löschen der Dokumente.** `supabase/functions/account-hard-delete/index.ts:126` fängt den Fehler ab, gestützt auf den überholten Kommentar „documents-Tabelle existiert derzeit nicht in Produktion". Sie existiert. Der Hard-Delete meldet trotzdem Erfolg.~~ | Re-Check A-4 | klein |
| **I-5** | ✅ **GESCHLOSSEN (Folge-Sitzung 19.08.2026).** `.next-old/**` und `.claude/worktrees/**` in `globalIgnores`. Gemessen: **66 109 → 2 374 Probleme** (2 017 Fehler). Der Lauf ist damit wieder als Gate brauchbar — rot ist er weiterhin, siehe I-12. ~~**B-1 — ESLint lintet 880 MB Build-Artefakte.** `.next-old/**` (349 MB) und `.claude/worktrees/**` (531 MB) fehlen in `globalIgnores`. Von 66 109 gemeldeten Problemen stammen ~63 800 aus minifiziertem Fremdcode; der reale App-Wert ist 2 338. Der Lint-Lauf ist als CI-Gate wertlos.~~ | Re-Check B-1 | klein — zwei Pfade eintragen |
| **I-6** | ✅ **CODE FERTIG, Migration wartet auf Apply (Folge-Sitzung 19.08.2026).** Neu: `public.api_rate_limits` + SECDEF-RPC `api_rate_limit_hit()` (Migration `20260922030000`, mit Rollback) und `lib/rate-limit-persistent.ts`. `visitor-alert` nutzt ihn für Aufrufer-IP **und** Cooldown; die `Map` im Modul-Scope ist weg. Ohne eingespielte Migration Fallback auf den bisherigen In-Memory-Limiter mit einmaliger Warnung — bewusst nicht fail-closed, sonst wäre die Route bis zum Apply tot. 16 PGlite-Tests + 11 TS-Tests. ~~**B-2 — `visitor-alert` hat nur einen In-Memory-Ratelimit.** Unauthentifiziert, `createAdminClient()`, schreibt `visitor_locations`, legt Notifications an, versendet Mail. Die 1-h-IP-Sperre gilt auf Serverless pro Instanz. Schaden bleibt auf Rauschen begrenzt (fester Empfänger, HTML-escaped), als Dauerlösung reicht es nicht.~~ | Re-Check B-2 | mittel — Persistenz-Ratelimit |
| **I-7** | ✅ **GESCHLOSSEN (Folge-Sitzung 19.08.2026).** Neue Server Action `app/onboarding/actions.ts`: validiert Pflegegrad (1–5) und PLZ (5 Ziffern), schreibt `care_recipients` **und** zieht die Führungsspalte `clients.care_level` mit, protokolliert den Abschluss. Legt bewusst keinen Klienten an (Bürovorgang). 20 Tests in `__tests__/security/onboarding-server-action.test.ts`. ~~**B-3 — `OnboardingFlow.tsx` schreibt `pflegegrad` direkt aus dem Browser** (Zeilen 107/120/128), an der `care_level`-Führung und am Server-Sync vorbei.~~ | Re-Check B-3 | klein |
| **I-8** | **B-4 — 62 lokal nachgebaute Guard-Funktionen in `app/`**, obwohl `lib/*/api-auth.ts` bereits 29 zentrale `require*`-Helfer bietet. Kein akuter Fehler, aber die wahrscheinlichste Ursache des nächsten Auth-Befunds. | Re-Check B-4 | mittel |
| **I-9** | **Screenreader-Durchgang (AK-BF-03)** ist intern leistbar — eine Person, ein Termin, VoiceOver oder NVDA. Protokollvorlage steht. Formal GF-Entscheidung, faktisch kein externer Akteur nötig. | DiPA-Bericht | klein |
| **I-10** | **Zusammenführung der beiden KIM-Pfade A und B.** Pfad A hat Adapter-Register und Kartenverwaltung, Pfad B den funktionierenden Nachrichtenbetrieb. Umbau an fremden Kernmodulen, für den letzten Durchlauf ausgeschlossen. | Track 5 | groß |
| **I-11** | **Referenzdaten-Schreibschutz.** `billing_*`, `kf_pricing_*`, `bundeslaender` sind mandantenübergreifend beschreibbar. Heute unkritisch (nur `is_admin()`/`service_role`, nur eine produktive Org). Vor dem ersten Fremdmandanten zu entscheiden — Empfehlung: nur `superadmin`. | Security-Fixes, Punkt 5 | mittel |
| **I-12** | **`npm run lint` ist rot** (nach dem B-1-Fix vom 19.08.2026: 2 017 Fehler in 2 374 Problemen; davor 9 717 in 66 126) und war es schon vor dieser Arbeitsphase. Eine ESLint-/Config-Aktualisierung hat bestehende Warnungen zu Fehlern hochgestuft. Die neu angelegten Dateien sind lint-sauber. | Security-Fixes, Punkt 2 | groß — eigene Aufgabe |

### 4.3 Bewusst nicht lösbar, weil eine Entscheidung fehlt

* `nutzer_in_aktiver_org()` gibt `true` zurück, wenn ein Nutzer **überhaupt keine** Org-Bindung hat.
  Ohne diesen Zweig wären frisch registrierte Nutzer für jeden Admin unsichtbar. Folge:
  bindungslose Nutzer sind bis zur ersten Zuordnung für Admins aller Mandanten sichtbar. Der Test
  hält das ausdrücklich fest.
* PflegeCoach-Belegkontext (`coach_bestellungen`, `coach_zahlungen`, `coach_rechnungen`,
  `coach_freischaltungen`) braucht eine Mandantenzuordnung, sobald mehr als ein Mandant PflegeCoach
  verkauft — als eigener Beleg-Kontext, nicht als Spalte an den Gesundheitsdaten. **Produktentscheidung.**

---

## 5 · ChairMatch — Sonderabschnitt

**Supabase-Projekt: `pwdbjqfpgumyfktbfswg`** (nicht Alltagsengel!) · Repo `/Users/work/chairmatch`

### 5.1 Der P0 — offen, jetzt gerade

Gemessen mit dem öffentlichen Anon-Key, ohne jeden Login — exakt die Sicht eines beliebigen
Angreifers. Reproduzierbar mit `./scripts/rls-anon-probe.sh`, 64 Tabellen geprüft.

| Tabelle | Zeilen für `anon` | Was offen liegt |
|---|---|---|
| **`profiles`** | **50** | `email` (50/50 gesetzt), `full_name`, `role`, `totp_secret`, `stripe_customer_id`, `referral_balance_cents`, `password_must_change` |
| `reviews` | 48 | `customer_id`, `reviewer_id`, `reviewee_user_id`, `comment` — **alle 48 mit `moderation_status != 'approved'`** |
| `promo_codes` | 3 | `code`, `discount`, `max_uses`, `used_count` |
| `commission_rates` | 5 | `rate_percent`, `min_rate_percent`, `max_rate_percent` |

Drei Punkte machen `profiles` zum schwersten Befund des gesamten Audits:

1. **50 E-Mail-Adressen ohne Authentifizierung abrufbar** → Art. 32/33 DSGVO, bei Ausnutzung meldepflichtig.
2. **Rollenverteilung enumerierbar** (`kunde: 45, super_admin: 3, admin: 1, anbieter: 1`) → die vier Admin-Konten sind gezielt auffindbar und phishbar.
3. **`totp_secret` ist öffentlich lesbar.** Heute sind alle Werte `NULL` (`totp_enabled = true`: 0 Nutzer). Die Lücke ist **latent**: sobald der erste Nutzer 2FA aktiviert, ist sein TOTP-Seed weltweit lesbar und die 2FA wertlos.

Der Anon-Key steht naturgemäß im ausgelieferten JS-Bundle. Jeder kann das reproduzieren.

### 5.2 Migrationsstand

| Migration | Committet | **Angewendet** |
|---|---|---|
| `20260819_rls_close_gaps.sql` (v1) | ✅ in `0bb4f1b` auf `main` | ❌ **NEIN** |
| `20260819_rls_close_gaps_v2.sql` (enthält den P0-Fix) | ✅ | ❌ **NEIN** |

v1 allein reicht nicht: sie deckt genau die drei Tabellen ab, die aktuell **leer** sind
(`protect_pricing`, `compliance_plans`, `conversation_participants`), und keine der vier, aus denen
tatsächlich Daten abfließen. Deshalb wurde v2 ergänzt.

**Es existiert kein Schreibpfad zur Datenbank.** Getestet und einzeln belegt:

| Credential | Ergebnis |
|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ **gültig** (genau deshalb war der Leak messbar) |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ ungültig (rotiert) |
| `DATABASE_URL` / `DIRECT_URL` | ❌ ungültig (`password authentication failed for user "prisma_app"`) |
| Supabase CLI / Vercel CLI / Supabase MCP | ❌ nicht eingeloggt bzw. nicht verfügbar |

Es wurde **nichts blind ausgeführt.**

### 5.3 Was Yusuf für ChairMatch tun muss

**Schnellster Weg, ohne jedes Credential:** die beiden Migrationen im SQL-Editor ausführen —
https://supabase.com/dashboard/project/pwdbjqfpgumyfktbfswg/sql/new — erst v1, dann **v2** (der
P0-Fix). Danach `./scripts/rls-anon-probe.sh`; erwartet: `Tabellen mit anon-lesbaren Daten: 0`
außer den gewollten Katalogtabellen.

Alternativ (dauerhaft nützlicher): `SUPABASE_SERVICE_ROLE_KEY` aus dem Dashboard in
`/Users/work/chairmatch/.env.local` eintragen — die Variable fehlt dort komplett und steht nur
veraltet in `.env.prod`.

### 5.4 Ist ChairMatch-Production betroffen?

**Der Leak ja, die Anwendung sehr wahrscheinlich nicht.** `src/app/page.tsx` lädt über
`getSupabaseAdmin()` (service_role), und Commit `0bb4f1b` hat den stillen Anon-Fallback entfernt —
ohne gültigen Key würde die Funktion werfen. `https://www.chairmatch.de/` liefert HTTP 200 und
rendert 15 Salon-Karten. Nur die **lokalen** Key-Kopien sind veraltet.
*(Restunsicherheit: die Seite könnte aus dem ISR-Cache stammen.)*

### 5.5 Weitere offene ChairMatch-Risiken

1. **Schreibzugriff ungetestet.** Die anon-Schreibprobe wurde vom Safety-Classifier blockiert. Bei Tabellen ohne RLS ist anon-Schreibzugriff der Default — es ist von einer offenen Schreiblücke auszugehen, bis das Gegenteil gemessen ist. Manipulierbar wären u. a. `app_settings` (Branding der ganzen Seite), `promo_codes`, `commission_rates`.
2. **Repo/Live-Drift.** `is_admin_or_super` existiert live, aber in **keiner** Repo-Migration. Jede weitere Migration ist ohne vorherigen Schema-Abgleich ein Blindflug.
3. **Keine Preview/Prod-Trennung.** Alle Env-Dateien zeigen auf dasselbe Projekt — Preview-Deployments schreiben in die Produktivdatenbank.
4. **Cross-User-Tests nicht möglich** (bräuchte zwei Testkonten; Kontoanlage nicht erlaubt).

---

## 6 · DiPA / PflegeCoach — die 14 Punkte

**Keine Zulassungsaussage.** Eine Aufnahme in das Verzeichnis für digitale Pflegeanwendungen liegt
**nicht** vor. Keine Pflegekasse zahlt für dieses Produkt, keine Vergütung ist vereinbart. Der
PflegeCoach ist dauerhaft kostenlos für Endnutzer. `COACH_DIPA_MODUS=false`.

```
Anforderungen gesamt:   48
erfüllt:                34
in Arbeit:               6  ┐
offen:                   8  ┘ = die 14 Punkte
belastbare Quote:       71 %
```

| Kategorie | Bedeutung | Punkte |
|---|---|---|
| **A** | Intern technisch lösbar | **0** |
| **B** | GF-Entscheidung | **3** — AK-VS-02 (Support-Zusage), AK-DS-02 (DSFA zeichnen), AK-BF-03 (Screenreader-Termin) |
| **C** | Externer regulatorischer Blocker | **5** — AK-SEC-01, AK-SEC-04, AK-SEC-05, AK-REG-04, AK-REG-05 |
| **D** | Externer Vertrags-/Provider-Blocker | **6** — AK-DS-04, AK-BF-02, AK-QI-01, AK-QI-02, AK-NN-01, AK-VS-04 |

**Kategorie A ist leer, und das ist ein Ergebnis, keine Ausrede.** Was übrig ist, sind Zertifikate,
Unterschriften, Fachprüfungen und Entscheidungen. Ein Punkt, der als „erfüllt" gemeldet würde, weil
Code dazu existiert, wäre eine Falschaussage gegenüber dem BfArM.

Gebaut wurde trotzdem der *interne technische Rest* — Vorrichtungen, die die Erfüllung nachweisbar
machen und die Zwischenzeit ehrlich halten. Sie bewegen die Quote bewusst nicht (34/48 vorher wie
nachher):

* `lib/coach/support.ts` — Register für die Antwortzusage. `SUPPORT_ZUSAGE = null` heißt: die Oberfläche zeigt **gar keine Frist**. Ein Test durchsucht die gesamte Coach-Oberfläche nach Fristzusagen, die am Register vorbeigehen. 13 Tests. *(Anlass: auf `/pflegecoach/anfrage` stand „in der Regel innerhalb von zwei Werktagen" — unvereinbar mit der 24-Stunden-Frist, weil „Werktage" Wochenenden ausnehmen. Der Satz ist entfernt.)*
* `lib/coach/inhalte-freigabe.ts` — eine Freigabe braucht Prüferrolle, pflegefachliche Qualifikation, Prüfdatum, Protokollverweis und einen **Inhaltsstempel** der geprüften Fassung. Ändert sich der Text, fällt der Inhalt automatisch auf `entwurf` zurück. 12 Tests. *(Der Stempel hat keinen kryptografischen Anspruch — er schützt gegen das Versehen, nicht gegen Manipulation.)*
* EDIFACT-Dateiindikator: Default von `'2'` (Echtdatei) auf `'0'` (Testdatei) — siehe Abschnitt 8.

### Was den Antrag heute blockiert

Von den 14 Punkten liegen **11 in Zeitklasse A** — sie müssen bei Antragstellung vorliegen und sind
nach DiPAV § 15 Satz 2 **nicht eigeninitiativ nachreichbar**.

Drei davon sind **Eingangsblocker**:

1. **AK-SEC-01** — BSI TR-03161-Zertifikat (seit 01.07.2025 ist der Erklärungsweg geschlossen)
2. **AK-SEC-05** — ISMS-Zertifikat (ISO 27001, DAkkS-akkreditiert)
3. **AK-NN-01** — Evaluationskonzept mit Studienpartner und Ethikvotum

**Ein BfArM-Antrag ist derzeit nicht einreichbar.** Das ändert nichts am Betrieb.

### Zwei Punkte, die günstiger sind als sie aussehen

* **AK-SEC-04** (externer Pentest) ist **in AK-SEC-01 enthalten** — BfArM-Leitfaden v1.3 Kap. 3.4.2: durch die TR-03161-Zertifizierung entfällt der zusätzliche Pen-Test. Nicht separat beauftragen.
* **AK-REG-05** (BfArM-Beratungstermin) ist **nicht verpflichtend, hat aber die höchste Hebelwirkung im Katalog**: klärt TR-03161-Scope, die C5-Frage, den Vergütungsanteil, AK-INT-02 und AK-QI-02 in einem Zug. Kostet nichts. Fragen 1–20 sind vorbereitet.

### Die offene Risikofrage vor jeder Beauftragung

Weder Supabase noch Vercel besitzen ein **BSI-C5-Testat**. Beide haben SOC 2 Type II und ISO 27001.
Ob das als „vergleichbares Testat" i. S. v. O.Org_2 genügt, ist **ungeklärt** — SOC 2 ist nach
C5GleichwV **nicht** gleichwertig, und ab 01.07.2027 gilt nur noch C5 Typ 2. Supabase läuft auf AWS
Frankfurt (AWS hat C5), aber das AWS-Testat deckt Supabase als darauf aufbauenden Dienst nicht
automatisch ab. Diese Frage gehört **vor** die Beauftragung, nicht danach.

Ebenso hart: **Standardvertragsklauseln (Art. 46 DSGVO) sind für DiPA unzulässig** (DiPAV § 5
Abs. 4). Eine AVV-Kette mit SCC-Drittstaatstransfer ist nicht heilbar — der Dienstleister muss
ersetzt werden. Auch das ist vor der Auswahl zu prüfen.

### Empfohlene Reihenfolge

1. BfArM-Beratungstermin anfragen (kostenlos, klärt mehrere teure Beauftragungen)
2. Studienpartner + Ethikvotum anstoßen (längster Vorlauf im Katalog)
3. DSFA zeichnen (eine Unterschrift)
4. Support-Entscheidung treffen (Umsetzung danach automatisch)
5. AVV-Kette auf SCC prüfen und zeichnen (ein SCC-Fund erzwingt einen Dienstleisterwechsel)
6. Pflegefachkraft für die Inhaltsfreigabe gewinnen (keine Zertifizierungsstelle nötig)
7. ISMS + TR-03161 **gemeinsam** beauftragen — ein Vorgang, nicht drei
8. Testpersonen für die summative Runde (5+)
9. Screenreader-Durchgang terminieren

---

## 7 · Der Budget-Cap — in dieser Sitzung geschlossen

### Der Befund

`create_invoice_draft_atomic()` enthält **null** Referenzen auf `client_budgets`. Die Aufteilung
lautete schlicht: alles, was nicht `private` ist, wird Kassenanteil. Eine Rechnung über 400 € gegen
§ 45b für **einen Monat** entstand anstandslos als Kassenforderung.

`pruefeBudget()` existiert und ist gut gebaut — sitzt aber nur im **Planungs**pfad, ist dort per
`force_override` übersteuerbar und rechnet ausschließlich **jahresbasiert**. Der monatliche
Anspruch aus § 45b wurde nirgends durchgesetzt: `client_budgets.monthly_amount` wurde im gesamten
Code nur gelesen und angezeigt.

### Der Fix

Neu: `lib/billing/core/budget-cap.ts`, verdrahtet in `createInvoiceDraft()`.

* **Die Budgetlage wird VOR der RPC gelesen** — Anspruch, Übertrag und bereits fakturierter
  Verbrauch. Ist sie nicht ermittelbar, wird geworfen, **bevor** eine Rechnung existiert, deren
  Aufteilung niemand belegen kann.
* **Nach der RPC** wird der Kassenanteil auf den verfügbaren Anspruch gedeckelt; der Überschuss
  wandert nach `private_amount`. `total_amount` bleibt unverändert. **Es wird nicht blockiert** —
  die Leistung wurde erbracht, nur der Kostenträger ändert sich.
* **Monatlich, nicht nur jährlich:** § 45b entsteht mit 131 € je Kalendermonat und ist erst danach
  übertragbar. Der Deckel ist deshalb kumuliert (131 € × Monatsindex + Übertrag) **zusätzlich** zum
  Jahresdeckel von 1 572 €; der jeweils engere greift. Wer im Januar 1 572 € abrechnen wollte,
  bekommt jetzt 131 € Kassenanteil und 1 441 € Privatanteil.
* **§ 42a** (VP/KZP) kennt seit 01.07.2025 einen flexiblen Jahresbetrag von **3 539 €** ohne
  Monatsstaffelung und ohne Übertrag — dort greift nur der Jahresdeckel.
* Jede Deckelung schreibt einen `budget_capped`-Eintrag in `billing_audit_trail` mit Vorher-/
  Nachher-Beträgen, greifendem Deckel, Anspruchsquelle und Verbrauch, sowie eine Klartextnotiz an
  die Rechnung.

**Warum der Verbrauch aus `invoice_items` kommt und nicht aus `client_budgets.used_amount`:**
`used_amount` wird per Trigger aus `service_records` fortgeschrieben — also aus Leistungen, die zum
Zeitpunkt der Rechnung bereits gezählt sind. Als Vorher-Wert würde es die gerade abzurechnenden
Leistungen doppelt zählen.

**Was der Fix bewusst NICHT tut:** § 36 SGB XI (`haeusliche_pflege_36`) wird **nicht** gedeckelt.
Der Anspruch ist pflegegradabhängig und es sind keine Sätze hinterlegt — einen Betrag zu erfinden
wäre schlimmer als kein Deckel, weil er geprüft aussähe. Die Lücke ist als
`UNGEDECKELTE_TOEPFE.sachleistung_36` im Code hinterlegt, im Test festgehalten und in Abschnitt 4.2
als **I-1** gelistet.

**Der Deckel sitzt in TypeScript, nicht in der RPC.** Das ist eine Folge der fehlenden DDL-Rechte
(Abschnitt 2.2): eine Migration wäre eine vierte, die auf den SQL-Editor wartet, und bis dahin
wirkungslos. Der TS-Deckel ist mit dem Deploy wirksam. Er ist so gebaut, dass eine spätere
DB-seitige Deckelung ihn nicht doppelt anwendet (die Aufteilung wird jedes Mal aus dem Ist-Zustand
neu bestimmt, nicht inkrementell fortgeschrieben).

**Tests:** `__tests__/billing/budget-cap.test.ts` — 44 Fälle. Volle Suite danach:
**3 279 grün / 0 rot**, `tsc --noEmit` Exit 0.

---

## 8 · Simulationscheck — erscheint eine Simulation als echte Produktivfunktion?

An fünf Stellen kann dieses System etwas tun, das wie Produktivbetrieb aussieht, ohne es zu sein.
Geprüft wurde nicht, ob es Sicherungen *gibt*, sondern ob sie an **jedem** Weg liegen, der zum
Ergebnis führt.

| # | Punkt | Ergebnis |
|---|---|---|
| 1 | EDIFACT-Testlieferung (Dateiindikator, Verfahrenskennung) | **VERIFIZIERT** — ein Befund behoben |
| 2 | KIM simulierte Zustellung (`metadata.kim_simulation`) | **VERIFIZIERT** |
| 3 | § 302 SGB V — Stopp bei fehlenden verifizierten Tarifen | **VERIFIZIERT** |
| 4 | DAKOTA/DTA — keine vorgetäuschte Verbindung | **VERIFIZIERT** |
| 5 | ITSG — kein Fake-Zertifikat | **VERIFIZIERT** |

Der behobene Befund (1.4): `generateEDIFACT()` und `UNB()` setzten ohne ausdrückliche Angabe den
Dateiindikator `'2'` — **Echtdatei**. Der einzige Produktivaufrufer setzt den Wert immer korrekt;
der Default griff nur im Vergessensfall, und dann wäre die Vergesslichkeit zur Forderung gegen eine
Kasse geworden. Jetzt `'0'`. Das ist die gefährlichste Sorte Befund: er hätte nicht heute
geschadet, sondern in dem Moment, in dem das Gate aufgeht.

Regressionswächter: `__tests__/simulationscheck.test.ts` (21 Prüfungen, alle grün).

---

## 9 · DIE 10 ENDPUNKT-FRAGEN

### 1. Ist Alltagsengel intern technisch fertig?

**NEIN.**

Die Grundlage ist gut: 0 TypeScript-Fehler, grüner Build mit 579 Seiten, 3 279 grüne Tests, RLS auf
allen 298 Live-Tabellen mit 872 Policies, kein Secret im Code, kein echter Migration-Drift, 345 von
385 API-Routen mit Guard. Die geprüften Geschäftsflüsse (Kundenanlage, Mitarbeiteranlage,
Einsatzplanung, Leistungsnachweis, Rechnung, Engel-Portal) sind durchweg mit Org-Fence,
Rollenprüfung und Audit-Log gebaut.

Was dagegen spricht, „fertig" zu sagen:

* **Drei Security-Migrationen sind nicht angewendet.** HOCH-1, MITTEL-2, MITTEL-5, NIEDRIG-3 und
  NIEDRIG-7 gelten in Production unverändert weiter. Heute gemessen: **1/7**.
* **Vier substanzielle Code-Befunde sind offen** (A-2, A-3, A-4 sowie § 36 ungedeckelt) — alle
  intern lösbar, keiner geschlossen.
* **`npm run lint` ist rot** und als CI-Gate wertlos.

Der eine Befund, der Geld gekostet hätte — der fehlende Budget-Cap — ist geschlossen.

### 2. Ist Alltagsengel für reale Kunden technisch einsetzbar?

**JA — technisch. Rechtlich noch nicht.**

Technisch trägt die Kette: Kunde anlegen → Einsatz planen (mit Freigabe- und Budgetprüfung) →
Leistung erfassen → Unterschrift → Rechnung (tarifbasiert, unterschriftspflichtig, jetzt
budgetgedeckelt) → Zahlung → OPOS/Mahnwesen. Die Anlage-Wege für Kunden und Mitarbeiter
funktionieren samt UI.

Drei Vorbehalte, die keine Software löst:

1. **Ohne § 45a-Anerkennungsbescheid** gibt es keine Kostenerstattung des Entlastungsbetrags. Der
   Bescheid steht aus; die Nachreichungsfrist läuft am **31.08.2026** ab.
2. **Es sind keine verifizierten Privat-Tarife im System.** Die 35 €/h-Tarife bleiben `blocked` —
   sie liegen über den PfluV-Obergrenzen (30 € Betreuung / 25 € Hauswirtschaft). Der Preis-Resolver
   ist fail-closed: ohne verifizierten Tarif entsteht keine Rechnung.
3. **Mindestens eine Betreuungskraft braucht eine Einsatzfreigabe.** Sabrina Martin ist als Fachkraft
   vorhanden, die Freigabe ist nach Prüfung zu erteilen.

Der tragfähige Weg für den ersten Umsatz ist die **Privatrechnung gegen Kostenerstattung** — dafür
sind weder EDIFACT noch Kassenverträge noch SEPA nötig.

### 3. Gibt es intern noch lösbare kritische Punkte?

**JA — vier, aber keiner davon ist „kritisch" im Sinne eines P0.**

| Punkt | Warum es zählt |
|---|---|
| **I-1 · § 36 SGB XI ungedeckelt** | Der Budget-Cap deckt § 45b und § 42a. Pflegesachleistung läuft ungedeckelt durch. Relevant erst mit dem ersten Sachleistungsvertrag — aber dann sofort. |
| ~~I-2 · A-2, fremdbestimmte Audit-Identitäten~~ ✅ | Erledigt in der Folge-Sitzung 19.08.2026. War: jeder eingeloggte Nutzer konnte Audit-Zeilen unter fremdem Namen erzeugen. |
| ~~I-3 · A-3, 139 verschluckte Audit-Fehler~~ ✅ | Erledigt in der Folge-Sitzung 19.08.2026 (`logAuditEventOrWarn`, 141 Stellen). |
| ~~I-4 · A-4, Hard-Delete verschluckt Dokument-Löschung~~ ✅ | Erledigt in der Folge-Sitzung 19.08.2026. Der Hard-Delete bricht jetzt ab, statt Erfolg zu melden. |

Alles Weitere aus Abschnitt 4.2 ist Härtung, nicht kritisch.

### 4. Ist ChairMatch RLS live geschlossen?

**NEIN.**

Beide Migrationen sind committet und **nicht angewendet**. Es existiert kein Schreibpfad zur
Datenbank: service_role-Key rotiert, DB-Passwort rotiert, kein CLI-Login, kein MCP.

Live offen, heute gemessen: **50 Benutzerprofile** inklusive aller E-Mail-Adressen, der
Rollenverteilung (4 Admin-Konten gezielt auffindbar) und `totp_secret` — abrufbar mit dem
öffentlichen Anon-Key, ohne Login. Dazu 48 unmoderierte Reviews, 3 Rabattcodes, 5 Provisionssätze.

Der Schreibpfad wurde **nicht getestet** (vom Safety-Classifier blockiert). Bei Tabellen ohne RLS
ist anon-Schreibzugriff der Default — es ist von einer offenen Schreiblücke auszugehen, bis das
Gegenteil gemessen ist.

### 5. Gibt es noch HIGH Security Findings?

**JA — einen: HOCH-1, live unverändert offen.**

82 von 298 Tabellen haben keine `organization_id`; bei 52 ist die einzige Admin-Policy ein
org-blindes `is_admin()`. Betroffen sind unter anderem `profiles`, `messages`, `krankenfahrten`,
`angels`, `mis_privacy_*` und `audit_logs` — also auch die DSGVO-Anfragen und Einwilligungen
fremder Mandanten sowie die Sicherheitsprotokolle.

**Stand:** Die Migration `20260922020000` ist geschrieben, klassifiziert alle 82 Tabellen einzeln
(24 Referenz, 8 technisch, 7 Analytics, 16 Coach, 18 org_fence, 9 verengte Admin-Policy) und ist
mit 27 PGlite-Tests auf einer echten PostgreSQL-Instanz bewiesen — inklusive Vorher-Nachweis, dass
der Befund reproduzierbar ist. **Angewendet ist sie nicht.** Heute gemessen: bei allen 18
Zieltabellen fehlt die Spalte.

**Einordnung des realen Risikos:** Heute begrenzt, weil produktiv praktisch nur die
Stamm-Organisation genutzt wird. Mit dem ersten echten Fremdmandanten ist es ein Blocker.

Wenn man ChairMatch mitzählt, ist der `profiles`-Leak dort schwerer als HOCH-1 hier — er ist kein
strukturelles Risiko, sondern aktiver Datenabfluss.

### 6. Gibt es noch MEDIUM Security Findings?

**JA — zwei von fünf sind live offen.**

| ID | Stand |
|---|---|
| MITTEL-1 · `getActiveOrgId()` fail-open | ✅ **geschlossen** (Code-Fix, live) |
| **MITTEL-2 · Analytics ohne Mandantenbezug** | ⛔ **offen** — Spalte fehlt bei allen 7 Tabellen. Zwischenzeitliches Verhalten ist fail-closed (leere Aggregation statt fremder Daten), aber die Admin-Analytics ist damit still kaputt. |
| MITTEL-3 · Pflegenotizen ohne Audit | ✅ **geschlossen** |
| MITTEL-4 · Stripe fehlt in Datenschutzerklärung | ✅ **geschlossen** |
| **MITTEL-5 · Cron-RPC für `anon` ausführbar** | ⛔ **offen** — heute erneut als HTTP 200 gemessen. Ein Unbeteiligter kann ohne Anmeldung Statuswechsel auf `ops_aufgaben` samt Eskalations- und Workflow-Triggern auslösen. Kein Datenabfluss, aber ein schreibender Pfad von außen. |

Dazu offen aus der NIEDRIG-Klasse: NIEDRIG-3 (anon-INSERT auf drei Tracking-Tabellen, heute als
HTTP 201 gemessen) und NIEDRIG-7 (Mitgliedschafts-Orakel im PflegeCoach, Art. 9 DSGVO).

**Alle vier hängen an denselben drei Migrationen.**

### 7. Welche DiPA-Punkte sind intern noch lösbar?

**Zum Schließen: keiner.** Kategorie A ist leer — von den 14 Punkten lässt sich keiner durch
Programmieren erfüllen. Was übrig ist, sind Zertifikate, Unterschriften, Fachprüfungen und
Entscheidungen.

**Intern *leistbar* ohne externen Akteur sind drei Punkte** — sie brauchen eine Person und einen
Termin, keinen Dienstleister:

| Punkt | Was intern reicht |
|---|---|
| **AK-BF-03 · Screenreader-Durchgang** | Eine Person, ein Termin, VoiceOver oder NVDA. Der maschinelle Teil läuft bereits (`e2e/pflegecoach-axe.spec.ts`, S1–S3). S4–S8 sind maschinell nicht entscheidbar. Protokollvorlage steht. |
| **AK-DS-02 · DSFA** | Inhaltlich fertig (`audit/dipa/dsfa_pflegecoach.md`). **Keine externe Stelle vorgeschrieben** — die DSFA führt der Verantwortliche selbst durch. Es fehlt die Unterschrift. |
| **AK-VS-02 · Support-Zusage** | Eine Entscheidung, eingetragen als `SUPPORT_ZUSAGE` in `lib/coach/support.ts`. Danach erzeugt die Oberfläche den Fristsatz von allein. |

**Fast intern:** **AK-QI-01** (Inhaltsfreigabe) braucht eine pflegefachlich qualifizierte Person —
es ist **keine Zertifizierungsstelle vorgeschrieben** (Anlage 2 ist ein Selbsterklärungsfragebogen,
DiPAV § 6 Abs. 11). Das kann eine Fachkraft aus dem eigenen Netz sein. Das Register steht bereit,
die 10 Inhalte stehen auf `entwurf`.

Die technische Vorarbeit zu diesen Punkten ist gebaut und getestet — sie macht die offenen Punkte
belastbar statt behauptbar, bewegt die Quote aber bewusst nicht.

### 8. Was fehlt ausschließlich extern?

Punkte, an denen intern nichts mehr zu tun ist:

**Regulatorisch / Behörde**
* § 45a-Anerkennungsbescheid Hessen (Jugend- und Sozialamt Frankfurt) — **wartet, nach Einreichung**
* BSI TR-03161-Zertifikat (ISO/IEC 17065-akkreditierte Prüfstelle) — DiPA-Eingangsblocker
* ISO-27001-Zertifikat, DAkkS-akkreditiert — DiPA-Eingangsblocker
* Ethikvotum + Studienpartner für das Evaluationskonzept — DiPA-Eingangsblocker, längster Vorlauf
* BfArM-Beratungstermin (freiwillig, höchste Hebelwirkung)
* Klärung der C5-Frage für Supabase/Vercel

**Verträge / Provider**
* ITSG-Zertifikat (PKCS#12) — sperrt den gesamten § 105-Versand
* SFTP-/DTA-Zugänge je Datenannahmestelle (6 Stellen einzeln)
* Kassenverträge + Vergütungsvereinbarung Hessen — ohne belegten Vertragspreis bleibt jeder Kassentarif `unverified` bzw. `blocked`
* Testübertragung mit Dateiindikator `0` je Annahmestelle
* Zulassung § 132a SGB V, § 37-Vergütungsvereinbarung, Technische Anlage 1 (§ 302)
* gematik-Zulassung, KIM-Provider-Vertrag, Konnektor, SMC-B/eHBA, Technische Anlage 5
* AVV-Kette für alle Dienstleister — **mit Prüfung auf SCC-Drittstaatstransfer** (für DiPA unzulässig)
* Kanzlei-Prüfung der Selbstzahler-Nutzungsbedingungen (zurückgestellt)
* 5+ repräsentative Testpersonen für die summative Gebrauchstauglichkeits-Runde

**Nicht auslesbar, nur im Dashboard prüfbar**
* Supabase-Einstellungen: Link-Ablaufzeit, MFA-Policy, JWT-Laufzeit
* Google-Cloud-Beschränkung des Firebase-Client-Keys auf Paketname + SHA-1 (`android/app/google-services.json` — **kein Leak**, aber einmalig zu verifizieren)

### 9. Was muss Yusuf persönlich als Geschäftsführer erledigen?

**Diese Woche — Frist 31.08.2026**

1. **Gewerbeanmeldung** (frankfurt.de online oder Gewerbeamt Kleyerstr. 86) — doppelt dringend, auch für Google Business
2. **Betriebshaftpflicht** abschließen (24-h-Deckungszusage online möglich)
3. **Arbeitsvertrag-Felder** mit Sabrina Martin klären (Beginn, Stunden, Gehalt, Urlaub)
4. **Anschreiben-Anlagenverzeichnis** aktualisieren (3 fehlende Anlagen)
5. **Termin mit Sabrina Martin** für die 12 Unterschriften
6. **Gesamtpaket einreichen** — per Post an Hansaallee 150, 60320 Frankfurt **und** per E-Mail an entlastungsangebote45@stadt-frankfurt.de. Führungszeugnis und Erhebungsbogen als **Papier-Original**.

**Sofort, unabhängig von der Frist — Sicherheit**

7. **ChairMatch-Migrationen im SQL-Editor ausführen** (erst v1, dann **v2** — der P0-Fix):
   https://supabase.com/dashboard/project/pwdbjqfpgumyfktbfswg/sql/new
   Danach `./scripts/rls-anon-probe.sh`. *Solange das nicht passiert, sind 50 E-Mail-Adressen und
   4 Admin-Konten öffentlich abrufbar.*
8. **Alltagsengel-Migrationen im SQL-Editor ausführen** (Reihenfolge 1 → 2 → 3):
   https://supabase.com/dashboard/project/nnwyktkqibdjxgimjyuq/sql/new
   Danach `node scripts/verify-security-fixes-2026-08-19.mjs` → muss **7/7** melden.
9. Optional, dauerhaft nützlicher: `SUPABASE_SERVICE_ROLE_KEY` für ChairMatch aus dem Dashboard in
   `/Users/work/chairmatch/.env.local` eintragen — die Variable fehlt dort komplett.

**Entscheidungen (kein Zeitdruck, aber sie blockieren Folgeschritte)**

10. **DSFA zeichnen** — lesen, unterschreiben, Datum und Unterzeichnenden eintragen
11. **Support-Zusage festlegen** — Kanäle, Wochenend-/Feiertagsabdeckung, Vertretung, fachliche Verantwortung
12. **Screenreader-Termin** benennen (Person + Datum)
13. **Pflegefachkraft für die Inhaltsfreigabe** benennen
14. **Anbieterform mit Frau Krause klären** — bei Form II wäre Betreuung ausgeschlossen
15. **Privat-Tarife festlegen** (max. 30 € Betreuung / 25 € Hauswirtschaft) und im Admin-UI verifizieren
16. **Einsatzfreigabe** für mindestens eine Betreuungskraft erteilen

**Parallel, ohne Eile**

17. SEPA-Gläubiger-ID bei der Bundesbank (kostenfrei)
18. Steuerberater: DATEV-Nummern, Kleinunternehmerstatus § 19 UStG
19. Google-Business-Video-Verifizierung abschließen
20. BfArM-Beratungstermin anfragen (kostenlos, höchste Hebelwirkung im DiPA-Katalog)

### 10. Was kann Claude technisch noch selbst erledigen?

**Sofort umsetzbar, ohne jede externe Voraussetzung:**

| # | Aufgabe | Aufwand |
|---|---|---|
| ~~1~~ ✅ | ~~**A-2 fixen**~~ — erledigt 19.08.2026 | klein |
| ~~2~~ ✅ | ~~**A-4 fixen**~~ — erledigt 19.08.2026 | klein |
| ~~3~~ ✅ | ~~**B-1 fixen**~~ — erledigt 19.08.2026, 66 109 → 2 374 Probleme | klein |
| ~~4~~ ✅ | ~~**B-3 fixen**~~ — erledigt 19.08.2026 (`app/onboarding/actions.ts`) | klein |
| ~~5~~ ✅ | ~~**A-3 angehen**~~ — erledigt 19.08.2026 (141 Stellen auf `logAuditEventOrWarn`). Ein zentraler Zähler/Alarm auf die „AUDIT-LUECKE"-Meldungen fehlt weiterhin. | mittel |
| ~~6~~ ✅ | ~~**I-6**~~ — Code erledigt 19.08.2026; Migration `20260922030000` wartet auf den SQL-Editor | mittel |
| 7 | **I-8** — die 62 lokalen Guard-Kopien auf `lib/*/api-auth.ts` konsolidieren | mittel |
| 8 | **I-11** — Referenzdaten-Schreibschutz als Migration vorbereiten (`superadmin`-only) | mittel |
| 9 | **I-12** — Lint-Bestand aufräumen | groß |
| 10 | **I-10** — die beiden KIM-Pfade zusammenführen | groß |

**Vorbereitbar, aber erst nach einer Entscheidung wirksam:**

| # | Aufgabe | Wartet auf |
|---|---|---|
| 11 | **I-1** — § 36-Deckel nachrüsten | die pflegegradabhängigen Sätze; ich trage keinen Betrag ein, den ich nicht belegen kann |
| 12 | Privat-Tarife eintragen und verifizieren | GF-Preisentscheidung |
| 13 | `SUPPORT_ZUSAGE` eintragen | GF-Entscheidung (danach automatisch) |
| 14 | `INHALTE_FREIGABEN` befüllen | Prüfprotokoll der Pflegefachkraft |

**Was ich ausdrücklich NICHT kann:**

* **Keine DB-Migration anwenden** — weder bei Alltagsengel (`service_role` hat kein DDL) noch bei
  ChairMatch (alle Schreib-Credentials rotiert). Das ist der Grund, warum 5 Sicherheitsbefunde
  offen sind, obwohl der Code fertig ist.
* **Keine Credentials beschaffen oder rotieren.**
* **Keinen authentifizierten Cross-Tenant-Test gegen Production** — dafür bräuchte es zwei
  Testkonten; Kontoanlage würde Produktivdaten verunreinigen.
* **Keine Preise erfinden** — weder PfluV-Tarife noch § 36-Sätze noch eine DiPA-Vergütung.
* **Keine Zulassungs- oder Zertifizierungsaussage treffen.**

---

## 10 · Verifizierungsstatus dieses Dokuments

| Aussage | Grundlage |
|---|---|
| 3 279 Tests grün, tsc Exit 0 | **in dieser Sitzung gemessen** |
| 1/7 Security-Prüfungen bestanden | **in dieser Sitzung gemessen** (Live gegen `nnwyktkqibdjxgimjyuq`) |
| Build 579 Seiten, RLS 298 Tabellen / 872 Policies | `ALLTAGSENGEL_RECHECK_2026-08-19.md` |
| ChairMatch: 50 Profile, 48 Reviews, 4 Admin-Konten | `CHAIRMATCH_RLS_FINAL_STATUS.md` (Live-Messung mit Anon-Key) |
| DiPA 34/48, 0 intern lösbar | `DIPA_14_PUNKTE_ANALYSE_2026-08-19.md` (`npm run dipa:katalog`) |
| Entlastungsbetrag 131 €/Monat, 1 572 €/Jahr | PUEG ab 01.01.2025 — im Code versioniert hinterlegt |
| VP/KZP 3 539 €/Jahr | § 42a SGB XI ab 01.07.2025 |
| Preisobergrenzen 30 € / 25 € | § 1 Abs. 1 Nr. 12 PfluV |
| Frist 31.08.2026 | Rückmeldung Frau Krause, wörtlich im Schreiben |
| Anbieterform II | **UNVERIFIZIERT** — Klärung mit der Behörde nötig |
| Kosten Gewerbeanmeldung / Haftpflicht | **UNVERIFIZIERT** |
| Bearbeitungszeit Anerkennungsbescheid | **UNVERIFIZIERT** |
| ChairMatch anon-Schreibzugriff | **UNGETESTET** — Probe vom Safety-Classifier blockiert |
| SGB V / KIM gegen echte Gegenstellen | **NIE GELAUFEN** — `sgb_v_laeufe`, `kim_messages` live leer |

---

## 11 · Fazit

Die Software ist weiter, als der Betrieb es ist. Der Kernbetrieb trägt die Kette vom Kunden bis zur
Zahlung, die Sicherungen gegen vorgetäuschten Produktivbetrieb liegen an jedem geprüften Weg, und
die eine Lücke, die Geld gekostet hätte — der fehlende Budgetdeckel im Rechnungsweg — ist
geschlossen.

Was den Start blockiert, ist ausnahmslos extern: ein Bescheid, eine Police, eine Gewerbeanmeldung,
zwölf Unterschriften. Frist: **31.08.2026**.

Was unabhängig davon **heute** erledigt gehört, sind fünf Migrationen im SQL-Editor. Zwei davon
schließen einen aktiven Datenabfluss bei ChairMatch — 50 E-Mail-Adressen und vier
Administrator-Konten sind in diesem Moment ohne Login abrufbar. Das ist der einzige Punkt in diesem
Dokument, der nicht warten sollte.
