# DiPA — Eindeutige 48-Punkte-Matrix (15.08.2026)

**Status:** Diese Datei ist ab sofort die aktuellste Quelle. Sie ersetzt
`docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md` als Referenz (der Reverify bleibt als
Änderungsprotokoll stehen) und die veralteten Tabellen in `docs/DIPA_MATRIX_FINAL.md`.
Maschinenlesbares Gegenstück: `lib/coach/anforderungskatalog.ts`
(`npm run dipa:katalog`), gleiche 48 IDs.

**Regel dieser Matrix:** Jeder Punkt trägt **genau einen** Status aus der Liste
unten — keine Mischformen wie bisher ("PARTIAL / EXTERNAL_REQUIRED"). Wo die
Realität zwei Aspekte hat (z. B. "Umsetzung fertig, aber Zertifikat fehlt"), steht
das in der Spalte "Blocker", nicht im Status selbst.

## Status-Werte

| Status | Bedeutung |
|---|---|
| `PASS_INTERNAL` | Intern erfüllt, Nachweis vorhanden, Anforderungstext gegen Quelle verifiziert |
| `PASS_EXTERNAL_EVIDENCE_AVAILABLE` | Intern erfüllt, externer Nachweis liegt bereits vor |
| `EXTERNAL_EVIDENCE_REQUIRED` | Implementierung ggf. vorhanden, aber externer Nachweis/Prüfung fehlt |
| `PARTIAL` | Teilweise erfüllt, konkreter Rest benannt |
| `FAIL` | Nicht erfüllt |
| `NOT_APPLICABLE` | Nicht anwendbar |
| `UNVERIFIED` | Status unklar, Anforderungstext nicht gegen Originalquelle geprüft |

## Ergebnis in Zahlen

```
PASS_INTERNAL                      21
PASS_EXTERNAL_EVIDENCE_AVAILABLE    0
EXTERNAL_EVIDENCE_REQUIRED         12
PARTIAL                             3
FAIL                                0
NOT_APPLICABLE                      0
UNVERIFIED                         12
────────────────────────────────────
Gesamt                             48
```

## Die "44 %"-Quote — nachgerechnet und erklärt

`katalogFortschritt()` in `lib/coach/anforderungskatalog.ts` rechnet:

```
relevant = alle Einträge außer stand === 'nicht_anwendbar'   → 48 (kein Eintrag ist n/a)
erfuellt = Einträge mit stand === 'erfuellt' UND anforderungstextGeprueft === true
quote    = erfuellt / relevant.length
```

Nachgerechnet (Skript-Auszählung des aktuellen Dateiinhalts, 15.08.2026):
`erfuellt` (stand=erfuellt **und** geprüft) = **21** von 48 → 21/48 = 0,4375 →
gerundet **44 %**. Das ist exakt die Zahl unter `PASS_INTERNAL` oben — die beiden
Definitionen sind identisch, nur unterschiedlich benannt.

**Die Berechnung ist korrekt und reproduzierbar.** Zwei Zahlen kursierten bisher
nebeneinander und wurden mitunter verwechselt:

- **36/48 "textlich geprüft"** — zählt `anforderungstextGeprueft === true`
  unabhängig vom Status. Sagt nur: bei 36 Einträgen hat jemand den Originaltext
  gelesen (unabhängig davon, ob die Anforderung erfüllt ist).
- **21/48 = 44 % "belastbare Quote"** — zählt nur Einträge, die **sowohl**
  geprüft **als auch** tatsächlich erfüllt sind. Das ist die einzige Zahl, die
  etwas über den Zulassungsfortschritt aussagt; die 36/48 sagt nur etwas über den
  Rechercheaufwand.

Ein Eintrag kann text-geprüft und trotzdem nicht erfüllt sein (z. B. AK-SEC-01:
geprüft, aber `stand: offen`, weil das Zertifikat fehlt) — deshalb ist 44 % kleiner
als 36/48 = 75 %, nicht gleich groß. Das ist kein Rechenfehler, sondern der Sinn
der zwei getrennten Kennzahlen.

---

## 1. Produkt und Zweckbestimmung

| ID | Originalanforderung | Primärquelle (Fundstelle) | Produktnachweis | Technischer Nachweis | Externer Nachweis | Status | Blocker | Nächste Aktion |
|---|---|---|---|---|---|---|---|---|
| PROD-01 | Zweckbestimmung eindeutig und konsistent verwendet | DiPAV §2 Abs.1 Nr.2, Nr.6 | `app/pflegecoach/start/page.tsx` | `audit/dipa/finale_zweckbestimmung.md` | — | PASS_INTERNAL | — | Bei Funktionsänderung nachziehen |
| PROD-02 | Kein Medizinprodukt — schriftliche Begründung | MDR Art. 2 Nr. 1 (VO (EU) 2017/745) | `lib/coach/empfehlungen.ts` Verbotsliste | `audit/dipa/mdr_negativabgrenzung.md` | — | PASS_INTERNAL | Juristische Schlussprüfung vor Antrag empfohlen (nicht blockierend für diesen Status) | Bündel mit DS-02/VS-04 beauftragen |
| PROD-03 | Versioniert, Änderungen dokumentiert | Kein externer Normtext, eigene Disziplin | `lib/coach/version.ts` | `audit/dipa/CHANGELOG_pflegecoach.md` | — | PASS_INTERNAL | — | Changelog-Disziplin halten |
| PROD-04 | Funktionsumfang vollständig beschrieben | DiPAV §2 Abs.1 Nr.7 | `audit/dipa/funktionsbeschreibung_pflegecoach.md` | `audit/dipa/produktbeschreibung_pflegecoach.md` | — | PASS_INTERNAL | — | — |
| PROD-05 | Zielgruppe definiert und abgegrenzt | DiPAV §2 Abs.1 Nr.11 | `audit/dipa/zielgruppendefinition.md` | — | — | PASS_INTERNAL | — | — |
| PROD-06 | Vollständiger Nutzerflow bis Abrechnung abgebildet | Kein Textfund in DiPAV | `audit/dipa/nutzerflow_dipa.md`, Migration 20260826010000 | — | — | UNVERIFIED | Kein DiPAV-Antragsinhalt gefunden, der diesen Punkt trägt | Prüfen, ob Punkt in DiPAV/Leitfaden überhaupt existiert oder eigenständiger QS-Punkt ist |

## 2. Datenschutz

| ID | Originalanforderung | Primärquelle (Fundstelle) | Produktnachweis | Technischer Nachweis | Externer Nachweis | Status | Blocker | Nächste Aktion |
|---|---|---|---|---|---|---|---|---|
| DS-01 | Ausdrückliche, versionierte Einwilligung für Gesundheitsdaten | DSGVO Art. 9 Abs. 2 lit. a | `lib/coach/consent.ts`, `app/api/coach/consents` | `lib/coach/consent.test.ts` | — | PASS_INTERNAL | — | — |
| DS-02 | Datenschutz-Folgenabschätzung durchgeführt | DSGVO Art. 35 | `audit/dipa/dsfa_pflegecoach.md` (Entwurf) | — | fehlt | EXTERNAL_EVIDENCE_REQUIRED | Juristische Schlussbewertung fehlt | Kanzlei beauftragen (Bündel mit PROD-02/VS-04) |
| DS-03 | Löschkonzept, Löschanspruch, Datenportabilität | DSGVO Art. 17, 20 | `/pflegecoach/loeschung`, `/api/coach/export` | `audit/dipa/loeschkonzept.md` | — | PASS_INTERNAL | Aufbewahrungsfrist der Sicherungen hängt an DS-04 | — |
| DS-04 | Auftragsverarbeitungs-Kette dokumentiert | DSGVO Art. 28 | `audit/dipa/avv_dossier_pflegecoach.md` (Kette erhoben) | — | fehlt (Verträge) | EXTERNAL_EVIDENCE_REQUIRED | AVV-Verträge mit bestehenden Auftragsverarbeitern nicht gegengezeichnet | Gegenzeichnung bei Hosting/Zahlungsdienstleister einholen — siehe Reklassifizierung: kein neuer Dienstleister nötig, nur Signatur |
| DS-05 | Verzeichnis der Verarbeitungstätigkeiten | DSGVO Art. 30 | `audit/dipa/verarbeitungsverzeichnis_pflegecoach.md` | — | — | PASS_INTERNAL | — | — |
| DS-06 | Datenflüsse dokumentiert | Kein eigener Textfund (deckt sich vermutlich mit DS-05) | `audit/dipa/datenfluesse_pflegecoach.md`, `datenschutzarchitektur_pflegecoach.md` | — | — | UNVERIFIED | Kein eigenständiger Normtext gefunden | Klären, ob Punkt eigenständig ist oder mit DS-05 zusammenfällt |
| DS-07 | Kein Cross-Selling/Werbung mit Produktdaten | DiPAV §5 Abs. 5 | `components/ClientSideProviders.tsx` (Tracker aus) | `e2e/pflegecoach.spec.ts` (geladene Hosts) | — | PASS_INTERNAL | — | Bei neuem Tracker erneut prüfen |

## 3. Datensicherheit

| ID | Originalanforderung | Primärquelle (Fundstelle) | Produktnachweis | Technischer Nachweis | Externer Nachweis | Status | Blocker | Nächste Aktion |
|---|---|---|---|---|---|---|---|---|
| SEC-01 | Datensicherheitszertifikat (BSI TR-03161) | DiPAV §5 Abs.2 Nr.1, §8 Abs.3 + §78a Abs.7 SGB XI + §139e Abs.10 SGB V | `audit/dipa/tr03161_checkliste.md` (Selbsteinschätzung) | — | fehlt (Zertifikat) | EXTERNAL_EVIDENCE_REQUIRED | Zertifikat nur durch akkreditierte Prüfstelle; Übergangs-Erklärung seit 1.1.2025 nicht mehr zulässig (siehe Reklassifizierung) | Prüfstelle beauftragen (TÜVIT/secuvera/IT-TÜV o. ä.) — P0, kritischer Pfad |
| SEC-02 | Verschlüsselung Transport/Ruhezustand | Kein Textfund in Anlage 1 | `audit/dipa/verschluesselungskonzept.md` | — | — | UNVERIFIED | Kein Textfund; hängt evtl. an SEC-01/TR-03161-Kriterienkatalog | Nach TR-03161-Volltext erneut prüfen |
| SEC-03 | Zweiter Faktor bei Anmeldung | Kein Textfund in DiPAV/Anlage 1 | `lib/coach/mfa.ts` (TOTP) | `lib/coach/mfa.test.ts`, serverseitige Durchsetzung `lib/coach/api-auth.ts` | — | UNVERIFIED | Kein Textfund | Nach TR-03161-Volltext erneut prüfen |
| SEC-04 | Externer Penetrationstest | DiPAV §8 Abs.3; BfArM-Leitfaden Kap.3.4 | `audit/dipa/pentest_beauftragung_scope.md` | — | fehlt | EXTERNAL_EVIDENCE_REQUIRED | Faktisch Teil des SEC-01-Zertifizierungsprozesses, keine unabhängige zweite Beschaffung | **Nicht separat beauftragen** — mit SEC-01 zusammen vergeben |
| SEC-05 | Informationssicherheits-Managementsystem (ISO 27001) | BfArM-Leitfaden Kap.3.4.1 S.50 — **nicht** in Anlage 1 DiPAV selbst | `audit/dipa/isms_scope_vorbereitung.md` | — | fehlt (Zertifikat) | EXTERNAL_EVIDENCE_REQUIRED | DAkkS-akkreditierte Stelle; Rechtsgrundlage ist Verwaltungsleitfaden, nicht Verordnungstext (geringere Verbindlichkeit als SEC-01, siehe Reklassifizierung) | Geltungsbereich klären, dann Zertifizierungsstelle beauftragen |
| SEC-06 | Rollen-/Rechtekonzept technisch durchgesetzt | Kein Textfund | RLS-Policies | `supabase/shadow/50_pflegecoach_tests.sql` (68/68) | — | UNVERIFIED | Kein Textfund | Nach TR-03161-Volltext erneut prüfen |
| SEC-07 | Auditierbarkeit der Zugriffe | Kein Textfund | `coach_audit_log` (append-only) | Tests P7 | — | UNVERIFIED | Kein Textfund | Nach TR-03161-Volltext erneut prüfen |
| SEC-08 | Trennung von Betriebsplattform | Kein Textfund | eigene Tabellen/Policies | Tests P3, P9.5 | — | UNVERIFIED | Kein Textfund; Trennungstiefe offen (BfArM-Frage 13) | Nach TR-03161-Volltext bzw. BfArM-Beratung klären |

## 4. Interoperabilität

| ID | Originalanforderung | Primärquelle (Fundstelle) | Produktnachweis | Technischer Nachweis | Externer Nachweis | Status | Blocker | Nächste Aktion |
|---|---|---|---|---|---|---|---|---|
| INT-01 | Maschinenlesbarer, dokumentierter Export | Kein externer Normtext | `lib/coach/export.schema.json` | `lib/coach/export.test.ts` | — | PASS_INTERNAL | — | — |
| INT-02 | Verbindliches Austauschformat (FHIR), sofern gefordert | DiPAV §7, §2 Abs.1 Nr.20 + BfArM-Leitfaden Kap.2 ("erste Wahl", keine absolute Pflicht) | `lib/coach/fhir.ts` (FHIR-R4-Bundle) | `lib/coach/fhir.test.ts` (13 Tests) | — | PARTIAL | Verbindlichkeit im Einzelfall ungeklärt | Mit BfArM-Beratung klären (Bündel-Frage) |
| INT-03 | Menschenlesbarer Bericht zur Weitergabe | DiPAV §2 Abs.1 Nr.20 | `app/pflegecoach/bericht/page.tsx` | `audit/dipa/exportfunktionen.md` | — | PASS_INTERNAL | — | — |

## 5. Barrierefreiheit und Gebrauchstauglichkeit

| ID | Originalanforderung | Primärquelle (Fundstelle) | Produktnachweis | Technischer Nachweis | Externer Nachweis | Status | Blocker | Nächste Aktion |
|---|---|---|---|---|---|---|---|---|
| BF-01 | Barrierefreiheits-Standard erfüllt | Anlage 2 DiPAV Themenfeld IV Pkt.13 (**DIN EN ISO 9241-171**, wörtlich bestätigt am 15.08.2026 gegen Anlage-2-Rohtext) | Grundausstattung (Kontrast, Zielgrößen ≥44px) | `e2e/pflegecoach-axe.spec.ts` (deckt nicht Anhang C/D ab) | fehlt (Konformitätsprüfung) | EXTERNAL_EVIDENCE_REQUIRED | Anlage 2 ist als Selbstauskunfts-Fragebogen formuliert — externe Prüfung nur nötig, falls BfArM darüber hinausgeht (siehe Reklassifizierung) | Klären, ob Selbstauskunft genügt, bevor externe Prüfstelle beauftragt wird |
| BF-02 | Gebrauchstauglichkeit mit Zielgruppe geprüft | Anlage 2 DiPAV Themenfeld 4 + Leitfaden Kap.3.6.3.1 (formativ+summativ) | `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md` (bisher nur summativ) | — | fehlt (Testbericht) | EXTERNAL_EVIDENCE_REQUIRED | Testpersonen fehlen; formative Runde fehlt im Plan | Testpersonen ggf. aus eigenem Kundenstamm rekrutieren; Plan um formative Runde ergänzen |
| BF-03 | Screenreader-Durchgang durchgeführt und protokolliert | Operationalisierung von BF-01 (DIN EN ISO 9241-171 Anhang D) | Strukturprüfung (Überschriften, Landmarks, Sprungmarke) | `e2e/pflegecoach.spec.ts`, S1–S8 Prüfpunkte definiert | — | PARTIAL | Manueller VoiceOver/NVDA-Durchgang offen | Intern durchführen (kein externer Akteur nötig) |

## 6. Qualität der Inhalte

| ID | Originalanforderung | Primärquelle (Fundstelle) | Produktnachweis | Technischer Nachweis | Externer Nachweis | Status | Blocker | Nächste Aktion |
|---|---|---|---|---|---|---|---|---|
| QI-01 | Alle Inhalte pflegefachlich geprüft und freigegeben | Kein Textfund; eigener Qualitätsanspruch (höchstes Produktrisiko R1.4) | `lib/coach/inhalte.ts` (12 Module, `pruefstatus: entwurf`) | `audit/dipa/inhalte_pruefdossier.md` (Kriterien K1–K6) | fehlt (Freigaben) | UNVERIFIED | Kein Textfund; fachliche Freigabe steht komplett aus | Prüfen, ob eine bereits kooperierende Pflegefachkraft (Alltagsengel-Netzwerk) die Freigabe übernehmen kann, statt neu extern zu beauftragen |
| QI-02 | Erhebungsinstrumente validiert bzw. lizenziert | BfArM-Leitfaden Kap.4.5.1 | 7-Item-Kurzinstrument, als unvalidiert gekennzeichnet | `lib/coach/belastung.ts`, `lib/coach/fhir.ts` | fehlt (Lizenzen) | EXTERNAL_EVIDENCE_REQUIRED | Lizenzen FES-I/BSFC-s/SUS ungeklärt | Rechteinhaber kontaktieren |
| QI-03 | Pflegeprobleme und -ziele fachlich hergeleitet | Kein externer Normtext (Pflegeprozess-Methodik) | `audit/dipa/pflegeprobleme_pflegeziele.md` | — | — | PASS_INTERNAL | Sachlich abhängig von QI-01-Freigabe | Mit QI-01 gegenprüfen, sobald freigegeben |

## 7. Nutzennachweis

| ID | Originalanforderung | Primärquelle (Fundstelle) | Produktnachweis | Technischer Nachweis | Externer Nachweis | Status | Blocker | Nächste Aktion |
|---|---|---|---|---|---|---|---|---|
| NN-01 | Wissenschaftliches Evaluationskonzept einreichungsreif | DiPAV §§11-12 + BfArM-Leitfaden Kap.4.5.2 ("herstellerunabhängiges Institut" zwingend) | `audit/dipa/evaluationskonzept.md` (Grobkonzept) | — | fehlt (Institut, Ethikvotum) | EXTERNAL_EVIDENCE_REQUIRED | Kein Studienpartner, kein Ethikvotum | Wissenschaftlichen Partner suchen (idealerweise nach BfArM-Beratung) |
| NN-02 | Nutzungsdaten pseudonymisiert und auswertbar erhoben | Kein Textfund | `lib/coach/nachweise.ts` (HMAC-Pseudonym) | Tests P9.1/P9.2 | — | UNVERIFIED | Kein Textfund | Bleibt offen bei nächster Katalogpflege |
| NN-03 | Pilotdesign liegt vor | Kein Textfund | `audit/dipa/pilotdesign.md` | — | — | UNVERIFIED | Start hängt an NN-01, QI-01 | Bleibt offen bis Abhängigkeiten gelöst |

## 8. Verbraucherschutz

| ID | Originalanforderung | Primärquelle (Fundstelle) | Produktnachweis | Technischer Nachweis | Externer Nachweis | Status | Blocker | Nächste Aktion |
|---|---|---|---|---|---|---|---|---|
| VS-01 | Werbefrei, kein Cross-Selling | DiPAV §6 Abs.4, §5 Abs.5 | Tracker technisch aus | `e2e/pflegecoach.spec.ts` | — | PASS_INTERNAL | — | — |
| VS-02 | Erreichbarer Support, Antwort binnen Frist | Anlage 2 DiPAV Pkt. III.8 (**24 Stunden**, wörtlich bestätigt 15.08.2026) | Supportadresse, `/pflegecoach/anfrage` | — | — | PARTIAL | 24h-Antwortzusage fehlt (GAP-SUPPORT-SLA), Betriebszusage, keine Codeänderung | Geschäftsführungs-Entscheidung: SLA zusagen + operativ absichern |
| VS-03 | Jederzeit ohne Hürde beendbar | Kein Textfund in Anlage 2 | `app/pflegecoach/einstellungen/konto/page.tsx` | — | — | UNVERIFIED | Kein Textfund | Bleibt offen bei nächster Katalogpflege |
| VS-04 | Verständliche Nutzungsbedingungen (Selbstzahler) | Kein DiPAV-Bezug, Zivilrecht (Produkt A, nicht DiPA-Antragsinhalt) | Entwurf, 13 Paragrafen | `lib/coach/pricing.ts`, `lib/coach/bestellung.ts` (Bestellweg gesperrt) | fehlt (Rechtsprüfung) | EXTERNAL_EVIDENCE_REQUIRED | Juristische Prüfung fehlt | Kanzlei beauftragen (Bündel mit DS-02/PROD-02) |

## 9. QMS, Risikomanagement, Betrieb

| ID | Originalanforderung | Primärquelle (Fundstelle) | Produktnachweis | Technischer Nachweis | Externer Nachweis | Status | Blocker | Nächste Aktion |
|---|---|---|---|---|---|---|---|---|
| QMS-01 | QM- und Risikomanagementsystem dokumentiert | Anlage 1 DiPAV, Themenfelder QMS + Risikomanagement | `audit/dipa/qms_handbuch_pflegecoach.md` | `audit/dipa/risikoakte_pflegecoach.md`, `software_lebenszyklus_pflegecoach.md` | — | PASS_INTERNAL | Nicht extern auditiert (Lücken in §9 des Handbuchs benannt) | Externe Auditierung hängt an SEC-05 |
| QMS-02 | Risikoanalyse liegt vor | Anlage 1 DiPAV Themenfeld Risikomanagement + §3 Abs.3 Satz 2 | `audit/dipa/risikoanalyse_pflegecoach.md` | `audit/dipa/risikoakte_pflegecoach.md` (0 kritisch, 3 hoch) | — | PASS_INTERNAL | — | Wiedervorlage je MINOR-Version |
| QMS-03 | Technische Dokumentation liegt vor | DiPAV §3 Abs.3 Satz 2 (Beispiel-Nachweis) | `audit/dipa/technische_dokumentation_pflegecoach.md` | `sicherheitsarchitektur_pflegecoach.md`, `software_lebenszyklus_pflegecoach.md` | — | PASS_INTERNAL | — | Auf aktuelle Version fortschreiben |
| QS-04 | Automatisierte Tests decken Produktlogik/Zugriffsregeln ab | Kein externer Normtext, eigene QS-Erwartung | 68/68 Shadow-Tests | `supabase/shadow/50_pflegecoach_tests.sql` | — | PASS_INTERNAL | — | Bei neuen Tabellen mitziehen |
| QS-05 | Browser-E2E-Test des Produktbereichs | Kein externer Normtext, eigene QS-Erwartung | 24/24 auf 2 Browsern | `.github/workflows/ci.yml` | — | PASS_INTERNAL | — | Bei neuen Seiten mitziehen |
| BETR-01 | DB-Stand auf Produktion angewendet | Kein externer Normtext, interner Betriebszustand | Migrationen live (Tabellencheck 12.08.2026) | `audit/dipa/qms_handbuch_pflegecoach.md` (Änderungsverfahren) | — | PASS_INTERNAL | — | Live-Apply-Bestätigung im Änderungsverfahren halten |

## 10. Verfahren und offene regulatorische Fragen

| ID | Originalanforderung | Primärquelle (Fundstelle) | Produktnachweis | Technischer Nachweis | Externer Nachweis | Status | Blocker | Nächste Aktion |
|---|---|---|---|---|---|---|---|---|
| REG-01 | Anforderungstexte gegen Original geprüft (Meta-Punkt) | DiPAV/BfArM-Leitfaden/TR-03161, dieser Katalog selbst | — | `scripts/dipa-katalog-check.ts` (`npm run dipa:katalog`) | — | UNVERIFIED | 12 Resteinträge ungeprüft (s. o.) | **Korrigiert 15.08.2026**: Klasse E→C, da reine interne Lesearbeit, keine Behörde nötig |
| REG-02 | Ist ein Freischaltcode-Verfahren verbindlich? | BfArM-Leitfaden Kap.1/1.1 S.6 | `lib/coach/freischaltung.ts` | `lib/coach/freischaltung.test.ts` | — | PASS_INTERNAL | — | Frage beantwortet (NEIN, Kostenerstattung statt Code) — Zugangsschalter vor Aktivierung an Modell anpassen |
| REG-03 | Qualifikationsanforderungen für eUL-Erbringer? | BfArM-Leitfaden S.88 | `audit/dipa/eul_qualitaetsanforderungen.md` | — | — | PASS_INTERNAL | — | Frage beantwortet (Herstellerentscheidung) |
| REG-04 | Vergütung und Abrechnungsweg | §40a Abs.1a SGB XI + BfArM-Leitfaden S.6 (70€/Monat-Deckel bekannt, Anteil offen) | `lib/coach/abrechnung.ts` (fail-closed `verguetung_geklaert`) | `lib/coach/abrechnung.test.ts` | fehlt (Verhandlungsergebnis) | EXTERNAL_EVIDENCE_REQUIRED | Konkreter Anteil erst nach DiPA-Aufnahme verhandelbar | Nach vorläufiger Aufnahme mit GKV-Spitzenverband klären |
| REG-05 | BfArM-Beratungstermin hat stattgefunden | DiPAV §22 ("auf Anfrage") + Leitfaden Kap.5.5 ("keine rechtliche Bindung") | `audit/dipa/bfarm_fragenkatalog.md` (Fragen 1–20 vorbereitet) | — | fehlt (Termin) | EXTERNAL_EVIDENCE_REQUIRED | **Kein Pflicht-Blocker** — nachweislich freiwillig, aber höchste Hebelwirkung (klärt SEC-01-Scope, INT-02, REG-04 in einem Termin) | Termin anfragen — empfohlen, nicht Voraussetzung |

---

## Zusammenfassung nach Bearbeitungsklasse (nach REG-01-Korrektur)

| Klasse | Bedeutung | Anzahl | Davon offen (nicht erfüllt) |
|---|---|---|---|
| A | Intern erledigt | 26 | 0 |
| B | Intern technisch umsetzbar | 4 | 1 (INT-02) |
| C | Intern dokumentierbar | 3 | 2 (BF-03, REG-01) |
| D | Externer Dienstleister/Fachperson nötig | 11 | 11 |
| E | Behörde/Kostenträger nötig | 4 | 2 (REG-04, REG-05 — REG-05 optional) |

**Intern noch offen (Klasse A/B/C, nicht erfüllt): 3** — INT-02 (Klärung, keine
Codeänderung), BF-03 (manueller Screenreader-Durchgang), REG-01 (Restlektüre).
Keine dieser drei braucht einen externen Akteur.

**Extern noch offen (Klasse D/E, nicht erfüllt): 13** — siehe
`docs/DIPA_EXTERNE_RECLASSIFIZIERUNG_2026-08-15.md` für die Aufschlüsselung in
zwingend extern / intern vorbereitet+extern abzuschließen / davon einer (REG-05)
ausdrücklich kein Pflicht-Blocker.

## Was sich gegenüber Phase 4 (18_PHASE4_REVERIFY) geändert hat

1. **AK-REG-01**: Klasse E → C korrigiert (reine Lesearbeit, keine Behörde).
2. **AK-SEC-05**: Quelle um Vorbehalt ergänzt — Anlage 1 DiPAV selbst verlangt
   kein ISO-27001-Zertifikat, nur der (nicht bindende) BfArM-Leitfaden.
3. **AK-SEC-01/TR-03161**: Rechtliche Kette jetzt vollständig mit Datum belegt
   (Zertifikatspflicht seit 1.1.2025 zwingend, keine Erklärungs-Option mehr) und
   mit der Markterkenntnis ergänzt, dass akkreditierte Prüfstellen bereits aktiv
   tätig sind (TÜVIT, secuvera, IT-TÜV).
4. **Neue Erkenntnis, noch nicht als Katalogpunkt erfasst**: eine zweite,
   separate Zertifikatsspur für Datenschutz-Prüfkriterien nach §78a Abs. 8 SGB XI
   / DiPAV §8 Abs. 4 existiert, für die es noch keine akkreditierte
   Zertifizierungsstelle gibt — Empfehlung, bei nächster Katalogpflege als
   AK-DS-08 zu ergänzen.
5. Status-Modell umgestellt von Doppel-Codes (`PARTIAL / EXTERNAL_REQUIRED`) auf
   die sieben eindeutigen Werte oben.

Quelle für alle Primärtext-Zitate: `gesetze-im-internet.de` (DiPAV, SGB XI §78a,
SGB V §139e, DiGAV), BfArM-DiPA-Leitfaden Version 1.3, Webrecherche zu BSI
TR-03161 (Stand 15.08.2026, siehe Reklassifizierungsdokument für Einzelnachweise).
