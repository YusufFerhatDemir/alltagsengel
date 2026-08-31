# 30 Nachweise ohne Hash — warum, und warum sie so bleiben

**Stand:** 31.08.2026 · **Messung:** `npm run verify:unterschrift` (9/10) ·
**Bestand:** 30 `service_records`, alle in der Stamm-Organisation

## Warum der Hash fehlt

Nicht, weil er nicht berechnet wird. Der Trigger steht und rechnet richtig:

```
trg_compute_signature_hash  BEFORE  →  compute_signature_hash()

IF NEW.proof_status = 'UNTERSCHRIEBEN' AND NEW.client_signed_at IS NOT NULL THEN
  NEW.signature_hash := encode(digest(id|client_id|date|start_time|end_time|amount|client_signed_at,'sha256'),'hex');
  NEW.is_locked := true;
END IF;
```

Live steht auf **allen 30 Zeilen** `proof_status = 'ENTWURF'` und
`client_signed_at IS NULL`. Die Bedingung war nie erfüllt. **Es fehlt kein
Hash — es fehlt eine Unterschrift.**

26 der 30 tragen ein `client_signature`. Das ist ein **Bild**, das die
Verwaltungsmaske `/admin/records/new` mitspeichert, und ausdrücklich kein
Beleg: die Seite hält das seit dem Befund H-1 selbst so fest — `signed`
entsteht ausschließlich über `POST /api/leistungsnachweis/crud`
(`action='sign'`), und nur der Weg setzt `proof_status` **und**
`client_signed_at` zusammen. Die 30 Zeilen stammen sämtlich vom
02.07.2026 und sind nie durch diesen Weg gelaufen.

Alle vier beteiligten Klienten heißen `Erika Testfall`,
`Gerlinde Hoffmann`, `Ingrid Bauer`, `Werner Krause` — es ist
**Testbestand**, kein Kundendatum. Das ändert nichts an der Frage, macht
sie aber ungefährlich.

## Werden neue Nachweise korrekt gehasht?

**Ja — live gemessen, nicht aus dem Code geschlossen.**
`npm run verify:unterschrift` legt einen eigenen Prüfklienten an und misst:

| | |
|---|---|
| **U2** | Unterschrift (`proof_status` + `client_signed_at` zusammen) setzt `signature_hash` (64 Hexzeichen) **und** `is_locked = true`, `status` springt auf `signed`. |
| **U3** | Der Hash ist an den Inhalt gebunden — in Postgres mit demselben Ausdruck nachgerechnet: deckungsgleich; derselbe Datensatz mit Betrag + 1 ergibt einen völlig anderen Hash. |
| **U7** | Ein gesperrter Nachweis lässt sich im Betrag nicht mehr ändern — abgewiesen von `trg_prevent_locked_record`, **mit dem Dienstschlüssel, an jeder Route vorbei**. |
| **U8** | Der gespeicherte Hash beschreibt weiterhin genau den gespeicherten Inhalt. |

Und der früher offene Umgehungsweg ist zu:

> **U4** — `proof_status = 'UNTERSCHRIEBEN'` ohne Beleg, direkt auf die
> Tabelle geschrieben, wird von `trg_a_unterschrift_beleg` abgewiesen:
> *„Der Statuswert allein ist eine Behauptung über die Unterschrift, kein
> Nachweis — und er macht den Nachweis abrechenbar."*
> Migration `20261017000000` ist **live** (bestätigt via
> `npm run check:migrationen`). Der Kommentar in
> `lib/billing/nachweis-beleg.ts` („bis Migration 20261017000000
> angewendet ist, ist diese Prüfung hier die einzige") ist damit überholt
> — die Datenbank prüft heute mit.

## Können die bestehenden sicher nachgezogen werden?

**Nein. Ein Nachziehen wäre eine Fälschung — und zwar nicht im
übertragenen Sinn.**

Der Hash bildet `client_signed_at` **mit ab**. Um ihn zu berechnen, muss
man einen Unterschriftszeitpunkt in die Zeile schreiben. Dieser Zeitpunkt
ist unbekannt: es gibt ihn nirgends — nicht in `service_signatures`
(0 Zeilen live), nicht im Audit-Log, nicht im Bild.

Was ein Backfill also täte:

1. einen erfundenen Zeitpunkt eintragen,
2. darüber einen Hash bilden,
3. `is_locked = true` setzen,

und das Ergebnis wäre von einer echten Unterschrift **nicht mehr
unterscheidbar**. Genau das Gegenteil dessen, wofür der Hash da ist. Er
soll die Frage „hat der Klient das unterschrieben, und stand damals das
hier drin?" beantworten können. Ein nachgezogener Hash beantwortet sie mit
einer Erfindung — und die Sperre macht sie anschließend unkorrigierbar.

**Der Hash wird deshalb nicht nachgezogen. Für keine der 30 Zeilen.**

## Was stattdessen — die sichere Strategie

### Sofort (kein DDL, keine Datenänderung)

Der Zustand ist **messbar** und muss es bleiben. `npm run
verify:unterschrift` meldet ihn bei jedem Lauf als Station **U10**, mit
Zahl. Solange die Zahl über 0 steht, ist der Punkt offen und sichtbar —
das ist mehr wert als eine Datenänderung, die ihn zum Verschwinden
brächte.

### Der eine Fall, der eine Entscheidung braucht

Von den 30 ist **genau einer** abgerechnet, ohne dass irgendein Beleg
vorliegt — auch kein Bild:

```
2821966f-5251-482b-992a-c84dda0ad0c3
  2026-06-24 | invoiced / ENTWURF | 68,00 EUR
  client_signature = NULL, signature_hash = NULL, service_signatures = 0
  → Rechnung RE-2026-0001, Status "sent"
```

Die anderen 14 abgerechneten tragen wenigstens ein Unterschriftsbild und
gelten nach `unterschriftBelegt()` als belegt.

Für diesen einen gibt es **drei** Wege, und die Wahl gehört nicht zu einer
Aufräumaktion:

| Weg | Was er bedeutet |
|---|---|
| **A — nachunterschreiben lassen** | Der Klient unterschreibt heute; der Nachweis läuft durch `action='sign'` und bekommt einen echten Hash mit echtem Datum. Sauber, aber: es ist ein Testklient, das geht hier nicht. |
| **B — stornieren** | `proof_status = 'STORNIERT'` und Korrekturrechnung. Die richtige Antwort, wenn nie unterschrieben wurde. |
| **C — als Bestand ohne Beleg kennzeichnen** | Steht so in der Auswertung und wird nie mit einem belegten Nachweis verwechselt. |

Weil es Testbestand ist, ist **B** die naheliegende Wahl — aber es ist
eine **Geschäftsentscheidung über eine versendete Rechnung**, und die
trifft nicht ein Skript. Dieser Lauf verändert deshalb **nichts** daran.

### Wenn irgendwann echter Altbestand nachgezogen werden muss

Dann **nicht über `signature_hash`**, sondern über einen zweiten,
ehrlichen Ort:

- eine Zeile in `service_signatures` mit `signer_role = 'client'` und
  einer ausdrücklichen Herkunftsangabe („Papierbeleg, nacherfasst am …,
  durch …") — dann greift `unterschriftBelegt()` über Weg 3, ohne dass
  jemals ein Hash entsteht, der eine digitale Unterschrift behauptet;
- `signature_hash` und `is_locked` bleiben leer. Der Unterschied zwischen
  „digital unterschrieben" und „nachträglich vom Papier übernommen" bleibt
  damit im Datensatz lesbar — und genau darauf kommt es an.

## Prüfbarkeit

| Befehl | Was er beantwortet |
|---|---|
| `npm run verify:unterschrift` | Die ganze Kette live: Hash, Bindung an den Inhalt, Sperre, Umgehungsweg, lesende Prüfung, Mandantenbindung, Altbestand. Legt einen Prüfklienten an und räumt ihn mit Gegenprobe wieder ab. |
| `npm run check:migrationen` | ob `20261017000000` (der DB-Riegel aus U4) live steht |

Die Integritätsabfrage aus U8 lässt sich über den ganzen Bestand fahren
und ist die eigentliche Nutzung des Hashes:

```sql
SELECT sr.id, sr.date, sr.amount
  FROM public.service_records sr
 WHERE sr.signature_hash IS NOT NULL
   AND sr.signature_hash <> encode(extensions.digest(
         COALESCE(sr.id::text,'')||'|'||COALESCE(sr.client_id::text,'')||'|'||
         COALESCE(sr.date::text,'')||'|'||COALESCE(sr.start_time::text,'')||'|'||
         COALESCE(sr.end_time::text,'')||'|'||COALESCE(sr.amount::text,'')||'|'||
         COALESCE(sr.client_signed_at::text,''), 'sha256'), 'hex');
```

Jede Zeile im Ergebnis wurde nach der Unterschrift verändert. Live (31.08.2026):
**0 Zeilen** — es gibt allerdings auch keine einzige Zeile mit Hash, über
die die Abfrage etwas aussagen könnte.
