# Block 41 — Die Pflegekraft konnte sich selbst nicht lesen

**Stand:** 14.09.2026 · **Ausgangspunkt:** `b397ea27`

---

## Die Frage

Block 31 hat für `/kunde` nachgewiesen: die Seiten binden nie selbst, alles
hängt an RLS. Für **`/engel`** gilt dasselbe Bauprinzip — und dort werden
Gesundheitsdaten **fremder** Menschen angezeigt: Diagnosen, Vitalwerte,
Medikamente, Pflegeverlauf, Risiken.

26 Seiten, 26 Tabellen. Sieht eine Pflegekraft nur die Daten ihrer eigenen
Klienten?

---

## Antwort: fast durchgehend ja

**22 von 26** Tabellen sind sauber an die Pflegekraft gebunden — über
`eigene_caregiver_ids()`, `engel_hat_aktiven_klienten()` oder
`auth.uid()`. Darunter alle sensiblen: `pflege_diagnosen`, `vital_signs`,
`medikamente`, `pflege_risiken`, `pflege_verlauf`, `clients`,
`akten_dokumente`.

Zwei weitere sind der bekannte Marktplatz (`angels`,
`angel_availability`), eine ist eine korrekt gebaute View.

---

## Der Befund: `caregivers`

Drei Seiten beginnen mit demselben Schritt:

```ts
supabase.from('caregivers').select('id').eq('user_id', user.id).single()
```

Sie holen die eigene `caregiver_id` — **alles Weitere hängt daran**.
Betroffen: `/engel/medikamente`, `/engel/pflegedoku/verlauf`,
`/engel/einsaetze`.

`caregivers` trägt fünf Policies, und **keine** bindet eine Pflegekraft an
ihren eigenen Datensatz:

| Policy | Bedingung |
|---|---|
| `caregivers_admin_all` | `is_admin()` |
| `caregivers_org_fence` | RESTRICTIVE, `organization_id` |
| `caregivers_service_all` | `service_role` |
| `rk_caregivers_lesen` | `darf('personal.lesen')` |
| `rk_caregivers_schreiben` | `darf('personal.schreiben')` |

Die Rolle `engel` trägt laut `lib/auth/rollen.ts` **keine** Berechtigung —
`darf('personal.lesen')` ist für sie falsch. Das `.single()` fand also nie
eine Zeile, und die drei Seiten meldeten *„Ihre Zuordnung konnte nicht
geladen werden"*.

**Die Fehlerbehandlung war korrekt. Die Funktion war es nicht.**

### Warum das lange nicht auffiel

Live trägt **genau eine** Pflegekraft einen Login; die andere hat
`user_id IS NULL`. Und beide stehen auf `einsatzfreigabe = false` — es
findet ohnehin kein Einsatz statt (Block 26).

### Behebung

`supabase/migrations/20261125000000_engel_caregivers_select_own.sql`
(mit Rollback): die eigene Zeile, sonst nichts.

```sql
CREATE POLICY "engel_caregivers_select_own" ON public.caregivers
  FOR SELECT USING (user_id = auth.uid());
```

Bewusst **nicht** über `eigene_caregiver_ids()` — diese
SECURITY-DEFINER-Funktion existiert, um *andere* Tabellen zu binden, ohne
`caregivers` zu joinen (die bekannte Join-Falle). Sie hier zu verwenden
wäre ein Zirkelschluss: sie liest selbst `caregivers`.

**DDL ist per 42501 blockiert — die Migration muss in den SQL-Editor.**

---

## Der Wächter deckt jetzt beide Portale

`npm run verify:portal-bindung` liest die Tabellen aus `app/kunde` **und**
`app/engel`:

```
Tabellen geprueft        : 39
mit Bindung              : 35
Views (security_invoker) :  1
bewusst offen            :  2
bekannte Luecken         :  1
NEUE BEFUNDE             :  0
```

### Was der Lauf dabei lernen musste

Er meldete zunächst `ops_aufgaben_uebersicht` als Befund — eine View
**ohne jede Policy**. Die Messung zeigte: es ist eine View mit
`security_invoker = true`. Die Abfrage läuft mit den Rechten des
Aufrufers, die RLS der zugrunde liegenden Tabellen greift unverändert. Sie
ist genau richtig gebaut.

Eine Ausnahmeliste wäre hier die falsche Antwort gewesen — der Lauf muss
den **Unterschied kennen**, sonst meldet er die nächste solche View
wieder. Er liest die View-Eigenschaften jetzt live mit.

Der Gegenfall bleibt ein Befund: eine View **ohne** `security_invoker`
läuft mit den Rechten ihres Eigentümers und umgeht RLS — genau der P0, der
in diesem Projekt schon einmal behoben werden musste. Ein Test hält das
fest.

---

## Tests

29 Tests in der Datei (12 neu). Mutationsprobe:

| Mutation | Wirkung |
|---|---|
| Engel-Muster aus der Bindung entfernt | **2 Tests** fallen |
| Views pauschal als gebunden durchgewinkt | **6 Tests** fallen |

---

## Offen — in Yusufs Hand

Neu:

- **Migration `20261125000000` einspielen.** Danach schlägt
  `verify:portal-bindung` für `caregivers` von selbst auf „gebunden" um,
  und der Eintrag gehört aus `BEKANNTE_LUECKEN` heraus. Bis dahin sind
  drei Seiten des Engel-Portals unbenutzbar.

Unverändert: `CRON_SECRET`, Migrationen `20261105000000`,
`20261115000000`, `20261120000000`, die 26 Bestandszeilen aus Block 35,
das eigene `failed` für `substitution_requests` (Block 37), `mis_kpis`,
Nachweise für die Einsatzfreigabe, Erika Testfalls fehlende
E-Mail-Adresse.
