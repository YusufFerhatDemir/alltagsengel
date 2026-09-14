# Block 35 — Ein Unterschriftsbild, das nichts belegt

**Stand:** 14.09.2026 · **Ausgangspunkt:** `da1ee896`

---

## Die Frage

Wann wird ein Leistungsnachweis signiert, wer löst das aus — und warum
steht bei 10 von 13 Nachweisen ein Unterschriftsbild ohne
`client_signed_at` (BUSINESS_DECISION #5)?

---

## Die Kausalkette, End-zu-End gemessen

**1. Der Trigger verlangt zwei Dinge.** `compute_signature_hash`, live aus
`pg_proc` gelesen:

```sql
IF NEW.proof_status = 'UNTERSCHRIEBEN'
   AND NEW.client_signed_at IS NOT NULL THEN
  NEW.signature_hash := encode(digest(…), 'hex');
  NEW.is_locked := true;
```

**2. Der Signier-Weg liefert beide.** `POST /api/leistungsnachweis/crud`
(Aktion `sign`) setzt `client_signed_at` und `proof_status` unbedingt —
korrekt.

**3. Der Anlege-Weg lieferte keines.** `saveServiceRecord` in
`lib/admin/service-records.ts` — der gemeinsame Einstieg für jeden neu
erfassten Nachweis — schrieb `client_signature` und sonst nichts.

**Folge:** der Nachweis bleibt auf `proof_status = 'ENTWURF'`, bekommt
keinen `signature_hash` und wird **nicht gesperrt** — mit einem
Unterschriftsbild in der Zeile, das kryptografisch nichts belegt und
jederzeit änderbar bleibt.

---

## Live-Messung

Alle 30 Nachweise, angelegt am 02.07.2026:

```
14x  invoiced | ENTWURF | Bild | signed_at NULL | kein Hash
10x  signed   | ENTWURF | Bild | signed_at NULL | kein Hash
 3x  signed   | ENTWURF | ohne Bild            | kein Hash
 2x  draft    | ENTWURF | Bild | signed_at NULL | kein Hash
 1x  invoiced | ENTWURF | ohne Bild            | kein Hash
```

| | |
|---|---:|
| Bild vorhanden, `client_signed_at` NULL | **26 von 30** |
| ohne `signature_hash`, `is_locked = false` | **30 von 30** |
| `proof_status = 'ENTWURF'` | **30 von 30** |

**BUSINESS_DECISION #5 bestätigt sich exakt:** mit `status = 'signed'`
sind es 10 mit Bild und 3 ohne — genau die 13. Die Ursache ist damit
benannt: es ist kein Datenproblem, sondern ein **Schreibweg**.

Der Befund ist allerdings **größer als dokumentiert**: betroffen sind 26
Nachweise, nicht 10, und **keine einzige** Zeile im System trägt einen
Signatur-Hash.

---

## Behebung — vorwärts, nicht rückwärts

Der **Bestand wird nicht angefasst.** Das ist eine Geschäftsentscheidung
(BUSINESS_DECISION #5) und bleibt eine. Geändert ist, dass **kein neuer
Nachweis mehr so entsteht**:

- `saveServiceRecord` setzt bei vorhandener Unterschrift
  `client_signed_at` **und** `proof_status = 'UNTERSCHRIEBEN'` — damit
  greift der Trigger, bildet den Hash und sperrt die Zeile.
- `client_signer_name` und `client_signer_role` werden übernommen, wenn
  angegeben — und weggelassen, statt leere Strings zu schreiben.
- **Ohne** Unterschrift bleibt alles wie bisher. Ein Nachweis ohne
  Unterschrift *ist* ein Entwurf; ihn zu stempeln wäre dieselbe Unwahrheit,
  nur andersherum.
- Eine Unterschrift aus Leerzeichen gilt als keine (`.trim()`).

### Eine Folgewirkung, die mitbedacht werden musste

Sobald der Trigger `is_locked = true` setzt, weist
`prevent_locked_record_change()` **jedes** weitere UPDATE ab.
`app/admin/records/new/actions.ts` trug GPS bisher **nach** dem Anlegen
nach — das wäre ab sofort gescheitert. GPS wandert deshalb in denselben
Insert; der Nachtrag entfällt.

### Die anderen beiden Aufrufer

`saveServiceRecord` hat drei Aufrufer. Geprüft, ob die neue Sperre sie
trifft:

| Aufrufer | Unterschrift? | Folge-UPDATE? | betroffen |
|---|---|---|---|
| `app/admin/records/new/actions.ts` | ja | GPS → in den Insert gezogen | **ja** |
| `app/api/tours/[id]/stops/route.ts` | nein (`status: 'draft'`) | `assignment_id` | nein |
| `app/mis/team/page.tsx` | nein (`signature: false`) | keines | nein |

---

## Tests

22 Tests über zwei Dateien, davon 11 neu. Der Bestandstest
`leistungserfassung-budgettopf` bleibt grün.

| Mutation | Wirkung |
|---|---|
| `belegFelder` liefert immer `{}` | **4 Tests** fallen |
| `.trim()` entfernt | **1 Test** fällt |
| `proof_status` weggelassen (nur Zeitstempel) | **1 Test** fällt |

Mutation C ist die wichtigste: sie bildet genau den halben Fix nach, der
nichts bewirkt hätte — der Trigger verlangt **beide** Felder.

---

## Offen — in Yusufs Hand

Neu aus diesem Block:

- **BUSINESS_DECISION #5 ist ursächlich geklärt.** Die Entscheidung, was
  mit den 26 Bestandszeilen geschieht, bleibt deine. Möglich wären: über
  den regulären `sign`-Weg nachsignieren (erzeugt Hash und Sperre), oder
  sie als historischen Bestand stehen lassen und nur künftige Nachweise
  belegen. Ein Backfill per SQL wäre der falsche Weg — er erzeugte einen
  Hash über einen Zeitstempel, den niemand unterschrieben hat.
- **Kein Nachweis im System trägt bisher einen Signatur-Hash.** Wer sich
  auf `signature_hash` als Beleg verlässt, prüft heute gegen eine leere
  Menge.

Unverändert: `CRON_SECRET`, Migrationen `20261105000000`,
`20261115000000`, `20261120000000`, `mis_kpis` pflegen oder abschalten,
Nachweise für die Einsatzfreigabe, Erika Testfalls fehlende
E-Mail-Adresse.
