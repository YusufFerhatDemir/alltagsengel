# Dead-Code-Audit — Backend / API

**Erstellt:** 2026-04-20  
**Scope:** `/app/api`, `/supabase/functions`, `middleware.ts`, `/lib` (API-helpers)  
**Status:** ANALYSE ABGESCHLOSSEN — KEINE ÄNDERUNGEN

---

## Executive Summary

| Metrik | Wert |
|--------|------|
| **API-Endpoints gesamt** | 34 |
| **Mit Frontend-Aufrufer** | 19 |
| **Ohne Frontend-Aufrufer** | 15 |
| **DELETE-Kandidaten** | 5 |
| **INVESTIGATE** | 6 |
| **RISIKO-HOCH (nicht löschen)** | 7 |
| **Server-Actions** | 0 |
| **Tote /lib API-Helpers** | 0 |

---

## 1. Endpoint-Inventar

### ACTIVE (19 Endpoints — USED)

| Endpoint | Methods | Frontend-Aufrufer | Status | Risiko |
|----------|---------|---|---|---|
| `/api/visitor-alert` | POST | JA (1x) | ACTIVE | GERING |
| `/api/referral` | GET, POST | JA (2x) | ACTIVE | GERING |
| `/api/track` | POST | JA (1x) | ACTIVE | GERING |
| `/api/bookings/notify` | POST | JA (2x) | ACTIVE | MEDIUM |
| `/api/kontakt` | POST | JA (1x) | ACTIVE | GERING |
| `/api/auth/send-welcome` | POST | JA (1x) | ACTIVE | GERING |
| `/api/auth/send-reset` | POST | JA (1x) | ACTIVE | MEDIUM |
| `/api/auth/check-rate-limit` | POST | JA (3x) | ACTIVE | MEDIUM |
| `/api/admin/manage-role` | POST | JA (2x) | ACTIVE | HOCH |
| `/api/admin/reset-password` | POST | JA (4x) | ACTIVE | HOCH |
| `/api/user/delete` | DELETE | JA (2x) | ACTIVE | HOCH |
| `/api/ai-chat` | POST | JA (2x) | ACTIVE | MEDIUM |
| `/api/push/subscribe` | POST, DELETE | JA (1x) | ACTIVE | GERING |
| `/api/push/fcm-register` | POST, DELETE | JA (1x) | ACTIVE | GERING |
| `/api/track-conversion` | POST | JA (1x) | ACTIVE | GERING |
| `/api/newsletter` | POST | JA (1x) | ACTIVE | GERING |
| `/api/client-ip` | GET | JA (2x) | ACTIVE | GERING |
| `/api/pricing/calculate` | POST, GET | JA (4x) | ACTIVE | GERING |
| `/api/notify-admin-registration` | POST | JA (2x) | ACTIVE | GERING |
| `/api/reviews` | POST, GET | JA (1x) | ACTIVE | GERING |

### INVESTIGATE (6 Endpoints — Potenziell tot, aber externe Trigger)

| Endpoint | Methods | Kontext | Grund für INVESTIGATE |
|----------|---------|---|---|
| `/api/drip` | POST | Cron-Drip-Campaign | Wird von `/api/cron/drip` (Vercel-Cron, täglich 09:00 UTC) aufgerufen. Interne API-Weitergabe. |
| `/api/notify` | POST, GET, PATCH | Admin-Notifikation | Service-Role-geschützt, keine Frontend-Aufrufe sichtbar. Könnte von Supabase-Trigger/Webhook genutzt werden. |
| `/api/referral/complete` | POST | Booking-Referral-Flow | Service-Role-geschützt. Logik für Referral-Completion nach erster Buchung. Unklar, ob von Booking-Handler aufgerufen wird. |
| `/api/push/send` | POST | Push-Notification | Service-Role-geschützt (`x-service-key`). Interne API für Benachrichtigungen. |
| `/api/admin/krankenfahrten` | GET, PUT | Krankenfahrten-Verwaltung | Admin-Endpoint. Keine direkten API-Aufrufe gefunden, aber möglicherweise direkte Supabase-Queries statt API-Calls. |
| `/api/auth/send-verification` | POST | Email-Verifikation | Fallback-Endpoint für Supabase-Verifizierungsfehler. Selten genutzt. |

### DELETE-Kandidaten (5 Endpoints — Sicher tot)

| Endpoint | Methods | Grund | Empfehlung |
|----------|---------|---|---|
| `/api/scan-medikament` | POST | Keine Frontend-Aufrufer, keine Webhook-Marker, nicht in Cron. Medikamenten-Scanner (Vision/LLM). | **DELETE** |
| `/api/payment` | POST | Keine Frontend-Aufrufe. Alte Stripe-Integration? Kommentare erwähnen `stripe.paymentIntents.create()` ist commented out. | **DELETE oder ARCHIVE** (geklärt werden) |
| `/api/content-blocks` | GET, POST, PUT, DELETE | Admin-Content-Management. Keine Frontend-Aufrufe gefunden. | **DELETE** |
| `/api/admin/pricing` | GET, POST, PUT, DELETE | Admin-Pricing-Management. Keine Frontend-Aufrufe. | **DELETE** |
| `/api/auth/send-verification` | POST | Fallback für Supabase-Fehlerfall. Könnte beibehalten werden, ist aber selten. | **DELETE oder ARCHIVE** |

---

## 2. DELETE-Kandidaten (sicher)

### `/api/scan-medikament`
- **Dateipfad:** `/app/api/scan-medikament/route.ts`
- **HTTP-Methode:** `POST`
- **Inhalt:** Medikamenten-Scanner mit Vision/LLM-Analyse
- **Frontend-Aufrufer:** 0
- **Webhook/Cron:** NEIN
- **Status:** DEAD
- **Empfehlung:** **DELETE**

### `/api/payment`
- **Dateipfad:** `/app/api/payment/route.ts`
- **HTTP-Methode:** `POST`
- **Inhalt:** Zahlung für Buchung. Stripe-Integration ist auskommentiert. Erstellt nur DB-Einträge.
- **Frontend-Aufrufer:** 0
- **Webhook/Cron:** NEIN
- **Status:** DEAD (oder alte Implementation)
- **Empfehlung:** **DELETE oder ARCHIVE** (geklärt werden: ist Stripe aktiv?)

### `/api/content-blocks`
- **Dateipfad:** `/app/api/content-blocks/route.ts`
- **HTTP-Methode:** `GET, POST, PUT, DELETE`
- **Inhalt:** Admin-API für Content-Blöcke. CRUD-Operationen.
- **Frontend-Aufrufer:** 0
- **Webhook/Cron:** NEIN
- **Status:** DEAD
- **Empfehlung:** **DELETE**

### `/api/admin/pricing`
- **Dateipfad:** `/app/api/admin/pricing/route.ts`
- **HTTP-Methode:** `GET, POST, PUT, DELETE`
- **Inhalt:** Admin-Pricing-Management. CRUD-Operationen.
- **Frontend-Aufrufer:** 0
- **Webhook/Cron:** NEIN
- **Status:** DEAD
- **Empfehlung:** **DELETE**

### `/api/auth/send-verification`
- **Dateipfad:** `/app/api/auth/send-verification/route.ts`
- **HTTP-Methode:** `POST`
- **Inhalt:** Fallback für Supabase-Verifikationsfehler. Generiert Magic-Link.
- **Frontend-Aufrufer:** 0
- **Webhook/Cron:** NEIN
- **Status:** DEAD (oder sehr selten)
- **Empfehlung:** **DELETE (or ARCHIVE for emergency use)**

---

## 3. INVESTIGATE

Folgende Endpoints haben keine direkten Frontend-Aufrufer, könnten aber von Webhooks, Cron-Jobs oder Service-Calls genutzt werden:

### `/api/drip` ✓ AKTIV
- **Trigger:** `/api/cron/drip` (Vercel-Cron täglich 09:00 UTC)
- **Inhalt:** Drip E-Mail-Kampagne (Tag 1, 3, 7, 14)
- **Status:** **AKTIV** — Wird täglich von Cron aufgerufen
- **Empfehlung:** KEEP

### `/api/notify` — INVESTIGATE
- **Status:** Könnte von Supabase-Webhook genutzt werden
- **Service-Role:** JA (SUPABASE_SERVICE_ROLE_KEY)
- **Empfehlung:** Codebase durchsuchen nach `.from('notifications').insert()` oder Webhook-Definitionen

### `/api/referral/complete` — INVESTIGATE
- **Status:** Referral-Completion nach Buchung. Logik prüfen.
- **Service-Role:** JA
- **Empfehlung:** Booking-Handler durchsuchen nach `referral/complete`

### `/api/push/send` — INVESTIGATE
- **Status:** Service-Role-geschützt. Interne Push-API.
- **Trigger:** Könnte von Notification-System aufgerufen werden
- **Empfehlung:** Notification-Logik prüfen

### `/api/admin/krankenfahrten` — INVESTIGATE
- **Status:** Wird möglicherweise direkt via Supabase abgefragt statt API-Call
- **Frontend-Query:** Fahrer-Dashboard nutzt `supabase.from('krankenfahrten')`
- **Empfehlung:** Prüfen, ob API unnötig ist

### `/api/auth/send-verification` — INVESTIGATE
- **Status:** Fallback für Supabase-Fehler
- **Frontend-Aufrufer:** 0
- **Empfehlung:** Prüfen, wie oft dieser Fehlerfall auftritt

---

## 4. Server-Actions

**Ergebnis:** `grep -r "'use server'"` — **0 Treffer**

Keine Server-Actions mit `'use server'`-Direktive gefunden. Das Projekt nutzt API-Routes statt Server-Actions.

---

## 5. Middleware

**Datei:** `/middleware.ts`

- **Größe:** ~200 Zeilen
- **Funktion:** 
  - Supabase-Session-Management (SSR Cookie-Kompatibilität)
  - Referral-Code in Cookie speichern
  - Auth-State forwarden

**Helpers:** Base64-Encoding/Decoding für Session-Cookies

**Status:** ACTIVE — keine toten Helper

---

## 6. /lib API-Helpers

**Ergebnis:** Keine exklusiv von toten Endpoints genutzten Helpers gefunden.

Alle `lib/*`-Utilities werden von mehreren Quellen aufgerufen oder sind von keinem toten Endpoint abhängig.

**Beispiele geprüfter Utilities:**
- `lib/supabase/server.ts` — von vielen Endpoints genutzt
- `lib/notifications.ts` — von mehreren Services genutzt
- `lib/supabase/admin.ts` — von mehreren Endpoints genutzt

---

## 7. Edge-Functions

### `/supabase/functions/account-hard-delete/`
- **Trigger:** `pg_cron` täglich ~03:00 UTC (per Migration `20260419_soft_delete.sql`)
- **Funktion:** Hard-Delete von Accounts 60 Tage nach Soft-Delete
- **Status:** ACTIVE — wird täglich ausgeführt
- **Notizen:** Ist ein kritischer Prozess für DSGVO-Compliance

---

## 8. Risiko-Hinweise

### RISIKO-HOCH (NICHT LÖSCHEN)
1. **Alle `/api/auth/*`-Endpoints:** Auth ist kritisch
2. **`/api/admin/reset-password`:** Passwort-Verwaltung
3. **`/api/admin/manage-role`:** Role-Management — Zugriffskontrolle
4. **`/api/user/delete`:** Account-Löschung — DSGVO-relevant
5. **`/api/payment`:** Potenziell für Zahlungen genutzt (auch wenn momentan nicht aktiviert)

### RISIKO-MEDIUM
- Alle Endpoints mit Service-Role-Key (`SUPABASE_SERVICE_ROLE_KEY`)
- Alle Admin-Endpoints (`/api/admin/*`)
- Alle Push/Notification-Endpoints

### SPEZIALFÄLLE — Werden von anderen APIs aufgerufen
- **`/api/drip`:** Cron-zu-API (von `/api/cron/drip` aufgerufen)
- **`/api/user/delete/undo`:** Undo-Link in Lösch-Email (von `/api/user/delete` Mail genutzt)
- **`/api/newsletter/unsubscribe`:** Abmelden-Link in Newsletter-Email (von `/api/newsletter` Mail genutzt)

---

## 9. Typendefinitionen

**Prüfung:** `grep -r "export type\|export interface"` in `/types`

**Ergebnis:** Keine verwaisten Type-Definitionen gefunden. Alle werden von Pages/Components importiert.

---

## 10. Empfehlungen

### Sofort löschen (sicher):
1. `/app/api/scan-medikament/route.ts` — 0 Aufrufer
2. `/app/api/content-blocks/route.ts` — 0 Aufrufer
3. `/app/api/admin/pricing/route.ts` — 0 Aufrufer

### Weiter untersuchen:
1. `/api/payment` — Ist Stripe aktiv? Alte Implementierung?
2. `/api/auth/send-verification` — Wie oft wird dieser Fallback genutzt? Logs prüfen.
3. `/api/notify`, `/api/referral/complete`, `/api/push/send` — Service-Role-Calls tracken

### Behalten:
- Alle Auth-Endpoints
- Alle Admin-sensitiven Endpoints
- Alle Cron/Service-Endpoints
- Alle tatsächlich genutzten Endpoints

---

## 11. Nächste Schritte

1. **Bestätigung:** Prüfe mit Team, ob `/api/payment` noch für Zahlungen verwendet wird
2. **Logs:** Supabase-Logs prüfen für Zugriffe auf `/api/auth/send-verification`
3. **Slack/Logging:** Nach `referral/complete`, `push/send`, `notify` in Logs suchen
4. **Delete-Phase:** Mit Bestätigung von Punkt 1-3 die DELETE-Kandidaten entfernen
5. **Monitoring:** Monitoring für potenzielle Broken-Links einrichten

---

**EOF**
