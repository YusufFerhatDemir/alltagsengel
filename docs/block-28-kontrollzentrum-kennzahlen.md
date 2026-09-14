# Block 28 — Kontrollzentrum / MIS-Vollständigkeit

**Stand:** 14.09.2026 · **Ausgangspunkt:** `2483be45`

---

## Der Kern des Befunds

Das Kontrollzentrum nannte sich *„Echtzeit-Übersicht aller
Geschäftskennzahlen"* und rechnete den Umsatz so:

```ts
revenue: (bookingCount || 0) * UNIT_ECONOMICS.billingRatePerHour
```

Eine Buchung ist weder eine Stunde noch ein Euro. Sie kann abgesagt,
unbezahlt oder nie erbracht worden sein.

Damit gab **dasselbe System drei Antworten auf dieselbe Frage**:

| Auswertung | Zeigte | Regel |
|---|---:|---|
| `/mis` | 105 € | Buchungen × 35 € — erfunden |
| `/admin/analytics/kpi` | 1.901 € | Summe über `invoices`, ungeprüft |
| Offene Posten (OPOS) | 0 € | verlangt `frozen_at` — **korrekt** |

Richtig ist die dritte. Keine der drei Rechnungen im Bestand ist
festgeschrieben; alle sind synthetisch. **Der echte Umsatz ist 0 €** —
passend zu `FIRST_REAL_INVOICE_APPROVED=false`.

Das eigentliche Muster ist nicht die falsche Formel, sondern ihre
Herkunft: die Wahrheit existierte längst (`berechneUmsatz` in
`lib/analytics/kpi.ts`, das Statusvokabular in
`lib/billing/status-vokabular.ts`, die Belegregel in
`lib/billing/nachweis-beleg.ts`). `/mis` hatte daneben eine eigene,
falsche Zweitrechnung gebaut — dasselbe Doppelregel-Muster wie in
Block 15.

---

## Befunde und Behebung

| # | Befund | Behebung |
|---|---|---|
| 1 | Umsatz = Buchungen × Stundensatz (live 105 €) | Kommt aus `invoices` über `berechneUmsatz` |
| 2 | `berechneUmsatz` prüfte den Status nicht — ein Storno blieb für immer Umsatz | `KEIN_UMSATZ_STATUS` + `zaehltAlsUmsatz()` im zentralen Vokabular |
| 3 | `berechneUmsatz` prüfte `frozen_at` nicht — OPOS und KPI widersprachen sich | `frozen_at` ist Pflichtfeld des Eingabetyps; beide Auswertungen tragen jetzt dieselbe Bedingung |
| 4 | Kein Mandantenzaun auf `profiles`/`bookings`/`angels` | Alle Zahlen kommen org-gefenced aus `/api/mis/kennzahlen` |
| 5 | `/api/mis/` existierte überhaupt nicht | `app/api/mis/kennzahlen/route.ts`, `requireOpsAdmin('berichte.lesen')` |
| 6 | Falsche Grundgesamtheit: „Engel" zählte 22 Marktplatz-Profile | Zählt jetzt die 2 eigenen Kräfte — und davon die **einsatzbereiten (0)** |
| 7 | Stille Null: Abfragefehler → Log → Karten blieben auf 0 | Störungsbanner (`role="alert"`), Zahlen werden verworfen |
| 8 | `mis_kpis` (14 gepflegte Zeilen) las niemand — und die Tabelle **widersprach** der Seite (TAM 24,6 vs. 50 Mrd. €) | Marktzahlen kommen aus der Tabelle, als Planannahme gekennzeichnet |
| 9 | „95 % API-Verfügbarkeit", „42 % Speicherauslastung" — Konstanten als Messung | Ersetzt durch echte Betriebslage (Einsatzbereitschaft, Nachweisquote, Auslastung) |
| 10 | „Pitch Deck v2 hochgeladen — vor 2 Stunden" — Attrappe seit jeher | Entfernt, ersetzt durch echte Nachweiszahlen |
| 11 | `trend="up"` fest verdrahtet auf allen vier Karten | Entfernt |
| 12 | Stummer Leerzustand (`recentBookings.length > 0 &&`) | `DataTable` mit `emptyMessage` |
| 13 | Fehlende Kennzahlen: offene Posten, Auslastung, Nachweislage | Ergänzt |

### Geprüft und **kein** Befund

19 weitere `/mis`-Seiten fragen client-seitig ohne `.eq('organization_id')`
ab. Das ist hier **kein** Leck: sie nutzen den RLS-Client, und die
Schnittmenge der von ihnen gelesenen Tabellen mit den drei org-blinden
Tabellen aus Block 23 (`email_entwuerfe`, `marketing_content_status`,
`security_watchlist`) ist **leer**. Der RLS-Zaun trägt dort.

---

## Live-Beweis

`npm run verify:mis-kennzahlen` (schreibt nichts):

```
Umsatz (festgeschrieben)    0,00 € aus 0 Rechnung(en)
nicht festgeschrieben       3 Rechnung(en)
offene Posten               0,00 € aus 0 Rechnung(en)

Klienten                    4 (davon aktiv: 4)
Kräfte                      2
davon einsatzbereit         0
Leistungsnachweise          30 (26 mit Beleg, 4 ohne)

Gegenprobe
  Summe ALLER Rechnungen ohne Prüfung   1.901,00 €
  ausgewiesener Umsatz                  0,00 €
  → Differenz 1.901,00 € — und das ist richtig so
```

---

## Offen — in Yusufs Hand

Unverändert aus den Vorblöcken:

- **`CRON_SECRET` setzen** — 40 verschleppte Leads warten
- **Migrationen einspielen** (DDL nur im SQL-Editor): `20261105000000`
  (Audit-Lücke), `20261115000000` (Mandantenzaun, 3 org-blinde Tabellen)
- **BUSINESS_DECISION #5** — 13 unabrechenbare Nachweise
- **Einsatzbereitschaft herstellen** — 2 Kräfte brauchen Führungszeugnis +
  Erste-Hilfe + Freigabe; 4 Klienten brauchen einen aktiven Vertrag.
  Solange hier 0 steht, entsteht kein Einsatz, kein Nachweis, keine
  Rechnung — und das Kontrollzentrum sagt das jetzt auch.

Neu aus diesem Block:

- **`mis_kpis` pflegen oder abschalten.** Die Tabelle wird jetzt gelesen
  und angezeigt. Zehn ihrer vierzehn Zeilen stehen auf 0 (MAU,
  Buchungen/Monat, Umsatz, CSAT, ISO-Compliance …). Solange sie niemand
  pflegt, zeigt das Kontrollzentrum gepflegte Nullen.
