# BEWEISBERICHT — 05.09.2026 (v2)
**Konsolidierter Nachweis für P11 WEITERARBEIT**
Projekte: Alltagsengel · ChairMatch · efy care

---

## 1. efy care — 14 anon-callable SECURITY DEFINER Funktionen

Ausgangslage: 56 anon-callable DEFINER-Funktionen. 42 Trigger-Funktionen per REVOKE PUBLIC EXECUTE bereinigt. Verbleibend: 14.

| # | Funktion | DEFINER | RLS-Refs | Risiko | Sicherung |
|---|---|---|---|---|---|
| 1 | actor_belongs_to_org(uuid) | Ja | 5 | NIEDRIG | auth.uid()→null=false |
| 2 | client_org_member(uuid) | Ja | 8 | NIEDRIG | auth.uid()→null=false |
| 3 | current_profile_role() | Ja | 0 | NIEDRIG | auth.uid()→null=null |
| 4 | is_caregiver_for_client(uuid) | Ja | 18 | NIEDRIG | auth.uid()+active-Check |
| 5 | is_caregiver_self(uuid) | Ja | 4 | NIEDRIG | auth.uid()+active-Check |
| 6 | is_client_self(uuid) | Ja | 22 | NIEDRIG | auth.uid()+active-Check |
| 7 | is_org_admin(uuid) | Ja | 4 | NIEDRIG | auth.uid()+role-Check |
| 8 | is_org_admin_roh(uuid) | Ja | 0 | NIEDRIG | auth.uid()→null=false |
| 9 | is_org_member(uuid) | Ja | 91 | NIEDRIG | auth.uid()+active-Check |
| 10 | is_org_member_roh(uuid) | Ja | 2 | NIEDRIG | auth.uid()→null=false |
| 11 | shares_org_with(uuid) | Ja | 2 | NIEDRIG | auth.uid()→null=false |
| 12 | single_membership_org() | Ja | 0 | NIEDRIG | auth.uid()→null=null |
| 13 | storage_beleg_gebunden(..) | Ja | 6 | NIEDRIG | Datei-Bindungsprüfung |
| 14 | storage_mimetype_ok(..) | Ja | 6 | NIEDRIG | MIME-Type-Validierung |

**Bewertung:** Alle 14 nutzen auth.uid() als Schutzbarriere. Alle haben search_path=public. 11/14 aktiv in RLS-Policies. Keine weitere Reduktion möglich. **✅ VERIFIZIERT**

---

## 2. PITR + MFA — Alle Projekte

| Check | AE | CM | efy | Status |
|---|---|---|---|---|
| archive_mode | on | on | on | ✅ SQL-bestätigt |
| wal_level | logical | logical | logical | ✅ SQL-bestätigt |
| Tägliche Backups | ✅ | ✅ | ✅ | ✅ Standard |
| PITR Add-on | ? | ? | ? | ⛔ Dashboard nötig |
| MFA | — | — | — | ⛔ Dashboard nötig |

**⛔ BLOCKIERT** — Dashboard-Login erforderlich.

---

## 3. efy care — Production Proof

| Prüfpunkt | Ergebnis | Status |
|---|---|---|
| DB Health | ACTIVE_HEALTHY (PostgreSQL 17.6.1.141) | ✅ |
| API-Erreichbarkeit | REST + Auth Endpoints antworten | ✅ |
| Edge Functions | 4 deployed + funktional | ✅ |
| Git-Sync | local HEAD = origin/main | ✅ |
| Auth-Infrastruktur | Konfiguriert, aber 0 Benutzer | 🟡 |
| EAS Production Build | Config vorhanden, Build-History unbekannt | 🟡 |
| E2E Auth-Roundtrip | Nie produktiv durchlaufen | 🟡 |

**🟡 NICHT PRODUCTION READY** — Build + Auth-Roundtrip ausstehend.

---

## 4. Host Health — SSD-Bereinigung

| Metrik | Wert |
|---|---|
| Vorher | 17.3 GB frei |
| Nachher | 18.3 GB frei |
| Gewonnen | +1.0 GB |
| Ziel | 30 GB |
| Delta zum Ziel | -11.7 GB |

**🟡 TEILWEISE** — 30 GB nicht erreichbar ohne Löschung essentieller Daten.

---

## 5. Gesamtstatus

| Aufgabe | Evidenz-Status |
|---|---|
| CM FORCE RLS 80/81 (spatial_ref_sys) | ✅ VERIFIZIERT |
| efy 14 anon-callable Funktionen | ✅ VERIFIZIERT |
| efy REVOKE 42 Trigger-Funktionen | ✅ VERIFIZIERT |
| CM Rate Limiting | ✅ VERIFIZIERT |
| AE Test-Bookings Cleanup | ✅ VERIFIZIERT |
| PITR + MFA | ⛔ BLOCKIERT |
| efy care Production Proof | 🟡 NICHT VERIFIZIERT |
| Host Health SSD | 🟡 TEILWEISE |

**Fazit:** 5/8 vollständig verifiziert. 1 blockiert. 2 teilweise. Keine Behauptung "alles fertig".

---
*Erstellt: 05.09.2026 | BEWEISPFLICHT aktiv*
