# Block 34 — Die Nachbartür stand offen

**Stand:** 14.09.2026 · **Ausgangspunkt:** `0056c82e`

---

## Warum dieser Block

Block 33 hat im **POST** von `/api/einsatzplanung` die Budget-Übersteuerung
an `abrechnung.schreiben` gebunden. Ich habe dabei nicht nachgesehen, ob
der **PATCH** denselben Riegel trägt. Das ist die Nacharbeit.

---

## Befund 1 — Der PATCH kannte den Budgetriegel nicht

Gemessen, Prüfung für Prüfung:

| Prüfung | POST | PATCH |
|---|---|---|
| Einsatzfreigabe | ✓ | ✓ |
| Klientenfreigabe | ✓ | ✓ |
| Abwesenheit / Verfügbarkeit | ✓ | ✓ |
| Doppelbelegung | ✓ | ✓ |
| **Budget** | ✓ | **✗ kam im ganzen Zweig nicht vor** |

Der in Block 33 gehärtete Riegel ließ sich damit schlicht umgehen — auf
drei Wegen:

1. Einsatz für einen Klienten mit freiem Budget anlegen, danach
   `client_id` auf einen **erschöpften** Klienten ändern.
2. `service_type` von einem **ungedeckelten** Topf (§ 36, privat) auf
   `entlastung` ziehen.
3. `start_time`/`end_time` **ausweiten** — mehr Verbrauch, keine Prüfung.

**Behoben:** der PATCH prüft jetzt gegen **Bestand + Änderung zusammen**
(wie die Nachbarprüfungen — sonst liefe ein reiner Klientenwechsel gegen
den alten Klienten) und trägt dieselbe Regel wie der POST:
Übersteuern verlangt `abrechnung.schreiben`, der gebrochene Riegel wird
als *„Budgetsperre übersteuert"* vermerkt.

### Ein Fehler in meiner eigenen Behebung

Der erste Entwurf hängte die Budgetprüfung in einen Block, der nur bei
Änderung von Mitarbeiter, Datum, Zeit oder Klient betreten wird. **Eine
reine `service_type`-Änderung — Weg 2 aus meiner eigenen Aufzählung —
wäre nie angekommen.** `updates.service_type` steht jetzt in der
Auslösebedingung; ein Test hält das fest.

---

## Befund 2 — Der Kommentar beschrieb eine Absicht, die der Code nicht umsetzte

`requireStaff` verlangte für **jedes** Verb `einsatz.lesen`:

```ts
// Einsatzplanung gehoert zum Einsatzgeschehen: admin/superadmin und pdl.
if (!quellenDuerfen(quellen, 'einsatz.lesen')) { … }
```

`einsatz.lesen` tragen laut `lib/auth/rollen.ts` aber auch `qm` und
`buchhaltung`. Beide konnten Einsätze **anlegen und ändern**, obwohl ihre
Rollenbeschreibung genau das ausschließt:

> **qm:** „prüft, dokumentiert Befunde, ändert aber die geprüften Daten
> NICHT — sonst prüfte es die eigene Korrektur."

| Rolle | `einsatz.lesen` | `einsatz.schreiben` |
|---|---|---|
| qm | ✓ | **✗** |
| buchhaltung | ✓ | **✗** |
| pdl | ✓ | ✓ |

**Behoben:** `requireStaff` nimmt die Berechtigung als Parameter. GET
liest, POST und PATCH schreiben.

---

## Live-Wirkung: keine

```
Rollenverteilung am 14.09.2026
  kunde 37 · engel 30 · fahrer 5 · superadmin 3 · admin 1
  qm 0 · buchhaltung 0 · pdl 0
```

Beide Lücken sind **strukturell, nicht eingetreten**. Die Konten, die sie
hätten nutzen können, gibt es nicht — und wer heute PATCHen kann
(admin/superadmin), trägt `abrechnung.schreiben` ohnehin.

Das macht sie nicht weniger echt: die Rollen sind angelegt, um besetzt zu
werden.

---

## Tests

36 Tests über drei Dateien, davon 17 neu. Beide Bestandstests
(`d1-force-override-auth`, `budget-uebersteuerung-berechtigung`) bleiben
grün.

| Mutation | Wirkung |
|---|---|
| Budgetblock aus dem PATCH entfernt | **7 Tests** fallen |
| `service_type` aus der Auslösebedingung | **1 Test** fällt |
| `requireStaff` wieder immer `einsatz.lesen` | **2 Tests** fallen |

Die Tests prüfen POST und PATCH **gegeneinander**: beide müssen dieselbe
Regel tragen. Genau diese Paarung fehlte, und genau sie wäre beim nächsten
Auseinanderlaufen wieder der Befund.

---

## Offen — in Yusufs Hand

Unverändert: `CRON_SECRET`, Migrationen `20261105000000`,
`20261115000000`, `20261120000000`, BUSINESS_DECISION #5, `mis_kpis`
pflegen oder abschalten, Nachweise für die Einsatzfreigabe, Erika
Testfalls fehlende E-Mail-Adresse (Block 32).

Nichts Neues aus diesem Block — beide Befunde sind im Code behoben und
brauchen keine Entscheidung.
