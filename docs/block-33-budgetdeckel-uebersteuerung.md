# Block 33 — Die PDL konnte eine private Forderung auslösen

**Stand:** 14.09.2026 · **Ausgangspunkt:** `1a957647`

---

## Vorab: 131 € ist kein Deckel

Die Frage lautete „was passiert, wenn ein Kunde mehr als 131 €/Monat
verbraucht?" — die Prämisse trifft nicht zu, und das ist wichtig für alles
Weitere.

**§ 45b SGB XI ist ein Jahresanspruch**: 12 × 131 € = 1.572 €, flexibel
abrufbar. 400 € in einem Monat sind zulässig, solange das Jahr sie trägt.
`monthly_amount` ist Rechengröße, nicht Schranke. Ein monatliches Limit
wäre fachlich falsch.

Was verfällt, ist der **Übertrag** aus dem Vorjahr — am 30.06. des
Folgejahres (§ 45b Abs. 1 S. 5).

---

## Was ich gemessen habe — und was hält

`npm run verify:budgetdeckel` (neu, schreibt nichts), live:

```
Gerlinde Hoffmann     323,00 € von 1.572,00 €   21 %
Werner Krause       1.520,00 € von 1.572,00 €   97 %  ⚠ über 80 %
Ingrid Bauer        1.300,00 € von 1.572,00 €   83 %  ⚠ über 80 %
                    Übertrag 150,00 € VERFALLEN am 2026-06-30
Erika Testfall         70,00 € von 1.572,00 €    4 %

über dem Deckel: 0
```

Vier Dinge halten — gemessen, nicht angenommen:

| Prüfung | Ergebnis |
|---|---|
| **Verfallsregel** | Ingrid Bauer wird gegen **1.572 €** gerechnet, nicht gegen 1.722 €. Der verfallene Übertrag zählt korrekt nicht mehr mit |
| **Deckel bei der Planung** | `pruefeBudget().blockiert` wirft in der Einsatzkette (`BUDGET_BLOCKIERT`) |
| **Deckel bei der Abrechnung** | `invoice-engine` kappt den Kassenbetrag und schiebt den Überschuss auf den Privatanteil, mit Vermerk |
| **Warnung ab 80 %** | beide Klienten erzeugen eine Warnung; der Dublettenschutz greift (je 3 Zeilen = 3 Empfänger, eine je Rolle) |

Auch der fehlende Trigger auf `client_budgets` ist **kein** Befund: der
Trigger `update_budget_used_amount` rechnet den Verbrauch aus den
Nachweisen **neu** statt zu deckeln. Das ist richtig — erbrachte Leistung
ist erbracht; gedeckelt gehört, was der Kasse berechnet wird.

---

## Befund 1 — Das falsche Recht öffnet die Budgettür

`POST /api/einsatzplanung` kennt `force_override`. Es war für **alle**
Riegel an `personal.schreiben` gebunden, mit dieser Begründung im Code:

> Übersteuern einer fehlenden Einsatzfreigabe ist eine
> Personalentscheidung.

Für Einsatz- und Klientenfreigabe stimmt das. Für das Budget nicht: was am
Deckel hängt, ist **Geld**. Der Überschuss wandert im Rechnungsweg auf den
**Privatanteil** des Klienten — ein übersteuerter Deckel erzeugt eine
private Forderung.

Und die Rollenmatrix sagt über die PDL wörtlich:

> Rechnungen darf sie einsehen (Rückfragen aus dem Betrieb), aber nicht
> erzeugen oder ändern.

| Rolle | `personal.schreiben` | `abrechnung.schreiben` |
|---|---|---|
| pdl | ✓ | **✗** |
| buchhaltung | ✗ | ✓ |
| admin / superadmin | ✓ | ✓ |

**Die PDL konnte über diesen Weg genau das auslösen, was ihr verwehrt
ist.**

**Behoben:** die Budgetsperre zu übersteuern verlangt jetzt
`abrechnung.schreiben`. Die übrigen Riegel bleiben bei
`personal.schreiben` — die Verschärfung sammelt nicht alles ein. Der
Hinweistext nennt das nötige Recht, statt zu etwas einzuladen, das dann
403 gibt.

---

## Befund 2 — Der gebrochene Riegel sah aus wie eine Warnung

Jeder übersteuerte Riegel legte eine Notiz ab (*„Einsatzfreigabe
übersteuert: …"*, *„Abwesenheit übersteuert: …"*) — **außer dem Budget**.
Dort landete nur der gewöhnliche Auslastungstext:

```
Budget zu 97% ausgeschöpft (52.00 EUR verbleibend)
```

Im Audit-Trail war damit nicht unterscheidbar, ob jemand eine **Sperre
gebrochen** oder bloß eine Warnung gesehen hat. Das sind zwei sehr
verschiedene Vorgänge.

**Behoben:** der Sperrfall vermerkt *„Budgetsperre übersteuert: …"*, der
Warnfall bleibt der Warnfall (`else if`).

---

## Tests

19 Tests, davon 12 neu. Der Bestandstest `d1-force-override-auth`
läuft unverändert grün — der `personal.schreiben`-Riegel für die übrigen
Prüfungen steht.

| Mutation | Wirkung |
|---|---|
| Berechtigungsprüfung entfernt | **2 Tests** fallen |
| Übersteuerungsvermerk zurück auf Warntext | **1 Test** fällt |

Die Tests prüfen die Rollenmatrix selbst mit — dass `pdl` kein
`abrechnung.schreiben` hat und `buchhaltung` kein `personal.schreiben`,
ist die Voraussetzung des ganzen Befunds. Wäre sie eines Tages nicht mehr
wahr, fällt der Test.

---

## Offen — in Yusufs Hand

Neu aus diesem Block:

- **Werner Krause steht bei 97 %** (52 € Rest), **Ingrid Bauer bei 83 %**.
  Beide Warnungen liegen seit dem 28.08.2026 in `ops_benachrichtigungen`.
  Wenn bei Werner Krause der nächste Einsatz geplant wird, greift die
  Sperre — und übersteuern darf sie ab sofort nur noch, wer
  `abrechnung.schreiben` hat.
- **Ingrid Bauers Übertrag von 150 € ist am 30.06.2026 verfallen.** Die
  Rechnung berücksichtigt das korrekt; die Zeile in `client_budgets` führt
  den Betrag aber weiter. Kosmetisch, aber verwirrend beim Draufsehen.

Unverändert: `CRON_SECRET`, Migrationen `20261105000000`,
`20261115000000`, `20261120000000`, BUSINESS_DECISION #5, `mis_kpis`
pflegen oder abschalten, Nachweise für die Einsatzfreigabe.
