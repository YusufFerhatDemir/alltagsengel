# Pilot — kontrollierter Echtbetrieb

Stand: 13.08.2026

## Zweck

Der Pilotmodus macht eine einzige Frage beantwortbar: **Kann ein echter Kunde
heute von Anfang bis Ende bearbeitet werden — und wenn nein, wo genau hakt es?**

Er ist bewusst **nur lesend**. Er bewertet den Ist-Zustand und verändert ihn
nicht. Es gibt keinen „Pilot-Schalter", der Verhalten umstellt; es gibt eine
Checkliste, die den Betrieb sichtbar macht, und Sperren an den Stellen, an
denen echtes Geld oder echte Datenübertragung im Spiel ist.

## Einstieg

`/admin/pilot` (Navigation → Übersicht → „Pilot / Echtbetrieb")

- **Teil 1 — Betriebs-Checkliste:** darf überhaupt echt abgerechnet werden?
- **Teil 2 — Kundenketten:** wie weit ist jeder Kunde gekommen?

Pro Kunde führt `/admin/pilot/[clientId]` zur Detailansicht mit allen
13 Schritten, dem jeweiligen Stand und dem konkreten nächsten Schritt.

## Die Kette

| # | Schritt | Erledigt, wenn … |
|---|---------|------------------|
| 1 | Kunde angelegt | Name, Geburtsdatum, Anschrift, PLZ und Telefon/E-Mail erfasst |
| 2 | Pflegegrad erfasst | `clients.pflegegrad` 1–5 gesetzt |
| 3 | Budget angelegt | mindestens ein `client_budgets`-Satz im laufenden Jahr |
| 4 | Betreuungskraft zugeordnet | zugeordnete Kraft hat `einsatzfreigabe = true` |
| 5 | Termin geplant | mindestens ein `assignments`-Satz |
| 6 | Leistungsnachweis erfasst | mindestens ein `service_records`-Satz |
| 7 | Signaturen geleistet | zu jedem Nachweis eine Zeile in `service_signatures` |
| 8 | Nachweis freigegeben | `status` ∈ `signed`, `complete`, `invoiced` |
| 9 | Rechnung erstellt | Rechnung mit fortlaufender Nummer |
| 10 | Rechnungs-PDF erzeugt | Zeile in `invoice_packages` |
| 11 | Zahlungseingang verbucht | `payment_allocations` decken den Rechnungsbetrag |
| 12 | OPOS ausgeglichen | keine offene Forderung mehr |
| 13 | In DATEV übergeben | nicht fehlgeschlagener `datev_exports`-Satz deckt das Rechnungsdatum ab |

„Pflegegrad/Budget" ist absichtlich in zwei Schritte geteilt: der Pflegegrad ist
ein externer Bescheid, das Budget die interne Folge daraus. Sie scheitern an
verschiedenen Stellen und brauchen verschiedene nächste Schritte.

## Statusfallen, die die Bewertung berücksichtigt

Diese drei Punkte sind der Grund, warum die Kette nicht einfach Status-Strings
abliest:

1. **`service_records.status = 'signed'` beweist keine Unterschrift.** Der Wert
   wird auch von Importen und Altbestand gesetzt. Schritt 7 zählt deshalb
   Zeilen in `service_signatures`. Live-Befund am 13.08.2026: 30 Nachweise auf
   `signed`, **0** Signaturen — die Kette weist das jetzt korrekt als offen aus.

2. **`invoices` führt zwei Status-Wortschätze parallel** — den neuen der
   Status-Machine (`entwurf`…`bezahlt`) und Alt-Werte (`sent`, `paid`,
   `disputed`). Die Bezahlt-Erkennung läuft deshalb über Beträge, nie über den
   Status-String.

3. **`invoices.total_amount` steht in EURO, `payment_allocations.amount_cents`
   in CENT.** Die Umrechnung passiert an genau einer Stelle
   (`euroZuCent()` in `lib/pilot/kundenkette.ts`).

## Bewusst gesperrte Wege

Der Pilot läuft als **Selbstzahler-Betrieb**. Zwei Wege sind abgeschaltet, weil
externe Voraussetzungen fehlen. Beide blockieren die Kette nicht — sie ist ohne
sie vollständig durchlaufbar:

| Weg | Grund | Sperre im Code |
|-----|-------|----------------|
| Kassenübertragung (DTA/SECON) | kein Bundesland freigeschaltet; Anerkennung § 45a, ITSG-Zertifikat und SFTP-Zugang fehlen | `lib/abrechnung/versand-guard.ts` |
| SEPA-Lastschrifteinzug | Gläubiger-ID ist ein Platzhalter | `lib/billing/sepa/glaeubiger-id.ts` |

## P0 gefixt: SEPA-Platzhalter-Gläubiger-ID

**Befund.** Migration `20260812120000` setzt `organizations.sepa_creditor_id`
auf `DE98ZZZ09999999999`. Der Wert stand produktiv in der Stamm-Organisation.
`createSepaBatch()` prüfte ausschliesslich `if (!org?.sepa_creditor_id)` — ein
Platzhalter ist nicht leer und rutschte durch.

**Folge, wenn ungefixt.** Der Sammelauftrag wäre mit ungültiger CI erzeugt
worden. Im besten Fall weist die Bank ihn zurück. Im schlechteren Fall gilt der
Lauf intern als eingezogen, die Rechnungen verlassen die OPOS-Liste, und der
Zahlungseingang bleibt unbemerkt aus.

**Fix.** `lib/billing/sepa/glaeubiger-id.ts` erkennt Platzhalter, Formatfehler
und Null-Identifikationsteile und wirft, statt einen Wahrheitswert zu liefern.
Die Sperre sitzt an **zwei** Stellen:

- `createSepaBatch()` — der heutige Aufrufer
- `generatePain008()` — der Erzeugungspunkt selbst, damit ein künftiger
  zweiter Aufrufer sie nicht umgehen kann

Die zweite Stelle ist die Lehre aus dem Tarif-Fail-Closed-Bypass: ein
Fail-Closed-Fix muss alle Lesepfade abdecken, nicht nur den Hauptweg.

**Aufhebung.** Sobald die echte Gläubiger-ID der Deutschen Bundesbank vorliegt,
wird sie in `organizations.sepa_creditor_id` eingetragen. Es ist **keine**
Code-Änderung nötig — die Prüfung lässt jede strukturell gültige, nicht als
Platzhalter gelistete ID durch.

## Gesetzliche Werte (Quelle: `lib/config/budget-constants.ts`)

Ab 01.01.2025, versioniert und fail-closed:

- Entlastungsbetrag § 45b: **131 €/Monat**, 1.572 €/Jahr
- VP + KZP § 42a gemeinsamer Jahresbetrag: **3.539 €**, ab Pflegegrad 2

Für ein Jahr ohne hinterlegte Version wirft `budgetVersionFuerJahr()`. Es gibt
bewusst keinen stillen Fallback auf einen benachbarten Zeitraum.

## Kein Pilot-Flag in der Datenbank

Der Pilot braucht **keine Migration**. Die Kohorte wird aus den vorhandenen
Daten abgeleitet: alle aktiven Kunden der aktiven Organisation, begrenzt auf
100 pro Ansicht. Wird gekappt, sagt die Oberfläche das ausdrücklich — eine
stille Kappung liest sich sonst wie „das sind alle".

## Dateien

```
lib/pilot/types.ts             Ampel-, Blocker- und Schritt-Typen
lib/pilot/schritte.ts          Definition der 13 Kettenschritte
lib/pilot/voraussetzungen.ts   Betriebs-Checkliste (Org-Ebene)
lib/pilot/kundenkette.ts       Kettenstand je Kunde
app/api/admin/pilot/           API hinter requireAdminMitOrg
app/admin/pilot/               Übersicht + Kundendetail
__tests__/billing/pilot-kundenkette.test.ts
__tests__/billing/sepa-glaeubiger-id.test.ts
```
