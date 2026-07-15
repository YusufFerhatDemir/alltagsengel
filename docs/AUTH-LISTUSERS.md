# auth.admin.listUsers() → "Database error finding users"

**Status (2026-07-15):** Code-seitig umgangen. Die zwei defekten DB-Zeilen sind noch offen —
Repair-SQL siehe unten, braucht SQL-Editor-Zugriff.

## Symptom

```
GET /auth/v1/admin/users  → 500 {"error_code":"unexpected_failure","msg":"Database error finding users"}
```

Im Code sah das aus wie „0 User", weil der Fehler verschluckt wurde:

```ts
const { data: users } = await adminSupabase.auth.admin.listUsers()  // error wird ignoriert
const found = users?.users?.find(...)                                // undefined
// → 404 "Benutzer nicht gefunden"
```

Praktische Folge: Admin-Passwort-Reset per E-Mail lief immer in ein 404.

## Ursache

GoTrue (Auth-Server) liest die Token-Spalten von `auth.users` in Go-`string`-Felder ein.
Diese Spalten sind nullable, aber GoTrue erwartet `''` statt `NULL` — ein `NULL` bricht den
Row-Scan mit `converting NULL to string is unsupported` ab. Der Fehler wird als generisches
„Database error finding users" nach außen gegeben.

Betroffen sind Zeilen, die **manuell per SQL-INSERT** in `auth.users` angelegt wurden statt
über die Auth-API. Über die API angelegte User bekommen `''` als Default.

## Diagnose (reproduzierbar ohne SQL-Zugriff)

Binärsuche über die Admin-API-Pagination — funktionierende Seiten liefern 200, die Seite mit
der defekten Zeile 500:

```bash
set -a && . ./.env.local && set +a
for p in $(seq 1 48); do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/users?page=$p&per_page=1" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
  [ "$code" != "200" ] && echo "Zeile $p defekt ($code)"
done
```

Einzelabruf `GET /auth/v1/admin/users/<id>` liefert für eine defekte Zeile
`500 "Database error loading user"` — damit lässt sich eine konkrete ID verifizieren.

**Befund 2026-07-15:** genau 2 von 48 Zeilen defekt, beide manuell angelegte Test-Accounts:

| E-Mail | id | angelegt |
|---|---|---|
| `procare-demo@alltagsengel.care` | `7f1b2132-038c-4fbb-9f36-f080b09481b6` | 2026-04-29 |
| `review@alltagsengel.care` (Apple Review) | `62e32b28-a2e2-4183-9594-f05b1b420d3e` | 2026-03-17 |

Alle 46 echten User-Accounts sind intakt. Keine Daten verloren.

## Code-Fix (erledigt)

`app/api/admin/reset-password/route.ts` schlägt die userId jetzt über `profiles` nach
(`profiles.id == auth.users.id`) statt über `listUsers()`. Damit ist der Reset-Flow
unabhängig von defekten `auth.users`-Zeilen, und Lookup-Fehler werden nicht mehr
verschluckt, sondern als 500 gemeldet.

**Regel:** User-Lookup nach E-Mail immer über `profiles`, nie über `auth.admin.listUsers()`.
Wenn `listUsers()` doch nötig ist: `error` prüfen und nicht als „0 User" behandeln.

## DB-Repair (offen — braucht SQL-Editor)

Setzt die NULL-Token-Spalten auf `''`. Idempotent, betrifft nur defekte Zeilen, ändert
keine Passwörter/Sessions:

```sql
UPDATE auth.users SET
  confirmation_token          = COALESCE(confirmation_token, ''),
  recovery_token              = COALESCE(recovery_token, ''),
  email_change                = COALESCE(email_change, ''),
  email_change_token_new      = COALESCE(email_change_token_new, ''),
  email_change_token_current  = COALESCE(email_change_token_current, ''),
  phone_change                = COALESCE(phone_change, ''),
  phone_change_token          = COALESCE(phone_change_token, ''),
  reauthentication_token      = COALESCE(reauthentication_token, '')
WHERE confirmation_token IS NULL
   OR recovery_token IS NULL
   OR email_change IS NULL
   OR email_change_token_new IS NULL
   OR email_change_token_current IS NULL
   OR phone_change IS NULL
   OR phone_change_token IS NULL
   OR reauthentication_token IS NULL;
```

Danach muss `GET /auth/v1/admin/users` wieder 200 liefern (Diagnose-Snippet oben).

Bis dahin gilt: für die zwei Accounts oben schlagen **alle** Auth-Admin-Operationen fehl
(auch `updateUserById`, also der eigentliche Passwort-Reset). Für alle anderen 46 Accounts
funktioniert der Reset-Flow mit dem Code-Fix wieder.

**Prävention:** Test-/Demo-Accounts nicht per SQL-INSERT in `auth.users` anlegen, sondern
über `auth.admin.createUser()`.
