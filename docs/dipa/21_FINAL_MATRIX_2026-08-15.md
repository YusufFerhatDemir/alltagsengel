# DiPA — Finale 48-Punkte-Matrix (15.08.2026)

**Diese Datei ist der definitive Stand.** Sie ersetzt
`docs/dipa/20_DIPA_MATRIX_EINDEUTIG_2026-08-15.md` als Referenz (die bleibt als
Zwischenstand und Änderungsprotokoll stehen). Maschinenlesbares Gegenstück:
`lib/coach/anforderungskatalog.ts`, prüfbar über `npm run dipa:katalog`, gleiche
48 Kennungen.

**Was in diesem Durchgang passiert ist:** Die zwölf Einträge, die bis zum
14.08.2026 den Status `UNVERIFIED` trugen, wurden einzeln gegen die
Originaldokumente geprüft — nicht gegen Zusammenfassungen. Gelesen wurden die
Rohtexte von DiPAV samt Anlage 1 und Anlage 2, SGB XI § 78a, SGB V § 139e
(alle `gesetze-im-internet.de`) sowie BSI TR-03161 Teile 1 bis 3 (`bsi.bund.de`)
und die BfArM-Seite zu den DiGA-/DiPA-Datensicherheitskriterien.

`UNVERIFIED` ist jetzt **0**. Alle 48 Einträge tragen
`anforderungstextGeprueft: true`.

---

## Ergebnis in Zahlen

```
                                    vorher (14.08.)   jetzt (15.08.)
PASS_INTERNAL                              21               33
PASS_EXTERNAL_EVIDENCE_AVAILABLE            0                0
EXTERNAL_EVIDENCE_REQUIRED                 12               13
PARTIAL                                     3                2
FAIL                                        0                0
NOT_APPLICABLE                              0                0
UNVERIFIED                                 12                0
──────────────────────────────────────────────────────────────────
Gesamt                                     48               48

Belastbare Quote (geprüft UND erfüllt)    44 %             69 %
```

Die Quote ist dieselbe Rechnung wie bisher (`katalogFortschritt()`:
`erfuellt && anforderungstextGeprueft` geteilt durch alle Einträge ohne
`nicht_anwendbar`), nur mit den nachgezogenen Prüfungen: 33/48 = 0,6875 → 69 %.
Die zweite Kennzahl „textlich geprüft" ist jetzt 48/48 und damit nicht mehr
aussagekräftig — sie hatte nur Sinn, solange sie kleiner als 48 war.

### Warum EXTERNAL von 12 auf 13 gestiegen ist

Das ist kein Rückschritt, sondern die Auflösung einer Unschärfe. Drei
Bewegungen:

| Punkt | vorher | jetzt | Grund |
|---|---|---|---|
| BF-01 | EXTERNAL | **PARTIAL** | Anlage 2 ist eine Selbsterklärung — eine externe Prüfstelle ist nirgends gefordert. Klasse D → C. |
| QI-01 | UNVERIFIED | **EXTERNAL** | Hat sehr wohl einen harten Verordnungstext (§ 6 Abs. 8), und die fachliche Freigabe steht aus. |
| VS-02 | PARTIAL | **EXTERNAL** | 24-Stunden-Frist wörtlich bestätigt; der fehlende Nachweis ist eine Betriebszusage, nicht Code. |

**Zur Statusbezeichnung bei VS-02:** `EXTERNAL_EVIDENCE_REQUIRED` heißt hier
ausdrücklich *außerhalb der Technik*, **nicht** *externer Dienstleister*. Es
wird kein Auftrag vergeben — es wird eine Entscheidung der Geschäftsführung
gebraucht. Das ist der einzige Punkt, bei dem der Status so zu lesen ist; er
steht deshalb auch in der Spalte „Blocker" ausdrücklich so drin.

---

## Status-Werte

| Status | Bedeutung |
|---|---|
| `PASS_INTERNAL` | Intern erfüllt, Nachweis vorhanden, Anforderungstext gegen Quelle verifiziert |
| `PASS_EXTERNAL_EVIDENCE_AVAILABLE` | Intern erfüllt, externer Nachweis liegt bereits vor |
| `EXTERNAL_EVIDENCE_REQUIRED` | Implementierung ggf. vorhanden, Nachweis von außerhalb der Technik fehlt |
| `PARTIAL` | Teilweise erfüllt, konkreter Rest benannt |
| `FAIL` | Nicht erfüllt |
| `NOT_APPLICABLE` | Nicht anwendbar |
| `UNVERIFIED` | *(nicht mehr belegt)* |

Regel unverändert: Jeder Punkt trägt **genau einen** Status. Wo die Realität
zwei Aspekte hat („Umsetzung fertig, Zertifikat fehlt"), steht das in der
Spalte „Blocker", nicht im Status.

---

## 1. Produkt und Zweckbestimmung

| ID | Anforderung | Primärquelle (geprüfte Fundstelle) | Nachweis | Status | Blocker |
|---|---|---|---|---|---|
| PROD-01 | Zweckbestimmung eindeutig und konsistent | DiPAV § 2 Abs. 1 Nr. 2, Nr. 6 | `audit/dipa/finale_zweckbestimmung.md`, `app/pflegecoach/start` | PASS_INTERNAL | — |
| PROD-02 | Kein Medizinprodukt — schriftliche Begründung | MDR Art. 2 Nr. 1 (VO (EU) 2017/745), alle vier Alternativen einzeln | `audit/dipa/mdr_negativabgrenzung.md` | PASS_INTERNAL | Juristische Schlussprüfung empfohlen (nicht statusrelevant) |
| PROD-03 | Versioniert, Änderungen dokumentiert | Kein Normtext — eigener QS-Standard | `lib/coach/version.ts`, Changelog | PASS_INTERNAL | — |
| PROD-04 | Funktionsumfang vollständig beschrieben | DiPAV § 2 Abs. 1 Nr. 7 | `audit/dipa/funktionsbeschreibung_pflegecoach.md` | PASS_INTERNAL | — |
| PROD-05 | Zielgruppe definiert und abgegrenzt | DiPAV § 2 Abs. 1 Nr. 11 | `audit/dipa/zielgruppendefinition.md` | PASS_INTERNAL | — |
| **PROD-06** | Nutzerflow bis Abrechnung abgebildet | **Neu geklärt:** kein eigener Normtext. Anknüpfungen: DiPAV § 2 Abs. 1 Nr. 6, 7, 15, 17 + Anlage 2 III Nr. 2 | `audit/dipa/nutzerflow_dipa.md` | **PASS_INTERNAL** | — (eigener QS-Standard, jetzt begründet statt offengelassen) |

## 2. Datenschutz

| ID | Anforderung | Primärquelle (geprüfte Fundstelle) | Nachweis | Status | Blocker |
|---|---|---|---|---|---|
| DS-01 | Versionierte Einwilligung für Gesundheitsdaten | DSGVO Art. 9 Abs. 2 lit. a i. V. m. DiPAV § 5 Abs. 3 | `lib/coach/consent.ts` + Test | PASS_INTERNAL | — |
| DS-02 | Datenschutz-Folgenabschätzung | DSGVO Art. 35 | `audit/dipa/dsfa_pflegecoach.md` (Entwurf) | EXTERNAL_EVIDENCE_REQUIRED | Juristische Schlussbewertung fehlt |
| DS-03 | Löschkonzept, Löschanspruch, Portabilität | DSGVO Art. 17, 20 | `/pflegecoach/loeschung`, `/api/coach/export` | PASS_INTERNAL | Aufbewahrungsfrist der Sicherungen hängt an DS-04 |
| DS-04 | Auftragsverarbeitungs-Kette dokumentiert | DSGVO Art. 28 | `audit/dipa/avv_dossier_pflegecoach.md` | EXTERNAL_EVIDENCE_REQUIRED | Verträge nicht gegengezeichnet — kein neuer Dienstleister nötig, nur Signatur |
| DS-05 | Verzeichnis der Verarbeitungstätigkeiten | DSGVO Art. 30 | `audit/dipa/verarbeitungsverzeichnis_pflegecoach.md` | PASS_INTERNAL | — |
| **DS-06** | Datenflüsse dokumentiert | **Korrigiert:** DiPAV § 2 Abs. 1 Nr. 18 (Standorte der Datenverarbeitung) + § 5 Abs. 4 (Inland/EU/Angemessenheitsbeschluss) + DSGVO Art. 30 Abs. 1 lit. c/e | `audit/dipa/datenfluesse_pflegecoach.md` | **PASS_INTERNAL** | — (fällt **nicht** mit DS-05 zusammen, wie zuvor vermutet) |
| DS-07 | Kein Cross-Selling/Werbung mit Produktdaten | DiPAV § 5 Abs. 5 | Tracker aus, E2E prüft geladene Hosts | PASS_INTERNAL | — |

## 3. Datensicherheit

Alle fünf zuvor als „kein Textfund" geführten Punkte haben eine verbindliche
Fundstelle — nur nicht dort, wo zuvor gesucht wurde. Die
Datensicherheitsanforderungen stehen **nicht** in Anlage 1 DiPAV, sondern in der
über **DiPAV § 5 Abs. 2 Nr. 1 → § 78a Abs. 7 SGB XI** verbindlich gemachten
**BSI TR-03161**.

| ID | Anforderung | Primärquelle (geprüfte Fundstelle) | Nachweis | Status | Blocker |
|---|---|---|---|---|---|
| SEC-01 | Datensicherheitszertifikat (BSI TR-03161) | DiPAV § 5 Abs. 2 Nr. 1, § 8 Abs. 3 + § 78a Abs. 7 SGB XI + § 139e Abs. 10 S. 3 SGB V | `audit/dipa/tr03161_checkliste.md` (Selbsteinschätzung) | EXTERNAL_EVIDENCE_REQUIRED | **Erklärungs-Fallback aus § 8 Abs. 3 S. 4 gegengeprüft und geschlossen** (s. u.). Anwendbar: TR-03161-2 (Web) + -3 (Backend). P0, kritischer Pfad |
| **SEC-02** | Verschlüsselung Transport/Ruhezustand | **Neu gefunden:** TR-03161-3 O.Data_1, O.Arch_4, O.Ntwk_1/_2; TR-03161-1 O.Cryp_1–7; DiPAV § 5 Abs. 1 | `audit/dipa/verschluesselungskonzept.md` | **PASS_INTERNAL** | Formale Bestätigung derselben Punkte läuft über SEC-01 |
| **SEC-03** | Zweiter Faktor bei Anmeldung | **Neu gefunden, strenger als angenommen:** TR-03161-1 O.Auth_3 / -3 O.Auth_4 — „Jeder Authentifizierungsvorgang des Nutzers MUSS in Form einer Zwei-Faktor-Authentisierung umgesetzt werden." Herabstufung nur als KANN mit Einzel-Einwilligung (O.Auth_4/_5, § 139e Abs. 10 S. 4 SGB V über § 78a Abs. 7 S. 2 SGB XI) | `lib/coach/mfa.ts` (+ 5 neue Tests), `lib/coach/api-auth.ts` | **PASS_INTERNAL** | Dokumentierte Abweichung: Lesen, Export, Widerruf, Löschung bleiben ohne zweiten Faktor erreichbar (Art. 7 Abs. 3 / 15 / 20 DSGVO) — als Herstelleraussage in die TR-Prüfung |
| SEC-04 | Externer Penetrationstest | DiPAV § 8 Abs. 3 S. 5; BfArM-Leitfaden Kap. 3.4 | `audit/dipa/pentest_beauftragung_scope.md` | EXTERNAL_EVIDENCE_REQUIRED | **Nicht separat beauftragen** — mit SEC-01 zusammen vergeben |
| SEC-05 | Informationssicherheits-Managementsystem | **Vorbehalt zurückgenommen:** TR-03161-3 O.Org_1 (ISO 27001 / IT-Grundschutz, MUSS) + DiPAV § 8 Abs. 3 S. 2 | `audit/dipa/isms_scope_vorbereitung.md` | EXTERNAL_EVIDENCE_REQUIRED | **Verbindlicher als bisher notiert.** Scope zu erweitern um O.Org_2 (C5-Typ-2-Testat der Cloud-Dienstleister), O.Org_3/_4 (Monitoring + Alarmprozesse), O.Org_5 (Notfallvorsorgekonzept) |
| **SEC-06** | Rollen-/Rechtekonzept durchgesetzt | **Neu gefunden:** TR-03161-3 O.Auth_1, O.Auth_3 („Autorisierung bei jedem Datenzugriff separat"), O.Auth_7, O.Arch_10 | 68/68 Shadow-Tests | **PASS_INTERNAL** | — |
| **SEC-07** | Auditierbarkeit der Zugriffe | **Neu gefunden:** TR-03161-3 O.Arch_11 (zentrales Protokollierungssystem, MUSS), O.Org_3, Passwort-/Verbindungsprotokollierung | `coach_audit_log` (append-only), Tests P7 | **PASS_INTERNAL** | SOLL (nicht MUSS) offen: dedizierter Logserver getrennt vom Quellsystem |
| **SEC-08** | Trennung von Betriebsplattform | **Neu gefunden, andere Begründung als vermutet:** DiPAV § 5 Abs. 3 S. 1 (abschließende Zweckliste) + § 5 Abs. 5 (andere Zwecke „ausgeschlossen"); ergänzend TR-03161-3 O.Arch_9 | Eigene Tabellen/Policies, Tests P3 + P9.5 | **PASS_INTERNAL** | Trennungstiefe (gemeinsames DB-Projekt) bleibt BfArM-Frage 13 — betrifft das Wie, nicht mehr das Ob |

## 4. Interoperabilität

| ID | Anforderung | Primärquelle (geprüfte Fundstelle) | Nachweis | Status | Blocker |
|---|---|---|---|---|---|
| INT-01 | Maschinenlesbarer, dokumentierter Export | Kein externer Normtext (eigenes Schema) | `lib/coach/export.schema.json` + Test | PASS_INTERNAL | — |
| **INT-02** | Verbindliches Austauschformat (FHIR) | **Geklärt:** DiPAV § 7 + Anlage 2 I Nr. 1 lassen „einen offenen anerkannten internationalen Standard" zu — FHIR R4 ist einer, ein Eigenprofil ist gerade **nicht** nötig. Der echte offene Punkt war Anlage 2 I Nr. 4 (Veröffentlichungspflicht) | `lib/coach/interop.ts` + Test, `/pflegecoach/interoperabilitaet`, Fußzeilen-Link | **PASS_INTERNAL** | Einzelfallfrage für die BfArM-Beratung: existiert ein passendes MIO/PIO der KBV? Derzeit keines bekannt |
| INT-03 | Menschenlesbarer Bericht zur Weitergabe | DiPAV § 2 Abs. 1 Nr. 20, Anlage 2 I Nr. 2 | `/pflegecoach/bericht` | PASS_INTERNAL | — |

## 5. Barrierefreiheit und Gebrauchstauglichkeit

| ID | Anforderung | Primärquelle (geprüfte Fundstelle) | Nachweis | Status | Blocker |
|---|---|---|---|---|---|
| **BF-01** | Barrierefreiheits-Standard erfüllt | Anlage 2 IV Nr. 13 (DIN EN ISO 9241-171 „berücksichtigt"), Nr. 14/15; § 6 Abs. 11 — **Anlage 2 ist ein Selbsterklärungs-Fragebogen** | Bedienhilfen umgesetzt, axe-core ohne Verstoß | **PARTIAL** (war EXTERNAL) | **Keine Prüfstelle gefordert.** Echter Rest: der DIN-Normtext ist kostenpflichtig und liegt nicht vor — ohne ihn keine belastbare Abgleichdokumentation. Nächster Schritt: Normtext kaufen, nicht Prüfstelle beauftragen |
| BF-02 | Gebrauchstauglichkeit mit Zielgruppe geprüft | **Fundstelle verschärft:** Anlage 2 IV Nr. 2 (formative Evaluation) **und** Nr. 3 (summative Validierung, „mindestens fünf repräsentative Vertreter"), dazu Nr. 10 und Nr. 12 — alles Verordnungstext, nicht nur Leitfaden | `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md` | EXTERNAL_EVIDENCE_REQUIRED | Testpersonen fehlen; Plan deckt nur die summative Runde ab, Nr. 2/10/12 fehlen darin |
| **BF-03** | Screenreader-Durchgang protokolliert | Operationalisierung von BF-01 (9241-171, Zugänglichkeit bei Seh-Beeinträchtigungen) | `e2e/pflegecoach-axe.spec.ts` — **neuer Block „Screenreader-Semantik"** | **PARTIAL** | Maschineller Teil neu abgedeckt (S1–S3 + ARIA/Rolle-Name-Wert/Struktur, 0 Verstöße auf 4 Seiten). S4–S8 sind maschinell nicht entscheidbar — manueller VoiceOver/NVDA-Durchgang bleibt, intern leistbar |

## 6. Qualität der Inhalte

| ID | Anforderung | Primärquelle (geprüfte Fundstelle) | Nachweis | Status | Blocker |
|---|---|---|---|---|---|
| **QI-01** | Alle Inhalte pflegefachlich geprüft und freigegeben | **Neu gefunden, harter Verordnungstext:** DiPAV § 6 Abs. 8 — Inhalte „müssen qualitätsgesichert sein und dem allgemein anerkannten Stand der pflegerisch-medizinischen Erkenntnisse entsprechen"; Anlage 2 VI Nr. 1–19; § 2 Abs. 1 Nr. 9 (Quellenangabe im Antrag) | `audit/dipa/inhalte_pruefdossier.md` | **EXTERNAL_EVIDENCE_REQUIRED** (war UNVERIFIED) | Alle 12 Module tragen weiterhin `pruefstatus: entwurf`. **Keine Zertifizierungsstelle gefordert** — es braucht eine pflegefachlich qualifizierte Person, die die Freigabe verantwortet; eine Fachkraft aus dem eigenen Netz genügt |
| QI-02 | Erhebungsinstrumente validiert bzw. lizenziert | BfArM-Leitfaden Kap. 4.5.1 | 7-Item-Kurzinstrument, als unvalidiert gekennzeichnet | EXTERNAL_EVIDENCE_REQUIRED | Lizenzen FES-I/BSFC-s/SUS ungeklärt |
| QI-03 | Pflegeprobleme und -ziele fachlich hergeleitet | Kein externer Normtext (Pflegeprozess-Methodik) | `audit/dipa/pflegeprobleme_pflegeziele.md` | PASS_INTERNAL | Sachlich abhängig von QI-01 |

## 7. Nutzennachweis

| ID | Anforderung | Primärquelle (geprüfte Fundstelle) | Nachweis | Status | Blocker |
|---|---|---|---|---|---|
| NN-01 | Wissenschaftliches Evaluationskonzept | **Gesetzesrang nachgetragen:** § 78a Abs. 6a S. 2 Nr. 3 SGB XI — „ein von einer herstellerunabhängigen Institution erstelltes wissenschaftliches Evaluationskonzept" ist schon dem **Erprobungs**-Antrag beizufügen; dazu DiPAV §§ 11–12 | `audit/dipa/evaluationskonzept.md` (Grobkonzept) | EXTERNAL_EVIDENCE_REQUIRED | **Der Weg über die vorläufige Aufnahme umgeht das nicht.** Zweiter Punkt auf dem kritischen Pfad neben SEC-01 |
| **NN-02** | Nutzungsdaten pseudonymisiert erhoben | **Neu gefunden:** DiPAV § 5 Abs. 3 S. 1 Nr. 2 + S. 2 (getrennte Einwilligung); DSGVO Art. 5 Abs. 1 lit. c, Art. 32 Abs. 1 lit. a; TR-03161-3 O.Data_3 | `lib/coach/nachweise.ts`, Tests P9.1/P9.2 | **PASS_INTERNAL** | — |
| **NN-03** | Pilotdesign liegt vor | **Geprüft:** kein Normtext — eigener QS-Standard zur Vorbereitung auf § 78a Abs. 6a SGB XI und DiPAV §§ 11–13 | `audit/dipa/pilotdesign.md` | **PASS_INTERNAL** | Ersetzt **nicht** das Evaluationskonzept aus NN-01 |

## 8. Verbraucherschutz

| ID | Anforderung | Primärquelle (geprüfte Fundstelle) | Nachweis | Status | Blocker |
|---|---|---|---|---|---|
| VS-01 | Werbefrei, kein Cross-Selling | DiPAV § 6 Abs. 4, § 5 Abs. 5, Anlage 2 III Nr. 5 | Tracker aus, E2E-Test | PASS_INTERNAL | — |
| **VS-02** | Erreichbarer Support, Antwort binnen 24 h | Anlage 2 III Nr. 8, wörtlich: „kostenlose deutschsprachige Anwenderbetreuung … zur Beantwortung von Anfragen spätestens innerhalb von 24 Stunden" | Supportadresse, `/pflegecoach/anfrage` | **EXTERNAL_EVIDENCE_REQUIRED** (war PARTIAL) | **Kein Dienstleister — Entscheidung der Geschäftsführung.** Bewusst nicht einseitig veröffentlicht: eine publizierte Reaktionszeit ist eine bindende Zusage und setzt Personal-/Bereitschaftsentscheidungen voraus (Wochenende und Feiertage inbegriffen, die Frist kennt keine Ausnahme) |
| **VS-03** | Jederzeit ohne Hürde beendbar | **Neu gefunden:** DSGVO Art. 7 Abs. 3 („so einfach wie die Erteilung") — einschlägig, weil DiPAV § 5 Abs. 3 die Einwilligung als **einzige** Grundlage vorsieht; dazu Anlage 2 III Nr. 6, Art. 17 DSGVO, TR-03161-3 O.Data_7 | `/pflegecoach/einstellungen/konto` | **PASS_INTERNAL** | — |
| VS-04 | Verständliche Nutzungsbedingungen (Selbstzahler) | Kein DiPAV-Bezug — Zivil-/AGB-Recht, Produkt A | Entwurf, 13 Paragrafen; Bestellweg gesperrt | EXTERNAL_EVIDENCE_REQUIRED | Juristische Prüfung fehlt |

## 9. QMS, Risikomanagement, Betrieb

| ID | Anforderung | Primärquelle (geprüfte Fundstelle) | Nachweis | Status | Blocker |
|---|---|---|---|---|---|
| QMS-01 | QM- und Risikomanagementsystem dokumentiert | Anlage 1 DiPAV, Themenfelder QMS + Risikomanagement | `audit/dipa/qms_handbuch_pflegecoach.md` | PASS_INTERNAL | Nicht extern auditiert — hängt an SEC-05 |
| QMS-02 | Risikoanalyse liegt vor | Anlage 1 DiPAV + DiPAV § 3 Abs. 3 S. 2 | Risikoanalyse + Risikoakte (0 kritisch, 3 hoch) | PASS_INTERNAL | — |
| QMS-03 | Technische Dokumentation liegt vor | DiPAV § 3 Abs. 3 S. 2 | `audit/dipa/technische_dokumentation_pflegecoach.md` | PASS_INTERNAL | — |
| QS-04 | Automatisierte Tests decken Produktlogik/Zugriffsregeln | Kein externer Normtext — eigener QS-Standard | 68/68 Shadow-Tests | PASS_INTERNAL | — |
| QS-05 | Browser-E2E-Test des Produktbereichs | Kein externer Normtext — eigener QS-Standard | `e2e/pflegecoach.spec.ts`, CI-Job | PASS_INTERNAL | — |
| BETR-01 | DB-Stand auf Produktion angewendet | Kein externer Normtext — interner Betriebszustand | Migrationen live | PASS_INTERNAL | — |

## 10. Verfahren und offene regulatorische Fragen

| ID | Anforderung | Primärquelle (geprüfte Fundstelle) | Nachweis | Status | Blocker |
|---|---|---|---|---|---|
| **REG-01** | Anforderungstexte gegen Original geprüft (Meta) | DiPAV + Anlagen, SGB XI § 78a, SGB V § 139e, TR-03161 Teile 1–3, BfArM-Leitfaden v1.3 | `npm run dipa:katalog`: 48/48 geprüft, 0 ungeprüft | **PASS_INTERNAL** | Wiedervorlage bei jeder neuen Fassung eines der Dokumente — „geprüft" gilt gegen die genannten Fassungen, nicht auf Dauer |
| REG-02 | Freischaltcode-Verfahren verbindlich? | BfArM-Leitfaden Kap. 1/1.1 | Frage beantwortet: **nein**, Kostenerstattung statt Code | PASS_INTERNAL | Zugangsschalter vor Aktivierung an das Modell anpassen |
| REG-03 | Qualifikationsanforderungen eUL-Erbringer? | BfArM-Leitfaden S. 88 | Frage beantwortet: Herstellerentscheidung | PASS_INTERNAL | — |
| REG-04 | Vergütung und Abrechnungsweg | § 40a Abs. 1a SGB XI (70-€-Deckel gesetzlich) + Leitfaden | `lib/coach/abrechnung.ts` fail-closed | EXTERNAL_EVIDENCE_REQUIRED | Konkreter Anteil erst nach Aufnahme verhandelbar |
| REG-05 | BfArM-Beratungstermin | DiPAV § 22 („auf Anfrage"), Leitfaden Kap. 5.5 („keine rechtliche Bindung") | `audit/dipa/bfarm_fragenkatalog.md` | EXTERNAL_EVIDENCE_REQUIRED | **Kein Pflicht-Blocker — ausdrücklich freiwillig.** Höchste Hebelwirkung: klärt SEC-01-Scope, INT-02-MIO-Frage, QI-02 und REG-04 in einem Termin |

---

## Die zwölf UNVERIFIED — was die Prüfung ergeben hat

| # | Punkt | Ergebnis |
|---|---|---|
| 1 | PROD-06 | Kein Normtext, aber vier belegte Anknüpfungen im Antragsinhalt → eigener QS-Standard, **PASS_INTERNAL** |
| 2 | DS-06 | **Vermutung widerlegt** — fällt nicht mit DS-05 zusammen; § 2 Abs. 1 Nr. 18 + § 5 Abs. 4 → **PASS_INTERNAL** |
| 3 | SEC-02 | Fundstelle in TR-03161 statt Anlage 1 → **PASS_INTERNAL** |
| 4 | SEC-03 | **Strenger als angenommen** (MUSS, nicht „verfügbar") → Code nachgezogen, **PASS_INTERNAL** |
| 5 | SEC-06 | TR-03161-3 O.Auth_1/_3/_7 → **PASS_INTERNAL** |
| 6 | SEC-07 | TR-03161-3 O.Arch_11 → **PASS_INTERNAL**, SOLL-Rest benannt |
| 7 | SEC-08 | Trägt über die **Zweckbindung** (§ 5 Abs. 3/5), nicht über die Architektur → **PASS_INTERNAL** |
| 8 | QI-01 | **Harter Verordnungstext** (§ 6 Abs. 8) gefunden; Freigabe steht aus → **EXTERNAL_EVIDENCE_REQUIRED** |
| 9 | NN-02 | § 5 Abs. 3 S. 1 Nr. 2 + DSGVO Art. 32 → **PASS_INTERNAL** |
| 10 | NN-03 | Kein Normtext → eigener QS-Standard, **PASS_INTERNAL** |
| 11 | VS-03 | DSGVO Art. 7 Abs. 3 über DiPAV § 5 Abs. 3 → **PASS_INTERNAL** |
| 12 | REG-01 | Selbst erledigt: 48/48 geprüft → **PASS_INTERNAL** |

Bemerkenswert ist das Muster: **sieben** der zwölf hatten sehr wohl einen
verbindlichen Text. Die vorherige Suche war systematisch zu eng — sie endete bei
DiPAV und Anlage 1 und griff nicht auf die Norm durch, die § 5 Abs. 2 Nr. 1
selbst in Bezug nimmt.

---

## Codeänderungen in diesem Durchgang

| Datei | Änderung | Punkt |
|---|---|---|
| `lib/coach/mfa.ts` | `mfaPflicht()` liefert im DiPA-Modus `true` und lässt sich dort nicht per `COACH_MFA_PFLICHT=false` abschalten (fail-closed, O.Auth_3). Außerhalb des DiPA-Modus unverändert. | SEC-03 |
| `lib/coach/mfa.test.ts` | 5 neue Tests: beide Richtungen des Schalters, kein Opt-out im DiPA-Modus, Durchgriff bis zur Sperre | SEC-03 |
| `lib/coach/interop.ts` *(neu)* | Veröffentlichte Standards, FHIR-Ressourcentypen, Eigenschema, Nicht-zutreffend-Begründungen, Diskriminierungsfreiheits-Zusage | INT-02 |
| `lib/coach/interop.test.ts` *(neu)* | 6 Tests, darunter die Gegenprobe in **beide** Richtungen: veröffentlichte Ressourcenliste ↔ tatsächliche Ausgabe von `buildFhirBundle` | INT-02 |
| `app/pflegecoach/interoperabilitaet/page.tsx` *(neu)* | Öffentliche Seite ohne Anmeldung | INT-02 |
| `app/pflegecoach/CoachShell.tsx` | Fußzeilen-Link auf jeder Produktseite (Anlage 2 I Nr. 4 verlangt „auf der Anwendungswebseite verlinkt") | INT-02 |
| `e2e/pflegecoach-axe.spec.ts` | Neuer Block „Screenreader-Semantik" (cat.aria, cat.name-role-value, cat.structure, cat.semantics) + Prüfungen S1–S3; neue Seite aufgenommen; zwei Schleifen-Tests in Einzeltests aufgeteilt (Zeitbudget, **keine** Assertion geändert) | BF-03 |
| `lib/coach/anforderungskatalog.ts` | Alle 12 Resteinträge auf `anforderungstextGeprueft: true` mit Fundstelle; Statuskorrekturen INT-02, VS-02, BF-01, SEC-05, NN-01, SEC-01 | alle |

**Nicht geändert und warum:** `COACH_DIPA_MODUS` bleibt per Default `false` —
die MFA-Verschärfung ändert im heutigen Betrieb nichts. Die 24-Stunden-Zusage
aus VS-02 wurde bewusst **nicht** ins Produkt geschrieben (siehe dort).

---

## Was der Katalog weiterhin nicht abdeckt

Ein Punkt aus DiPAV **§ 5 Abs. 2 Nr. 2** ist in den 48 Kennungen nicht
enthalten und war es nie: die vom BfArM nach **§ 78a Abs. 8 SGB XI**
festgelegten **Prüfkriterien für den Datenschutz**, nachzuweisen nach
**DiPAV § 8 Abs. 4** durch ein Zertifikat einer nach § 39 BDSG akkreditierten
und zugelassenen Stelle.

Anders als bei SEC-01 ist der Erklärungs-Fallback hier **offen**: § 8 Abs. 4
S. 4 lässt bis zum Vorliegen der Verfahren eine Erklärung nach § 4 Abs. 6 S. 2
DiGAV zu, und eine akkreditierte Zertifizierungsstelle für diese Spur ist nach
derzeitigem Kenntnisstand nicht verfügbar. Der Punkt ist damit heute kein
Blocker, gehört aber bei der nächsten Katalogpflege als **AK-DS-08**
aufgenommen — die 48er-Zählung wurde in diesem Durchgang bewusst nicht
verändert, damit die Vorher-/Nachher-Zahlen vergleichbar bleiben.

---

## Was jetzt zuerst zu tun ist

**Auf dem kritischen Pfad (blockieren die Antragstellung):**

1. **SEC-01 + SEC-04** — eine Beauftragung, nicht zwei. TR-03161-2 und -3.
2. **NN-01** — herstellerunabhängiges Institut. Wird auch für den
   Erprobungs-Antrag gebraucht, ist also nicht aufschiebbar.
3. **QI-01** — pflegefachliche Freigabe der 12 Module. Braucht keine
   Zertifizierungsstelle, nur eine qualifizierte Person.

**Intern erledigbar, ohne Auftrag:**

4. **BF-01** — DIN EN ISO 9241-171 beschaffen, dann selbst abgleichen.
5. **BF-03** — einen Termin für den manuellen VoiceOver/NVDA-Durchgang setzen.
6. **VS-02** — Entscheidung der Geschäftsführung zur 24-Stunden-Zusage.

**Höchste Hebelwirkung pro Aufwand:** **REG-05** (BfArM-Beratung) — freiwillig,
klärt aber SEC-01-Scope, die MIO-Frage aus INT-02, QI-02 und REG-04 in einem
Termin.

---

*Quellen dieses Durchgangs, jeweils im Volltext gelesen am 15.08.2026:
`gesetze-im-internet.de` (DiPAV §§ 2, 3, 5, 6, 7, 8, 22 sowie Anlage 1 und
Anlage 2; SGB XI § 78a; SGB V § 139e), `bsi.bund.de` (BSI TR-03161 Teile 1, 2
und 3), `bfarm.de` (DiGA- und DiPA-Datensicherheitskriterien).*
