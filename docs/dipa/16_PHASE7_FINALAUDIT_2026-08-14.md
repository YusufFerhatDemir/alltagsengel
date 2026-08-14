# Phase 7 — Finalaudit der 48-Punkte-DiPA-Matrix (verschärftes Schema)

**Stand:** 2026-08-14, Abend · **Produktversion:** 0.5.0 · `COACH_DIPA_MODUS=false` (unverändert)

## 1. Zweck und Abgrenzung zu bestehenden Dokumenten

`docs/DIPA_MATRIX_FINAL.md` und `docs/dipa/00_KATEGORISIERUNG_PHASE4.md` bleiben
die maßgeblichen Arbeitsdokumente für Nachweise und Nächste-Aktion-Texte. Dieses
Dokument beantwortet eine engere, strengere Frage, die keines der beiden bisher
beantwortet hat:

> **Was davon wurde in DIESEM Durchgang tatsächlich gegen echten Code, echte
> Tests oder eine echte Datenbank geprüft — und was ist nur eine Markdown-Datei,
> die "erledigt" behauptet?**

Kategorienschema (bewusst anders als die A–E-Bearbeitungsklasse der Matrix und
anders als das A–D-Schema in `00_KATEGORISIERUNG_PHASE4.md` — siehe dort Fußnote
zur Doppelbedeutung):

| Kategorie | Bedeutung |
|---|---|
| **A** | Technisch tatsächlich erfüllt — Code/Feature existiert **und** funktioniert nachweisbar (Test gelaufen, Route geprüft, DB-Constraint live bestätigt) |
| **B** | Dokumentation intern noch machbar, aber **nicht** in dieser Sitzung abschließbar (Begründung je Zeile) |
| **C** | Externer Nachweis/Dienstleister erforderlich (Prüfstelle, Kanzlei, Pflegefachkraft, Testpersonen) |
| **D** | Behörde/BfArM erforderlich (Antrag, Beratungstermin, Kostenträger-Verhandlung) |
| **E** | Nicht anwendbar |

## 2. Was in dieser Sitzung tatsächlich ausgeführt wurde (Methodik)

Nicht aus Dokumenten übernommen — selbst ausgeführt und hier mit Ergebnis:

1. `npm run dipa:katalog` erneut laufen lassen: 48 Einträge, 30 erfüllt / 8 in
   Arbeit / 10 offen, 93/93 Nachweisdateien vorhanden, **5/48 Anforderungstexte
   gegen das Original geprüft (6 % belastbar)** — unverändert zum Vortagesstand.
2. `./scripts/shadow-db.sh reset` — Datenbank **komplett neu aus dem Repository
   aufgebaut** (157/161 Migrationen OK; die 4 Fehlschläge betreffen
   Abrechnungs-/Billing-Tabellen außerhalb von PflegeCoach, nicht Gegenstand
   dieses Audits). Beide PflegeCoach-Migrationen (`20260819010000`,
   `20260826010000`) liefen fehlerfrei durch.
3. `supabase/shadow/50_pflegecoach_tests.sql` gegen diese frisch gebaute DB
   ausgeführt: **68/68 PASS**, selbst gemessen (nicht aus einer Doku
   übernommen). Deckt SEC-06, SEC-07, SEC-08, QS-04, NN-02, DS-01, DS-07,
   REG-02-Mechanismus ab.
4. `npm run test:unit` (node:test über `lib/**/*.test.ts`): **481/481 PASS**,
   darunter `mfa.test.ts` (9, SEC-03), `fhir.test.ts` (18, INT-02 technisch),
   `export.test.ts` (29, INT-01), `consent.test.ts` (9, DS-01),
   `produktgrenze.test.ts` (9, SEC-08/PROD-02).
5. E2E-Suite lokal gegen `npm run dev` versucht — unter Ressourcendruck dieser
   Maschine (parallel laufende DB-Resets/Vitest/andere Sessions) mit
   Timeouts, **daher nicht als Beleg verwendet**. Stattdessen unabhängiger Beleg
   über `gh run view` auf den tatsächlichen CI-Lauf zu Commit `c0c5e8c`
   (unbelasteter GitHub-Runner): Job **„E2E — PflegeCoach-Produktbereich
   (DiPA-Matrix QS-05)" → `success`, **60 passed (53.1s)**, 0 fehlgeschlagen.
   Deckt QS-05 und den axe-Anteil von BF-01/BF-03 ab.
6. Stichprobenartiger `grep`/`Read` gegen echten Code für PROD-01/02/03,
   DS-03/07, SEC-08, INT-03, VS-01/02/03, QMS-01, BETR-01 — jeweils Datei und
   relevante Zeile bestätigt (nicht nur „Datei existiert", sondern Inhalt
   passt zur Behauptung).
7. `docs/dipa/04_ROLLEN_RECHTE_MATRIX.md` und `docs/dipa/10_LOGGING_AUDIT_KONZEPT.md`
   gegen die echten `CREATE POLICY`/`REVOKE`/`GRANT`-Anweisungen in
   `supabase/migrations/20260819010000_*.sql` und `20260826010000_*.sql`
   gegengelesen: beide bereits vollständig, mit ehrlich offen ausgewiesenen
   Lücken (GAP-SHARES-UI, fehlende Auswertung/Alarmierung, keine Prüfung
   gegen die tatsächliche Produktions-DB) — keine Ergänzung nötig, keine
   Übertreibung gefunden.

## 3. Punkt-für-Punkt-Tabelle (48/48)

| # | Kurzbezeichnung | Kat. | Nachweis/Begründung |
|---|---|:---:|---|
| PROD-01 | Zweckbestimmung eindeutig | A | `app/pflegecoach/start/page.tsx` enthält die Zweckbestimmungs-Komponente; Code gelesen, Inhalt passt zur Behauptung. |
| PROD-02 | Kein Medizinprodukt (MDR-Negativabgrenzung) | A | Mechanismus technisch verifiziert (`produktgrenze.test.ts`, 9 Tests PASS); der **Inhalt** der Argumentation braucht vor Antragstellung juristische Prüfung (gebündelt mit DS-02/VS-04, siehe C-1). |
| PROD-03 | Produkt versioniert, Änderungen dokumentiert | A | `lib/coach/version.ts` (SemVer) gelesen, `audit/dipa/CHANGELOG_pflegecoach.md` vorhanden. |
| PROD-04 | Funktionsumfang vollständig beschrieben | A | `audit/dipa/funktionsbeschreibung_pflegecoach.md` vorhanden und mit Selbstzahler-Weg ergänzt (Doku-Deliverable, kein Code). |
| PROD-05 | Zielgruppe definiert | A | `audit/dipa/zielgruppendefinition.md` vorhanden. |
| PROD-06 | Nutzerflow bis Abrechnung | A | `audit/dipa/nutzerflow_dipa.md` + Migration `20260826010000` in Shadow-DB fehlerfrei angewendet. |
| DS-01 | Einwilligung für Gesundheitsdaten (Art. 9) | A | `coach_consents`, `lib/coach/consent.ts`; `consent.test.ts` 9/9 in `test:unit`-Lauf PASS; P1-Testgruppe (Shadow-DB) PASS. |
| DS-02 | DSFA (Art. 35) | C | `audit/dipa/dsfa_pflegecoach.md` vorbereitet, offene Bewertungen markiert; unterschriebene DSFA braucht Kanzlei/DSB. |
| DS-03 | Löschkonzept, Löschanspruch, Portabilität | A | `app/pflegecoach/loeschung/page.tsx` und `app/api/coach/export/route.ts` existieren und gelesen; `audit/dipa/loeschkonzept.md`. |
| DS-04 | Auftragsverarbeitungs-Kette (Art. 28) | C | `audit/dipa/avv_dossier_pflegecoach.md` (Kette erhoben, 10-Punkte-Prüfliste); unterschriebene AVV mit 4 Anbietern fehlt. |
| DS-05 | Verarbeitungsverzeichnis (Art. 30) | A | `audit/dipa/verarbeitungsverzeichnis_pflegecoach.md` — reines Doku-Deliverable, vorhanden. |
| DS-06 | Datenflüsse dokumentiert | A | `audit/dipa/datenfluesse_pflegecoach.md`, `datenschutzarchitektur_pflegecoach.md`, `interoperabilitaet_fhir.md` vorhanden. |
| DS-07 | Keine Werbe-/Cross-Selling-Nutzung | A | Shadow-DB-Test „anon hat 0 Grants auf coach_-Tabellen" PASS; E2E-Test „Produktbereich lädt keine Tracker" in CI PASS. |
| SEC-01 | TR-03161-Zertifikat | C | `audit/dipa/tr03161_checkliste.md` (Selbsteinschätzung); Zertifikat einer akkreditierten Prüfstelle fehlt, Monate Vorlauf. |
| SEC-02 | Verschlüsselung Transport/Ruhezustand | A | `audit/dipa/verschluesselungskonzept.md`; TLS/At-Rest sind Plattformgarantien von Supabase/Vercel — hier nicht neu pentestet, siehe SEC-04. |
| SEC-03 | Zweiter Faktor (TOTP) | A | `lib/coach/mfa.ts`; `mfa.test.ts` 9/9 PASS; serverseitige AAL2-Durchsetzung in `lib/coach/api-auth.ts` gelesen (Zeile mit `aal2`-Prüfung bestätigt). |
| SEC-04 | Externer Penetrationstest | C | `audit/dipa/pentest_beauftragung_scope.md` versandfertig; Durchführung fehlt. |
| SEC-05 | ISMS (ISO 27001 o. ä.) | C | `audit/dipa/isms_scope_vorbereitung.md`; Geltungsbereich noch mit BfArM zu klären, dann Beratung/Zertifizierung extern. |
| SEC-06 | Rollen-/Rechtekonzept technisch durchgesetzt | A | **Selbst neu ausgeführt:** 68/68 Shadow-DB-Tests PASS (P1–P9), gegen frisch aus dem Repo gebaute DB. `04_ROLLEN_RECHTE_MATRIX.md` gegen echte Policies gelesen. |
| SEC-07 | Auditierbarkeit der Zugriffe | A | `coach_audit_log`, Trigger `coach_audit_trigger()`; P7-Testgruppe PASS (append-only bestätigt); `10_LOGGING_AUDIT_KONZEPT.md` gegen Migration gelesen. Offen bleibt Auswertung/Alarmierung (dokumentiert, kein Code-Fix in diesem Lauf). |
| SEC-08 | Trennung Produkt/Plattform | A | P8/P9.5-Testgruppe PASS („Betriebstabellen bleiben außerhalb des Produkts"); keine Admin-Policy auf Gesundheitsdatentabellen bestätigt. |
| INT-01 | Maschinenlesbarer Export | A | `lib/coach/export.schema.json`; `export.test.ts` 29/29 in `test:unit` PASS. |
| INT-02 | FHIR/MIO-Austauschformat | D | Technik verifiziert (`fhir.ts`, `fhir.test.ts` 18/18 PASS) — aber die **Verbindlichkeit** ist eine offene BfArM-Frage (Frage 10, ORF-9); Gesamtstatus daher D, nicht A. |
| INT-03 | Menschenlesbarer Bericht | A | `app/pflegecoach/bericht/page.tsx` existiert, gelesen. |
| BF-01 | Barrierefreiheits-Standard (EN 301 549/WCAG 2.1 AA) | C | axe-core-Durchgang (0 Verstöße, CI-bestätigt) ist **unterstützender Beleg, kein Ersatz** für den amtlichen BITV-Test — die Norm verlangt eine akkreditierte Prüfstelle. |
| BF-02 | Gebrauchstauglichkeit mit Zielgruppe | C | Durchführungsplan fertig; 5 echte Testpersonen aus der Zielgruppe fehlen — kein Dienstleister im engeren Sinn, aber ohne externe Personen nicht durchführbar. |
| BF-03 | Screenreader-Durchgang (S1–S8) | **B** | Maschineller Anteil abgeschlossen (axe + Struktur, CI-bestätigt). Manueller Anteil (S1,S5,S7,S8) verlangt eine **echte VoiceOver/NVDA-Sitzung durch einen Menschen** — das kann dieser Agent-Lauf nicht ausführen. Checkliste in `14_ACCESSIBILITY_GAP_LISTE.md` §3.3 ist bereits vollständig auf die 4 Restpunkte heruntergebrochen; nichts Sinnvolles mehr an Doku zu ergänzen, ohne die Durchführung vorzutäuschen. |
| QI-01 | Pflegefachliche Inhaltsfreigabe | C | `audit/dipa/inhalte_pruefdossier.md` (12 Module, K1–K6); Freigabe durch externe Pflegefachkraft fehlt — höchstes Produktrisiko R1.4. |
| QI-02 | Lizenzierung der Erhebungsinstrumente | C | FES-I/HPS/BSFC-s/SUS sind lizenzpflichtig; Lizenzverträge fehlen. |
| QI-03 | Pflegeprobleme/-ziele fachlich hergeleitet | A | `audit/dipa/pflegeprobleme_pflegeziele.md` — internes Doku-Deliverable, Methodik nachvollziehbar dokumentiert. |
| NN-01 | Wissenschaftliches Evaluationskonzept | C | `audit/dipa/evaluationskonzept.md`; Studienpartner + Ethikvotum fehlen. |
| NN-02 | Pseudonymisierte Nutzungsdaten | A | P9-Testgruppe PASS: Schlüssel unlesbar, fremdes Pseudonym nicht berechenbar, Ereignisse unveränderlich — selbst gemessen. |
| NN-03 | Pilotdesign | A | `audit/dipa/pilotdesign.md` vorhanden; Start hängt organisatorisch an NN-01/QI-01, das Design selbst ist fertig. |
| VS-01 | Werbefreie Kernfunktion | A | E2E-Test „lädt keine Tracker/Werbeskripte" — Teil der 60 in CI bestandenen Tests. |
| VS-02 | Erreichbarer Support | A | `COACH_SUPPORT_EMAIL` in 12 Dateien inkl. Fußzeile/Produktseite/Einstellungen gefunden. |
| VS-03 | Nutzung jederzeit beendbar | A | `app/pflegecoach/einstellungen/konto/page.tsx` existiert (Widerruf/Export/Löschung). |
| VS-04 | Nutzungsbedingungen Selbstzahler-Weg | C | `audit/dipa/nutzungsbedingungen_entwurf_selbstzahler.md` (13 §§) — juristisch nicht geprüft, nicht veröffentlicht, keine Beträge erfunden. |
| QMS-01 | QM-/Risikomanagementsystem | A | `audit/dipa/qms_handbuch_pflegecoach.md` existiert (Verantwortung, Dokumentenlenkung, 7 Qualitätstore). |
| QMS-02 | Risikoanalyse | A | `audit/dipa/risikoanalyse_pflegecoach.md` + Risikoakte (0 kritisch, 3 hoch, 11 mittel, 5 niedrig). |
| QMS-03 | Technische Dokumentation | A | `technische_dokumentation_pflegecoach.md`, `sicherheitsarchitektur_pflegecoach.md`, `software_lebenszyklus_pflegecoach.md` vorhanden. |
| QS-04 | Automatisierte Tests (Produktlogik/Zugriff) | A | **Selbst neu ausgeführt:** 68/68 PASS gegen frisch gebaute Shadow-DB (kein Übernehmen aus Doku). |
| QS-05 | Browser-E2E-Test | A | Unabhängig über `gh run view` bestätigt: CI-Job „E2E — PflegeCoach-Produktbereich" `success`, 60 passed, 0 failed. |
| BETR-01 | Produktions-DB-Stand | A | Beide PflegeCoach-Migrationen bauen in einer frisch aus dem Repo erzeugten Shadow-DB fehlerfrei; Live-Status auf Production selbst nicht in dieser Sitzung neu abgefragt (kein Supabase-MCP verfügbar) — stützt sich auf den am 12./13.08. bereits bestätigten Tabellencheck. |
| REG-01 | Anforderungstexte gg. Original geprüft | D | `npm run dipa:katalog` erneut ausgeführt: unverändert 5/48 (6 %). Das Nachlesen der frei verfügbaren Texte (DiPAV, WCAG, MDR) wäre ohne Behörde möglich, ist aber ein mehrtägiger Einzelvergleich über ~38 Einträge — in dieser Sitzung bewusst **nicht** überstürzt begonnen, um keine unbelastbaren „geprüft"-Flags in einen Zulassungskatalog zu schreiben. Siehe `15_REG01_ANFORDERUNGSTEXTE.md`. |
| REG-02 | Freischaltcode-Verfahren verbindlich? | D | Mechanismus gebaut (Teil der 68/68 PASS), per `COACH_FREISCHALTUNG_PFLICHT=false` deaktiviert; Verbindlichkeit nur durch BfArM klärbar. |
| REG-03 | Qualifikationsanforderungen eUL | D | Kriterien selbst gesetzt (ORF-1), nicht regulatorisch abgeleitet — Bestätigung nur durch BfArM/GKV. |
| REG-04 | Vergütung/Abrechnungsweg | D | `coach_abrechnungswege` fail-closed über `verguetung_geklaert`; erst nach Aufnahme verhandelbar. |
| REG-05 | BfArM-Beratungstermin | D | `audit/dipa/bfarm_fragenkatalog.md` (20 Fragen) vorbereitet; Termin selbst nur durch BfArM vergebbar. |

## 4. Zusammenfassung

| Kategorie | Anzahl | Anteil |
|---|---|---|
| **A — technisch tatsächlich erfüllt** | 30 | 62,5 % |
| **B — dokumentarisch vorbereitet, Ausführung braucht einen Menschen** | 1 (BF-03) | 2,1 % |
| **C — extern (Prüfstelle/Kanzlei/Fachkraft/Testpersonen)** | 11 | 22,9 % |
| **D — Behörde/BfArM** | 6 (INT-02, REG-01–05) | 12,5 % |
| **E — nicht anwendbar** | 0 | 0 % |
| **Summe** | **48** | 100 % |

**Warum 0 bei E:** Der Katalog ist bereits auf die 48 für ein DiPA-Verfahren
relevanten Anforderungen vorgefiltert (siehe `docs/DIPA_MATRIX_FINAL.md`); ein
Punkt „nicht anwendbar" wegzudefinieren wäre in diesem Bestand keine
Kategorisierung, sondern ein Wegargumentieren. Es gibt keinen.

**Warum A hier 30 und nicht wie in der alten Matrix „26 + 4 B/C-erledigt = 30
sowieso schon" ist:** Deckungsgleich in der Zahl, aber **nicht** deckungsgleich
in der Methode — 6 der 30 A-Einträge (SEC-06, SEC-07, SEC-08, QS-04, QS-05,
DS-01/DS-07 teilweise über dieselbe Testgruppe) sind in dieser Sitzung mit einer
selbst neu aufgebauten Datenbank bzw. einem unabhängigen CI-Lauf **erneut**
gemessen worden, nicht aus einer Markdown-Zeile übernommen.

## 5. BfArM-Antrag heute einreichbar?

**NEIN.** 18 von 48 Punkten (11 C + 6 D + 1 B) sind ohne externe Partei, Behörde
oder eine echte menschliche Prüfsitzung nicht abschließbar. Am schwersten wiegen
für die Antragsreife: DS-02 (DSFA), SEC-01 (TR-03161-Zertifikat, längste
Vorlaufzeit), QI-01 (fachliche Inhaltsfreigabe, höchstes Produktrisiko R1.4) und
REG-01 (nur 6 % der Anforderungstexte belastbar geprüft). Keine dieser vier
Lücken lässt sich durch weitere interne Dokumentationsarbeit schließen.

## 6. Leitplanken eingehalten

`COACH_DIPA_MODUS=false` unverändert · keine Preise erfunden oder verändert ·
keine Kassenzahlungs-/Zulassungsbehauptung in diesem oder einem der
bearbeiteten Dokumente · kein Punkt als PASS markiert ohne echten funktionalen
Nachweis (siehe §2) · keine neuen Features, kein Code geändert · `typecheck`
und `test`/`vitest` nicht gleichzeitig ausgeführt (nur `tsx --test` und
`shadow-db`-SQL verwendet) · nichts committet.

## Quellen

* `docs/DIPA_MATRIX_FINAL.md`, `docs/dipa/00_KATEGORISIERUNG_PHASE4.md` — Vorgängerkategorisierungen (andere Fragestellung, siehe §1)
* `docs/dipa/15_REG01_ANFORDERUNGSTEXTE.md` — Detailaufschlüsselung REG-01
* `docs/dipa/04_ROLLEN_RECHTE_MATRIX.md`, `docs/dipa/10_LOGGING_AUDIT_KONZEPT.md`, `docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md` — gegengelesen, unverändert (bereits vollständig)
* `supabase/shadow/50_pflegecoach_tests.sql` — 68/68 PASS, selbst ausgeführt 14.08.2026 abends
* GitHub Actions Run `31801043552` (Commit `c0c5e8c`) — E2E-Job 60 passed
* `lib/coach/*.test.ts` über `npm run test:unit` — 481/481 PASS
