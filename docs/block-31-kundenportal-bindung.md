# Block 31 — Die Kundin sah ihren Pflegeplan, aber nicht die Maßnahmen

**Stand:** 14.09.2026 · **Ausgangspunkt:** `70ef714b`

---

## Die Frage

Das Kundenportal zeigt Verträge, Rechnungen, Einsätze, Budget und
Pflegedokumentation — also Finanz- und Gesundheitsdaten. Sieht eine
Kundin dort ausschließlich ihre eigenen?

Der erste Messwert war beunruhigend: **alle sechs datentragenden Seiten
haben null `getUser()`-Aufrufe und keinen `client_id`-Filter.**

Das ist allerdings richtig so. Die Bindung gehört in die RLS-Policy, nicht
in 25 Seiten — sonst hat man 25 Stellen, die man vergessen kann. Es heißt
aber auch: eine **fehlende** Policy fällt nicht auf. PostgREST beantwortet
eine RLS-Verweigerung mit `200 []`, nicht mit einem Fehler.

Und der Mandantenzaun hilft hier nicht: `org_fence` trennt
**Organisationen, nie Rollen**. Innerhalb der Stamm-Organisation liegen
alle vier Klienten.

---

## Befund

`/kunde/pflegedoku` liest drei Tabellen. Zwei tragen eine Kundenbindung,
eine nicht:

| Tabelle | Kundenpolicy |
|---|---|
| `pflege_massnahmenplaene` | `kunde_pflege_massnahmenplaene_select` ✓ |
| `pflege_verlauf` | `kunde_pflege_verlauf_select` ✓ |
| **`pflege_massnahmen`** | **nur `is_admin()` und die Engel-Policy** ✗ |

Die Seite holt zuerst den aktiven Plan, dann dessen Maßnahmen. Der Plan
kam durch, die Maßnahmen nicht — und weil die Verweigerung als `200 []`
zurückkommt, fiel das nirgends auf. Die Seite zeigte einen **Pflegeplan
ohne Inhalt**.

Eine stille Null über die Pflege eines Menschen.

### Live-Wirkung: latent, nicht eingetreten

```
pflege_massnahmenplaene   0 Zeilen
pflege_massnahmen         0 Zeilen
pflege_verlauf            0 Zeilen
```

Die Lücke greift beim ersten echten Maßnahmenplan.

### Behebung

`supabase/migrations/20261120000000_kunde_pflege_massnahmen_select.sql`
(mit Rollback) — wortgleich zur Schwesterpolicy, nur über den Plan hinweg:
die Maßnahme gehört der Kundin, wenn der Plan ihr gehört. Enger als die
Engel-Policy, die auch `abgelaufen` sieht.

**DDL ist mit dem Dienstschlüssel nicht möglich (42501) — die Migration
muss im SQL-Editor eingespielt werden.**

---

## Der eigentliche Ertrag: der Befund wird künftig gefunden

Ein Einzelfix hätte die nächste fehlende Policy nicht verhindert. Neu:

- **`lib/kunde/portal-bindung.ts`** — die Bewertung, rein und getestet.
- **`npm run verify:portal-bindung`** — liest die Tabellenliste aus dem
  Quelltext von `app/kunde` (bleibt also von selbst aktuell), holt die
  Policies live aus `pg_policies` und fragt je Tabelle: gibt es eine
  **permissive SELECT-Policy**, deren Ausdruck an `auth.uid()` bzw.
  `eigene_client_ids()` gebunden ist?

Drei Unterscheidungen, die der Lauf trifft und die jeweils einen eigenen
Fehler abfangen:

| | warum |
|---|---|
| permissiv vs. restriktiv | RESTRICTIVE **gewährt nichts**, es verengt nur. `org_fence` + `is_admin()` ergibt für die Kundin leer |
| `SELECT`/`ALL` vs. `UPDATE` | eine `UPDATE`-Policy mit `user_id = auth.uid()` bindet zwar, erlaubt aber kein Lesen |
| Bindung vs. Rollenrecht | `darf('pflege.lesen') AND organization_id = current_org_id()` bindet an den **Mandanten**, nie an die Person |

Stand heute:

```
Tabellen geprueft  : 24
mit Kundenbindung  : 21
bewusst offen      :  2   angels, angel_availability
bekannte Luecken   :  1   pflege_massnahmen (Migration wartet)
NEUE BEFUNDE       :  0
```

Der Lauf endet mit 0, solange jede Tabelle gebunden, bewusst offen oder
eine **bekannte** Lücke ist — und mit 1 bei jedem Neuzugang. Dasselbe
Verhalten wie `verify:mandantenzaun`, damit eine wartende Migration den
Lauf nicht dauerhaft rot färbt.

---

## Geprüft und **kein** Befund

- **`angels` / `angel_availability`** tragen ein ausdrückliches
  `SELECT true`. Wer einen Engel buchen will, muss Engel sehen können,
  bevor eine Beziehung zu ihm besteht — eine Entscheidung, kein Versehen.
  Sie stehen mit Begründung auf der Ausnahmeliste, und ein Test verbietet,
  dort jemals Klienten-, Abrechnungs- oder Pflegedaten einzutragen.
- **Rechnungen, Verträge, Budget, Einsätze, Dokumente, Medikamentenplan,
  Notfallinfo, Nachrichten, Krankenfahrten** — alle mit sauberer Bindung
  an `clients.user_id = auth.uid()` bzw. `user_id = auth.uid()`.
- **`verify:mandantenzaun`** läuft weiterhin (`ZAUN_EXIT=0`); die
  Lese-RPC `_run_sql` existiert, mein erster Aufruf hatte nur den falschen
  Parameternamen (`p`, nicht `query`).

### Eine Test-Lücke, die erst die Mutationsprobe zeigte

Der Test „ignoriert RESTRICTIVE-Policies" benutzte zunächst einen
org-Fence-Ausdruck **ohne** `auth.uid()`. Damit hielt er auch dann, wenn
man die Permissive-Prüfung ganz entfernt — er prüfte nichts. Erst die
Mutationsprobe brachte das ans Licht; der Test trägt den Ausdruck jetzt
mit `auth.uid()`, und zwei Tests fallen, wenn die Prüfung verschwindet.

---

## Offen — in Yusufs Hand

- **NEU: Migration `20261120000000` einspielen** (SQL-Editor). Danach
  schlägt `verify:portal-bindung` für `pflege_massnahmen` von selbst auf
  „gebunden" um, und der Eintrag gehört aus `BEKANNTE_LUECKEN` heraus.
- **`pflege_massnahmen_evaluationen`** hat dieselbe Lücke, wird vom Portal
  aber nicht gelesen — kein Befund dieses Blocks, aber beim nächsten
  Ausbau der Pflegedoku mitzudenken.
- Unverändert: `CRON_SECRET`, Migrationen `20261105000000` und
  `20261115000000`, BUSINESS_DECISION #5, `mis_kpis` pflegen oder
  abschalten, Nachweise für die Einsatzfreigabe hochladen.
