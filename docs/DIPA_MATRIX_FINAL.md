# DiPA-Matrix — Digitaler PflegeCoach

**Stand:** 2026-08-14 · **Produktversion:** 0.5.0 · **Betriebsmodus:** `COACH_DIPA_MODUS=false`

## Wozu dieses Dokument

Diese Matrix beantwortet genau eine Frage: **Was liegt noch zwischen dem heutigen
Produkt und einem Antrag auf Aufnahme ins DiPA-Verzeichnis?** Sie fasst zusammen,
was in `audit/dipa/` über 30 Einzeldokumente verteilt ist, und trennt dabei
konsequent:

- was wir selbst erledigt haben,
- was wir selbst noch erledigen müssen,
- was nur von außen kommen kann (Prüfstelle, Jurist, Ethikkommission, Kasse).

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

### Statuswerte

| Status | Bedeutung |
|---|---|
| `INTERN ERLEDIGT` | Von uns gebaut/dokumentiert, Nachweis im Repo vorhanden. |
| `INTERN OFFEN` | Liegt in unserer Hand, ist aber noch nicht getan. |
| `EXTERN NÖTIG` | Kann nicht intern erzeugt werden — Prüfstelle, Kanzlei, Wissenschaftspartner, Behörde. Vorlaufzeit einplanen. |

> Der Auftrag nannte zwei Statuswerte. Der dritte (`INTERN OFFEN`) ist bewusst
> ergänzt: Ohne ihn müsste jede unfertige eigene Arbeit entweder als „erledigt"
> beschönigt oder als „extern nötig" von uns weggeschoben werden. Beides wäre falsch.

### Wichtiger Vorbehalt zu den Anforderungstexten

Die verbindlichen Anforderungen stehen in DiPAV/SGB XI, im BfArM-Leitfaden und in
BSI TR-03161 — in der zum Antragszeitpunkt gültigen Fassung. Die Formulierungen in
dieser Matrix sind **Arbeitsfassungen**, keine Zitate. `lib/coach/anforderungskatalog.ts`
führt dafür pro Eintrag das Flag `anforderungstextGeprueft`; ein Eintrag zählt dort
erst als erfüllt, wenn jemand den Originaltext dagegen gehalten hat. Aktuell ist
dieses Flag bei den meisten Einträgen `false`. **Vor Antragstellung ist der komplette
Katalog gegen die Originaldokumente zu prüfen** — das ist selbst eine offene Aufgabe
(siehe Zeile REG-01).

---

## 1. Produkt und Zweckbestimmung

| # | Anforderung (Arbeitsfassung) | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|
| PROD-01 | Zweckbestimmung eindeutig formuliert, in Produkt und Unterlagen konsistent | INTERN ERLEDIGT | `audit/dipa/finale_zweckbestimmung.md`; UI: `app/pflegecoach/start/page.tsx` | Bei jeder Funktionsänderung nachziehen |
| PROD-02 | Schriftliche Begründung, warum kein Medizinprodukt vorliegt | INTERN ERLEDIGT | `audit/dipa/mdr_negativabgrenzung.md`; Verbotsliste in `lib/coach/empfehlungen.ts` | Vor Antrag juristisch gegenlesen lassen (Bündel mit DS-02) |
| PROD-03 | Produkt eindeutig identifizierbar und versioniert, Änderungen dokumentiert | INTERN ERLEDIGT | `lib/coach/version.ts` (SemVer), `audit/dipa/CHANGELOG_pflegecoach.md`, Version in UI-Fußzeile/Export/Bericht | Changelog-Disziplin halten |
| PROD-04 | Funktionsumfang vollständig beschrieben | INTERN ERLEDIGT | `audit/dipa/funktionsbeschreibung_pflegecoach.md`, `produktbeschreibung_pflegecoach.md` | Um Selbstzahler-Weg (`/pflegecoach/anfrage`) ergänzen |
| PROD-05 | Zielgruppe definiert und abgegrenzt | INTERN ERLEDIGT | `audit/dipa/zielgruppendefinition.md` | — |
| PROD-06 | Vollständiger Nutzerflow bis Abrechnung abgebildet | INTERN ERLEDIGT | `audit/dipa/nutzerflow_dipa.md`; Migration `20260826010000` | Nach Klärung GAP-DIPA-FLOW ggf. anpassen |

## 2. Datenschutz

| # | Anforderung (Arbeitsfassung) | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|
| DS-01 | Ausdrückliche, versionierte Einwilligung für Gesundheitsdaten (Art. 9 Abs. 2 lit. a) | INTERN ERLEDIGT | `coach_consents` (append-only, Widerruf protokolliert), `app/api/coach/consents`, `lib/coach/consent.ts` | — |
| DS-02 | Datenschutz-Folgenabschätzung (Art. 35) durchgeführt | **EXTERN NÖTIG** | `audit/dipa/dsfa_pflegecoach.md` — Vorbereitung, offene Bewertungen markiert | Kanzlei/DSB beauftragen; Einwilligungstexte + Datenschutzhinweise mitprüfen lassen (sie tragen bis heute den Entwurfs-Hinweis) |
| DS-03 | Löschkonzept mit Löschanspruch und Datenportabilität, technisch umgesetzt | INTERN ERLEDIGT | `audit/dipa/loeschkonzept.md`; `/pflegecoach/loeschung`, `/pflegecoach/einstellungen/konto`, `/api/coach/export` | Backup-Aufbewahrungsfrist im AVV-Dossier festhalten (hängt an DS-04) |
| DS-04 | Auftragsverarbeitungs-Kette produktbezogen dokumentiert (Art. 28) | **EXTERN NÖTIG** | — | AVV-Dossier für Supabase, Vercel, Resend erstellen; Unterauftragnehmer-Liste einholen |
| DS-05 | Verarbeitungsverzeichnis (Art. 30) | INTERN ERLEDIGT | `audit/dipa/verarbeitungsverzeichnis_pflegecoach.md` | Mit DS-02 gegenprüfen lassen |
| DS-06 | Datenflüsse dokumentiert | INTERN ERLEDIGT | `audit/dipa/datenfluesse_pflegecoach.md`, `datenschutzarchitektur_pflegecoach.md` | Um Anfrage-Route (`/api/coach/anfrage`, nur E-Mail, keine DB) ergänzen |
| DS-07 | Keine Nutzung der Produktdaten für Werbung/Cross-Selling | INTERN ERLEDIGT | Keine `anon`-Grants, keine Admin-Policies auf `coach_*`; Tracker unter `/pflegecoach` deaktiviert (`components/ClientSideProviders.tsx`) | Bei jedem neuen Tracker prüfen |

## 3. Datensicherheit

| # | Anforderung (Arbeitsfassung) | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|
| SEC-01 | Zertifikat einer akkreditierten Prüfstelle nach BSI TR-03161 | **EXTERN NÖTIG** | `audit/dipa/tr03161_checkliste.md` — Selbsteinschätzung, **kein Zertifikat** | **Kritischer Pfad, Monate Vorlauf.** Prüfstelle anfragen; Geltung für eine vorläufige Aufnahme klären (BfArM-Frage 9) |
| SEC-02 | Verschlüsselung in Transport und Ruhezustand beschrieben und umgesetzt | INTERN ERLEDIGT | `audit/dipa/verschluesselungskonzept.md` (inkl. begründeter Entscheidung gegen echte E2E) | Im Rahmen SEC-01 verifizieren lassen |
| SEC-03 | Zweiter Faktor bei der Anmeldung | INTERN OFFEN | — | MFA für PflegeCoach-Nutzer bauen. **Nebenbefund:** `app/investor/en/product-technology/page.tsx:186` behauptet MFA — Widerspruch beseitigen |
| SEC-04 | Externer Penetrationstest / unabhängiges Security-Review | **EXTERN NÖTIG** | `audit/dipa/security_review_pflegecoach.md` — Selbst-Review (gleicher Autor wie der Code), PASS mit Auflagen | Pentest beauftragen; Scope: `/pflegecoach` + `/api/coach` + RLS |
| SEC-05 | Informationssicherheits-Managementsystem (ISO 27001 o. ä.) | **EXTERN NÖTIG** | — | ISMS-Beratung; Scope-Frage (BfArM-Frage 11, ORF-2); mit QMS-01 bündeln |
| SEC-06 | Rollen- und Rechtekonzept, technisch durchgesetzt und getestet | INTERN ERLEDIGT | `audit/dipa/rollen_rechtekonzept.md`; `supabase/shadow/50_pflegecoach_tests.sql` — 39/39 PASS | Siehe QS-04 (Tests für die 7 neuen Tabellen fehlen) |
| SEC-07 | Auditierbarkeit der Zugriffe | INTERN ERLEDIGT | `coach_audit_log` (append-only, Metadaten ohne Werte, Trigger auf 9 Datentabellen); `audit/dipa/logging_audit_konzept.md` | — |
| SEC-08 | Trennung des Produkts von der Plattform | INTERN ERLEDIGT (mit Restrisiko) | Eigene Tabellen `coach_*`, eigene RLS, eigenes Layout, kein Betriebszugriff | Trennungstiefe mit dem BfArM klären (Frage 13); Migrationspfad zu eigenem Supabase-Projekt vorplanen |

## 4. Interoperabilität

| # | Anforderung (Arbeitsfassung) | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|
| INT-01 | Maschinenlesbarer, dokumentierter Datenexport | INTERN ERLEDIGT | `lib/coach/export.schema.json` (`de.alltagsengel.pflegecoach.export` v1.0) + Konformanz-Test | — |
| INT-02 | Verbindliches Austauschformat (FHIR/MIO), sofern gefordert | INTERN OFFEN | — | Verbindlichkeit klären (BfArM-Frage 10, ORF-9); Mapping Questionnaire/QuestionnaireResponse/CarePlan ist vorbereitet |
| INT-03 | Menschenlesbarer Bericht zur Weitergabe | INTERN ERLEDIGT | `/pflegecoach/bericht` — unveränderliche Snapshots, druckbar | — |

## 5. Barrierefreiheit und Gebrauchstauglichkeit

| # | Anforderung (Arbeitsfassung) | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|
| BF-01 | Erfüllung des geltenden Barrierefreiheits-Standards (EN 301 549 / WCAG 2.1 AA) | **EXTERN NÖTIG** | Grundausstattung umgesetzt: 3 Schriftgrade (serverseitig gespeichert), Kontrastmodus, Skip-Link, ARIA-Landmarks, Seitenwechsel-Ansage, Touch-Ziele ≥ 48 px, `prefers-reduced-motion` | BITV-Test beauftragen; Nachweisform klären (BfArM-Frage 12) |
| BF-02 | Gebrauchstauglichkeit mit der Zielgruppe geprüft und protokolliert | INTERN OFFEN | `audit/dipa/gebrauchstauglichkeit_testprotokoll.md` — Vorlage vorhanden, **nicht durchgeführt** | Testpersonen aus der Zielgruppe gewinnen, Durchgänge protokollieren |
| BF-03 | Screenreader-Durchgang | INTERN OFFEN | — | Mit BF-02 zusammen durchführen (VoiceOver/NVDA) |

## 6. Qualität der Inhalte

| # | Anforderung (Arbeitsfassung) | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|
| QI-01 | Alle Inhalte pflegefachlich geprüft und freigegeben | INTERN OFFEN | `lib/coach/inhalte.ts` — alle Module tragen `pruefstatus: 'entwurf'`, UI zeigt ein Entwurfs-Badge | Pflegefachkraft mit der Prüfung beauftragen, Freigabe dokumentieren, Status umstellen. **Auch für Produkt A wünschenswert**, dort aber keine Zulassungsvoraussetzung |
| QI-02 | Verwendete Erhebungsinstrumente validiert bzw. lizenziert | **EXTERN NÖTIG** | Produktinternes 7-Item-Kurzinstrument, transparent als nicht validiert gekennzeichnet | Lizenzen für FES-I, HPS/BSFC-s, SUS klären (BfArM-Frage 16) |
| QI-03 | Pflegeprobleme und -ziele fachlich hergeleitet | INTERN ERLEDIGT | `audit/dipa/pflegeprobleme_pflegeziele.md` | Mit QI-01 gegenprüfen lassen |

## 7. Nutzennachweis und Evaluation

| # | Anforderung (Arbeitsfassung) | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|
| NN-01 | Wissenschaftliches Evaluationskonzept, einreichungsreif | **EXTERN NÖTIG** | `audit/dipa/evaluationskonzept.md` — kein Studienpartner, kein Ethikvotum | Hochschul-/Institutspartner gewinnen; Ethikvotum einholen; Methodik klären (ORF-10) |
| NN-02 | Pseudonymisierte, auswertbare Nutzungsdaten | INTERN ERLEDIGT | `coach_nutzungsereignisse` (ohne Zeitstempel, ohne Inhalte), HMAC-Schlüssel in eigener Tabelle ohne Lesezugriff, Aggregation unterdrückt kleine Gruppen; `lib/coach/nachweise.ts` | Vor Pilotstart `COACH_NUTZUNGSNACHWEIS_AKTIV=true` setzen |
| NN-03 | Pilotdesign | INTERN ERLEDIGT | `audit/dipa/pilotdesign.md` | Start hängt an NN-01 und QI-01 |

## 8. Verbraucherschutz

| # | Anforderung (Arbeitsfassung) | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|
| VS-01 | Kernfunktion werbefrei, kein Cross-Selling mit den Daten | INTERN ERLEDIGT | Keine Tracker/Pixel unter `/pflegecoach`; `audit/dipa/eul_konzept.md` | Details der Werbefreiheit klären (ORF-5) |
| VS-02 | Erreichbarer Herstellersupport | INTERN ERLEDIGT | `COACH_SUPPORT_EMAIL` (`info@alltagsengel.care`) in Fußzeile, Produktseite, Einstellungen, Konto-Seite; `/pflegecoach/anfrage` | Reaktionszeit-Zusage festlegen und einhalten |
| VS-03 | Nutzung jederzeit und ohne Hürde beendbar | INTERN ERLEDIGT | `/pflegecoach/einstellungen/konto` — Widerruf, Export, Löschung, Kontolöschung; keine Frist, keine Mindestlaufzeit | — |
| VS-04 | Verständliche Nutzungsbedingungen für den Selbstzahler-Weg | INTERN OFFEN | — | AGB/Leistungsbeschreibung für Produkt A durch DS-02-Mandat mitprüfen lassen (betrifft **Produkt A**, nicht die DiPA-Aufnahme) |

## 9. QMS, Risikomanagement, Betrieb

| # | Anforderung (Arbeitsfassung) | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|
| QMS-01 | Dokumentiertes Qualitäts- und Risikomanagementsystem | INTERN OFFEN | Bausteine vorhanden (Changelog, Versionierung, Review-Doku, Test-Gates, Audit-Log), aber nicht als QMS verfasst | Schlankes, produktbezogenes QMS-Handbuch + Risikoakte; ggf. mit SEC-05 bündeln |
| QMS-02 | Risikoanalyse | INTERN ERLEDIGT | `audit/dipa/risikoanalyse_pflegecoach.md` | In die Risikoakte aus QMS-01 überführen |
| QMS-03 | Technische Dokumentation | INTERN ERLEDIGT | `audit/dipa/technische_dokumentation_pflegecoach.md`, `sicherheitsarchitektur_pflegecoach.md` | Auf Version 0.5.0 fortschreiben |
| QS-04 | Automatisierte Tests decken die Produktlogik und die Zugriffsregeln ab | INTERN ERLEDIGT (mit Lücke) | `lib/coach/*.test.ts`; `supabase/shadow/50_pflegecoach_tests.sql` 39/39 | Shadow-Tests um die 7 Tabellen aus `20260826010000` erweitern: Pseudonym-Isolation, kein Admin-Zugriff auf `coach_freischaltungen`, kein Selbst-Insert |
| QS-05 | Browser-E2E-Test des Produktbereichs | INTERN OFFEN | Playwright im Repo vorhanden, keine Suite für `/pflegecoach` | E2E-Suite gegen Preview schreiben |
| BETR-01 | Datenbankstand des Produkts auf Production | INTERN ERLEDIGT | Migrationen `20260819010000` und `20260826010000` sind live (per Tabellencheck am 12.08.2026 bestätigt) | Bei neuen Migrationen Live-Apply verifizieren, nicht annehmen |

## 10. Verfahren und offene regulatorische Fragen

| # | Frage | Status | Nachweis | Nächste Aktion |
|---|---|---|---|---|
| REG-01 | Anforderungstexte gegen die Originaldokumente geprüft | INTERN OFFEN | `lib/coach/anforderungskatalog.ts` — `anforderungstextGeprueft` überwiegend `false` | Vor Antrag: DiPAV, BfArM-Leitfaden, TR-03161 in gültiger Fassung durcharbeiten und je Eintrag setzen |
| REG-02 | Ist ein Freischaltcode-Verfahren verbindlich, und wer gibt die Codes aus? | **EXTERN NÖTIG** | Mechanismus vollständig gebaut, per `COACH_FREISCHALTUNG_PFLICHT=false` deaktiviert | In der BfArM-Beratung klären, danach Schalter setzen |
| REG-03 | Qualifikationsanforderungen an eUL-Erbringer | **EXTERN NÖTIG** | `audit/dipa/eul_qualitaetsanforderungen.md` — Kriterien **selbst gesetzt**, nicht regulatorisch abgeleitet (ORF-1) | Klären, dann Kriterien bestätigen oder ersetzen |
| REG-04 | Vergütung und Abrechnungsweg | **EXTERN NÖTIG** | `coach_abrechnungswege` + `lib/coach/abrechnung.ts` — fail-closed über `verguetung_geklaert`, keine Beträge im Code | Erst nach Aufnahme verhandelbar |
| REG-05 | Formaler BfArM-Beratungstermin | **EXTERN NÖTIG** | `audit/dipa/bfarm_fragenkatalog.md` — Fragen 1–20 vorbereitet | Termin beantragen. **Günstigster nächster Schritt insgesamt:** klärt REG-02 bis REG-04, SEC-01, INT-02 und QI-02 in einem Zug |

---

## Zusammenfassung

| Status | Anzahl | Anteil |
|---|---|---|
| INTERN ERLEDIGT | 27 | 56 % |
| INTERN OFFEN | 9 | 19 % |
| EXTERN NÖTIG | 12 | 25 % |
| **Summe** | **48** | |

**Was den Zeitplan bestimmt, ist nicht die Software.** Von den 21 nicht erledigten
Punkten sind 12 nur von außen zu beschaffen, und zwei davon haben Vorlauf in
Monaten: das TR-03161-Zertifikat (SEC-01) und der Evaluationspartner samt
Ethikvotum (NN-01). Beide sollten unabhängig voneinander sofort angestoßen werden.

**Empfohlene Reihenfolge:**

1. **BfArM-Beratungstermin beantragen** (REG-05) — beseitigt sechs Unklarheiten auf einmal und verhindert Fehlinvestitionen in SEC-01 und INT-02.
2. **TR-03161-Prüfstelle anfragen** (SEC-01) — längste Vorlaufzeit, parallel zu allem anderen.
3. **DSFA und AVV-Dossier beauftragen** (DS-02, DS-04) — ein Mandat; nimmt VS-04 und PROD-02 mit.
4. **Pflegefachliche Inhaltsfreigabe** (QI-01) — hebt zugleich die Qualität von Produkt A.
5. **Evaluationspartner suchen** (NN-01) — lange Anbahnung, früh beginnen.
6. Intern parallel: MFA (SEC-03), QMS-Handbuch (QMS-01), Shadow-Tests (QS-04), E2E-Suite (QS-05), Gebrauchstauglichkeit (BF-02/BF-03).

**Was heute nicht behauptet werden darf:** keine Erstattungsfähigkeit, keine
BfArM-Listung, keine Kassenfinanzierung, keine DiPA-Zulassung. `COACH_DIPA_MODUS`
bleibt `false`, bis eine Aufnahme tatsächlich vorliegt. Der Strukturtest in
`lib/coach/produktgrenze.test.ts` prüft das bei jedem Testlauf mit.

## Quellen

- `audit/dipa/dipav_gap_liste.md` — die führende Gap-Liste, Grundlage dieser Matrix
- `lib/coach/anforderungskatalog.ts` — maschinenlesbare Sicht mit Prüfstatus je Anforderung
- `audit/DIPA_REGULATORIK_2026-08-09.md` — Regulatorik-Analyse, ORF-1 bis ORF-11
- `audit/dipa/bfarm_fragenkatalog.md` — Fragen für die Beratung
- `docs/DIPA_BFARM_READINESS.md`, `docs/ZERTIFIZIERUNGSLEITFADEN_DIPA_BFARM.md`
