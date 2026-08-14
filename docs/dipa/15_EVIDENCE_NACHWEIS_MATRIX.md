# Evidenz-/Nachweis-Matrix — Digitaler PflegeCoach

**Stand:** 2026-08-14
**Zweck:** Kompaktversion der 48-Punkte-DiPA-Matrix, fokussiert auf die Frage „Liegt ein Beleg vor?" — Nachweis-Spalte direkt aus `docs/DIPA_MATRIX_FINAL.md` übernommen.

---

## Legende

* **Liegt vor? Ja** — Status in der Matrix ist `ERLEDIGT` (auch mit Zusatz wie „mit Restrisiko" oder Datum).
* **Liegt vor? Teilweise** — Status ist `TEILWEISE` oder ein hybrider Status („technisch erledigt, Verbindlichkeit extern").
* **Liegt vor? Nein** — Status ist `OFFEN` oder `EXTERN`. Bei `EXTERN` zusätzlich als **EXTERN_BENÖTIGT** markiert.

Die Spalte „Nachweisdatei" ist wörtlich aus der Nachweis-Spalte der Matrix
übernommen. Die Spalte „Fehlt noch" aus deren Spalte „Nächste Aktion".

---

## 1. Produkt und Zweckbestimmung

| # | Liegt vor? | Nachweisdatei | Fehlt noch |
|---|---|---|---|
| PROD-01 | Ja | `audit/dipa/finale_zweckbestimmung.md`; UI: `app/pflegecoach/start/page.tsx` | Bei jeder Funktionsänderung nachziehen |
| PROD-02 | Ja | `audit/dipa/mdr_negativabgrenzung.md`; Verbotsliste in `lib/coach/empfehlungen.ts` | Vor Antrag juristisch gegenlesen lassen (Bündel mit DS-02, VS-04) |
| PROD-03 | Ja | `lib/coach/version.ts` (SemVer), `audit/dipa/CHANGELOG_pflegecoach.md` | Changelog-Disziplin halten |
| PROD-04 | Ja | `audit/dipa/funktionsbeschreibung_pflegecoach.md`, `produktbeschreibung_pflegecoach.md` | Um Selbstzahler-Weg ergänzen |
| PROD-05 | Ja | `audit/dipa/zielgruppendefinition.md` | — |
| PROD-06 | Ja | `audit/dipa/nutzerflow_dipa.md`; Migration `20260826010000` | Nach Klärung von REG-02 ggf. anpassen |

## 2. Datenschutz

| # | Liegt vor? | Nachweisdatei | Fehlt noch |
|---|---|---|---|
| DS-01 | Ja | `coach_consents` (append-only, Widerruf protokolliert), `lib/coach/consent.ts` | — |
| DS-02 | **Nein — EXTERN_BENÖTIGT** | `audit/dipa/dsfa_pflegecoach.md` — Vorbereitung, offene Bewertungen markiert | Kanzlei/DSB beauftragen; Einwilligungstexte und Datenschutzhinweise mitprüfen lassen |
| DS-03 | Ja | `audit/dipa/loeschkonzept.md`; `/pflegecoach/loeschung`, `/api/coach/export` | Aufbewahrungsfrist der Sicherungen festhalten — hängt an DS-04 |
| DS-04 | **Nein — EXTERN_BENÖTIGT** | `audit/dipa/avv_dossier_pflegecoach.md` — Kette für Supabase, Vercel, Resend, Stripe erhoben; 10-Punkte-Prüfliste; Verträge fehlen | Verträge beschaffen, Unterauftragnehmerlisten anfordern, Sicherungsfristen erfragen |
| DS-05 | Ja | `audit/dipa/verarbeitungsverzeichnis_pflegecoach.md` | Mit DS-02 gegenprüfen lassen |
| DS-06 | Ja | `audit/dipa/datenfluesse_pflegecoach.md`, `datenschutzarchitektur_pflegecoach.md`, `interoperabilitaet_fhir.md` | — |
| DS-07 | Ja | Keine `anon`-Grants, keine Admin-Policies auf `coach_*`; Tracker deaktiviert; E2E-Test prüft die geladenen Fremdhosts | Bei jedem neuen Tracker prüfen |

## 3. Datensicherheit

| # | Liegt vor? | Nachweisdatei | Fehlt noch |
|---|---|---|---|
| SEC-01 | **Nein — EXTERN_BENÖTIGT** | `audit/dipa/tr03161_checkliste.md` — Selbsteinschätzung, **kein Zertifikat** | Kritischer Pfad, Monate Vorlauf. Prüfstelle anfragen; Geltung für vorläufige Aufnahme klären (BfArM-Frage 9) |
| SEC-02 | Ja | `audit/dipa/verschluesselungskonzept.md` (inkl. begründeter Entscheidung gegen echte E2E) | Im Rahmen SEC-01 verifizieren lassen |
| SEC-03 | Ja (14.08.2026) | `lib/coach/mfa.ts` + 9 Tests; `/pflegecoach/einstellungen/sicherheit`; serverseitige Durchsetzung in `lib/coach/api-auth.ts` | Entscheidung über `COACH_MFA_PFLICHT` mit dem BfArM klären |
| SEC-04 | **Nein — EXTERN_BENÖTIGT** | `audit/dipa/pentest_beauftragung_scope.md` — versandfertige Beauftragungsunterlage | An mindestens drei Anbieter zur Angebotseinholung geben |
| SEC-05 | **Nein — EXTERN_BENÖTIGT** | `audit/dipa/isms_scope_vorbereitung.md` — 3 Geltungsbereiche bewertet, 5 größte Lücken benannt | Geltungsbereich mit dem BfArM klären (Frage 11), dann Beratung anfragen |
| SEC-06 | Ja | `audit/dipa/rollen_rechtekonzept.md`; `supabase/shadow/50_pflegecoach_tests.sql` — 68/68 bestanden am 14.08.2026 | — |
| SEC-07 | Ja | `coach_audit_log` (append-only, Metadaten ohne Werte); Tests P7 | Auswertung/Alarmierung einrichten (siehe SEC-05, Lücke 5) |
| SEC-08 | Ja (mit Restrisiko) | Eigene Tabellen, eigene Policies, eigenes Layout; Tests P9.5 belegen Trennung auch in Gegenrichtung | Trennungstiefe mit dem BfArM klären (Frage 13) |

## 4. Interoperabilität

| # | Liegt vor? | Nachweisdatei | Fehlt noch |
|---|---|---|---|
| INT-01 | Ja | `lib/coach/export.schema.json` (`de.alltagsengel.pflegecoach.export` v1.0) + Konformanz-Test | — |
| INT-02 | **Teilweise** — technisch erledigt, Verbindlichkeit extern | `lib/coach/fhir.ts` + 13 Tests; FHIR-R4-Bundle über `/api/coach/export?format=fhir`; Doku: `audit/dipa/interoperabilitaet_fhir.md`. Ausdrücklich ohne Profil-, LOINC- oder SNOMED-Anspruch | Verbindlichkeit klären (BfArM-Frage 10, ORF-9); erst danach Profilvalidierung beauftragen |
| INT-03 | Ja | `/pflegecoach/bericht` — unveränderliche Snapshots, druckbar | — |

## 5. Barrierefreiheit und Gebrauchstauglichkeit

| # | Liegt vor? | Nachweisdatei | Fehlt noch |
|---|---|---|---|
| BF-01 | **Nein — EXTERN_BENÖTIGT** | Grundausstattung umgesetzt (3 Schriftgrade, Kontrastmodus, Skip-Link, ARIA-Landmarks, Touch-Ziele ≥ 44 px, `prefers-reduced-motion`); Strukturprüfung in `e2e/pflegecoach.spec.ts` | BITV-Test beauftragen; Nachweisform klären (BfArM-Frage 12) |
| BF-02 | **Nein — EXTERN_BENÖTIGT (Testpersonen)** | `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md` — 5 Testpersonen definiert, 9 Aufgaben mit Zeitlimits und Erfolgskriterien | Testpersonen gewinnen — ohne Vorkenntnis des Produkts |
| BF-03 | Teilweise | Maschinelle Strukturprüfung (H1 je Seite, eindeutige Titel, Sprungmarke, Landmarks, beschriftete Felder, kein Überlauf bei 200 % Schrift); Prüfpunkte S1–S8 festgelegt | Manuellen Durchgang mit VoiceOver/NVDA durchführen — zusammen mit BF-02 |

## 6. Qualität der Inhalte

| # | Liegt vor? | Nachweisdatei | Fehlt noch |
|---|---|---|---|
| QI-01 | **Nein — EXTERN_BENÖTIGT** | `audit/dipa/inhalte_pruefdossier.md` — Prüfgegenstand (12 Module), Kriterien K1–K6, Einstufungen, Protokollform. Alle Module weiterhin `pruefstatus: 'entwurf'` | Pflegefachkraft beauftragen — höchstes Produktrisiko (R1.4), betrifft auch Produkt A |
| QI-02 | **Nein — EXTERN_BENÖTIGT** | Produktinternes 7-Item-Kurzinstrument, transparent als nicht validiert gekennzeichnet; FHIR-Export überträgt nur Summenwerte | Lizenzen für FES-I, HPS/BSFC-s, SUS klären (BfArM-Frage 16) |
| QI-03 | Ja | `audit/dipa/pflegeprobleme_pflegeziele.md` | Mit QI-01 gegenprüfen lassen |

## 7. Nutzennachweis und Evaluation

| # | Liegt vor? | Nachweisdatei | Fehlt noch |
|---|---|---|---|
| NN-01 | **Nein — EXTERN_BENÖTIGT** | `audit/dipa/evaluationskonzept.md` — kein Studienpartner, kein Ethikvotum | Hochschul-/Institutspartner gewinnen; Ethikvotum einholen (ORF-10) |
| NN-02 | Ja | `coach_nutzungsereignisse` (ohne Zeitstempel, ohne Inhalte); Tests P9.1/P9.2 | Vor Pilotstart `COACH_NUTZUNGSNACHWEIS_AKTIV=true` setzen |
| NN-03 | Ja | `audit/dipa/pilotdesign.md` | Start hängt an NN-01 und QI-01 |

## 8. Verbraucherschutz

| # | Liegt vor? | Nachweisdatei | Fehlt noch |
|---|---|---|---|
| VS-01 | Ja | Keine Tracker unter `/pflegecoach`; E2E-Test prüft geladene Fremdhosts | Details der Werbefreiheit klären (ORF-5) |
| VS-02 | Ja | `COACH_SUPPORT_EMAIL` in Fußzeile, Produktseite, Einstellungen, Konto-Seite; `/pflegecoach/anfrage` | Reaktionszeit-Zusage festlegen — bis dahin nicht behauptet |
| VS-03 | Ja | `/pflegecoach/einstellungen/konto` — Widerruf, Export, Löschung, Kontolöschung; keine Frist | — |
| VS-04 | **Nein — EXTERN_BENÖTIGT** | `audit/dipa/nutzungsbedingungen_entwurf_selbstzahler.md` — 13 Paragrafen, Prüfliste. Nicht wirksam, nicht veröffentlicht | Zusammen mit DS-02 und PROD-02 in ein Mandat geben |

## 9. QMS, Risikomanagement, Betrieb

| # | Liegt vor? | Nachweisdatei | Fehlt noch |
|---|---|---|---|
| QMS-01 | Ja (14.08.2026) | `audit/dipa/qms_handbuch_pflegecoach.md`, `risikoakte_pflegecoach.md`, `software_lebenszyklus_pflegecoach.md` | Externe Auditierung — hängt an SEC-05 |
| QMS-02 | Ja | `audit/dipa/risikoanalyse_pflegecoach.md` + Risikoakte: 0 kritisch, 3 hoch, 11 mittel, 5 niedrig | Wiedervorlage bei jeder MINOR-Version |
| QMS-03 | Ja | `technische_dokumentation_pflegecoach.md`, `sicherheitsarchitektur_pflegecoach.md`, `software_lebenszyklus_pflegecoach.md` | Auf Version 0.5.0 fortschreiben |
| QS-04 | Ja (14.08.2026) | `supabase/shadow/50_pflegecoach_tests.sql`: 68/68 bestanden, real gemessen | Bei neuen Tabellen mitziehen |
| QS-05 | **Ja (14.08.2026)** | `e2e/pflegecoach.spec.ts` — 24 Tests, ausgeführt gegen Chromium und Mobile Safari (24/24 grün, beide Browser, reproduziert). Dabei 4 Fehler in der Testlogik behoben, 1 echter Produktfehler (Reflow auf schmalen Viewports) gefunden und behoben. In `.github/workflows/ci.yml` aufgenommen | Bei neuen Seiten/Formularfeldern mitziehen |
| BETR-01 | Ja | Migrationen `20260819010000` und `20260826010000` live (Tabellencheck 12.08.2026) | Live-Apply-Bestätigung bleibt Pflichtschritt im Änderungsverfahren |

## 10. Verfahren und offene regulatorische Fragen

| # | Liegt vor? | Nachweisdatei | Fehlt noch |
|---|---|---|---|
| REG-01 | Nein | Werkzeug `npm run dipa:katalog` — prüft alle 91 Nachweisverweise, meldet 43 ungeprüfte Anforderungstexte | Vor Antrag: DiPAV, BfArM-Leitfaden, TR-03161 durcharbeiten, je Eintrag `anforderungstextGeprueft` setzen |
| REG-02 | **Nein — EXTERN_BENÖTIGT** | Mechanismus vollständig gebaut und getestet, per `COACH_FREISCHALTUNG_PFLICHT=false` deaktiviert | In der BfArM-Beratung klären, danach Schalter setzen |
| REG-03 | **Nein — EXTERN_BENÖTIGT** | `audit/dipa/eul_qualitaetsanforderungen.md` — Kriterien selbst gesetzt, nicht regulatorisch abgeleitet (ORF-1) | Klären, dann Kriterien bestätigen oder ersetzen |
| REG-04 | **Nein — EXTERN_BENÖTIGT** | `coach_abrechnungswege` + `lib/coach/abrechnung.ts` — fail-closed über `verguetung_geklaert`, keine Beträge im Code | Erst nach Aufnahme verhandelbar |
| REG-05 | **Nein — EXTERN_BENÖTIGT** | `audit/dipa/bfarm_fragenkatalog.md` — Fragen 1–20 vorbereitet | Termin beantragen. Günstigster nächster Schritt insgesamt |

---

## Zusammenfassung (je Liegt-vor-Status, aus den 48 Zeilen oben gezählt)

| Liegt vor? | Anzahl |
|---|---|
| Ja | 30 (QS-05 am 14.08.2026 hinzugekommen) |
| Teilweise | 2 (INT-02, BF-03) |
| Nein (davon 15 EXTERN_BENÖTIGT, 1 intern offen: REG-01) | 16 |

**Hinweis zur Abweichung von der Zusammenfassung in `docs/DIPA_MATRIX_FINAL.md`:**
Die dortige Tabelle „Nach Status" führt TEILWEISE/in Arbeit mit 9 und OFFEN mit
10 (statt hier 3 bzw. 16). Der Unterschied liegt darin, dass die Matrix dort
weitere Differenzierungen (z. B. „ERLEDIGT mit Restrisiko" als eigene Zeile in
der Änderungstabelle, unterschiedliche Zählweise von Klasse D/E) vornimmt, die
in dieser Kompaktversion bewusst auf die drei einfachen Kategorien Ja/Teilweise/Nein
reduziert wurden. Für die verbindliche Zählung gilt `docs/DIPA_MATRIX_FINAL.md`.

---

## Quellen

* `docs/DIPA_MATRIX_FINAL.md` — vollständige 48-Punkte-Matrix mit Klassen, Status, Nachweisen und nächsten Aktionen (maßgeblich)
* `lib/coach/anforderungskatalog.ts` — maschinenlesbare Fassung, geprüft durch `npm run dipa:katalog`
