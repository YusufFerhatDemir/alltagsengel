# Architektur-Empfehlungen — Phase 5 nach Dead-Code-Audit

> **Stand:** 20.04.2026
> **Methodik:** Code-Inspektion + Live-DB-Snapshot + 24h-API-Logs aus Supabase
> **Status:** **Empfehlung — keine DB-Aenderung ohne dein Go.**

---

## TL;DR — die 4 Entscheidungen, die anstehen

| # | Thema | Befund | Meine Empfehlung |
|---|-------|--------|------------------|
| 1 | **Pflegebox-Feature** | 856 Zeilen Code live, **4 DB-Tabellen fehlen** → 404er auf der iPhone-App | **JETZT entscheiden:** Feature aktivieren (DB-Migration) ODER Code rausnehmen. Status quo schadet. |
| 2 | **`messages` vs. `chat_messages`** | Beide Tabellen leer (0 Zeilen), beide RLS-geschuetzt | Status quo OK — Tabellen kosten nichts, Entscheidung verschieben |
| 3 | **Stripe / `/api/payment`** | Code auskommentiert, keine `payments`-Tabelle in DB, 0 Aufrufe in 24h | **DELETE.** Wenn Stripe spaeter kommt, frisch schreiben. |
| 4 | **`/api/auth/send-verification`** | 0 Aufrufe in 24h, redundant zur Supabase-Standard-Verifikation | **DELETE.** |

---

## 1. Pflegebox — der schlafende Riese (P0!)

### Befund

Im Code existiert ein vollausgebautes Pflegebox-Feature:

| Datei | Zweck |
|-------|-------|
| `app/admin/pflegebox/page.tsx` | 259 Zeilen — Admin sieht Bestellungen |
| `app/kunde/pflegebox/page.tsx` | 597 Zeilen — Kunde bestellt |
| `app/hygienebox/page.tsx` | SEO-Landingpage „§40 SGB XI" |
| `app/auth/register/page.tsx:166` | Eligibility-Check bei Registrierung |
| `app/kunde/profil/page.tsx:78,128` | Eligibility im Profil |
| `app/kunde/home/page.tsx:244` | Banner auf Kunde-Home |
| `app/admin/layout.tsx:100` | Eintrag im Admin-Menue |

**Analogie:** Stell dir vor du hast ein Restaurant aufgebaut, mit Stuehlen, Speisekarte, Werbeplakat draussen — aber die Kueche ist nicht angeschlossen. Gaeste setzen sich, bestellen, und es passiert nichts.

### DB-Realitaet

Im Code wird referenziert → in der DB existiert?

| Tabelle | im Code | in DB |
|---------|---------|-------|
| `care_eligibility` | ja | **NEIN** |
| `carebox_catalog_items` | ja | **NEIN** |
| `carebox_order_requests` | ja | **NEIN** |
| `carebox_cart` | ja | **NEIN** |

### Live-Konsequenz (aus 24h Supabase-API-Logs)

```
GET 404 /rest/v1/carebox_order_requests   ← iPhone iOS 18.7
GET 404 /rest/v1/carebox_catalog_items    ← iPhone iOS 18.7
GET 404 /rest/v1/care_eligibility          ← iPhone iOS 18.7 (3x)
```

Das ist ein **Live-Nutzer**, der die App benutzt und ueber das halbfertige Feature stolpert. Profil-Seite und Pflegebox-Seite werfen Fehler in der DevTools-Console. UX = peinlich.

### Drei Wege nach vorn

**A) Feature aktivieren (groesster Aufwand, groesster Wert)**
- 4 DB-Migrationen schreiben (`care_eligibility`, `carebox_catalog_items`, `carebox_order_requests`, `carebox_cart`)
- RLS-Policies anlegen (Kunde sieht eigene, Admin sieht alle)
- Katalog-Items befuellen (Handschuhe, Desinfektion, Bettschutz, …)
- §40-SGB-XI-Abrechnung an Pflegekasse klaeren
- **Hebel:** zweiter Umsatzkanal neben §45b SGB XI
- **Aufwand:** 1-2 Wochen Vollzeit

**B) Code rausnehmen (kleinster Aufwand, sauberster Stand)**
- 5 Dateien loeschen / Code rauspatchen
- Banner auf Kunde-Home raus
- Admin-Menue raus
- `/hygienebox` Landingpage einstampfen ODER auf „bald verfuegbar" Wartelisten-Form umbauen
- **Hebel:** keine 404er mehr, klares „diese App macht §45b, fertig"
- **Aufwand:** 1-2 Stunden

**C) Status quo lassen (NICHT empfohlen)**
- Live-User sehen Pflegebox-Banner → klicken → 404er
- Vermutlich Vertrauensverlust, gerade bei aelteren Nutzern

### Empfehlung

**Wenn Pflegebox in den naechsten 4 Wochen ein priorisiertes Feature ist → A.**
**Sonst → B.** Und auf eine Wartelisten-Landingpage umbiegen, das ist im Marketing oft besser als ein kaputter Banner.

Kein Mittelweg — Status-quo schadet aktiv.

---

## 2. `messages` vs. `chat_messages` — Tabellen-Doppelgaenger

### Befund (DB-Snapshot 20.04.2026)

| Tabelle | Zeilen | letzter Eintrag |
|---------|--------|-----------------|
| `messages` | **0** | — |
| `chat_messages` | **0** | — |

Im Master-Audit stand „messages aktiv genutzt" — DB-Snapshot widerspricht. Beide leer.

### Was das heisst

- Booking-Chat ist im Code da (mit der neuen Pagination aus Task #4), wird aber **noch nicht real benutzt** in Produktion
- Krankenfahrt-Chat ist nur als Tabelle da, ohne Frontend

**Analogie:** Du hast zwei Brieftaschen gekauft. Beide sind leer. Du brauchst gerade keine Brieftasche. Solange du die nicht aktiv mitschleppst, kostet dich auch keine etwas.

### Empfehlung

**Status quo lassen, NICHT loeschen.** Begruendung:
- Tabellen verbrauchen nichts (0 Zeilen, kein Storage, keine Index-Kosten)
- Sobald Booking-Chat Live geht (Engel <-> Kunde), waechst `messages`
- Krankenfahrt-Chat-Entscheidung kann warten bis das Modul priorisiert wird
- Loeschen-und-spaeter-neu-bauen ist mehr Arbeit als Liegenlassen

**Wenn sich das nach 6 Monaten nicht bewegt:** `chat_messages` droppen, dann `messages` ggf. um `ride_id` erweitern (`booking_id` und `ride_id` beide nullable, exactly-one-not-null Check).

---

## 3. Stripe — `/api/payment/route.ts`

### Befund

- Datei vorhanden, Code **auskommentiert** (siehe Audit)
- **Keine `payments`-Tabelle** in der DB (mit `information_schema` geprueft)
- **0 Aufrufe** in den letzten 24h API-Logs
- Im Cleanup-Skript (`scripts/cleanup-deadcode.sh`) bereits als Loeschkandidat vorgemerkt

### Empfehlung

**DELETE.**

Begruendung: Eine auskommentierte Stripe-Integration ohne DB-Schema ist wertlos. Wenn ihr Stripe in 6 Monaten wirklich integriert, schreibt ihr es in 2 Tagen frisch nach aktueller Stripe-Doku — die kommentierten Zeilen sind dann eh veraltet.

**Aktion:** Bereits im Cleanup-Skript drin. `./scripts/cleanup-deadcode.sh --apply` faengt das ab.

**Analogie:** Im Werkzeugkasten liegt ein abgesaegtes Saegeblatt-Stueck, Aufschrift „kommt bestimmt mal eine Saege dazu". Das raubt nur Platz.

---

## 4. `/api/auth/send-verification/route.ts`

### Befund

- Im Audit als „Fallback fuer Supabase-Verifikations-Fehler" markiert
- **0 Aufrufe** in den letzten 24h API-Logs
- Supabase macht Email-Verifikation nativ und stabil

### Empfehlung

**DELETE.**

Begruendung: Ein Fallback, der nie getriggert wird, ist toter Code mit Authz-Risiko (jeder Unauth-Endpoint ist Angriffsflaeche). Wenn Supabase-Verifikation mal ausfaellt, faellt sowieso die ganze Registrierung — dann ist ein eigener Email-Endpoint nicht die Loesung.

**Aktion:** noch NICHT im Cleanup-Skript. Bei naechster Cleanup-Runde dazunehmen.

---

## 5. Beifang aus dem ESLint-Lauf (Phase 4)

ESLint zeigt **533 Befunde** — davon **94 % stilistisch** (`no-explicit-any`, `no-unused-vars`, `no-unescaped-entities`). Die echten Hooks-Bugs:

| Regel | Anzahl | Status |
|-------|--------|--------|
| `react-hooks/refs` | 1 | **gefixt** in `lib/use-chat-pagination.ts` (Commit `2340ecd`) |
| `react-hooks/set-state-in-effect` | 26 | meist legitime Init-Pattern; 2 explizit markiert mit `eslint-disable-next-line` + Begruendung |
| `react-hooks/purity` | 3 | `Date.now()` in Display-Helpern (`timeAgo`, `isLocked`); kosmetisch — Anzeige aktualisiert sich beim naechsten Re-Render eh |
| `react-hooks/immutability` | 7 | Ref-Mutationen — vermutlich falsch klassifiziert von eslint-plugin-react, manuell pruefen wenn Konflikt auftritt |
| `react-hooks/exhaustive-deps` | 19 | meist defensive Auslassungen; in Einzelfaellen koennten Stale-Closures lauern, aber keiner der Bugs aus Tasks 1-3 deckte sich |

### Empfehlung

**Nicht den ESLint-Backlog jagen.** 533 Befunde sind ein Tagesprojekt und der Wertbeitrag ist marginal (Bundle-Size aendert sich nicht, Bugs sind nicht da). Stattdessen:

1. Auf jedem neuen PR `npm run lint` laufen lassen, dann steigen die Zahlen nicht weiter
2. Bei jedem File, das du sowieso anfasst, lokal aufraeumen (Boy-Scout-Regel)
3. `no-explicit-any` perspektivisch zu `warn` herunterstufen, dann wird der Lint-Output uebersichtlicher

---

## 6. Naechste Schritte (Reihenfolge)

1. **Pflegebox-Entscheidung treffen.** Aktivieren oder rausnehmen — beides ist OK, Status-quo nicht.
2. **`./scripts/cleanup-deadcode.sh --apply` lokal laufen lassen.** Das raeumt Stripe + 25 MB Archiv + 3 ungenutzte Icons in einem Schwung weg. Danach commit + push.
3. **`/api/auth/send-verification` loeschen** (kann ich beim naechsten Mal mit ins Cleanup-Skript packen).
4. **Vor dem naechsten DB-Patch (z.B. Pflegebox)**: kurz nach RLS-Matrix schauen (`npm run rls:matrix`), damit neue Tabellen direkt ordentliche Policies kriegen.

---

## 7. Was diese Empfehlung **nicht** abdeckt (bewusst)

- **Bundle-Size-Messung lokal** (Task #9) — braucht `npm run analyze` auf deinem Rechner
- **JWT-Expiry & Sentry-DSN-Konfiguration** — User-Action im Vercel/Supabase-Dashboard
- **Playwright-E2E** — lokal ausfuehren, Sandbox kann den Browser nicht starten
- **Legal-Review von `/impressum` + `/agb`** — Rechtsanwalts-Aufgabe, nicht Code

Diese Punkte sind in der `TASKS.md` separat gelistet — alles deine Entscheidung ueber Reihenfolge.
