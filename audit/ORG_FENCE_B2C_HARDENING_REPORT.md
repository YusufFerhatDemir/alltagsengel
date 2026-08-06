# B2C RLS-Härtung — Audit Report

**Datum:** 2026-08-06  
**PR:** #34 (`feature/org-fence-chat-messages-notifications`)  
**Bewertung:** **GO**

---

## 1. Geprüfte Tabellen

| Tabelle | Beziehungsquelle | RLS aktiv |
|---|---|---|
| `chat_messages` | `ride_id` → `krankenfahrten` (customer_id, provider_id via krankenfahrt_providers) | ✅ |
| `messages` | `booking_id` → `bookings` (customer_id, angel_id) | ✅ |
| `notifications` | `user_id` (direkt) | ✅ |

## 2. Policy-Matrix VORHER

| Tabelle | Policy | Cmd | Rollen | Schwachstelle |
|---|---|---|---|---|
| chat_messages | Users can read their ride messages | SELECT | public | Rolle zu weit (public statt authenticated) |
| chat_messages | Users can send messages to their rides | INSERT | public | Rolle zu weit |
| messages | Users can view own messages | SELECT | public | Rolle zu weit |
| messages | Users can send messages | INSERT | public | **KRITISCH: Keine Buchungs-Validierung — beliebige booking_id/receiver_id möglich** |
| messages | Receiver can mark as read | UPDATE | public | **KRITISCH: Kein WITH CHECK — Empfänger kann jedes Feld ändern (content, sender_id, booking_id)** |
| notifications | Users can view own notifications | SELECT | public | Rolle zu weit |
| notifications | Users can insert own notifications | INSERT | authenticated | OK |
| notifications | Users can update own notifications | UPDATE | public | **MITTEL: User kann type, title, body, data, link, email_sent ändern** |

**Vorher: 8 Policies, 0 Trigger, 3 kritische Schwachstellen**

## 3. Policy-Matrix NACHHER

| Tabelle | Policy | Cmd | Rollen | Schutz |
|---|---|---|---|---|
| chat_messages | chat_messages_select_ride_participant | SELECT | authenticated | Fahrt-Teilnehmer + Soft-Delete-Check |
| chat_messages | chat_messages_insert_ride_participant | INSERT | authenticated | sender_id = auth.uid() + Fahrt-Validierung |
| messages | messages_select_sender_or_receiver | SELECT | authenticated | Sender/Empfänger + Soft-Delete |
| messages | messages_insert_booking_participant | INSERT | authenticated | sender_id = auth.uid() + Buchungs-Validierung + Receiver-Validierung |
| messages | messages_update_receiver_read_only | UPDATE | authenticated | USING + WITH CHECK: receiver_id = auth.uid() |
| notifications | notifications_select_own | SELECT | authenticated | user_id = auth.uid() + Soft-Delete |
| notifications | notifications_insert_own | INSERT | authenticated | user_id = auth.uid() |
| notifications | notifications_update_own | UPDATE | authenticated | USING + WITH CHECK: user_id = auth.uid() |

**Nachher: 8 Policies, 2 Trigger**

### Trigger (Feld-Tampering-Schutz)

| Trigger | Tabelle | Geschützte Felder |
|---|---|---|
| trg_prevent_messages_tampering | messages | sender_id, receiver_id, booking_id, content |
| trg_prevent_notifications_tampering | notifications | user_id, type, title, body, data, link |

## 4. Cross-User-Testmatrix

| # | Test | Ergebnis |
|---|---|---|
| T1 | Kunde A liest eigene Fahrt-Nachrichten | ✅ PASS |
| T2 | Kunde B sieht NICHT Fahrt von Kunde A | ✅ PASS |
| T3 | Kunde B INSERT in fremde Fahrt → blockiert | ✅ PASS |
| T4 | Sender-Spoofing chat_messages → blockiert | ✅ PASS |
| T5 | chat_messages UPDATE → blockiert (keine Policy) | ✅ PASS |
| T6 | chat_messages DELETE → blockiert (keine Policy) | ✅ PASS |
| T7 | Kunde A liest eigene Buchungs-Nachrichten (Sender) | ✅ PASS |
| T8 | Engel A liest eigene Buchungs-Nachrichten (Empfänger) | ✅ PASS |
| T9 | Kunde B sieht NICHT Nachrichten von Buchung A | ✅ PASS |
| T10 | Kunde A INSERT mit korrekter Buchung → erlaubt | ✅ PASS |
| T11 | Sender-Spoofing messages → blockiert | ✅ PASS |
| T12 | Receiver-Spoofing (Engel B als Empfänger in Buchung A) → blockiert | ✅ PASS |
| T13 | Fremde booking_id → blockiert | ✅ PASS |
| T14 | Empfänger setzt read-Flag → erlaubt | ✅ PASS |
| T15 | Sender kann NICHT updaten → blockiert | ✅ PASS |
| T16 | content-Tampering via UPDATE → Trigger blockiert | ✅ PASS |
| T17 | sender_id-Tampering via UPDATE → Trigger blockiert | ✅ PASS |
| T18 | booking_id-Tampering via UPDATE → Trigger blockiert | ✅ PASS |
| T19 | messages DELETE → blockiert | ✅ PASS |

## 5. Cross-Org-Testmatrix

| # | Test | Ergebnis |
|---|---|---|
| T31 | Engel A (Org Alpha) sieht NICHT Messages von Buchung B (Org Beta) | ✅ PASS |
| T32 | Engel A sieht NICHT Notifications von Engel B (Org Beta) | ✅ PASS |

## 6. Notifications-Sicherheitstests

| # | Test | Ergebnis |
|---|---|---|
| T21 | Eigene Notifications lesen → erlaubt | ✅ PASS |
| T22 | Fremde Notifications lesen → 0 Zeilen | ✅ PASS |
| T23 | INSERT mit fremder user_id → blockiert | ✅ PASS |
| T24 | is_read setzen (eigene) → erlaubt | ✅ PASS |
| T25 | title-Tampering → Trigger blockiert | ✅ PASS |
| T26 | body-Tampering → Trigger blockiert | ✅ PASS |
| T27 | data-Tampering → Trigger blockiert | ✅ PASS |
| T28 | Fremder Notification-Update → 0 affected rows | ✅ PASS |
| T29 | Notification DELETE → blockiert | ✅ PASS |

## 7. Anonymer Zugriff

| # | Test | Ergebnis |
|---|---|---|
| T30a | anon SELECT chat_messages → 0 Zeilen | ✅ PASS |
| T30b | anon SELECT messages → 0 Zeilen | ✅ PASS |
| T30c | anon SELECT notifications → 0 Zeilen | ✅ PASS |

## 8. Rollback-Verifikation

| Schritt | Ergebnis |
|---|---|
| Rollback-Migration angewendet | ✅ Originale 8 Policies wiederhergestellt, Trigger entfernt |
| Hardened Policies erneut angewendet | ✅ Finaler Zustand korrekt |

## 9. Testdatenbereinigung

| Kategorie | Gelöscht | Verbleibend |
|---|---|---|
| auth.users | 6 | 0 |
| profiles | 6 | 0 |
| organizations | 2 | 0 |
| organization_members | 4 | 0 |
| bookings | 2 | 0 |
| krankenfahrten | 1 | 0 |
| krankenfahrt_providers | 1 | 0 |
| chat_messages | 1 | 0 |
| messages | 3 | 0 |
| notifications | 4 | 0 |

## 10. Realtime-Bewertung

- `chat_messages`: Realtime-Subscriptions filtern über `ride_id`. RLS greift auch bei Realtime (Supabase filtert INSERT-Events über SELECT-Policy). **Sicher.**
- `messages`: Realtime-Subscriptions filtern über `booking_id`. SELECT-Policy prüft sender_id/receiver_id. **Sicher.**
- `notifications`: Kein Realtime (Polling alle 15s). **Nicht betroffen.**

## 11. REST/PostgREST-Bewertung

Direkter PostgREST-SELECT mit fremdem user_id-Filter liefert 0 Zeilen, da RLS auf DB-Ebene filtert. Kein Umgehen möglich.

## 12. Geänderte Dateien

| Datei | Änderung |
|---|---|
| `supabase/migrations/20260806120000_harden_b2c_rls_policies.sql` | Neue Migration: 8 gehärtete Policies + 2 Trigger |
| `supabase/migrations/20260806120001_rollback_harden_b2c_rls_policies.sql` | Rollback-Migration |
| `__tests__/security/b2c-rls-hardening.test.ts` | Testprotokoll (32 Tests) |
| `audit/ORG_FENCE_B2C_HARDENING_REPORT.md` | Dieser Report |

## 13. Verbleibende Risiken

1. **notifications INSERT via Client**: Authentifizierte User können eigene Notifications erstellen. Risiko gering (nur eigene Daten), aber unnötige Angriffsfläche. Empfehlung: Langfristig auf service_role-only umstellen.
2. **notifications email_sent**: User kann `email_sent` auf eigenen Notifications ändern. Der Trigger schützt alle anderen Felder. `email_sent` wird nicht blockiert, da der `/api/notify`-Route (user-scoped) dies benötigt.
3. **chat_messages sender_id nullable**: Kein FK auf profiles. WITH CHECK erzwingt `sender_id = auth.uid()`, daher kein praktisches Risiko. Empfehlung: Langfristig NOT NULL + FK hinzufügen.

## 14. Empfehlung

**GO** — Alle 32 Staging-Tests bestanden. Die drei kritischen Schwachstellen (messages INSERT ohne Buchungs-Check, messages UPDATE ohne WITH CHECK, notifications UPDATE zu offen) sind behoben. Rollback verifiziert.
