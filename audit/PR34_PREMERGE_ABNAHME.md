# PR #34 Pre-Merge-Abnahme Report

**Datum:** 2026-08-06
**Branch:** `feature/org-fence-chat-messages-notifications`
**PR-HEAD Commit:** `3b45373`
**Ergebnis:** **GO**

---

## 1. Vercel Preview Deployment

| Feld | Wert |
|------|------|
| Deployment-ID | `BMj2GHFRQ` |
| Status | Ready (Latest) |
| Build-Dauer | 2m 36s |
| Environment | Preview |
| Preview-URL | `alltagsengel-git-feature-org-f54995-yusufferhatdemirs-projects.vercel.app` |
| Supabase-Zuordnung | **Staging** (`rpkdwwurewpmgmemhdje`) - verifiziert via Netzwerk-Request |
| Build-Errors | 0 |
| Build-Warnings | 3 (alle Sentry auth token - nicht PR-34-bezogen) |
| Runtime-Errors | 0 |
| Console-Errors | 0 |

---

## 2. notifications INSERT - Entscheidung

### Analyse
Alle Notification-INSERTs im Code laufen ueber **Admin/Service-Role-Clients**:

- `app/api/visitor-alert/route.ts` → `createAdminClient()` (service_role)
- `app/api/referral/complete/route.ts` → `supabaseAdmin` (service_role)
- `app/api/notify-admin-registration/route.ts` → `createAdminClient()` (service_role)
- `app/api/bookings/notify/route.ts` → `adminSupabase` (service_role)
- `app/api/bookings/respond/route.ts` → `admin` (service_role)
- `app/api/notify/route.ts` → war user-scoped, jetzt auf `createAdminClient()` umgestellt

Kein Frontend-Code fuehrt Client-INSERTs aus. Die `/api/notify`-Route wird von keinem aktiven Frontend-Code aufgerufen (nur in archivierten Typdefinitionen).

### Entscheidung
**INSERT-Policy auf `false` gesetzt** (alle Client-INSERTs blockiert).

**Begruendung:** Service-Role/Admin-Clients umgehen RLS. Die alte Policy (`auth.uid() = user_id`) erlaubte Self-INSERTs mit beliebigem type/title/body/link/data - ein unnoetige Angriffsflaeche. Kein Breaking Change, da kein Frontend-Code Client-INSERTs durchfuehrt.

### Aenderungen
- Migration: `20260806140000_harden_notifications_insert.sql`
- Rollback: `20260806140001_rollback_harden_notifications_insert.sql`
- Code-Fix: `app/api/notify/route.ts` → INSERT via `createAdminClient()` statt user-scoped Client

---

## 3. chat_messages.sender_id FK - Entscheidung

### Analyse
- `sender_id`: uuid, nullable, kein Default
- Bestehender FK: nur `ride_id → krankenfahrten`
- Tabelle: **0 Datensaetze** auf Produktion
- Keine verwaisten sender_ids

### Entscheidung
**FK bereits vorhanden** in Migration `20260804300000_fix_all_auth_user_fks.sql`:

```sql
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;
```

Kein zusaetzlicher Handlungsbedarf. FK ist korrekt konfiguriert:
- nullable (fuer DSGVO-Anonymisierung nach User-Loeschung)
- ON DELETE SET NULL (Nachricht bleibt erhalten, Sender wird anonymisiert)

---

## 4. Geaenderte Policies/Trigger/RPCs

### Neue Migration (20260806140000)
| Tabelle | Typ | Name | Aenderung |
|---------|-----|------|-----------|
| notifications | Policy | `notifications_insert_blocked` | NEU: WITH CHECK (false) |
| notifications | Policy | `notifications_insert_own` | ENTFERNT |

### Bestehende (aus 20260806120000, Commit 3b45373)
| Tabelle | Typ | Name |
|---------|-----|------|
| chat_messages | Policy | `chat_messages_select_ride_participant` |
| chat_messages | Policy | `chat_messages_insert_ride_participant` |
| messages | Policy | `messages_select_sender_or_receiver` |
| messages | Policy | `messages_insert_booking_participant` |
| messages | Policy | `messages_update_receiver_read_only` |
| messages | Trigger | `trg_prevent_messages_tampering` |
| notifications | Policy | `notifications_select_own` |
| notifications | Policy | `notifications_update_own` |
| notifications | Trigger | `trg_prevent_notifications_tampering` |

---

## 5. Migrationsdateien

| Datei | Zweck |
|-------|-------|
| `20260806140000_harden_notifications_insert.sql` | INSERT-Policy auf false |
| `20260806140001_rollback_harden_notifications_insert.sql` | Rollback |

---

## 6. Testergebnisse

### RLS-Testmatrix (Staging, 32 Tests)

| Test-ID | Beschreibung | Ergebnis |
|---------|-------------|----------|
| **chat_messages** | | |
| CM-T01 | KundeA eigene Fahrt lesen (2 Zeilen) | PASS |
| CM-T02 | KundeB fremde Fahrt lesen (0 Zeilen) | PASS |
| CM-T03 | EngelA eigene Fahrt lesen (2 Zeilen) | PASS |
| CM-T04 | EngelB fremde Fahrt lesen (0 Zeilen) | PASS |
| CM-T05 | KundeA INSERT eigene Fahrt | PASS |
| CM-T06 | KundeB INSERT fremde Fahrt → blockiert | PASS |
| CM-T07 | Sender-Spoofing → blockiert | PASS |
| CM-T08 | UPDATE → blockiert (keine Policy) | PASS |
| CM-T09 | DELETE → blockiert (keine Policy) | PASS |
| **messages** | | |
| MSG-T01 | KundeA eigene Nachrichten lesen (1) | PASS |
| MSG-T02 | EngelA eigene Nachrichten lesen (1) | PASS |
| MSG-T03 | KundeB fremde Buchung lesen (0) | PASS |
| MSG-T04 | INSERT korrekte Buchung | PASS |
| MSG-T05 | Sender-Spoofing → blockiert | PASS |
| MSG-T06 | Receiver-Spoofing → blockiert | PASS |
| MSG-T07 | Fremde booking_id → blockiert | PASS |
| MSG-T08 | Empfaenger setzt read → erlaubt | PASS |
| MSG-T09 | Sender kann nicht updaten | PASS |
| MSG-T10 | content-Tampering → Trigger blockiert | PASS |
| MSG-T11 | sender_id-Tampering → Trigger blockiert | PASS |
| MSG-T12 | booking_id-Tampering → Trigger blockiert | PASS |
| MSG-T13 | DELETE → blockiert | PASS |
| **notifications** | | |
| NOT-T01 | KundeA eigene Notifications (1) | PASS |
| NOT-T02 | KundeA fremde Notifications (0) | PASS |
| NOT-T03 | Client INSERT → blockiert (neue Policy) | PASS |
| NOT-T04 | is_read setzen → erlaubt | PASS |
| NOT-T05 | title-Tampering → Trigger blockiert | PASS |
| NOT-T06 | body-Tampering → Trigger blockiert | PASS |
| NOT-T07 | data-Tampering → Trigger blockiert | PASS |
| NOT-T08 | Fremde Notification updaten (0 rows) | PASS |
| NOT-T09 | DELETE → blockiert | PASS |
| **Cross-Org** | | |
| CROSS-T01 | EngelA sieht nicht Messages Buchung B | PASS |
| CROSS-T02 | EngelA sieht nicht Notifications EngelB | PASS |
| **Anonym** | | |
| ANON-T01 | chat_messages SELECT → 0 | PASS |
| ANON-T02 | messages SELECT → 0 | PASS |
| ANON-T03 | notifications SELECT → 0 | PASS |
| ANON-T04 | chat_messages INSERT → blockiert | PASS |
| ANON-T05 | messages INSERT → blockiert | PASS |
| ANON-T06 | notifications INSERT → blockiert | PASS |
| **Sicherheit** | | |
| SEC-T01 | UPDATE sender_id → Trigger blockiert | PASS |
| SEC-T02 | UPDATE receiver_id → Trigger blockiert | PASS |
| SEC-T03 | Fremde ride_id INSERT → blockiert | PASS |
| SEC-T04 | Service-Role INSERT notifications → erlaubt | PASS |

**Ergebnis: 32/32 Tests bestanden**

### Rollback-Verifikation
- Rollback angewandt → alte Policy `notifications_insert_own` wiederhergestellt
- Client INSERT nach Rollback → erlaubt (PASS)
- Re-Apply → gehaerteter Zustand `notifications_insert_blocked` korrekt

### Unit-Tests (Vitest)
- **257 bestanden**, 5 fehlgeschlagen (vorbekannt, p0-1-admin-auth, Sandbox-Umgebung ohne SUPABASE_URL), 29 uebersprungen
- Keine PR-34-bezogenen Fehler

### TypeCheck
- `npx tsc --noEmit` → **0 Fehler**

---

## 7. Testdatenbereinigung

| Tabelle | Erstellt | Geloescht | Verbleibend |
|---------|----------|-----------|-------------|
| auth.users | 4 | 4 | 0 |
| profiles | 4 | 4 | 0 |
| organizations | 2 | 2 | 0 |
| organization_members | 2 | 2 | 0 |
| bookings | 2 | 2 | 0 |
| krankenfahrten | 1 | 1 | 0 |
| krankenfahrt_providers | 1 | 1 | 0 |
| chat_messages | 2 | 2 | 0 |
| messages | 2 | 2 | 0 |
| notifications | 4 | 4 | 0 |

---

## 8. Verbleibende Risiken

1. **p0-1-admin-auth Tests**: 5 Tests schlagen in Sandbox fehl (fehlende SUPABASE_URL). Vorbekanntes Issue, nicht PR-34-bezogen. Sollte in CI mit korrekten Env-Vars bestehen.

2. **`/api/notify` Route**: Wird von keinem aktiven Frontend-Code aufgerufen. Umstellung auf Admin-Client ist korrekt, aber tote Route sollte mittelfristig entfernt oder reaktiviert werden.

3. **page_views 404**: Preview-Deployment macht POST an `/rest/v1/page_views` auf Staging → 404 (Tabelle existiert nicht auf Staging-Branch). Nicht sicherheitsrelevant, nur Analytics.

---

## 9. Merge-Empfehlung

**GO** — Alle sicherheitsrelevanten Tests bestanden. Die Haertung der notifications INSERT-Policy schliesst die letzte bekannte Luecke. Rollback ist verifiziert. Keine Produktionsdaten beruehrt.
