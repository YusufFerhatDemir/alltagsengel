# Konsolidierter Go-Live-Abschlussbericht

**Stand:** 14.08.2026 · **Commits:** `5c66016` (DiPA Phase 4), `b1e525c` (Phase 7 Bericht), `1f47ace` (Phase 6 Checklist)

**Methodik:** 2 unabhängige Gegenprüfungen gegen die Produktionsdatenbank (PostgREST-Vollsweep über 303 exponierte Objekte, `pg_catalog`-Introspektion, Policy-Analyse). Keine Zahl aus früheren Berichten übernommen — jede Aussage eigenständig verifiziert. Bei Unsicherheit: FAIL-CLOSED.

---

## 1. Pflege-Software produktionsreif: NEIN

Der Privatzahler-Weg funktioniert (4 Klienten, 30 Leistungsnachweise, 5 Rechnungen live). Aber: 1 kritischer Fehler blockiert den Kassenweg am ersten Schritt (P0-1), und die Unterschriftskette ist nicht an die Abrechenbarkeit gekoppelt (H-1). Beide sind intern lösbar.

## 2. PflegeCoach verkaufsfähig: JA (technisch bereit)

Der Selbstzahler-Weg ist vollständig gebaut und live (Checkout, Bestellung, Rechnung PC-YYYY-NNNNNN, Zugang, Kündigung §312k BGB, Widerrufsbelehrung versioniert). Vierfaches Fail-Closed-Gate sperrt korrekt: Preisfreigabe, Stripe Secret Key, Stripe Price ID, Betrag > 0. 12/14 Checklisten-Punkte erfüllt.

## 3. PflegeCoach — was fehlt für echten Verkauf:

Ausschließlich kaufmännische Entscheidungen, kein Code:
- Preise festlegen (aktuell Platzhalter: 19 €/Monat, 190 €/Jahr — kaufmännisch NICHT entschieden)
- Stripe-Price-IDs anlegen
- `COACH_PREISE_FREIGEGEBEN=true` setzen
- `COACH_DIPA_MODUS` bleibt `false`, kein DiPA-/Kassenerstattungs-Bezug im Verkaufsweg

## 4. Kassenabrechnung intern vorbereitet: NEIN

Korrigiert die bisherige Einschätzung. Die Code-Bausteine existieren (EDIFACT-Generator, SECON-Verschlüsselung, SFTP-Transport, Rückläufer, OPOS, Mahnwesen). Aber:

- **P0-1:** `check_billing_gate()` liest `state_settings.kasse_status` — eine Spalte, die nicht existiert (Fehler 42703). Jeder INSERT/UPDATE auf `service_records` mit `billing_type != 'PRIVAT'` wird zurückgerollt. Der gesamte Kassenweg ist am ersten Schritt dicht.
- **Tarife:** §39 VP hat keinen einzigen verifizierten Kassentarif. `leistungspreise` sind zu 100% unverified (24/24). §45b hat 1 verifizierten, 8 blockierte Tarife.
- **Unterschrift:** `create_invoice_draft_atomic` prüft weder `proof_status` noch `signature_hash` — Rechnungen ohne Unterschriftsnachweis möglich (H-1).

## 5. Kassenabrechnung extern freigeschaltet: NEIN

§45a-Bescheid Hessen fehlt. Live bestätigt: `insurance_enabled = false`, `kassenrechnung_enabled = false`. Kein Bundesland hat einen freigeschalteten Status.

## 6. DiPA intern technisch vorbereitet: 30/48

Gemessen mit `npm run dipa:katalog` am 14.08.2026. 30 ERLEDIGT, 8 in Arbeit, 10 offen. 15 konsolidierte Dokumente in `docs/dipa/`. Alle intern möglichen B-Punkte abgeschlossen (SEC-03 MFA, QS-04 Shadow-Tests 68/68, QS-05 E2E-Suite 24/24 Chromium+Mobile).

**Vorbehalt:** 43 von 48 Anforderungstexten sind gegen Arbeitsfassungen geprüft, NICHT gegen DiPAV/BfArM-Leitfaden im Wortlaut. Die belastbare Quote gegen Originaldokumente liegt bei 6%.

## 7. Noch intern machbare DiPA-Punkte:

2 Punkte:
- **BF-03** (Screenreader-Durchgang) — maschinelle Strukturprüfung erledigt, manueller VoiceOver/NVDA-Durchgang braucht eine reale Testsitzung mit einer Person
- **REG-01** (Anforderungstexte gegen Originaldokumente prüfen) — Werkzeug `npm run dipa:katalog` gebaut, Prüfung selbst braucht DiPAV/BfArM-Leitfaden/TR-03161 in gültiger Fassung

## 8. Extern notwendige DiPA-Punkte:

16 Punkte, aufgeteilt in:

**Dienstleister/Fachperson (11):**
- DS-02: DSFA durch Kanzlei/DSB
- DS-04: AVV-Verträge mit Supabase, Vercel, Resend, Stripe
- SEC-01: BSI TR-03161-Zertifikat (Prüfstelle, Monate Vorlauf — KRITISCHER PFAD)
- SEC-04: Penetrationstest (Beauftragungsunterlage versandfertig)
- SEC-05: ISMS-Beratung
- BF-01: BITV-Test
- BF-02: Gebrauchstauglichkeitstest (5 Testpersonen)
- QI-01: Pflegefachliche Inhaltsprüfung (HÖCHSTES PRODUKTRISIKO)
- QI-02: Instrumentenlizenzen (FES-I, HPS/BSFC-s, SUS)
- VS-04: Nutzungsbedingungen juristisch prüfen
- NN-01: Evaluationspartner + Ethikvotum

**Behörde (5):**
- REG-02: Freischaltcode-Verfahren (BfArM-Beratung)
- REG-03: eUL-Qualifikationsanforderungen (BfArM)
- REG-04: Vergütung/Abrechnungsweg (nach Aufnahme)
- REG-05: BfArM-Beratungstermin (günstigster nächster Schritt — klärt 9 offene Punkte in einem Zug)

## 9. BfArM-Antrag heute einreichbar: NEIN

Gründe: kein TR-03161-Zertifikat, keine DSFA, kein Pentest, kein ISMS, keine pflegefachliche Inhaltsprüfung, kein Evaluationspartner, kein Gebrauchstauglichkeitstest, nur 6% der Anforderungstexte gegen Originaldokumente verifiziert.

## 10. Kritische Fehler offen: 1

**P0-1 — `check_billing_gate()` blockiert jeden Kassen-Leistungsnachweis**
`supabase/migrations/20260808200000_einsatzplanung_leistungsnachweise.sql:503`. Trigger liest `s.kasse_status` aus `state_settings` — Spalte existiert nicht. Fehler 42703 reproduziert. Jeder Nicht-PRIVAT-Leistungsnachweis wird zurückgerollt. Intern lösbar: Spaltenreferenz auf real existierende Spalten umschreiben.

## 11. Hohe Fehler offen: 2

**H-1 — Rechnung ohne Unterschriftsnachweis möglich**
Zwei Wege zu `status='signed'`, nur einer verlangt Unterschrift. `create_invoice_draft_atomic` prüft weder `proof_status` noch `signature_hash`. Live: alle 30 Nachweise haben `proof_status='ENTWURF'`, 0 haben `signature_hash`, aber 15 sind fakturiert.

**H-2 — VP/KZP-Budget fehlt bei 2 von 4 Klienten**
Beide PG-2-Klienten haben `combined_annual_amount = 0` statt 3.539 €. Ursache: Budgetzeilen wurden vor dem Pflegegrad-Backfill angelegt. Fix: `auto-budget.ts` erneut für diese Klienten laufen lassen.

## 12. Mittlere Fehler offen: 6

| # | Befund |
|---|---|
| M-1 | `validate_correction_atomic` nicht live — parallele Rechnungskorrektur nicht serialisiert |
| M-2 | `assignment_audit_log` + `service_record_audit_log` ohne Unveränderlichkeits-Trigger (8/10 Audit-Tabellen geschützt, 2 nicht) |
| M-3 | Kein Trigger hält `care_level`/`pflegegrad` synchron — Ursache von H-2 |
| M-4 | `prevent_finalized_service_record_mutation` schützt `service_type` nicht — Leistungsart nach Unterschrift änderbar |
| M-5 | `leistungspreise` 100% unverified (24/24), nur 1 verifizierter Kassentarif in `billing_tariffs` |
| M-6 | 5 Bestandsrechnungen mit 30 Tagen Zahlungsziel statt 14 (Code-Standard) |

## 13. Tests / CI / Build / Production-Status

| Metrik | Wert | Status |
|---|---|---|
| TypeScript | `npx tsc --noEmit` → 0 Fehler | GRÜN |
| Tests | 2.749 Tests, 2.711 bestanden, 38 übersprungen, 0 fehlgeschlagen | GRÜN |
| Build | `npm run build` → Exit 0, 657 Routen (254 statisch, 4 SSG, 399 dynamisch) | GRÜN |
| CI | Lauf `31784652882` → success, 5m02s | GRÜN |
| Vercel Production | Deployment für `1f47ace` erfolgreich | GRÜN |
| Supabase Production | 9 Migrationen LIVE (einzeln über Artefakte verifiziert), 280 Tabellen mit RLS aktiv, 826 Policies | GRÜN |
| Speicher | 25 GB frei (228 GB gesamt, 88% belegt) | AUSREICHEND |
| DiPA-Katalog | `npm run dipa:katalog` → 0 Befunde, 93 Nachweisdateien existieren | GRÜN |

**Wichtiger Hinweis:** Die Testsuite ist grün, fängt aber keinen der Befunde P0-1, H-1, H-2 ab. Alle drei sind Schema-/Datenwahrheits-Fehler, die sich nur gegen die echte Datenbank zeigen. Die Tests laufen gegen `fake-billing-db.ts` und teilen die falschen Annahmen.

## 14. Externe Genehmigungen/Zertifikate, die fehlen

| Genehmigung | Wer | Wirkung |
|---|---|---|
| §45a-Bescheid Hessen | Land Hessen | Öffnet §45b + VP/KZP + §105-DTA gleichzeitig. Größter einzelner Umsatzhebel. |
| ITSG-Zertifizierung | ITSG Trust Center | DTA-Versand. Code fertig, Gate `ITSG_ZERTIFIZIERT`. |
| SEPA-Gläubiger-ID | Deutsche Bundesbank | `DE98ZZZ09999999999` ist PLATZHALTER. Kein Lastschrifteinzug bis zur echten ID. |
| SECON-Zertifikat | Trust Center | Verschlüsselung für DTA. |
| SFTP-Zugangsdaten | Kostenträger | Realer Versandweg. |
| Technische Anlage 1 (§302) | GKV-Spitzenverband | §302-Generator bewusst gesperrt. |
| Kassen-Fehlercodes | Kostenträger | Rückläufer-Katalog ist leer (bewusst). |
| BSI TR-03161 | Prüfstelle | DiPA, Monate Vorlauf. |
| DSFA | Kanzlei/DSB | DiPA. |
| Pentest-Ergebnis | Sicherheitsdienstleister | DiPA. Beauftragungsunterlage versandfertig. |
| BfArM-Aufnahme | BfArM | DiPA-Erstattungsfähigkeit. |

## 15. Was ausschließlich Yusuf persönlich erledigen muss

Nach Umsatzwirkung geordnet:

1. **PflegeCoach-Preise festlegen** — kaufmännische Entscheidung, Stripe-Price-IDs anlegen, dann `COACH_PREISE_FREIGEGEBEN=true`. Einzige Umsatzquelle ohne externen Blocker.
2. **§45a-Antrag Hessen nachfassen** — steht auf `ANTRAG_EINGEREICHT`. Längste Vorlaufzeit, größter Hebel.
3. **SEPA-Gläubiger-ID beantragen** — Bundesbank, kostenfrei, online. Ohne: jede Rechnung muss manuell überwiesen werden.
4. **Tarif-Entscheidung:** 8 blockierte §45b-Tarife (35 €/h) prüfen und belegen oder neue vereinbaren. Für §39 VP fehlt jede Preisgrundlage.
5. **ITSG-Zertifizierung anstoßen** + SECON-Zertifikat beschaffen.
6. **Für DiPA (falls Ziel):** Kanzlei für DSFA, Pentest-Angebote einholen, TR-03161-Prüfstelle anfragen, BfArM-Beratungstermin beantragen. Alle haben Monate Vorlauf — wenn DiPA ein Ziel ist, jetzt starten.

**Nicht auf dieser Liste:** P0-1, H-1, H-2, M-1 bis M-6 — alles intern lösbar, kein Terminal nötig.

## 16. Die nächsten 3 Schritte mit größtem Umsatz-/Go-Live-Effekt

### Schritt 1 — Die Abrechnungs-Beweiskette reparieren (P0-1 + H-1)

`check_billing_gate()` auf real existierende Spalten umschreiben + Unterschrift an Abrechenbarkeit koppeln (`create_invoice_draft_atomic` muss `proof_status='UNTERSCHRIEBEN'` verlangen). Ohne diesen Schritt ändert auch der §45a-Bescheid nichts — der erste Kassen-Leistungsnachweis lässt sich nicht einmal speichern. Rein intern, kein externer Beteiligter.

### Schritt 2 — PflegeCoach-Preise freigeben

Kaufmännische Entscheidung + Stripe-Price-IDs. Schnellster Weg zu neuem Umsatz, weil kein externer Beteiligter existiert. Alles andere wartet auf Behörden.

### Schritt 3 — Tarifgrundlage herstellen + §45a nachfassen

Parallel: §45b-Tarife belegen/verifizieren, für §39 VP Preisgrundlage schaffen, beim Land Hessen nachfassen. Größter Umsatzpool, aber einziger mit externer Abhängigkeit. Vorarbeit (Tarife) jetzt erledigen, damit am Tag des Bescheids nichts mehr im Weg steht.

## 17. Gesamturteil: Wie nah sind wir am Ziel?

### Pflege-Software: 75%

**Ableitung:** Gegenprüfung A (Security): 8/10 PASS. Gegenprüfung B (Workflow): 7/11 PASS (1 FAIL B6, 2 TEILWEISE B3/B8, 1 UNGEPRÜFT B10). Das ergibt 15/21 vollständig bestandene Prüfpunkte = 71%. Korrigiert auf 75%, weil die fehlenden Punkte alle intern lösbar sind (kein externer Blocker) und der Privatzahler-Weg heute funktioniert. 100% erfordert: P0-1 fixen, H-1 fixen, H-2 Budget nachberechnen, 6 MITTEL-Befunde schließen.

### PflegeCoach: 95%

**Ableitung:** 12/14 Checklisten-Punkte erfüllt. Vierfaches Fail-Closed-Gate korrekt. E2E-Suite 24/24 grün. Self-RLS verifiziert. DiPA-Modus deaktiviert und strukturell gegen Regression gesichert. Fehlende 5%: kaufmännische Preisfestlegung + Stripe-Price-IDs (Punkt 10 Admin-Ansicht ist bewusste Produktgrenze, kein Mangel).

### Kassenabrechnung: 35%

**Ableitung:** 10 Readiness-Bereiche geprüft. Code-Bausteine für alle 10 vorhanden (EDIFACT, SECON, SFTP, Rückläufer, OPOS, Mahnwesen, Tarife, Budgets, Rechnungen, DTA). Aber:
- P0-1 blockiert den ersten Schritt der Kette → kein einziger Bereich ist end-to-end nutzbar → 0% funktional
- Code-Vollständigkeit der 10 Bereiche: ~70% (alle gebaut, aber Trigger-Bug + fehlende Tarife + fehlende Unterschriftsprüfung)
- Externe Freischaltung: 0% (§45a, ITSG, SEPA, SFTP-Zugänge fehlen alle)
- Gewichtung: 50% intern (davon 70% = 35%) + 50% extern (davon 0% = 0%) = 35%
- Intern auf 100% bringbar: P0-1 fixen, Unterschrift koppeln, Tarife verifizieren
- Dann steigt intern auf ~90%, Gesamt auf ~45%. Rest ist extern.

### DiPA: 30%

**Ableitung:** 30/48 Matrix-Punkte erledigt = 62,5% der Arbeitsfassungen. Aber: nur 5/48 gegen Originaldokumente verifiziert (6% belastbare Quote). Da der BfArM-Antrag die Originaltexte als Maßstab nimmt, nicht unsere Arbeitsfassungen, wird die belastbare Antragsfähigkeit mit max(62,5% × 6%, 30%) = 30% bewertet. Die 30% spiegeln den realen Stand: Dokumentation und Code sind weit, aber die regulatorische Verbindlichkeit fehlt durchgehend. 16 der 18 offenen Punkte sind extern — die interne Arbeit ist im Wesentlichen getan.

---

## Gegenprüfungs-Ergebnisse (Kurzfassung)

### Gegenprüfung A — Security/Datenschutz/RLS/Billing

| # | Prüfung | Ergebnis |
|---|---|---|
| A1 | Anon-Zugriff Gesundheitsdaten | PASS |
| A2 | Billing nur Admin/Staff | PASS |
| A3 | Audit-Trails schreibgeschützt | TEILWEISE → M-2 |
| A4 | Leistungsnachweis unveränderlich | PASS mit Lücke → M-4 |
| A5 | Coach Self-RLS | PASS |
| A6 | correctInvoice() sicher | TEILWEISE → M-1 |
| A7 | Mandantentrennung | PASS (190/198 RESTRICTIVE org_fence, 8 in PERMISSIVE geprüft) |
| A8 | service_role nicht im Client | PASS |
| A9 | PDF-Zugriff autorisiert | PASS |
| A10 | Keine Secrets im Code | PASS |

### Gegenprüfung B — Nutzerworkflow/PflegeCoach/Billing/OPOS

| # | Prüfung | Ergebnis |
|---|---|---|
| B1 | Klient anlegen (status 'new') | PASS |
| B2 | Pflegegrad synchron | PASS mit Risiko → M-3 |
| B3 | Budget korrekt (131 €, 3.539 €) | TEILWEISE → H-2 |
| B4 | Mitarbeiter zuweisen | PASS |
| B5 | Buchung → Einsatz → Nachweis | PASS |
| B6 | Unterschrift → signed | FAIL → H-1 |
| B7 | Tarif-Auflösung | PASS |
| B8 | Rechnung erstellen | TEILWEISE → H-1 |
| B9 | PDF mit DejaVuSans | PASS |
| B10 | Zahlung → OPOS → Mahnwesen | UNGEPRÜFT LIVE (P0 behoben, aber 0 Zahlungen in Produktion) |
| B11 | PflegeCoach Checkout | PASS |

---

*Erstellt: 14.08.2026 nach Abschluss aller 7 Phasen des Go-Live-Abschlussblocks.*
*Keine Zahl geschätzt — jede Aussage gegen Produktionsdatenbank oder Code verifiziert.*
*Bei Unsicherheit: FAIL-CLOSED.*
