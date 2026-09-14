# Block 38 — Sechs tote Schreibwege, davon vier im Datenschutzmodul

**Stand:** 14.09.2026 · **Ausgangspunkt:** `0e9d6eb0`

---

## Die zweite Achse

Block 37 baute einen Detektor für **Werte** gegen CHECK-Listen. Dieser
Block baut die Schwester: **Spaltennamen** gegen das Schema. Eine
unbekannte Spalte ist dabei der härtere Fall — Postgres weist nicht das
Feld ab, sondern die **ganze Abfrage** (`42703`).

Warum beide nötig sind, zeigte der allererste Lauf.

---

## Der Befund, der mich selbst traf

Die Referral-Benachrichtigung trug **zwei** tote Gründe in *einer*
Anweisung:

```ts
await supabaseAdmin.from('notifications').insert({
  title: 'Empfehlungsbonus erhalten!',
  message: `…`,          // ← die Spalte heißt `body`   (42703)
  type: 'referral',      // ← der CHECK kennt sie nicht (23514)
})
```

Ich hatte in **Block 37** den Wert korrigiert und die Stelle für erledigt
erklärt. Der Vokabular-Detektor meldete sie danach als sauber — und die
Benachrichtigung kam trotzdem nicht an. Eine Achse sieht nur ihren
eigenen Fehler.

---

## Die sechs Befunde

| Stelle | Folge |
|---|---|
| `mis_applicants.created_by` | **Bewerber anlegen** scheiterte |
| `mis_job_postings.created_by` | Stellenausschreibung anlegen scheiterte |
| `mis_privacy_records.created_by` | **Verarbeitungsverzeichnis (Art. 30 DSGVO)** nicht führbar |
| `mis_privacy_consents.created_by` | Einwilligung nicht erfassbar |
| `mis_privacy_consents.updated_at` | **Einwilligung nicht widerrufbar** |
| `mis_privacy_requests.created_by` | Betroffenenanfrage (Art. 15–22) nicht erfassbar |

Vier davon liegen im Datenschutzmodul. Ein Verarbeitungsverzeichnis, das
sich nicht führen lässt, und ein Widerruf, der nicht funktioniert, sind
keine Komfortfragen — das sind gesetzliche Pflichten.

Und `mis_applicants` schließt an **Block 17** an: dort las
`/mis/recruiting` eine leere Tabelle. Jetzt zeigt sich, dass auch das
*Anlegen* nie funktioniert hat.

### Behebung

Die Felder sind entfernt. `created_by` existiert in keiner der Tabellen —
die Urheberschaft steht ohnehin im `mis_audit_log`
(`logAuditEventOrWarn` mit `actorId`), und dort gehört sie hin. Erfunden
wird nichts: eine Spalte anzulegen wäre eine Migration und eine eigene
Entscheidung.

---

## Drei Fehlversuche beim Bau — jeder meldete null Befunde

Das ist die eigentliche Lehre dieses Blocks. **Ein Detektor, der nichts
findet, sieht aus wie ein sauberes System** — dreimal in zwei Blöcken bin
ich darauf hereingefallen:

| # | Fehler | Wirkung |
|---|---|---|
| 1 | Strings blieben stehen | „Nachweis fehlt: …" lieferte `fehlt` als Spalte |
| 2 | Die Klammer-Kürzung traf das **äußere** Objekt | löschte den ganzen Inhalt → 0 Befunde |
| 3 | Beliebiger Leerraum vor dem Feld | Ternäre (`a ? b : null`) wurden zu Spalten |

Gefunden habe ich das nur, weil ich nach jeder Schärfung die **Gegenprobe**
gefahren bin: den bereits behobenen Fall zurückgedreht und geprüft, ob der
Detektor ihn wiederfindet. Nach Schärfung 2 fand er ihn **nicht** — und
hätte ohne diese Probe „0 Befunde" gemeldet.

Alle drei sind als Test festgehalten; die Mutationsprobe lässt bei
Rückbau 1, 5 bzw. 1 Test fallen.

---

## Der Lauf

`npm run verify:vokabular` prüft jetzt **beide** Achsen:

```
Wertelisten im Schema : 419 (Tabelle.Spalte)
Tabellen in der API   : 351
Quelldateien geprueft : 1555

NEU: verbotener Wert  : 0
NEU: fehlende Spalte  : 0
```

---

## Offen — in Yusufs Hand

Nichts Neues aus diesem Block; alle sechs Befunde sind behoben.

Unverändert: `CRON_SECRET`, Migrationen `20261105000000`,
`20261115000000`, `20261120000000`, die Entscheidung zu den 26
Bestandszeilen aus Block 35, die Frage nach einem eigenen `failed` für
`substitution_requests` (Block 37), `mis_kpis`, Nachweise für die
Einsatzfreigabe, Erika Testfalls fehlende E-Mail-Adresse.
