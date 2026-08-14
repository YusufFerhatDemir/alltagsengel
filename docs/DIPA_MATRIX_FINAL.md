# DiPA-Matrix — Digitaler PflegeCoach

**Stand:** 2026-08-14 · **Produktversion:** 0.5.0 · **Betriebsmodus:** `COACH_DIPA_MODUS=false`

## Wozu dieses Dokument

Diese Matrix beantwortet genau eine Frage: **Was liegt noch zwischen dem heutigen
Produkt und einem Antrag auf Aufnahme ins DiPA-Verzeichnis?** Sie führt alle 48
Anforderungen mit Bearbeitungsklasse, Status, Nachweis und nächster Aktion.

Die maschinenlesbare Fassung derselben 48 Einträge liegt in
`lib/coach/anforderungskatalog.ts` und wird durch `npm run dipa:katalog`
geprüft — das Skript meldet tote Nachweisverweise und erfüllte Einträge ohne
Beleg. Beide Fassungen tragen dieselben Kennungen.

### Abgrenzung: Produkt A vs. Produkt B

| | **Produkt A — PflegeCoach Selbstzahler** | **Produkt B — DiPA** |
|---|---|---|
| Status | **verkaufsfähig, heute aktiv** | Zukunft, nach BfArM-Aufnahme |
| Finanzierung | privat zu zahlendes Angebot | Erst nach Aufnahme zu klären |
| Schalter | `COACH_DIPA_MODUS=false` | `COACH_DIPA_MODUS=true` |
| Aussagen zu Kostenträgern | **keine** — technisch abgesichert durch `lib/coach/produktgrenze.test.ts` | erst nach Aufnahme zulässig |
| Oberflächen | alle Bereiche außer `/pflegecoach/anspruch` und `/pflegecoach/freischaltung` | zusätzlich diese beiden |

**Diese Matrix beschreibt ausschließlich Produkt B.** Nichts darin ist eine
Voraussetzung für den Verkauf von Produkt A. Produkt A ist kein Medizinprodukt und
keine Kassenleistung; das steht so auf `/pflegecoach/start` und wird durch einen
Strukturtest gegen Regression gesichert.

### Bearbeitungsklassen

Die Klasse beantwortet: **Wer kann das überhaupt erledigen?** Sie ist unabhängig
vom Status. Ein offener D-Punkt ist kein Rückstand, sondern eine Beauftragung.

| Klasse | Bedeutung |
|---|---|
| **A** | Intern vollständig erledigt, Nachweis im Repository |
| **B** | Technisch umsetzbar, liegt in unserer Hand |
| **C** | Dokumentation, die wir selbst erstellen können |
| **D** | Externer Dienstleister oder Fachperson nötig (Prüfstelle, Kanzlei, Pflegefachkraft, Testpersonen) |
| **E** | Behörde oder Kostenträger nötig (BfArM, GKV) |

### Statuswerte

| Status | Bedeutung |
|---|---|
| `ERLEDIGT` | Gebaut/dokumentiert, Nachweis vorhanden. |
| `OFFEN` | Noch nicht getan. Bei A/B/C in unserer Hand. |
| `EXTERN` | Wartet auf eine Leistung von außen. |

### Wichtiger Vorbehalt zu den Anforderungstexten

Die verbindlichen Anforderungen stehen in DiPAV/SGB XI, im BfArM-Leitfaden und in
BSI TR-03161 — in der zum Antragszeitpunkt gültigen Fassung. Die Formulierungen in
dieser Matrix sind **Arbeitsfassungen**, keine Zitate. `lib/coach/anforderungskatalog.ts`
führt dafür pro Eintrag das Flag `anforderungstextGeprueft`; ein Eintrag zählt dort
erst als erfüllt, wenn jemand den Originaltext dagegen gehalten hat. **Aktuell sind
43 von 48 Einträgen ungeprüft; die belastbare Quote liegt damit bei 6 %.** Vor
Antragstellung ist der komplette Katalog gegen die Originaldokumente zu prüfen —
das ist selbst eine offene Aufgabe (REG-01).

---

## 1. Produkt und Zweckbestimmung

| # | Anforderung (Arbeitsfassung) | Klasse | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|---|
| PROD-01 | Zweckbestimmung eindeutig formuliert, in Produkt und Unterlagen konsistent | A | ERLEDIGT | `audit/dipa/finale_zweckbestimmung.md`; UI: `app/pflegecoach/start/page.tsx` | Bei jeder Funktionsänderung nachziehen |
| PROD-02 | Schriftliche Begründung, warum kein Medizinprodukt vorliegt | A | ERLEDIGT | `audit/dipa/mdr_negativabgrenzung.md`; Verbotsliste in `lib/coach/empfehlungen.ts` | Vor Antrag juristisch gegenlesen lassen (Bündel mit DS-02, VS-04) |
| PROD-03 | Produkt eindeutig identifizierbar und versioniert, Änderungen dokumentiert | A | ERLEDIGT | `lib/coach/version.ts` (SemVer), `audit/dipa/CHANGELOG_pflegecoach.md` | Changelog-Disziplin halten |
| PROD-04 | Funktionsumfang vollständig beschrieben | A | ERLEDIGT | `audit/dipa/funktionsbeschreibung_pflegecoach.md`, `produktbeschreibung_pflegecoach.md` | Um Selbstzahler-Weg ergänzen |
| PROD-05 | Zielgruppe definiert und abgegrenzt | A | ERLEDIGT | `audit/dipa/zielgruppendefinition.md` | — |
| PROD-06 | Vollständiger Nutzerflow bis Abrechnung abgebildet | A | ERLEDIGT | `audit/dipa/nutzerflow_dipa.md`; Migration `20260826010000` | Nach Klärung von REG-02 ggf. anpassen |

## 2. Datenschutz

| # | Anforderung (Arbeitsfassung) | Klasse | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|---|
| DS-01 | Ausdrückliche, versionierte Einwilligung für Gesundheitsdaten (Art. 9 Abs. 2 lit. a) | A | ERLEDIGT | `coach_consents` (append-only, Widerruf protokolliert), `lib/coach/consent.ts` | — |
| DS-02 | Datenschutz-Folgenabschätzung (Art. 35) durchgeführt | **D** | EXTERN | `audit/dipa/dsfa_pflegecoach.md` — Vorbereitung, offene Bewertungen markiert | Kanzlei/DSB beauftragen; Einwilligungstexte und Datenschutzhinweise mitprüfen lassen |
| DS-03 | Löschkonzept mit Löschanspruch und Datenportabilität, technisch umgesetzt | A | ERLEDIGT | `audit/dipa/loeschkonzept.md`; `/pflegecoach/loeschung`, `/api/coach/export` | Aufbewahrungsfrist der Sicherungen festhalten — hängt an DS-04 |
| DS-04 | Auftragsverarbeitungs-Kette produktbezogen dokumentiert (Art. 28) | **D** | EXTERN | **NEU:** `audit/dipa/avv_dossier_pflegecoach.md` — Kette für Supabase, Vercel, Resend, Stripe erhoben; 10-Punkte-Prüfliste; Verträge fehlen | Verträge beschaffen, Unterauftragnehmerlisten anfordern, Sicherungsfristen erfragen |
| DS-05 | Verarbeitungsverzeichnis (Art. 30) | A | ERLEDIGT | `audit/dipa/verarbeitungsverzeichnis_pflegecoach.md` | Mit DS-02 gegenprüfen lassen |
| DS-06 | Datenflüsse dokumentiert | A | ERLEDIGT | `audit/dipa/datenfluesse_pflegecoach.md`, `datenschutzarchitektur_pflegecoach.md`, **neu:** `interoperabilitaet_fhir.md` | — |
| DS-07 | Keine Nutzung der Produktdaten für Werbung/Cross-Selling | A | ERLEDIGT | Keine `anon`-Grants, keine Admin-Policies auf `coach_*`; Tracker deaktiviert; **neu:** E2E-Test prüft die tatsächlich geladenen Fremdhosts | Bei jedem neuen Tracker prüfen |

## 3. Datensicherheit

| # | Anforderung (Arbeitsfassung) | Klasse | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|---|
| SEC-01 | Zertifikat einer akkreditierten Prüfstelle nach BSI TR-03161 | **D** | EXTERN | `audit/dipa/tr03161_checkliste.md` — Selbsteinschätzung, **kein Zertifikat** | **Kritischer Pfad, Monate Vorlauf.** Prüfstelle anfragen; Geltung für eine vorläufige Aufnahme klären (BfArM-Frage 9) |
| SEC-02 | Verschlüsselung in Transport und Ruhezustand beschrieben und umgesetzt | A | ERLEDIGT | `audit/dipa/verschluesselungskonzept.md` (inkl. begründeter Entscheidung gegen echte E2E) | Im Rahmen SEC-01 verifizieren lassen |
| SEC-03 | Zweiter Faktor bei der Anmeldung | **B** | **ERLEDIGT (14.08.2026)** | `lib/coach/mfa.ts` + 9 Tests; `/pflegecoach/einstellungen/sicherheit` (TOTP einrichten/entfernen); Code-Abfrage im Login; **serverseitige Durchsetzung** in `lib/coach/api-auth.ts`: wer einen Faktor hat, schreibt ohne AAL2 nicht. Widerspruch auf der Investorenseite beseitigt | Entscheidung über `COACH_MFA_PFLICHT` mit dem BfArM klären |
| SEC-04 | Externer Penetrationstest / unabhängiges Security-Review | **D** | EXTERN | **NEU:** `audit/dipa/pentest_beauftragung_scope.md` — versandfertige Beauftragungsunterlage (Umfang, 5 Testkonten, 6 Schwerpunkte, Regeln, Abnahmekriterien) | An mindestens drei Anbieter zur Angebotseinholung geben |
| SEC-05 | Informationssicherheits-Managementsystem (ISO 27001 o. ä.) | **D** | EXTERN | **NEU:** `audit/dipa/isms_scope_vorbereitung.md` — 3 Geltungsbereiche bewertet, Bestand nach 13 Themenfeldern erhoben, 5 größte Lücken benannt | Geltungsbereich mit dem BfArM klären (Frage 11), dann Beratung anfragen |
| SEC-06 | Rollen- und Rechtekonzept, technisch durchgesetzt und getestet | A | ERLEDIGT | `audit/dipa/rollen_rechtekonzept.md`; `supabase/shadow/50_pflegecoach_tests.sql` — **68/68 bestanden am 14.08.2026** (vorher 38/39) | — |
| SEC-07 | Auditierbarkeit der Zugriffe | A | ERLEDIGT | `coach_audit_log` (append-only, Metadaten ohne Werte); Tests P7 | Auswertung/Alarmierung einrichten (siehe SEC-05, Lücke 5) |
| SEC-08 | Trennung des Produkts von der Plattform | A | ERLEDIGT (mit Restrisiko) | Eigene Tabellen, eigene Policies, eigenes Layout; **neu:** Tests P9.5 belegen die Trennung auch in der Gegenrichtung (Nutzer sieht keine Betriebstabellen) | Trennungstiefe mit dem BfArM klären (Frage 13) |

## 4. Interoperabilität

| # | Anforderung (Arbeitsfassung) | Klasse | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|---|
| INT-01 | Maschinenlesbarer, dokumentierter Datenexport | A | ERLEDIGT | `lib/coach/export.schema.json` (`de.alltagsengel.pflegecoach.export` v1.0) + Konformanz-Test | — |
| INT-02 | Verbindliches Austauschformat (FHIR/MIO), sofern gefordert | **B** | **TECHNISCH ERLEDIGT — Verbindlichkeit EXTERN** | **NEU:** `lib/coach/fhir.ts` + 13 Tests; FHIR-R4-Bundle über `/api/coach/export?format=fhir` (Questionnaire, QuestionnaireResponse, Goal, CarePlan); Doku: `audit/dipa/interoperabilitaet_fhir.md`. Ausdrücklich **ohne** Profil-, LOINC- oder SNOMED-Anspruch — durch Tests abgesichert | Verbindlichkeit klären (BfArM-Frage 10, ORF-9); erst danach Profilvalidierung beauftragen |
| INT-03 | Menschenlesbarer Bericht zur Weitergabe | A | ERLEDIGT | `/pflegecoach/bericht` — unveränderliche Snapshots, druckbar | — |

## 5. Barrierefreiheit und Gebrauchstauglichkeit

| # | Anforderung (Arbeitsfassung) | Klasse | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|---|
| BF-01 | Erfüllung des geltenden Barrierefreiheits-Standards (EN 301 549 / WCAG 2.1 AA) | **D** | EXTERN | Grundausstattung umgesetzt (3 Schriftgrade, Kontrastmodus, Skip-Link, ARIA-Landmarks, Touch-Ziele ≥ 44 px, `prefers-reduced-motion`); **neu:** Strukturprüfung in `e2e/pflegecoach.spec.ts` | BITV-Test beauftragen; Nachweisform klären (BfArM-Frage 12) |
| BF-02 | Gebrauchstauglichkeit mit der Zielgruppe geprüft und protokolliert | **D** | EXTERN (Testpersonen) | **NEU:** `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md` — 5 Testpersonen definiert, 9 Aufgaben mit Zeitlimits und Erfolgskriterien, Bewertungsmaßstab, Aufwand | Testpersonen gewinnen — ohne Vorkenntnis des Produkts |
| BF-03 | Screenreader-Durchgang | **C** | TEILWEISE | **NEU:** maschinelle Strukturprüfung (eine H1 je Seite, eindeutige Titel, Sprungmarke, Landmarks, beschriftete Felder, kein Überlauf bei 200 % Schrift); Prüfpunkte S1–S8 festgelegt | Manuellen Durchgang mit VoiceOver/NVDA durchführen — zusammen mit BF-02 |

## 6. Qualität der Inhalte

| # | Anforderung (Arbeitsfassung) | Klasse | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|---|
| QI-01 | Alle Inhalte pflegefachlich geprüft und freigegeben | **D** | EXTERN | **NEU:** `audit/dipa/inhalte_pruefdossier.md` — Prüfgegenstand (12 Module), Kriterien K1–K6, Einstufungen, Protokollform, Ablauf nach der Freigabe. Alle Module weiterhin `pruefstatus: 'entwurf'`, im Produkt sichtbar | Pflegefachkraft beauftragen — **höchstes Produktrisiko (R1.4)**, betrifft auch Produkt A |
| QI-02 | Verwendete Erhebungsinstrumente validiert bzw. lizenziert | **D** | EXTERN | Produktinternes 7-Item-Kurzinstrument, transparent als nicht validiert gekennzeichnet; **neu:** FHIR-Export überträgt für lizenzpflichtige Instrumente nur Summenwerte, keine Fragetexte | Lizenzen für FES-I, HPS/BSFC-s, SUS klären (BfArM-Frage 16) |
| QI-03 | Pflegeprobleme und -ziele fachlich hergeleitet | A | ERLEDIGT | `audit/dipa/pflegeprobleme_pflegeziele.md` | Mit QI-01 gegenprüfen lassen |

## 7. Nutzennachweis und Evaluation

| # | Anforderung (Arbeitsfassung) | Klasse | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|---|
| NN-01 | Wissenschaftliches Evaluationskonzept, einreichungsreif | **D** | EXTERN | `audit/dipa/evaluationskonzept.md` — kein Studienpartner, kein Ethikvotum | Hochschul-/Institutspartner gewinnen; Ethikvotum einholen (ORF-10) |
| NN-02 | Pseudonymisierte, auswertbare Nutzungsdaten | A | ERLEDIGT | `coach_nutzungsereignisse` (ohne Zeitstempel, ohne Inhalte); **neu:** Tests P9.1/P9.2 belegen — Schlüssel unlesbar, fremde Pseudonyme nicht berechenbar, Ereignisse unveränderlich | Vor Pilotstart `COACH_NUTZUNGSNACHWEIS_AKTIV=true` setzen |
| NN-03 | Pilotdesign | A | ERLEDIGT | `audit/dipa/pilotdesign.md` | Start hängt an NN-01 und QI-01 |

## 8. Verbraucherschutz

| # | Anforderung (Arbeitsfassung) | Klasse | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|---|
| VS-01 | Kernfunktion werbefrei, kein Cross-Selling mit den Daten | A | ERLEDIGT | Keine Tracker unter `/pflegecoach`; **neu:** E2E-Test prüft die geladenen Fremdhosts | Details der Werbefreiheit klären (ORF-5) |
| VS-02 | Erreichbarer Herstellersupport | A | ERLEDIGT | `COACH_SUPPORT_EMAIL` in Fußzeile, Produktseite, Einstellungen, Konto-Seite; `/pflegecoach/anfrage` | Reaktionszeit-Zusage festlegen — bis dahin wird keine behauptet |
| VS-03 | Nutzung jederzeit und ohne Hürde beendbar | A | ERLEDIGT | `/pflegecoach/einstellungen/konto` — Widerruf, Export, Löschung, Kontolöschung; keine Frist | — |
| VS-04 | Verständliche Nutzungsbedingungen für den Selbstzahler-Weg | **D** | EXTERN | **NEU:** `audit/dipa/nutzungsbedingungen_entwurf_selbstzahler.md` — 13 Paragrafen, Prüfliste mit 10 Punkten. **Nicht wirksam, nicht veröffentlicht.** Keine Beträge erfunden; Bestellweg technisch gesperrt | Zusammen mit DS-02 und PROD-02 in ein Mandat geben |

## 9. QMS, Risikomanagement, Betrieb

| # | Anforderung (Arbeitsfassung) | Klasse | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|---|
| QMS-01 | Dokumentiertes Qualitäts- und Risikomanagementsystem | **C** | **ERLEDIGT (14.08.2026)** | **NEU:** `audit/dipa/qms_handbuch_pflegecoach.md` (Verantwortung, Dokumentenlenkung, Änderungsverfahren, 7 Qualitätstore, Fehlerbehandlung, Fail-Closed-Schalter, Lücken in §9), `risikoakte_pflegecoach.md`, `software_lebenszyklus_pflegecoach.md` | Externe Auditierung — hängt an SEC-05 |
| QMS-02 | Risikoanalyse | A | ERLEDIGT | `audit/dipa/risikoanalyse_pflegecoach.md` + **neu:** Risikoakte mit Bewertung vor/nach Maßnahme und Restrisiko: **0 kritisch, 3 hoch, 11 mittel, 5 niedrig** | Wiedervorlage bei jeder MINOR-Version |
| QMS-03 | Technische Dokumentation | A | ERLEDIGT | `technische_dokumentation_pflegecoach.md`, `sicherheitsarchitektur_pflegecoach.md`, **neu:** `software_lebenszyklus_pflegecoach.md` | Auf Version 0.5.0 fortschreiben |
| QS-04 | Automatisierte Tests decken Produktlogik und Zugriffsregeln ab | **B** | **ERLEDIGT (14.08.2026)** | `supabase/shadow/50_pflegecoach_tests.sql`: **68/68 bestanden**, real gemessen gegen eine aus dem Repository aufgebaute Datenbank. P9 neu für alle 8 Tabellen aus `20260826010000` | Bei neuen Tabellen mitziehen |
| QS-05 | Browser-E2E-Test des Produktbereichs | **B** | TEILWEISE | **NEU:** `e2e/pflegecoach.spec.ts` — 9 geschützte Seiten, 401 auf allen Produkt-APIs, 404 der DiPA-Seiten ohne Schalter, Werbefreiheit, 6 A11y-Strukturprüfungen. **Suite geschrieben, in dieser Umgebung nicht ausgeführt** (keine Playwright-Browser installiert) | `npm run test:e2e:install`, dann Suite gegen Preview laufen lassen und in CI aufnehmen |
| BETR-01 | Datenbankstand des Produkts auf Production | A | ERLEDIGT | Migrationen `20260819010000` und `20260826010000` live (Tabellencheck 12.08.2026) | Live-Apply-Bestätigung bleibt Pflichtschritt im Änderungsverfahren |

## 10. Verfahren und offene regulatorische Fragen

| # | Frage | Klasse | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|---|
| REG-01 | Anforderungstexte gegen die Originaldokumente geprüft | **E** | OFFEN | **NEU:** Werkzeug `npm run dipa:katalog` — prüft alle 91 Nachweisverweise gegen das Dateisystem und meldet die 43 ungeprüften Anforderungstexte. Die Prüfung selbst setzt die Originaldokumente voraus | Vor Antrag: DiPAV, BfArM-Leitfaden, TR-03161 in gültiger Fassung durcharbeiten, je Eintrag `anforderungstextGeprueft` setzen |
| REG-02 | Ist ein Freischaltcode-Verfahren verbindlich, und wer gibt die Codes aus? | **E** | EXTERN | Mechanismus vollständig gebaut und getestet, per `COACH_FREISCHALTUNG_PFLICHT=false` deaktiviert | In der BfArM-Beratung klären, danach Schalter setzen |
| REG-03 | Qualifikationsanforderungen an eUL-Erbringer | **E** | EXTERN | `audit/dipa/eul_qualitaetsanforderungen.md` — Kriterien **selbst gesetzt**, nicht regulatorisch abgeleitet (ORF-1) | Klären, dann Kriterien bestätigen oder ersetzen |
| REG-04 | Vergütung und Abrechnungsweg | **E** | EXTERN | `coach_abrechnungswege` + `lib/coach/abrechnung.ts` — fail-closed über `verguetung_geklaert`, keine Beträge im Code | Erst nach Aufnahme verhandelbar |
| REG-05 | Formaler BfArM-Beratungstermin | **E** | EXTERN | `audit/dipa/bfarm_fragenkatalog.md` — Fragen 1–20 vorbereitet | Termin beantragen. **Günstigster nächster Schritt insgesamt:** klärt REG-02 bis REG-04, SEC-01, SEC-05, INT-02 und QI-02 in einem Zug |

---

## Zusammenfassung

### Nach Bearbeitungsklasse

| Klasse | Gesamt | davon offen |
|---|---|---|
| A — intern erledigt | 26 | 0 |
| B — intern umsetzbar | 4 | 2 (teilweise) |
| C — intern erstellbar | 2 | 1 (teilweise) |
| D — externer Dienstleister | 11 | 11 |
| E — Behörde/Kostenträger | 5 | 5 |
| **Summe** | **48** | |

### Nach Status

| Status | Anzahl | Anteil |
|---|---|---|
| ERLEDIGT | 29 | 60 % |
| TEILWEISE / in Arbeit | 9 | 19 % |
| OFFEN (davon 15 extern) | 10 | 21 % |

Zahlen maschinell erzeugt mit `npm run dipa:katalog` (14.08.2026).

### Was sich am 14.08.2026 geändert hat

| # | Vorher | Jetzt |
|---|---|---|
| SEC-03 | INTERN OFFEN — kein zweiter Faktor | **ERLEDIGT** — TOTP gebaut, serverseitig durchgesetzt, 9 Tests |
| INT-02 | INTERN OFFEN — kein Mapping | **technisch ERLEDIGT** — FHIR-R4-Bundle, 13 Tests, Doku |
| QS-04 | „39/39 PASS" (tatsächlich 38/39) | **68/68 real gemessen**, P9 für 8 bisher ungetestete Tabellen |
| QS-05 | INTERN OFFEN — keine Suite | Suite geschrieben, Ausführung offen |
| QMS-01 | INTERN OFFEN — Bausteine ohne System | **ERLEDIGT** — Handbuch, Risikoakte, Lebenszyklus |
| BF-03 | INTERN OFFEN — nichts | Strukturprüfung maschinell, manueller Durchgang offen |
| DS-04, SEC-04, SEC-05, BF-02, QI-01, VS-04 | „extern nötig", ohne Unterlage | Beauftragungsunterlagen fertig — versandfertig |
| REG-01 | INTERN OFFEN — kein Werkzeug | Werkzeug gebaut; Prüfung selbst bleibt offen |

**Drei Punkte sind bewusst NICHT auf „erledigt" gesetzt**, obwohl daran
gearbeitet wurde: INT-02 (die Verbindlichkeitsfrage ist extern), BF-03 (eine
Maschine kann nicht beurteilen, ob eine Ansage verständlich ist) und QS-05 (die
Suite wurde nicht ausgeführt). Ein „erledigt" ohne Ausführung wäre genau die
Sorte Statusmeldung, die dieses Projekt schon einmal teuer bezahlt hat.

### Korrektur einer bisherigen Angabe

Die frühere Matrix führte QS-04 als „39/39 PASS". Tatsächlich gemessen wurden am
14.08.2026 **38 bestanden, 1 fehlgeschlagen**: Der Strukturtest erwartete exakt
10 `coach_`-Tabellen, es existierten aber 19. Der Test misst jetzt „keine Tabelle
ohne RLS" statt einer festen Anzahl — eine Zusicherung statt einer Momentaufnahme.

### Was den Zeitplan bestimmt

Von den 19 nicht abgeschlossenen Punkten sind **16 nur von außen zu beschaffen**.
Intern verbleiben drei Teilarbeiten (Screenreader-Durchgang, E2E-Ausführung,
Profilvalidierung nach Klärung).

Drei Restrisiken stehen auf „hoch" — alle drei extern:

1. **R1.4 — Inhalte nicht pflegefachlich freigegeben** (QI-01). Höchstes
   Produktrisiko, betrifft auch das heute verkaufte Angebot.
2. **R2.9 — Auftragsverarbeiter-Kette ohne Verträge** (DS-04).
3. **R3.2 — kein externer Penetrationstest** (SEC-04).

**Empfohlene Reihenfolge:**

1. **BfArM-Beratungstermin beantragen** (REG-05) — beseitigt sechs Unklarheiten auf einmal und verhindert Fehlinvestitionen in SEC-01, SEC-05 und INT-02.
2. **TR-03161-Prüfstelle anfragen** (SEC-01) — längste Vorlaufzeit; Unterlage aus SEC-04 gleich mitschicken und fragen, ob der Penetrationstest Teilleistung ist.
3. **Ein Mandat, drei Themen** (DS-02, DS-04, VS-04, PROD-02) — DSFA, AVV-Dossier, Nutzungsbedingungen; alle Unterlagen liegen versandfertig vor.
4. **Pflegefachliche Inhaltsfreigabe** (QI-01) — Prüfdossier liegt vor; senkt zugleich das höchste Produktrisiko.
5. **Evaluationspartner suchen** (NN-01) — lange Anbahnung.
6. **Testpersonen gewinnen** (BF-02/BF-03) — naheliegend über den eigenen Betrieb.
7. Intern parallel: Playwright-Browser installieren und QS-05 ausführen; Screenreader-Durchgang; Rücksicherung erproben; Auswertung des Zugriffsprotokolls einrichten.

**Was heute nicht behauptet werden darf:** keine Erstattungsfähigkeit, keine
BfArM-Listung, keine Kassenfinanzierung, keine DiPA-Zulassung, keine
TR-03161-Konformität, kein FHIR-Profil-Anspruch, keine ISMS-Zertifizierung.
`COACH_DIPA_MODUS` bleibt `false`, bis eine Aufnahme tatsächlich vorliegt. Der
Strukturtest in `lib/coach/produktgrenze.test.ts` prüft das bei jedem Testlauf mit.

## Quellen

- `lib/coach/anforderungskatalog.ts` — maschinenlesbare Fassung dieser Matrix, geprüft durch `npm run dipa:katalog`
- `audit/dipa/dipav_gap_liste.md` — Gap-Liste
- `audit/dipa/qms_handbuch_pflegecoach.md` — QM-System
- `audit/dipa/risikoakte_pflegecoach.md` — Risiken mit Bewertung
- `audit/DIPA_REGULATORIK_2026-08-09.md` — Regulatorik-Analyse, ORF-1 bis ORF-11
- `audit/dipa/bfarm_fragenkatalog.md` — Fragen für die Beratung
- `docs/DIPA_BFARM_READINESS.md`, `docs/ZERTIFIZIERUNGSLEITFADEN_DIPA_BFARM.md`
