# Block 32 — Eskaliert, aber nie benachrichtigt

**Stand:** 14.09.2026 · **Ausgangspunkt:** `9ff30179`

---

## Was ich zuerst gemessen habe

Vier der fünf Kandidaten waren bereits gedeckt. Das gehört genauso in den
Bericht wie ein Befund:

| Kandidat | Messung |
|---|---|
| Rechnungsfreigabe | `validate_invoice_status_transition` **hängt** als `trg_validate_invoice_status`; insgesamt **6 Trigger** auf `invoices`, darunter `prevent_finalized_invoice_mutation` |
| Einsatz-Konflikte | `trg_check_assignment_overlap` **hängt** auf `assignments` — nicht nur Kalender-UI |
| Nachweiskette | **9 Trigger** auf `service_records` (Belegpflicht, Sperre, Budgetfortschreibung) |
| Budget-Deckel | `client_budgets` hat **null** Trigger — der Deckel liegt allein in TypeScript. Bekannte, dokumentierte Entscheidung, kein neuer Befund |
| Mahn-Anrede | `mahnungAnrede` weicht bewusst vom Haus-Standard ab; `lib/kommunikation/anrede.ts` nennt die Abweichung ausdrücklich als Schwesterentscheidung. Unterschrift ist `org.name`, kein persönlicher Name — Regel erfüllt |

Ungeprüft war der **Mahnbrief** selbst: Block 30 hat die Eskalation
verifiziert, nie den Empfänger.

---

## Befund

`runDunningRun` erhöht die Mahnstufe **und bucht die Mahngebühr**, bevor
es das Schreiben erzeugt. Danach:

```ts
await sendDunningEmail(...)   // kehrt bei fehlender E-Mail wortlos zurück
emailCount++                  // zählt trotzdem als versendet
```

`sendDunningEmail` gab `void` zurück und verließ sich auf drei stille
Rücksprünge — Rechnung weg, keine E-Mail-Adresse, kein Mahneintrag. Der
Zähler stand außerhalb.

**Die Folge:** ein Klient ohne E-Mail-Adresse läuft Stufe für Stufe bis
zur Inkasso-Vorbereitung hoch, trägt bei jeder Stufe eine Mahngebühr —
und bekommt nie ein Schreiben. Der Lauf meldet dabei, es seien Mahnungen
versendet worden.

### Live

```
Klienten gesamt      4
davon ohne E-Mail    1   (Erika Testfall, status aktiv)
```

Ein Viertel des Bestands. Nicht hypothetisch.

### Zweiter Befund, vom Test gefunden

Die Prüfung war `!client?.email` — blosse Wahrheit. Eine Adresse aus
**Leerzeichen** (`'   '`) ist truthy und wäre als Empfänger in die Queue
gegangen; der Versand scheitert dann erst beim Anbieter, und bis dahin
sieht der Lauf aus, als sei zugestellt worden. Jetzt `.trim()`.

Diesen zweiten Befund hat nicht das Lesen gefunden, sondern der achte
Test — geschrieben, bevor der Code ihn erfüllen konnte.

---

## Behebung

- **`sendDunningEmail` gibt ein Ergebnis zurück** statt zu schweigen:
  `{ ok: true } | { ok: false; grund: string }`. Jeder der vier
  Abbruchgründe trägt Klartext — und der häufigste sagt, was zu tun ist:
  *„Mahnung muss auf dem Postweg zugestellt werden."*
- **`emailsVersendet` zählt nur noch echte Einreihungen.**
- **`DunningRunResult.nichtBenachrichtigt`** führt jede eskalierte, aber
  nicht zugestellte Rechnung mit Grund. Der Lauf protokolliert sie
  zusätzlich als Fehler — die Stufe steht bereits.
- **Die Cron-Route weist sie aus**, je Mandant und in der Gesamtsumme,
  bewusst direkt neben `eskaliert`: die Differenz ist die Zahl der
  Menschen, die eine Gebühr tragen, ohne davon zu wissen.

### Was bewusst NICHT passiert

Die Eskalation wird **nicht zurückgenommen**. Die Rechnung ist überfällig,
daran ändert eine fehlende Adresse nichts. Der Lauf sagt nur deutlich,
dass die Zustellung aussteht — das ist ein Betriebszustand, den ein Mensch
auflöst, kein Softwarefehler.

Ohne Empfänger wird auch **kein Mahndokument** erzeugt. Sonst läge ein PDF
herum, das nie jemand bekommen hat.

---

## Tests

8 neue Tests. Die Mutationsprobe bestätigt, dass sie greifen:

| Mutation | Wirkung |
|---|---|
| Zählung wieder bedingungslos | **4 Tests** fallen |
| `.trim()` entfernt | **1 Test** fällt |

---

## Offen — in Yusufs Hand

Neu aus diesem Block:

- **Erika Testfall hat keine E-Mail-Adresse.** Solange das so ist, kann
  sie gemahnt werden, ohne es zu erfahren. Entweder Adresse nachtragen
  oder den Postweg als Vorgang einrichten — der Lauf weist sie ab sofort
  im Bericht aus.
- **Entscheidung:** soll eine Eskalation ohne zustellbaren Empfänger
  überhaupt stattfinden? Heute ja (die Forderung besteht). Die Gegenposition
  wäre, die Stufe zu halten, bis zugestellt werden kann — das ist eine
  fachliche Entscheidung, keine technische.

Unverändert: `CRON_SECRET`, Migrationen `20261105000000`,
`20261115000000` und **neu `20261120000000`** (Kundenbindung
`pflege_massnahmen`), BUSINESS_DECISION #5, `mis_kpis` pflegen oder
abschalten, Nachweise für die Einsatzfreigabe.
