# Sicherheitsaudit: Org-Fence Report — Chat, Messages, Notifications

**Datum:** 2026-08-06  
**Branch:** `feature/org-fence-chat-messages-notifications`  
**Ergebnis:** TEIL-GO (mis_ai_conversations) / NO-GO (B2C-Tabellen)

---

## 1. Gesamtergebnis

| Kategorie | Ergebnis |
|-----------|----------|
| **Mandantenquelle** | `organizations` + `organization_members` + `current_org_id()` (JWT → Mitgliedschaft → Stamm-Org-Fallback) |
| **Geprüfte Tabellen** | 5: `chat_messages`, `messages`, `notifications`, `mis_notifications`, `mis_ai_conversations` |
| **Vorher bestehende Policies** | 11 (über alle 5 Tabellen) |
| **Neue Policies** | 6 (auf `mis_ai_conversations`: org_fence, user_insert, user_update, user_delete, user_select + bestehende admin_select) |
| **Cross-Tenant-Datenlecks** | 0 (alle 10 Tests bestanden) |
| **Testdatenbereinigung** | Vollständig (0 Testdatensätze verbleiben) |
| **Rollback-Migration** | Vorhanden: `20260806100001_rollback_org_fence_mis_ai_conversations.sql` |
| **Verbleibende Risiken** | B2C-Tabellen ohne Org-Fence (architekturbedingt, s. Abschnitt 4) |

---

## 2. Durchgeführte Maßnahme: mis_ai_conversations

### 2.1 Problem
`mis_ai_conversations` ist eine MIS-Tabelle (Admin-Bereich), hatte aber:
- Kein `organization_id`
- Nur eine `admin_select`-Policy (kein INSERT/UPDATE/DELETE-Schutz)
- Keine Org-Fence

Ein Admin von Organisation A konnte theoretisch AI-Conversations von Organisation B sehen.

### 2.2 Lösung (Migration `20260806100000_org_fence_mis_ai_conversations.sql`)

1. `organization_id UUID NOT NULL DEFAULT current_org_id()` hinzugefügt
2. Index `idx_mis_ai_conversations_org` angelegt
3. RESTRICTIVE org_fence-Policy (AND-Verknüpfung mit allen permissiven Policies)
4. Permissive Policies für INSERT, UPDATE, DELETE, SELECT (je `user_id = auth.uid()`)
5. Bestehende `admin_select`-Policy beibehalten

### 2.3 Policy-Matrix nach Migration

| Policy | Typ | Cmd | Prüfung |
|--------|-----|-----|---------|
| mis_ai_conversations_org_fence | RESTRICTIVE | ALL | `organization_id = current_org_id()` |
| mis_ai_conversations_admin_select | PERMISSIVE | SELECT | `is_admin()` |
| mis_ai_conversations_user_select | PERMISSIVE | SELECT | `user_id = auth.uid()` |
| mis_ai_conversations_user_insert | PERMISSIVE | INSERT | `user_id = auth.uid()` |
| mis_ai_conversations_user_update | PERMISSIVE | UPDATE | `user_id = auth.uid()` |
| mis_ai_conversations_user_delete | PERMISSIVE | DELETE | `user_id = auth.uid()` |

---

## 3. Staging-Tests auf Branch `rpkdwwurewpmgmemhdje`

### 3.1 Testaufbau
- 2 Organisationen: Alpha (Org A), Beta (Org B)
- 3 Test-User: Admin A (Org A), Admin B (Org B), Engel A (Org A, nicht-Admin)
- 3 AI-Conversations: je 1 pro User, Org-zugehörig

### 3.2 Testmatrix

| # | Test | Erwartung | Ergebnis |
|---|------|-----------|----------|
| 1 | Service-role sieht alle 3 Conversations | 3 Zeilen | ✅ PASS |
| 2 | Admin A (Org A) sieht nur Org-A-Conversations | 2 Zeilen (eigene + Engel A) | ✅ PASS |
| 3 | Admin B (Org B) sieht nur Org-B-Conversation | 1 Zeile | ✅ PASS |
| 4 | Engel A (Org A, nicht-Admin) sieht nur eigene | 1 Zeile | ✅ PASS |
| 5 | Admin B greift direkt auf Org-A-Conversation zu | 0 Zeilen | ✅ PASS |
| 6 | Anonymer Zugriff | 0 Zeilen | ✅ PASS |
| 7 | Admin B versucht INSERT mit Org-A-ID | RLS-Error (org_fence) | ✅ PASS |
| 8 | Admin B versucht UPDATE auf Org-A-Conversation | 0 affected rows, Daten unverändert | ✅ PASS |
| 9 | Admin B versucht DELETE auf Org-A-Conversation | 0 affected rows, 3 Conversations intakt | ✅ PASS |
| 10 | Engel A versucht Admin-A-Conversation zu lesen | 0 Zeilen (nicht-Admin, andere user_id) | ✅ PASS |

### 3.3 Testdatenbereinigung
Alle Testdaten wurden vollständig entfernt. Verifikation: 0 Conversations, 0 Members, 0 Profiles, 0 Orgs auf Staging.

---

## 4. NO-GO: B2C-Tabellen (chat_messages, messages, notifications)

### 4.1 Bereits abgesichert (mis_notifications)
`mis_notifications` hat bereits eine korrekte RESTRICTIVE org_fence-Policy. Keine Maßnahme erforderlich.

### 4.2 Nicht umsetzbar ohne Architekturarbeit

| Tabelle | Datensätze | Grund für NO-GO |
|---------|-----------|-----------------|
| `chat_messages` | 0 | Kein `organization_id`. Parent `krankenfahrten` hat kein `organization_id`. Gesamtes Ride-Subsystem außerhalb des Org-Modells. |
| `messages` | 2 | Kein `organization_id`. Verknüpft mit `bookings` (hat `organization_id`), aber Nachrichten sind mandantenübergreifend by design (Kunde↔Engel). |
| `notifications` | 137 | Kein `organization_id`. User-scoped, kein eindeutiger Org-Kontext. Einige über service_role erstellt. |

### 4.3 Bestehende Absicherung (kein akutes Risiko)

Die B2C-Tabellen haben funktionale RLS-Policies, die Benutzer-Isolation gewährleisten:
- `chat_messages`: Ride-Teilnahme-Check (SELECT/INSERT)
- `messages`: Sender/Receiver-Check (SELECT/INSERT/UPDATE)
- `notifications`: User-ID-Check (SELECT/INSERT/UPDATE)

Es besteht kein akutes Cross-Tenant-Risiko, da die Isolation über User-IDs statt Organisation stattfindet. Die Architektur erfordert mandantenübergreifende Kommunikation im Marketplace-Modell.

### 4.4 Empfohlene nächste Schritte

1. **Kurzfristig:** Bestehende Policies härten (explizite DENY für UPDATE/DELETE auf `chat_messages`)
2. **Mittelfristig:** `organization_id` (nullable) auf `messages` hinzufügen, befüllt aus `bookings.organization_id` — als Defense-in-Depth, nicht als alleinige Fence
3. **Langfristig:** Architekturentscheidung ob Ride-Subsystem (`krankenfahrten`, `chat_messages`) ins Org-Modell integriert wird

---

## 5. Dateien in diesem Branch

| Datei | Zweck |
|-------|-------|
| `audit/ORG_FENCE_ANALYSIS.md` | Detaillierte Bestandsaufnahme (Phase 1) |
| `audit/ORG_FENCE_REPORT.md` | Dieser Abschlussreport |
| `supabase/migrations/20260806100000_org_fence_mis_ai_conversations.sql` | Migration: Org-Fence für mis_ai_conversations |
| `supabase/migrations/20260806100001_rollback_org_fence_mis_ai_conversations.sql` | Rollback-Dokumentation |

---

## 6. Rollback-Plan

Falls die Migration Probleme verursacht:

```sql
-- 1) Policies entfernen
DROP POLICY IF EXISTS "mis_ai_conversations_org_fence" ON public.mis_ai_conversations;
DROP POLICY IF EXISTS "mis_ai_conversations_user_insert" ON public.mis_ai_conversations;
DROP POLICY IF EXISTS "mis_ai_conversations_user_update" ON public.mis_ai_conversations;
DROP POLICY IF EXISTS "mis_ai_conversations_user_delete" ON public.mis_ai_conversations;
DROP POLICY IF EXISTS "mis_ai_conversations_user_select" ON public.mis_ai_conversations;

-- 2) Index + Spalte entfernen
DROP INDEX IF EXISTS idx_mis_ai_conversations_org;
ALTER TABLE public.mis_ai_conversations DROP COLUMN IF EXISTS organization_id;
```

Erwartet: Rückkehr zum Ausgangszustand (nur `admin_select`-Policy).
