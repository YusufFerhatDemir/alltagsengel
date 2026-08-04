# P0.2 / DSGVO: Alle auth.users Foreign Keys — Audit-Report

**Datum:** 2026-08-04  
**Branch:** `fix/dsgvo-all-auth-user-fks`  
**Autor:** Automatisierter Audit (Claude Agent)  
**Status:** BEREIT FÜR REVIEW

---

## 1. Zusammenfassung

6 Foreign Keys in `public.*`-Tabellen referenzierten `auth.users(id)` mit `ON DELETE NO ACTION` und blockierten dadurch die DSGVO-konforme Benutzerlöschung (Art. 17 DSGVO — Recht auf Löschung).

- **PR #29** behandelt `mis_auth_log_user_id_fkey` separat (noch nicht gemergt)
- **Dieser PR** behandelt die verbleibenden **5 FKs**

Nach Anwendung beider Migrationen gibt es **0 blockierende FKs** auf `auth.users`.

---

## 2. Entscheidungsmatrix

| FK-Name | Tabelle | Spalte | Vorher | Nachher | Nullable vorher? | Begründung |
|---|---|---|---|---|---|---|
| `caregivers_user_id_fkey` | caregivers | user_id | NO ACTION | **SET NULL** | JA | Mitarbeiterdaten (Qualifikationen, IK-Nr, Einsatzhistorie) müssen für Betriebsfortführung und Abrechnungsnachweise erhalten bleiben |
| `clients_user_id_fkey` | clients | user_id | NO ACTION | **SET NULL** | JA | Kundendaten (Pflegegrad, Versicherung, Kundennummer) unterliegen Aufbewahrungspflichten (§630f BGB, HGB §257) |
| `chat_messages_sender_id_fkey` | chat_messages | sender_id | NO ACTION | **SET NULL** | NEIN → JA | Nachrichten gehören zu Fahrten und können für Streitfälle relevant sein. Sender wird anonymisiert, Nachricht bleibt |
| `app_settings_updated_by_fkey` | app_settings | updated_by | NO ACTION | **SET NULL** | JA | App-Konfiguration muss bestehen bleiben. "Wer hat zuletzt geändert" ist nice-to-have |
| `kf_pricing_audit_actor_id_fkey` | kf_pricing_audit | actor_id | NO ACTION | **SET NULL** | JA | Preisänderungs-Audit-Trail muss für Compliance erhalten bleiben. Actor-Referenz kann anonymisiert werden |

### Warum überall SET NULL (kein CASCADE)?

Alle 5 Tabellen enthalten entweder Geschäftsdaten (caregivers, clients), Kommunikationshistorie (chat_messages), Konfiguration (app_settings) oder Audit-Trail (kf_pricing_audit). Ein CASCADE-Delete würde geschäftskritische Daten vernichten. SET NULL entfernt den Personenbezug DSGVO-konform, ohne die Datensätze zu zerstören.

---

## 3. Migration

**Datei:** `supabase/migrations/20260804300000_fix_all_auth_user_fks.sql`

Inhalt:
- 5× DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT mit ON DELETE SET NULL
- 1× DO-Block für chat_messages.sender_id DROP NOT NULL (idempotent)
- Keine RLS/Policy-Änderungen
- Keine Trigger-Änderungen
- mis_auth_log ist NICHT enthalten (PR #29)

---

## 4. Rollback

**Datei:** `audit/rollback/ROLLBACK_ALL_AUTH_USER_FKS.sql`

Stellt alle 5 FKs auf ON DELETE NO ACTION zurück. chat_messages.sender_id wird nur dann wieder NOT NULL gesetzt, wenn keine NULL-Werte existieren (safe guard).

---

## 5. Preview-Branch-Testergebnisse

| Test | Ergebnis |
|---|---|
| Preview-Branch erstellt | ✅ PASS |
| PR #29 Migration (mis_auth_log) angewendet | ✅ PASS |
| Diese Migration angewendet | ✅ PASS |
| FK-Status: 0 NO ACTION FKs übrig | ✅ PASS |
| Testnutzer A + B erstellt | ✅ PASS |
| Datensätze in allen 6 Tabellen für A und B | ✅ PASS |
| **Nutzer A gelöscht (DELETE FROM auth.users)** | **✅ PASS — kein FK-Fehler** |
| A-Referenzen in SET NULL-Tabellen: user_id = NULL | ✅ PASS (alle 6 Tabellen) |
| A-Datensätze noch vorhanden (anonymisiert) | ✅ PASS (alle 6 Tabellen) |
| B-Datensätze unverändert | ✅ PASS (alle 6 Tabellen) |
| Idempotenz: Migration erneut angewendet | ✅ PASS |
| Rollback angewendet: alle FKs zurück auf NO ACTION | ✅ PASS |
| Re-apply nach Rollback: alle FKs wieder SET NULL | ✅ PASS |
| Preview-Branch gelöscht | ✅ PASS |

### Löschtest-Beweise

**Vorher (alle = 1):**
```
caregivers_A=1, clients_A=1, chat_messages_A=1,
app_settings_A=1, kf_pricing_audit_A=1, mis_auth_log_A=1
```

**DELETE FROM auth.users WHERE id = User_A → Erfolgreich**

**Nachher:**
```
A-Referenzen = 0 (SET NULL hat gegriffen)
A-Datensätze existieren noch (anonymisiert mit NULL)
B-Datensätze = alle unverändert (1)
```

---

## 6. Unit-Tests

**Datei:** `__tests__/dsgvo-all-auth-user-fks.test.ts`  
**Ergebnis:** 19/19 Tests bestanden

---

## 7. Risikoanalyse

### Was kann schiefgehen?

| Risiko | Eintrittswahrscheinlichkeit | Auswirkung | Mitigation |
|---|---|---|---|
| App-Code erwartet NOT NULL für chat_messages.sender_id | Niedrig (0 Nachrichten in Produktion) | UI zeigt "Unbekannt" statt Absender | Code-Review: sender_id null-safe machen |
| Caregiver/Client ohne user_id kann sich nicht anmelden | Kein Risiko | user_id ist Login-Verknüpfung, nicht Primärschlüssel | Gelöschter User kann sich sowieso nicht anmelden |
| Abrechnung braucht caregiver.user_id | Niedrig | Abrechnung nutzt caregiver.id, nicht user_id | Bestehende Abrechnungslogik prüfen |
| Rollback nach Produktions-Löschungen | Mittel | NOT NULL Constraint auf sender_id kann nicht wiederhergestellt werden wenn NULLs existieren | Rollback-SQL hat safe guard |

### Auswirkungen auf account-hard-delete

Die Edge Function `account-hard-delete` löscht chat_messages explizit per `DELETE FROM chat_messages WHERE sender_id = userId`. Nach dieser Migration ist das weiterhin korrekt — die Nachrichten werden gelöscht bevor auth.users.delete aufgerufen wird. Für caregivers, clients, app_settings und kf_pricing_audit ist keine explizite Löschung nötig, da SET NULL automatisch greift.

### Auswirkungen auf Pflegedokumentation

Keine. Pflegedaten (clients, caregivers) bleiben vollständig erhalten. Nur die Verknüpfung zum Auth-User wird entfernt. Kundennummer, Pflegegrad, Versicherungsdaten etc. bleiben intakt.

---

## 8. Merge-Reihenfolge

**Empfehlung: PR #29 zuerst, dann diesen PR.**

Beide PRs sind unabhängig voneinander (behandeln verschiedene FKs). Die Reihenfolge ist technisch egal, aber logisch sinnvoll:

1. PR #29 mergen → `mis_auth_log_user_id_fkey` → SET NULL
2. Diesen PR mergen → 5 weitere FKs → SET NULL
3. Auf Produktion: Migrations laufen in Timestamp-Reihenfolge automatisch

Alternativ können beide gleichzeitig gemergt werden — es gibt keine Konflikte.

---

## 9. GO / NO-GO

### GO-Kriterien

- [x] Alle 5 FKs auf SET NULL geändert
- [x] chat_messages.sender_id NULLABLE gemacht
- [x] Migration idempotent
- [x] Rollback vorhanden und getestet
- [x] Löschtest auf Preview erfolgreich
- [x] Nutzer B unverändert nach Löschung von A
- [x] 19/19 Unit-Tests bestanden
- [x] Keine RLS/Policy/Trigger-Änderungen
- [x] account-hard-delete kompatibel

### Empfehlung: **GO** ✅

Die Migration ist sicher, idempotent, rollback-fähig und auf dem Preview-Branch vollständig getestet. Nach Merge beider PRs (#29 + dieser) blockiert kein FK mehr die DSGVO-konforme Benutzerlöschung.
