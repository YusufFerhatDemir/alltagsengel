# Tarif-Verifizierung — Ist-Zustand und Zuständigkeiten

**Stand:** 14.08.2026, live über PostgREST mit Service-Role-Key ausgelesen.
**Anlass:** M-5 aus dem Abschlussbericht („leistungspreise 100 % unverified,
nur 1 verifizierter Kassentarif").

> **Dieses Dokument verifiziert nichts.** Es hält fest, was da ist, wer was
> freigeben muss und was dafür vorliegen muss. Ein Tarif wird ausschließlich
> über `/admin/kassenabrechnung/tarife` freigegeben, mit Rechtsquelle und
> hochgeladenem Primärbeleg. Es gibt keinen SQL-Weg daran vorbei
> (DB-Trigger `trg_verifizierung_belegpflicht`, Migration 20260904000000).

---

## 1. Warum das kein Code-Fehler ist

Der Zustand „unverified" ist die **Voreinstellung**, nicht ein Defekt. Die
Fail-Closed-Logik funktioniert genau wie vorgesehen: ohne Freigabe kommt kein
Kassenbetrag zustande. Was fehlt, sind die **Belege** — Vergütungsvereinbarung,
Anerkennungsbescheid oder Rechtsverordnung. Die kann nur beschaffen, wer mit
den Kassen verhandelt; kein Test und keine Migration ersetzen das.

Die Regel, nach der überall entschieden wird:

| `tarif_status` | Kassentarif (`rechtsgrundlage ≠ 'privat'`) und alle `leistungspreise` | Privattarif (`rechtsgrundlage = 'privat'`) |
| --- | --- | --- |
| `verified`   | abrechenbar | abrechenbar |
| `unverified` | **gesperrt** | abrechenbar (Privatpreise sind frei wählbar) |
| `blocked`    | **gesperrt** | **gesperrt** |
| NULL / unbekannt | **gesperrt** (gilt als `unverified`) | abrechenbar |

Durchgesetzt an fünf Stellen, alle gegen dieselbe Regel getestet
(`__tests__/billing/m5-tarif-fail-closed-konsistenz.test.ts`):

1. `resolvePrice()` — `lib/billing/core/price-resolver.ts` (Rechnungserstellung)
2. `isTarifFuerKorrekturVerwendbar()` — `lib/billing/core/invoice-engine.ts` (Korrekturrechnung)
3. `bewerteAbrechenbarkeit()` — `lib/billing/core/tarif-verifizierung.ts` (UI/Übersicht)
4. `create_invoice_draft_atomic()` — Migration 20260831050000 (Rechnungs-RPC, beide Auflösungszweige)
5. `zaehle_kassentarife()` — Migration 20260831050000 (Go-Live-Ampel)

---

## 2. `billing_tariffs` — 23 Zeilen

Diese Tabelle trägt die **verbindlichen Rechnungspreise**.

### 2.1 Verifiziert (11) — nutzbar

| Rechtsgrundlage | Leistungsarten | Preis | Quelle |
| --- | --- | --- | --- |
| `privat` | alltagsbegleitung, begleitservice, betreuung_45a, demenzbetreuung, einkaufsservice, nachtbetreuung, sonstige, wochenendbetreuung, hauswirtschaft | 38,00–45,00 €/h | `PRIVATE_PREISLISTE` |
| `privat` | wegepauschale | 5,00 € | `PRIVATE_PREISLISTE` |
| `§45b SGB XI` | wegepauschale | 5,00 € | `MANUELL_FREIGEGEBEN` |

**Privattarife brauchen keine Kassenfreigabe** — der Preis ist frei wählbar,
Rechtsgrundlage ist der Kundenvertrag. Das ist der Grund, warum der
Privatkunden-Weg heute vollständig funktioniert.

Der einzige verifizierte **Kassen**tarif ist die Wegepauschale §45b.

### 2.2 Gesperrt (8) — bleiben gesperrt

Alle acht: `§45b SGB XI`, 35,00 €/h, `MANUELL_FREIGEGEBEN` —
nachtbetreuung, wochenendbetreuung, begleitservice, alltagsbegleitung,
betreuung_45a, demenzbetreuung, einkaufsservice, hauswirtschaft.

> **Diese Tarife bleiben `blocked`.** Der Satz von 35 €/h stammt aus der
> Ersteinrichtung und ist nie gegen eine Vergütungsvereinbarung gehalten
> worden. Eine Freigabe „weil die Zahl plausibel aussieht" wäre genau der
> Fehler, gegen den die Sperre gebaut wurde.

### 2.3 Unverifiziert (4) — der eigentliche Engpass

`§39 SGB XI` (Verhinderungspflege), 35,00 €/h:
hauswirtschaft, betreuung_45a, alltagsbegleitung, demenzbetreuung.

**Folge:** Für §39 VP gibt es aktuell keinen verwendbaren Tarif. Jede
Rechnungserstellung über Verhinderungspflege bricht mit
`TarifNichtVerifiziertError` ab — korrekt, aber der Weg ist damit zu.

---

## 3. `leistungspreise` — 24 Zeilen, alle `unverified`

Diese Tabelle speist den **Monatsabschluss** (`lib/abrechnung/monatsabschluss.ts`)
mit Vorschau-Beträgen. Sie hat keine `rechtsgrundlage`-Spalte und gilt deshalb
durchgehend als Kassenpreis — Privatlogik gibt es hier nicht.

Alle Zeilen: `bundesland = 'hessen'`, Organisation = Stamm-Org,
`verifizierungs_quelle` = „UNVERIFIED: Keine Primaerquelle hinterlegt …",
`beleg_id` = NULL.

| Leistungsart | Preis | | Leistungsart | Preis |
| --- | --- | --- | --- | --- |
| alltagsbegleitung_45a | 25,00 € | | lk10_verlassen_wohnung_120p | 9,64 € |
| entlastung_45b | 131,00 € | | lk11_mobilisation_120p | 9,64 € |
| grosse_koerperpflege | 40,97 € | | lk12_begleitung_aktivitaeten_150p | 12,05 € |
| hauswirtschaft | 12,05 € | | lk13_haushaltsfuehrung_grundwert_150p | 12,05 € |
| hilfe_ausscheiden | 12,05 € | | lk14_betreuung_grundwert_300p | 24,10 € |
| kleine_koerperpflege | 32,14 € | | lk15_anleitung_grundwert_150p | 12,05 € |
| lk1_kleine_koerperpflege_400p | 32,14 € | | lk16_erstgespraech_900p | 72,31 € |
| lk2_grosse_koerperpflege_510p | 40,97 € | | lk17_folgegespraech_300p | 24,10 € |
| lk3_grosse_erw_koerperpflege_610p | 49,01 € | | lk18_beratungseinsatz_37_3 | 75,00 € |
| lk4_lagerung_100p | 8,03 € | | lk5_ausscheidung_umfangreich_150p | 12,05 € |
| lk6_nahrung_einfach_100p | 8,03 € | | lk7_nahrung_umfangreich_250p | 20,09 € |
| lk8_sondenkost_150p | 12,05 € | | lk9_aufstehen_zubett_100p | 8,03 € |

**Folge:** Der Monatsabschluss liefert für alle Leistungsarten
`betrag_cent = 0` und je Verordnung eine Warnung „Leistungspreis ist nicht
verifiziert". Es wird **kein Ersatzpreis** angesetzt — das ist beabsichtigt.

---

## 4. Wer muss was verifizieren

| # | Was | Wer | Was muss vorliegen |
| --- | --- | --- | --- |
| 1 | `leistungspreise`, alle 24 Zeilen (LK-Katalog Hessen) | Geschäftsführung / Abrechnung, gegen die Kasse | Vergütungsvereinbarung nach § 89 SGB XI mit den hessischen Pflegekassen bzw. der gültige Punktwert der Landesvereinbarung. Ohne Vertrag mit den Kassen ist keine dieser Zeilen freigebbar. |
| 2 | `billing_tariffs`, 4 × `§39 SGB XI` | dieselbe Stelle | Vergütungsvereinbarung für Verhinderungspflege. §39 ist der Weg, der heute komplett zu ist. |
| 3 | `billing_tariffs`, 8 × `§45b SGB XI` (`blocked`) | dieselbe Stelle | **Zuerst der Anerkennungsbescheid nach § 45a SGB XI (Hessen).** Danach der darin bzw. in der Landesverordnung festgelegte Stundensatz. Vorher bleibt `blocked` richtig. |
| 4 | `billing_tariffs`, `privat` | intern, Geschäftsführung | Eigene Preisliste mit Datum. Ist erledigt — alle 10 Zeilen sind `verified`. |

Reihenfolge: **§45a-Bescheid → §45b-Tarife → Kassenabrechnung.** Punkt 1 und 2
hängen an Verträgen mit den Pflegekassen und sind ohne diese nicht lösbar
(siehe `docs/BUSINESS_GO_LIVE_MATRIX_2026-08-14.md`).

---

## 5. Wie eine Freigabe abläuft

1. `/admin/kassenabrechnung/tarife` öffnen, Zeile auswählen.
2. Primärbeleg hochladen (PDF/JPEG/PNG/WebP, max. 20 MB) — landet im privaten
   Bucket `tarif-belege`.
3. Rechtsquelle eintragen, mindestens 5 Zeichen, in ganzen Worten
   (z. B. „Vergütungsvereinbarung AOK Hessen vom 01.03.2026").
4. Status auf `verified` setzen.

Geprüft wird dreifach — UI, API-Route `/api/billing/tariffs/[id]/verifizierung`,
und der DB-Trigger. Nur der Trigger ist nicht umgehbar; die ersten beiden
existieren für verständliche Fehlermeldungen.

**Für Kassentarife und alle `leistungspreise` ist der Beleg Pflicht.**
Privattarife brauchen nur die Rechtsquelle — gegen einen frei wählbaren Preis
lässt sich kein Beleg halten.

Jede Statusänderung landet unveränderlich in `billing_tariff_audit`
(Migration 20260909000000).

---

## 6. Was sich ändert, wenn freigegeben wird

| Vorher | Nachher |
| --- | --- |
| Monatsabschluss: Betrag 0, Warnung je Verordnung | Vorschau-Betrag = Minuten ÷ 60 × Preis |
| Rechnungserstellung §39/§45b: `TarifNichtVerifiziertError` | Rechnung wird erstellt |
| Go-Live-Ampel `zaehle_kassentarife`: zählt die Zeile nicht | zählt sie |
| `/admin/kassenabrechnung/tarife`: „nicht abrechenbar" | „freigegeben" |

---

## 7. Bekannte Falle

`supabase/migrations/20260808130000_expansion_phase2.sql` enthält noch die
**alte, ungefilterte** Fassung von `zaehle_kassentarife()`. Wird diese Migration
(oder eine Kopie) nach 20260831050000 erneut angewendet, steht die
Fail-Closed-Sperre der Go-Live-Ampel still wieder offen. Ein Test hält das fest:
`m5-tarif-fail-closed-konsistenz.test.ts` → „keine spaetere Migration definiert
zaehle_kassentarife ohne den Filter neu".
