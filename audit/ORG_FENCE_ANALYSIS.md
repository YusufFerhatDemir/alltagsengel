# Sicherheitsanalyse: Organisations- und Mandantentrennung für Chat, Messages und Notifications

**Datum:** 2026-08-06  
**Status:** NO-GO für sofortige vollständige Org-Fence-Implementierung  
**Analyst:** Automatisiertes Sicherheitsaudit  
**Scope:** `chat_messages`, `messages`, `notifications`, `mis_notifications`, `mis_ai_conversations`

---

## 1. Zusammenfassung (Executive Summary)

Die Bestandsaufnahme ergibt ein **geteiltes Ergebnis**:

- **mis_notifications** ist bereits korrekt mit einer RESTRICTIVE org_fence-Policy abgesichert.
- **mis_ai_conversations** ist eine **kritische Lücke** — MIS-Tabelle ohne `organization_id` und ohne Org-Fence.
- **chat_messages**, **messages** und **notifications** operieren im B2C-Marketplace-Modell und haben **kein `organization_id`**. Eine Org-Fence ist hier **strukturell nicht direkt umsetzbar**, weil das Datenmodell mandantenübergreifende Interaktionen (Kunde↔Engel) vorsieht.

**Empfehlung:** Teilweise Implementierung in zwei Schritten:
1. **Sofort (Phase 2A):** `mis_ai_conversations` erhält `organization_id` + Org-Fence.
2. **Architekturarbeit (Phase 2B):** Konzept für B2C-Tabellen, das Marketplace-Logik bewahrt und trotzdem Mandantentrennung gewährleistet.

---

## 2. Geprüfte Tabellen — Schema-Übersicht

### 2.1 chat_messages
| Spalte | Typ | Nullable | Default |
|--------|-----|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | NO | — |
| sender_id | uuid | YES | — |
| content | text | NO | — |
| created_at | timestamptz | YES | now() |

**FK:** `ride_id → krankenfahrten.id`  
**organization_id:** ❌ NICHT VORHANDEN  
**Datensätze:** 0  

### 2.2 messages
| Spalte | Typ | Nullable | Default |
|--------|-----|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| booking_id | uuid | NO | — |
| sender_id | uuid | NO | — |
| receiver_id | uuid | NO | — |
| content | text | NO | — |
| read | boolean | YES | false |
| created_at | timestamptz | YES | now() |

**FK:** `booking_id → bookings.id`, `sender_id → profiles.id`, `receiver_id → profiles.id`  
**organization_id:** ❌ NICHT VORHANDEN (aber `bookings` hat `organization_id`)  
**Datensätze:** 2  

### 2.3 notifications
| Spalte | Typ | Nullable | Default |
|--------|-----|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | — |
| type | text | NO | 'booking' |
| title | text | NO | — |
| body | text | YES | — |
| data | jsonb | YES | '{}' |
| link | text | YES | — |
| is_read | boolean | YES | false |
| email_sent | boolean | YES | false |
| created_at | timestamptz | YES | now() |

**FK:** `user_id → profiles.id`  
**organization_id:** ❌ NICHT VORHANDEN  
**Datensätze:** 137  

### 2.4 mis_notifications ✅
| Spalte | Typ | Nullable | Default |
|--------|-----|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES | — |
| title | text | NO | — |
| message | text | YES | — |
| type | text | YES | 'info' |
| module | text | YES | — |
| link | text | YES | — |
| is_read | boolean | YES | false |
| created_at | timestamptz | YES | now() |
| organization_id | uuid | NO | current_org_id() |

**FK:** `organization_id → organizations.id`, `user_id → profiles.id`  
**organization_id:** ✅ VORHANDEN mit Default `current_org_id()`  
**Datensätze:** 0  

### 2.5 mis_ai_conversations ⚠️
| Spalte | Typ | Nullable | Default |
|--------|-----|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES | — |
| title | text | YES | 'Neue Unterhaltung' |
| messages | jsonb | YES | '[]' |
| context | jsonb | YES | '{}' |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

**FK:** `user_id → profiles.id`  
**organization_id:** ❌ NICHT VORHANDEN  
**Datensätze:** 0  

---

## 3. RLS-Status

Alle 5 Tabellen haben RLS aktiviert (`relrowsecurity = true`).

### 3.1 Bestehende Policies

| Tabelle | Policy | Typ | Cmd | Bewertung |
|---------|--------|-----|-----|-----------|
| **chat_messages** | Users can read their ride messages | PERMISSIVE | SELECT | ✅ Prüft Ride-Teilnahme |
| | Users can send messages to their rides | PERMISSIVE | INSERT | ✅ sender_id + Ride-Teilnahme |
| | *(keine UPDATE/DELETE-Policy)* | — | — | ⚠️ Implizites Deny, aber nicht explizit |
| **messages** | Users can view own messages | PERMISSIVE | SELECT | ✅ sender/receiver + soft-delete-Check |
| | Users can send messages | PERMISSIVE | INSERT | ✅ sender_id-Check |
| | Receiver can mark as read | PERMISSIVE | UPDATE | ✅ receiver_id-Check |
| | *(keine DELETE-Policy)* | — | — | ✅ Implizites Deny |
| **notifications** | Users can view own notifications | PERMISSIVE | SELECT | ✅ user_id + soft-delete-Check |
| | Users can insert own notifications | PERMISSIVE | INSERT | ✅ auth + user_id-Check |
| | Users can update own notifications | PERMISSIVE | UPDATE | ✅ user_id-Check |
| | *(keine DELETE-Policy)* | — | — | ✅ Implizites Deny |
| **mis_notifications** | Users see own notifications | PERMISSIVE | SELECT | ✅ user_id-Check |
| | mis_notifications_org_fence | **RESTRICTIVE** | ALL | ✅ **Org-Fence aktiv** |
| **mis_ai_conversations** | mis_ai_conversations_admin_select | PERMISSIVE | SELECT | ⚠️ Nur Admin-SELECT, keine INSERT/UPDATE/DELETE-Policies |

### 3.2 Bewertung

- **mis_notifications:** ✅ Korrekt abgesichert (RESTRICTIVE org_fence + user_id-Check)
- **chat_messages:** ⚠️ Ride-basierte Isolation funktioniert, aber keine Org-Fence. Da `krankenfahrten` selbst kein `organization_id` hat, ist eine transitive Fence nicht möglich.
- **messages:** ⚠️ User-basierte Isolation funktioniert. Transitive Fence über `bookings.organization_id` theoretisch möglich, aber semantisch fragwürdig (s. Abschnitt 4).
- **notifications:** ⚠️ User-basierte Isolation funktioniert. Keine Org-Dimension vorhanden.
- **mis_ai_conversations:** ❌ **Kritische Lücke.** Nur Admin-SELECT, keine weiteren Policies. Kein `organization_id`. Ein Admin von Org A könnte theoretisch AI-Conversations von Org B sehen.

---

## 4. Architekturanalyse: Warum B2C-Tabellen kein einfaches Org-Fencing erlauben

### 4.1 Zwei-Welten-Architektur

Das System besteht aus zwei fundamental verschiedenen Domänen:

**B2B/MIS-Welt** (organisationsgebunden):
- Tabellen: `mis_*`, `clients`, `caregivers`, `invoices`, etc.
- Alle haben `organization_id`
- Phase-3-Migration hat RESTRICTIVE org_fence für ~70 Tabellen angelegt
- `current_org_id()` löst Organisation aus JWT → organization_members → Fallback

**B2C/Marketplace-Welt** (benutzergebunden):
- Tabellen: `bookings`, `messages`, `chat_messages`, `notifications`, `krankenfahrten`
- Interaktionen sind **mandantenübergreifend** by design:
  - Ein Kunde (ohne Org) bucht einen Engel (ohne Org oder Org A)
  - Ein Kunde bestellt eine Krankenfahrt bei einem Provider (eigene Entität, kein Org-Member)
  - Notifications werden für jeden User-Typ erzeugt

### 4.2 Transitive Org-Links

| Tabelle | Pfad zur Organisation | Problem |
|---------|----------------------|---------|
| messages | → bookings.organization_id | `bookings.organization_id` ist für MIS-Kontext. Der Engel gehört typischerweise NICHT zur selben Org wie die Buchung. Eine Org-Fence würde den Engel von seinem eigenen Chat ausschließen. |
| chat_messages | → krankenfahrten → ??? | `krankenfahrten` hat KEIN `organization_id`. `provider_id` verweist auf `krankenfahrt_providers` (ebenfalls ohne Org). Kein transitiver Pfad. |
| notifications | → profiles → ??? | `profiles` hat KEIN `organization_id`. User können Mitglied in 0..n Organisationen sein. Eine Notification hat keinen eindeutigen Org-Kontext. |

### 4.3 Mandantenquelle: `current_org_id()`

```sql
SELECT COALESCE(
  NULLIF(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid,
  (SELECT om.organization_id FROM organization_members om
   WHERE om.user_id = auth.uid() ORDER BY om.created_at LIMIT 1),
  '00000000-0000-4000-8000-000460629986'::uuid  -- Stamm-Org Fallback
);
```

Diese Funktion ist für MIS-Tabellen konzipiert. Für B2C-Tabellen ist sie ungeeignet, weil:
- Kunden sind typischerweise in KEINER Organisation → Fallback auf Stamm-Org
- Engel können in einer Org sein, müssen aber Nachrichten mit Kunden austauschen, die in einer anderen/keiner Org sind
- Ein `organization_id = current_org_id()` Filter würde B2C-Kommunikation brechen

---

## 5. Realtime-Subscriptions

Alle Realtime-Subscriptions nutzen `postgres_changes` und respektieren RLS:

| Kontext | Tabelle | Filter |
|---------|---------|--------|
| Fahrer-Chat | chat_messages | `ride_id=eq.${rideId}` |
| Kunde-Chat (Booking) | messages | `booking_id=eq.${chatId}` |
| Kunde-Chat (Ride) | chat_messages | `ride_id=eq.${chatId}` |
| Engel-Chat | messages | `booking_id=eq.${bookingId}` |
| Support-Nachrichten | care_notes | `client_id=eq.${cid}` |

**Bewertung:** Realtime liefert nur Daten aus, die der RLS-SELECT-Policy entsprechen. Da die bestehenden Policies Teilnahme prüfen (ride_id- bzw. sender/receiver-Check), werden keine fremden Daten über Realtime geleakt. Ohne Org-Fence auf den Tabellen gibt es jedoch auch keine Org-basierte Filterung in Realtime.

---

## 6. Server-seitige Notification-Inserts

Drei API-Routen verwenden `service_role` (adminClient) zum Einfügen von Notifications:

| Route | Client | Risiko |
|-------|--------|--------|
| `/api/referral/complete` | service_role | Niedrig — server-seitig, auth-geprüft |
| `/api/visitor-alert` | adminClient | Niedrig — server-seitig, IP-basiert |
| `/api/notify-admin-registration` | adminClient | Niedrig — server-seitig, auth-geprüft |
| `/api/notify` | User-Client | ✅ Nutzt RLS, Admin-Check für fremde user_ids |

**Hinweis:** Wenn `notifications` künftig ein `organization_id` mit NOT NULL erhält, müssen diese Routen die `organization_id` explizit setzen, da service_role RLS umgeht und `current_org_id()` ohne JWT-Kontext nicht funktioniert.

---

## 7. Ergebnis: NO-GO mit Teilempfehlung

### 7.1 Sofort umsetzbar (Phase 2A)

**mis_ai_conversations** — Org-Fence nachrüsten:
- `organization_id UUID NOT NULL DEFAULT current_org_id()` hinzufügen
- Backfill: Alle bestehenden Zeilen (aktuell 0) erhalten Stamm-Org-ID
- RESTRICTIVE org_fence-Policy analog zu mis_notifications
- INSERT/UPDATE/DELETE-Policies für Admins hinzufügen
- Geschätzer Aufwand: 1 Migration + 1 Rollback

### 7.2 Architekturarbeit erforderlich (Phase 2B)

Für `chat_messages`, `messages` und `notifications` muss erst eine Architekturentscheidung fallen:

**Option A: Org-ID auf B2C-Tabellen mit Doppelzugehörigkeit**
- `messages` bekommt `organization_id` (nullable), befüllt aus `bookings.organization_id`
- `notifications` bekommt `organization_id` (nullable), bestimmt durch Kontext
- `chat_messages` bekommt `organization_id` (nullable), benötigt erst Org-Link auf `krankenfahrten`
- **Pro:** Einheitliches Modell, Defense-in-Depth
- **Contra:** Nullable Org-ID schwächt die Fence. Marketplace-Nachrichten haben keinen eindeutigen Mandanten. Hohe Komplexität.

**Option B: Benutzer-basierte Isolation beibehalten, Defense-in-Depth über Booking/Ride-Prüfung**
- Bestehende RLS-Policies stärken (explizite DENY für anonyme User auf allen Tabellen)
- `chat_messages`: UPDATE/DELETE explizit verbieten
- `messages`: Prüfung verschärfen (z.B. aktive Buchungsteilnahme statt nur sender/receiver)
- `notifications`: Prüfung verschärfen (Soft-Delete-Check auf INSERT)
- **Pro:** Bewahrt Marketplace-Semantik, weniger invasiv
- **Contra:** Keine Org-basierte Trennung

**Option C: Separate Tabellen für B2B und B2C**
- MIS bekommt eigene Tabellen (z.B. `mis_messages` mit org_fence)
- B2C-Tabellen bleiben user-scoped
- **Pro:** Saubere Trennung, klare Verantwortlichkeiten
- **Contra:** Code-Duplikation, Migration bestehender Daten

### 7.3 Empfehlung

1. **Sofort:** Phase 2A umsetzen (mis_ai_conversations)
2. **Kurzfristig:** Option B als Quick-Win — bestehende Policies härten
3. **Mittelfristig:** Option A evaluieren — Org-ID auf B2C-Tabellen mit klarem Konzept für Marketplace-Nachrichten

---

## 8. Voraussetzungen für Phase 2A

| # | Voraussetzung | Status |
|---|---------------|--------|
| 1 | `organizations`-Tabelle existiert | ✅ |
| 2 | `organization_members`-Tabelle existiert | ✅ |
| 3 | `current_org_id()` Funktion existiert | ✅ |
| 4 | `is_admin()` Funktion existiert | ✅ |
| 5 | `is_org_member()` Funktion existiert | ✅ |
| 6 | `has_org_role()` Funktion existiert | ✅ |
| 7 | Phase-3-Migration als Vorlage verfügbar | ✅ |
| 8 | mis_ai_conversations hat 0 Datensätze | ✅ (kein Backfill nötig) |

---

## 9. Anhang: Helper-Funktionen

### current_org_id()
Reihenfolge: JWT `app_metadata.org_id` → erste `organization_members`-Zeile → Stamm-Org-Fallback

### is_admin()
Prüft `profiles.role IN ('admin', 'superadmin')` für `auth.uid()`

### is_org_member(org)
Prüft ob `auth.uid()` in `organization_members` für die gegebene Org existiert

### has_org_role(org, roles[])
Prüft ob `auth.uid()` in `organization_members` für die gegebene Org mit einer der angegebenen Rollen existiert
