# Block 30 — Was passiert, wenn `CRON_SECRET` gesetzt wird

**Stand:** 14.09.2026 · **Ausgangspunkt:** `a413d36b`

---

## Die Frage

`CRON_SECRET` ist seit Wochen der offene Blocker. In dem Moment, in dem er
gesetzt wird, laufen **zwölf Ketten zum ersten Mal** gegen echte Daten —
darunter Mahnwesen, Kontolöschung und drei E-Mail-Strecken an echte
Menschen. Sind sie sicher? Laufen sie idempotent? Können sie doppelt
feuern?

Dieser Block beantwortet das nicht durch Lesen allein, sondern durch den
Trockenlauf gegen die Produktion (`npm run verify:automatisierung`,
gebaut in Block 18).

---

## Befund 1 — Der Drip-Cron meldete Erfolg, ohne hinzusehen

`app/api/cron/drip` leitet an `/api/drip` weiter und gab danach
**bedingungslos** zurück:

```ts
return NextResponse.json({ success: true, ... })
```

`response.ok` wurde nie geprüft. Antwortete `/api/drip` mit 401 (falsches
Geheimnis), 500 (`RESEND_API_KEY` fehlt) oder 503, verbuchte Vercel
trotzdem einen **grünen Cron**. Eine Kampagne, die nichts versendet, sah
aus wie eine, die alles versendet hat.

Das wiegt gerade jetzt: der allererste scharfe Lauf ist genau der, bei dem
man einen Fehlschlag sehen will.

**Bemerkenswert:** jede andere Cron-Route macht es richtig — `indexnow`
prüft `.ok`, `zustellung-retry` reicht `ok: ergebnis.ok` durch. Diese war
die einzige Ausnahme.

**Behoben:** Fehlschlag → HTTP 502 mit Status und Klartext. Ein fehlender
JSON-Rumpf (Edge-502) lässt den Lauf nicht mehr in den `catch` mit einer
Parser-Meldung laufen.

**Riegel dagegen:** ein Test prüft *alle* Cron-Routen — jede, die intern
weiterleitet, muss `.ok` ansehen.

---

## Befund 2 — Der Feiertagskatalog lief einmal je Mandant

`billing_feiertage` hat **kein `organization_id`**: Feiertage sind
bundesweite Tatsachen, kein Mandantengut. Die Kette stand trotzdem in der
Mandantenschleife von `fuehreTaeglicheAutomatisierungAus`. Der Trockenlauf
zeigte es:

```
je Organisation: 78 Schreibvorgaenge, davon 76x billing_feiertage
ueber sechs Mandanten: 470 gesamt
```

Fünf der sechs Läufe konnten nichts tun, als 76 Unique-Verletzungen zu
erzeugen. Schlimmer als die vergebliche Arbeit war der Bericht: **jede
Organisation wies „importiert: 76" für Daten aus, die ihr nicht
gehören.**

Denselben Fall löst dieselbe Cron-Route beim Aufräumen der Zustellspur
bereits richtig — *„bewusst EINMAL pro Lauf, nicht je Organisation"*. Beim
Katalog fehlte er.

**Behoben:** `AutomatisierungsOptionen.katalogpflege`, Default `true`
(damit der Einzelanstoß über `POST /api/admin/automatisierung` den Katalog
weiter pflegt). Die Cron-Route setzt `false` und ruft die Pflege einmal
nach der Schleife auf. Das Trockenlauf-Skript wurde mitgezogen — es muss
messen, was scharf passiert.

**Messbar:**

| | vorher | nachher |
|---|---:|---:|
| je Organisation | 78 | **2** |
| gesamt je Tag | 470 | **90** |

---

## Geprüft und **kein** Befund

Der größere Teil dieses Blocks. Die Ketten sind in besserem Zustand, als
die offene Frage vermuten ließ:

| Prüfung | Ergebnis |
|---|---|
| Tor | **12 von 12** Routen tragen `pruefeCronGeheimnis`; kein selbst gebautes `Bearer ${CRON_SECRET}` |
| Zeitpläne | 12 in `vercel.json`, 12 Routen — deckungsgleich, keine Waise |
| `mahnlauf` | `next_dunning_at > heute` blockt den Doppellauf; `MahnstufeBereitsEskaliertError` fängt den Parallellauf; `frozen_at` hält Demo-Zeilen raus |
| `jahresuebertrag` | `carryover_amount: rest` ist ein SET, kein Zuwachs; `rest` stammt aus dem unveränderlichen Vorjahr — ein zweiter Lauf ändert nichts |
| `drip` (Kern) | exakter Tagesvergleich (`=== 3/7/14`), Idempotenzschlüssel je Kunde und Stufe, fail-closed bei Lesefehlern. **Die 40 verschleppten Leads lösen keine Mail-Lawine aus** |
| `onboarding-erinnerung` | `correlationId = ${ablaufId}:erinnerung:${stufe}` — dieselbe Stufe kann nie zweimal raus |
| `review-request` | `idempotenzSchluessel: bewertung:${bookingId}` |
| `aufbewahrung`, `perimeter-aufbewahrung` | je hinter eigenem ENV-Flag, laufen per Default **trocken** |
| `feiertage_katalog` | `unique_feiertag_datum_bl` ist live wirksam — 76 Zeilen, 38 je Jahr, **null Duplikate** |
| `zustellung-retry` | reicht das echte Ergebnis durch (`ok: ergebnis.ok`) |

### `konto-loeschung` — gemessen, nicht vermutet

Die einzige zerstörerische Kette **ohne** Trockenlauf-Flag: sie löscht
endgültig nach 60 Tagen Widerrufsfrist. Live am 14.09.2026:

```
Stichtag (heute − 60 Tage): 2026-07-16
Konten mit deleted_at      : 1
davon Frist abgelaufen     : 0   ← der erste Lauf löscht nichts
```

Kein Befund — aber die Zahl gehört vor dem Scharfschalten nachgeprüft,
nicht angenommen. Sie ändert sich mit jedem Tag.

---

## Offen — in Yusufs Hand

- **`CRON_SECRET` setzen.** Nach diesem Block ist belegt, was der erste
  Tag tut: 90 Schreibversuche, davon 76 vom Unique-Index abgefangen,
  0 Kontolöschungen, keine Mail-Lawine. Vorher einmal
  `npm run verify:automatisierung` laufen lassen — die Zahlen gelten für
  den Tag, an dem sie gemessen wurden.
- Unverändert: Migrationen `20261105000000` und `20261115000000`,
  BUSINESS_DECISION #5, `mis_kpis` pflegen oder abschalten (Block 28),
  Nachweise für die Einsatzfreigabe hochladen (Block 29).
