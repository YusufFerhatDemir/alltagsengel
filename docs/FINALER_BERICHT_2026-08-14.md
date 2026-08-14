# Finaler Bericht — Production-Abnahme Phase 7

**Stand:** 14.08.2026 · **Commit:** `1f47ace` · **Prüfer:** Phase-7-Abnahme mit zwei
unabhängigen Gegenprüfungen (A: Sicherheit/Datenschutz/RLS · B: Workflow/Billing/Coach)

**Methodik.** Jede Aussage in diesem Bericht ist gegen die **Produktionsdatenbank** oder
den Code belegt, nicht aus früheren Berichten übernommen. Grundlage der Datenbank-Aussagen:
PostgREST-Vollsweep über alle 303 exponierten Objekte (anon **und** `service_role`),
`pg_catalog`-Introspektion über das Lese-Orakel `_run_sql` (ausschließlich lesend, keine
Schreiboperation auf Produktion), sowie die Audit-RPCs `audit_rls_all_status` /
`audit_rls_all_policies`. Wo eine Aussage nicht beweisbar war, steht das ausdrücklich da.

**Ein methodischer Hinweis vorweg:** `HTTP 200 []` beweist *nicht*, dass RLS greift — bei
einer leeren Tabelle sieht ein Leck genauso aus. 55 der geprüften Tabellen sind in
Produktion leer. Für diese wurde der Nachweis deshalb nicht über Daten, sondern über
Policy-Introspektion geführt (siehe Punkt 7/A1).

---

## 1. Pflege-Software produktionsreif?

**NEIN** (fail-closed bewertet).

Das ist kein pauschales Urteil — der Privatzahler-Weg trägt heute Umsatz. Aufgeschlüsselt:

| Weg | Zustand |
|---|---|
| Privatkunde: Klient → Einsatz → Leistungsnachweis → Rechnung → PDF | **funktioniert** (live belegt: 4 Klienten, 30 Leistungsnachweise, 5 Rechnungen) |
| Kassenweg (§45b, VP/KZP) | **blockiert** — P0, siehe Punkt 7 |
| Zahlungseingang → OPOS → Mahnwesen | **technisch repariert, live nie gelaufen** (`payments` = 0 Zeilen) |
| Unterschrifts-Beweiskette | **lückenhaft** — siehe Punkt 8 |

Zwei Gründe für das NEIN: erstens der P0 in Punkt 7, der den Kassenweg am ersten Schritt
abbricht; zweitens die fehlende Unterschrifts-Kopplung in Punkt 8, die auch
Privatrechnungen ihre Beweisgrundlage nimmt. Beide sind intern lösbar.

## 2. PflegeCoach verkaufsfähig?

**JA — im Sinne von „technisch bereit".** Verkauft aktuell nichts, und das ist gewollt.

Der Selbstzahler-Weg ist vollständig gebaut und live (Checkout, Bestellung, Rechnung
`PC-YYYY-NNNNNN`, Zugang, Kündigung nach §312k BGB, Widerrufsbelehrung versioniert).
Er ist durch ein **vierfaches Fail-Closed-Gate** gesperrt (`lib/coach/pricing.ts:271`):
Preisfreigabe, `STRIPE_SECRET_KEY`, Stripe-Price-ID, Betrag > 0. Fehlt eine Voraussetzung,
wird nichts entgegengenommen.

Die Beträge in `lib/coach/pricing.ts` sind ausdrücklich **PLATZHALTER** und kaufmännisch
nicht entschieden. Solange das so ist, ist die Sperre korrekt — sie ist kein Rückstand.

`COACH_DIPA_MODUS` bleibt `false`. Im kundensichtbaren Verkaufsweg steht keine Aussage zu
DiPA, BfArM oder Kassenerstattung; ein Strukturtest sichert das gegen Regression.

## 3. Kassenabrechnung intern vorbereitet?

**NEIN.**

Das korrigiert die bisherige Einschätzung. Die Readiness-Matrix
(`docs/KASSENABRECHNUNG_READINESS.md`) führt zehn Bereiche als „INTERN READY". Die
Bausteine dahinter existieren tatsächlich — EDIFACT-Generator, SECON, SFTP, Rückläufer,
OPOS, Mahnwesen. Aber der **erste Schritt der Kette** ist blockiert: ein Leistungsnachweis
mit `billing_type != 'PRIVAT'` lässt sich in Produktion nicht speichern (P0, Punkt 7).

Solange das gilt, ist keiner der nachgelagerten Bausteine erreichbar. „Intern vorbereitet"
wäre eine falsche Zusage.

Erschwerend, unabhängig vom P0 — der Tarifbestand ist fail-closed gesperrt:

| Tabelle | Zustand (live gezählt) |
|---|---|
| `billing_tariffs` | 11 verified (davon **1** Kassentarif §45b, 10 privat), 8 blocked (§45b), 4 unverified (§39 VP) |
| `leistungspreise` | 24 Zeilen, **alle** unverified |

Für Verhinderungspflege (§39) existiert damit **kein** verwendbarer Kassentarif. Die
35 €/h-Tarife bleiben `blocked` — das ist so gewollt und wird hier nicht aufgehoben.

## 4. Kassenabrechnung extern freigeschaltet?

**NEIN — der §45a-Bescheid fehlt.**

Live in `state_settings` bestätigt: Hessen steht auf `VORBEREITUNG` bzw.
`ANTRAG_EINGEREICHT`, `insurance_enabled = false`, `kassenrechnung_enabled = false`.
Kein Bundesland hat den Status, der die Kassenabrechnung öffnen würde.

## 5. DiPA intern technisch vorbereitet

**30 von 48** (`npm run dipa:katalog`, gemessen 14.08.2026 um 10:40 Uhr).

Aufteilung: 30 erfüllt, 8 in Arbeit, 10 offen. Nach Bearbeitungsklasse sind **nur noch 2
Punkte intern offen** (AK-INT-02 Interoperabilität, AK-BF-03 Barrierefreiheit); 11 brauchen
einen externen Dienstleister, 5 eine Behörde.

**Wichtiger Vorbehalt:** von 48 Anforderungstexten sind erst **5 gegen das Originaldokument
geprüft**. Die belastbare Quote liegt damit bei **6 %**. Die 30/48 beschreiben den Stand
gegen unsere Arbeitsfassungen der Anforderungen, nicht gegen DiPAV/BfArM-Leitfaden im
Wortlaut. Diese Zahl bewegt sich derzeit — eine Parallel-Session bearbeitet den Katalog
(während dieser Prüfung stieg sie von 29 auf 30).

## 6. DiPA BfArM-/kassenerstattungsfähig?

**NEIN — keine BfArM-Listung.** Es ist kein Antrag gestellt. Auf dem kritischen Pfad liegen
BSI TR-03161 (Prüfstelle, Monate Vorlauf), DSFA durch eine Kanzlei/DSB, Pentest und ISMS —
alle vier extern.

## 7. Kritische Fehler offen: **1**

### P0-1 — `check_billing_gate()` blockiert jeden Kassen-Leistungsnachweis

**Fundort:** `supabase/migrations/20260808200000_einsatzplanung_leistungsnachweise.sql:503`,
live als Trigger `trg_check_billing_gate` (BEFORE INSERT/UPDATE) auf `service_records`.

Die Funktion liest `s.kasse_status` aus `state_settings`. **Diese Spalte existiert nicht** —
weder in `state_settings` noch irgendwo sonst im Schema (per `pg_attribute` geprüft). Die
Tabelle hat stattdessen `status`, `insurance_enabled`, `kassenrechnung_enabled`.

**Empirisch reproduziert** (lesend, ohne Schreibzugriff auf Produktion): dieselbe Abfrage
über das Lese-Orakel liefert

```
{"code":"42703","message":"column s.kasse_status does not exist"}
```

**Wirkung.** Der Trigger kehrt früh zurück, wenn `billing_type = 'PRIVAT'`. Bei jedem
anderen Wert läuft er in die Abfrage und bricht mit 42703 ab — der INSERT/UPDATE wird
zurückgerollt. Damit lässt sich **kein einziger Kassen-Leistungsnachweis erfassen**, und
die gesamte Kassenkette (§45b, VP/KZP, §105-DTA) ist am ersten Schritt dicht.

**Warum das bisher niemandem auffiel:** alle 30 Leistungsnachweise in Produktion haben
`billing_type = 'PRIVAT'`. Der Fehler ist latent, nicht aktiv — er schlägt in dem Moment zu,
in dem der erste Kassenfall erfasst wird. Alle vier Klienten-PLZ lösen ein Bundesland auf
(Berlin, Brandenburg, Hessen), die zweite Schutzbedingung (`v_bl IS NULL`) greift also nicht.

**Der Fehler steht auch im Repository** — es gibt nur diese eine Definition, sie wurde nie
korrigiert. Ein Neuaufbau der Datenbank aus den Migrationen reproduziert ihn.

## 8. Hohe Fehler offen: **2**

### H-1 — Rechnung ohne Unterschriftsnachweis möglich

Zwei Wege führen zu `status = 'signed'`, und nur einer verlangt eine Unterschrift:

* `app/api/leistungsnachweis/crud/route.ts:220` — der richtige Weg: setzt
  `proof_status = 'UNTERSCHRIEBEN'`, der Trigger `trg_compute_signature_hash` bildet daraus
  den SHA-256-Hash und setzt `is_locked`.
* `app/admin/records/new/page.tsx:111` — `status: isComplete ? 'signed' : 'complete'`. Hier
  entscheidet ein **Vollständigkeits-Flag** über den Status `signed`, nicht eine Unterschrift.

Der Rechnungslauf prüft die Unterschrift nicht nach: `create_invoice_draft_atomic` akzeptiert
live `status IN ('signed', 'complete')` und fragt **weder** `proof_status` **noch**
`signature_hash` **noch** `client_signed_at` ab (Funktionsrumpf introspiziert).

**Live-Befund, der genau das zeigt:**

| status / proof_status | Anzahl |
|---|---|
| `draft` / `ENTWURF` | 2 |
| `signed` / `ENTWURF` | 13 |
| `invoiced` / `ENTWURF` | 15 |

Alle 30 Nachweise stehen auf `proof_status = 'ENTWURF'`, **0** haben einen
`signature_hash`, **0** ein `client_signed_at` — und trotzdem sind 15 bereits abgerechnet.
In Produktion existiert damit kein einziger Leistungsnachweis mit belastbarem
Unterschriftsnachweis, während Rechnungen darauf beruhen.

Für die Kassenabrechnung ist der unterschriebene Leistungsnachweis der Nachweis schlechthin.
Auch für Privatrechnungen ist das die Belegkette im Streitfall.

### H-2 — VP/KZP-Budget fehlt bei 2 von 4 Klienten

Beide Pflegegrad-2-Klienten haben `combined_annual_amount = 0`, obwohl sie anspruchsberechtigt
sind (`minPflegegradVpKzp = 2`). Die beiden PG-3-Klienten haben korrekt 3.539 €.

**Ursache:** `lib/budget/auto-budget.ts:66` berechnet den Anspruch aus `pflegegrad`. Bei
Anlage der Budgetzeilen war `clients.pflegegrad` bei diesen Klienten NULL (bekanntes
Doppelspalten-Problem: `care_level` ist führend). Der Backfill
(`20260907000000_pflegegrad_backfill`) hat `pflegegrad` nachgezogen — live sind jetzt alle
vier synchron (2/2, 3/3, 2/2, 3/3) —, aber die **Budgetzeilen wurden nicht neu berechnet**.

Wirkung: für diese beiden Klienten stehen 3.539 € Verhinderungs-/Kurzzeitpflege nicht zur
Verfügung; die Budgetprüfung weist entsprechende Leistungen ab. `auto-budget.ts:104` würde
das bei erneutem Lauf selbst heilen (`vpAnspruch > 0 && !combined_annual_amount`) — der Lauf
ist für diese Zeilen nur nie erfolgt.

## 9. Mittlere Fehler offen: **6**

| # | Befund | Beleg |
|---|---|---|
| M-1 | `validate_correction_atomic` ist **nicht live** (fehlt in den 53 exponierten RPCs). `correctInvoice()` fängt „not found" ab und läuft ohne die `FOR UPDATE`-Sperre weiter — parallele Korrektur/Storno auf derselben Rechnung sind nicht serialisiert. | `lib/billing/core/invoice-engine.ts:768-781` |
| M-2 | `assignment_audit_log` und `service_record_audit_log` haben **keinen** Unveränderlichkeits-Trigger. Die 8 übrigen Audit-Tabellen haben je einen BEFORE-UPDATE- und BEFORE-DELETE-Trigger. Schutz besteht nur über RLS — jeder `service_role`-Pfad (die App nutzt ihn) umgeht ihn. | `pg_trigger`-Introspektion |
| M-3 | Kein Trigger hält `clients.care_level` und `clients.pflegegrad` synchron. Aktuell konsistent (Backfill), driftet aber bei jedem künftigen Schreibvorgang wieder auseinander — die Ursache von H-2. | `pg_trigger` auf `clients` = leer |
| M-4 | `prevent_finalized_service_record_mutation` schützt `service_type` nicht. Nach der Unterschrift lässt sich die Leistungsart noch ändern, also die Tarifgrundlage. Betrag, Zeiten, Klient und Betreuungskraft sind geschützt. | Funktionsrumpf live gelesen |
| M-5 | `leistungspreise` sind zu 100 % `unverified` (24/24), `billing_tariffs` haben nur **einen** verifizierten Kassentarif. §39 VP ist damit nicht abrechenbar. | live gezählt |
| M-6 | Die 5 Bestandsrechnungen tragen `payment_terms_days = 30`, der Code-Standard ist 14 (`ZAHLUNGSZIEL_STANDARD_TAGE`). Der Live-Trigger `set_invoice_due_date` setzt 14 nur, wenn `due_date` NULL ist. Altbestand ist inkonsistent zum heutigen Standard. | live gelesen |

## 10. Tests

**2.749 Tests · 2.711 bestanden · 38 übersprungen · 0 fehlgeschlagen**
124 Testdateien (123 bestanden, 1 übersprungen), Laufzeit 25,3 s. — **PASS**

Ergänzend: `npx tsc --noEmit` → **0 Fehler**. `npm run dipa:katalog` → keine Befunde,
alle 93 referenzierten Nachweisdateien existieren.

**Einordnung:** Die Suite ist grün und fängt trotzdem keinen der Befunde aus Punkt 7–9 ab.
Alle drei schwersten Befunde (P0-1, H-1, H-2) sind **Schema-/Datenwahrheits-Fehler**, die
sich nur gegen die echte Datenbank zeigen. Die Testsuite prüft gegen `fake-billing-db.ts`
und teilt die falschen Annahmen. Grüne Tests sind hier kein Nachweis der Abrechenbarkeit.

## 11. CI

**Grün.** Letzter Lauf `31784652882` („docs: Go-Live-Checkliste Phase 6") — `success`, 5m02s.
Die letzten fünf Läufe: 4× success, 1× cancelled (kein failure).

## 12. Vercel

**Grün.** Production-Deployment für `1f47ace` am 14.08.2026 um 08:40 UTC erfolgreich; die
drei letzten Production-Deployments sind durchgelaufen.
Lokaler Build zur Gegenprobe: `npm run build` → Exit 0, kompiliert in 111 s (Turbopack,
Next.js 16.2.12). **657 Routen**: 254 statisch, 4 SSG, 399 dynamisch — davon 337 API-Routen.

## 13. Supabase Production

**Alle geprüften Migrationen sind live** — jede einzeln über ihr Artefakt in der laufenden
Datenbank verifiziert, nicht über die Migrationsliste:

| Migration | Nachweis |
|---|---|
| `20260904000000` Tarif-Belegpflicht | Tabelle `billing_tarif_belege` + View `v_tarife_ohne_beleg` vorhanden |
| `20260905000000` Fix `wf_trigger_zahlung` | Funktionsrumpf enthält **kein** `invoice_id` mehr → **der Zahlungs-P0 ist behoben** |
| `20260906000000` View-Invoker | alle 7 exponierten Views liefern anon `HTTP 401` |
| `20260907010000` clients-Status | Constraint enthält `'new'` |
| `20260908020000` Abrechnungs-RLS | alle 9 Policies live |
| `20260909000000` Audit-Härtung | `billing_tariff_audit_select/_insert` live, `org_fence_tariff_audit` entfernt, Unveränderlichkeits-Trigger vorhanden, `angel_reviews` für anon gesperrt |

**Fehlend:** `validate_correction_atomic` (M-1).

**RLS-Gesamtbild:** 280 Tabellen, **alle** mit aktivem Row-Level-Security, 826 Policies.
190 von 198 Tabellen mit `organization_id` tragen eine RESTRICTIVE `org_fence`-Policy; die
8 übrigen erzwingen die Organisation in ihren PERMISSIVE-Policies (einzeln geprüft) — die
Mandantentrennung hat keine Lücke.

## 14. Speicher frei

**25 GB** (`/System/Volumes/Data`, 228 GB gesamt, 88 % belegt).
Knapp, aber für Build und Testlauf ausreichend — beide sind während dieser Prüfung
durchgelaufen.

## 15. Externe Blocker

| Blocker | Wer | Wirkung |
|---|---|---|
| **§45a-Bescheid Hessen** | Land Hessen | Öffnet §45b **und** VP/KZP **und** §105-DTA gleichzeitig. Der größte einzelne Umsatzhebel. |
| **ITSG-Zertifizierung + SECON-Zertifikat** | ITSG / Trust Center | DTA-Versand nach §105. Code fertig, Gate `ITSG_ZERTIFIZIERT`. |
| **SFTP-Zugangsdaten der Kassen** | Kostenträger | Realer Versandweg. |
| **Technische Anlage 1 (§302 SGB V)** | GKV-Spitzenverband | Generator wirft bewusst immer — Segmente werden nicht rekonstruiert. |
| **Echte Fehlercode-Kataloge der Kassen** | Kostenträger | Rückläufer-Verarbeitung läuft mechanisch, aber ohne Katalog. |
| **SEPA-Gläubiger-ID** | Deutsche Bundesbank | `DE98ZZZ09999999999` ist ein **PLATZHALTER**. Bis zur echten ID **kein Lastschrifteinzug**. Kostenfreier Online-Antrag, Anleitung in `docs/ANLEITUNG_SEPA_CREDITOR_ID.md`. |
| **BSI TR-03161-Zertifikat** | Prüfstelle | DiPA, Monate Vorlauf. |
| **DSFA + AVV-Verträge** | Kanzlei/DSB, Auftragsverarbeiter | DiPA (DS-02, DS-04). |
| **Pentest** | Sicherheitsdienstleister | DiPA (SEC-04). Beauftragungsunterlage liegt versandfertig vor. |
| **BfArM-Aufnahme** | BfArM | DiPA-Erstattung. |

## 16. Was Yusuf persönlich erledigen muss

Nach Umsatzwirkung geordnet. Punkt 1 und 2 sind reine Entscheidungen — dort hängt nichts
an Technik.

1. **PflegeCoach-Preise kaufmännisch festlegen** und die Stripe-Price-IDs anlegen. Das ist
   die einzige Umsatzquelle, die **niemand von außen blockiert**. Danach
   `COACH_PREISE_FREIGEGEBEN=true` — das Gate öffnet sich von selbst.
2. **§45a-Antrag Hessen nachfassen.** Steht auf `ANTRAG_EINGEREICHT`. Längste Vorlaufzeit,
   größter Hebel — je früher nachgefasst, desto besser.
3. **SEPA-Gläubiger-ID beantragen** (Bundesbank, kostenfrei, online). Bis dahin kein
   Lastschrifteinzug — jede Rechnung muss manuell überwiesen werden.
4. **Entscheiden, ob die 8 blockierten §45b-Tarife (35 €/h) geprüft und belegt werden
   sollen.** Ohne verifizierte Tarife bleibt der Kassenweg auch nach dem Bescheid gesperrt.
   Für §39 VP existiert **kein einziger** verwendbarer Tarif — hier fehlt die Preisgrundlage
   vollständig.
5. **ITSG-Zertifizierung anstoßen** und SECON-Zertifikat beschaffen.
6. **Für DiPA:** Kanzlei/DSB für die DSFA beauftragen, Pentest-Angebote einholen (Unterlage
   liegt fertig), TR-03161-Prüfstelle anfragen. Alle drei haben Monate Vorlauf — wenn DiPA
   ein Ziel ist, jetzt starten.

**Nicht auf dieser Liste:** die Befunde aus Punkt 7–9. Die sind alle intern lösbar und
brauchen kein Terminal von dir.

## 17. Die exakt 3 nächsten Schritte mit größtem Umsatz-/Go-Live-Effekt

### Schritt 1 — Die Abrechnungs-Beweiskette reparieren (P0-1 + H-1)

Zwei Fehler, eine Kette, gemeinsam zu beheben:

* `check_billing_gate()` auf die real existierenden Spalten umschreiben
  (`status = 'ANERKANNT'` bzw. `kassenrechnung_enabled`) — Migration + Repo-Korrektur, damit
  ein Neuaufbau den Fehler nicht reproduziert.
* Die Unterschrift an die Abrechenbarkeit koppeln: `create_invoice_draft_atomic` muss
  `proof_status = 'UNTERSCHRIEBEN'` bzw. einen `signature_hash` verlangen, und
  `app/admin/records/new/page.tsx:111` darf `signed` nicht mehr aus einem
  Vollständigkeits-Flag ableiten.

**Warum zuerst:** Ohne Schritt 1 ändert der §45a-Bescheid **nichts** — der erste
Kassen-Leistungsnachweis lässt sich nicht einmal speichern. Und ohne die Unterschriftskopplung
ist jede erzeugte Rechnung im Streitfall unbelegt. Rein intern, kein externer Beteiligter.

### Schritt 2 — PflegeCoach-Preise freigeben

Der Verkaufsweg ist vollständig gebaut, live und durch vier Gates gesperrt. Es fehlen
ausschließlich eine kaufmännische Entscheidung und die Stripe-Price-IDs.

**Warum zweitens:** schnellster Weg zu **neuem** Umsatz, weil kein externer Beteiligter
existiert. Alles andere wartet auf Behörden, Prüfstellen oder Kassen — das hier nicht.

### Schritt 3 — Tarifgrundlage herstellen und §45a nachfassen

Parallel: die §45b-Tarife belegen und verifizieren (die 8 blockierten prüfen, für §39 VP
überhaupt erst eine Preisgrundlage schaffen — dort sind alle 4 Tarife unverified und alle
24 `leistungspreise`-Zeilen ebenfalls), und beim Land Hessen zum §45a-Antrag nachfassen.

**Warum drittens:** Das ist der größte Umsatzpool, aber der einzige mit externer
Abhängigkeit. Die Vorarbeit (Tarife) lässt sich jetzt erledigen, damit am Tag des Bescheids
nichts mehr im Weg steht. Ohne Schritt 1 wäre diese Vorarbeit allerdings wertlos.

---

## Anhang A — Gegenprüfung A (Sicherheit/Datenschutz/RLS/IDOR/API/Audit)

| # | Prüfung | Ergebnis |
|---|---|---|
| A1 | Anon-Zugriff auf Gesundheitsdaten | **PASS** |
| A2 | Billing nur für Admin/Staff | **PASS** |
| A3 | Audit-Trails schreibgeschützt | **TEILWEISE** → M-2 |
| A4 | Leistungsnachweis ab `signed` unveränderlich | **PASS** mit Lücke → M-4 |
| A5 | Coach-Tabellen Self-RLS | **PASS** |
| A6 | `correctInvoice()` sicher | **TEILWEISE** → M-1 |
| A7 | Mandantentrennung | **PASS** |
| A8 | `service_role` nicht im Client-Bundle | **PASS** |
| A9 | Datei-/PDF-Zugriff autorisiert | **PASS** |
| A10 | Keine Secrets im Code | **PASS** |

**A1 im Detail.** Vollsweep über alle 303 exponierten Objekte als `anon`: 222 antworten
`HTTP 401`, 80 antworten `200`. Von diesen 80 liefern **4** tatsächlich Daten:

* `bundeslaender` (16), `plz_bundesland_regeln` (215), `state_settings_public` (96) —
  öffentliche Referenzdaten, unkritisch.
* `angels` (13) — Policy `Herkes engelleri okuyabilir`, bewusst öffentlich für die
  Engel-Suche. Inhalt geprüft: Stundensatz, Leistungen, Verfügbarkeit, Qualifikation,
  Bewertung. **Kein Name, keine Adresse, keine Kontaktdaten, kein `user_id`-Bezug.**

Die übrigen 76 liefern `[]`. Für 21 davon ist RLS **nachweislich** wirksam (`service_role`
sieht Zeilen, `anon` sieht 0 — u. a. `billing_audit_trail` 5, `wf_audit_log` 31,
`page_views` 6.932, `notifications` 176). Die restlichen 55 Tabellen sind in Produktion
leer, `200 []` beweist dort nichts. Für diese wurde stattdessen die Policy-Lage geprüft:
**alle 55 haben RLS aktiv und keine einzige PERMISSIVE-Policy mit `qual = true`** — darunter
`pflege_anamnesen`, `pflege_diagnosen`, `pflege_risiken`, `pflege_massnahmen`, `payments`,
`chat_messages`, `whatsapp_conversations`. Zusätzlich: alle 7 exponierten Views verweigern
anon den Zugriff, `coach_*`-Tabellen ebenso.

**A3 im Detail.** 8 von 10 Audit-Tabellen tragen je einen BEFORE-UPDATE- und
BEFORE-DELETE-Trigger. `assignment_audit_log` und `service_record_audit_log` haben keinen
(→ M-2).

**A5 im Detail.** `coach_bestellungen`, `coach_zahlungen`, `coach_rechnungen` haben je genau
eine SELECT-Self-Policy und **keine** Admin-Policy — die dokumentierte Produktgrenze ist live
durchgesetzt. `coach_pseudonym_key` hat 0 Policies (deny-all).

## Anhang B — Gegenprüfung B (Workflow/PflegeCoach/Billing/OPOS)

| # | Prüfung | Ergebnis |
|---|---|---|
| B1 | Klient anlegen (`status 'new'`) | **PASS** — Constraint enthält `'new'`; live 4× `active` |
| B2 | Pflegegrad synchron | **PASS mit Risiko** — live 2/2, 3/3, 2/2, 3/3 synchron, aber kein Trigger → M-3 |
| B3 | Budget korrekt | **TEILWEISE** — 131 €/1.572 € und 3.539 € in `budget-constants.ts` korrekt; live fehlt VP/KZP bei 2 Klienten → H-2 |
| B4 | Mitarbeiter zuweisen | **PASS** — 5 `assignments`, 2 `caregivers` live |
| B5 | Buchung → Einsatz → Nachweis | **PASS** — 30 Leistungsnachweise, genau **ein** Insert-Pfad |
| B6 | Unterschrift → `signed` | **FAIL** → H-1 |
| B7 | Tarif-Auflösung `tarifLeistungsart()` | **PASS** — der einzige Insert-Pfad nutzt sie |
| B8 | Rechnung `create_invoice_draft_atomic` | **TEILWEISE** — RPC live und atomar, prüft aber keine Unterschrift → H-1 |
| B9 | PDF mit DejaVuSans | **PASS** — beide Schriftdateien vorhanden, `loadPdfFonts()` wirft statt auf Helvetica zurückzufallen |
| B10 | Zahlung → OPOS → Mahnwesen | **UNGEPRÜFT LIVE** — `wf_trigger_zahlung` ist repariert (P0 behoben), aber `payments` = 0: der Weg ist in Produktion nie gelaufen |
| B11 | PflegeCoach-Checkout | **PASS** — vierfaches Fail-Closed-Gate verifiziert |

**Zu B10:** Der frühere P0 (`NEW.invoice_id` auf `payments`) ist behoben — die Live-Funktion
enthält das Feld nicht mehr. Damit ist der Zahlungseingang technisch wieder möglich. Ein
Nachweis am echten Objekt steht aus: `payments`, `payment_allocations` und `dunning_entries`
sind leer. Ein Live-Test hätte in Produktion eine Zahlung angelegt und über `wf_emit_event`
Workflow-Aktionen ausgelöst — das wurde hier bewusst **nicht** getan.
