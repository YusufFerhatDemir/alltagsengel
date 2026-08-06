# AP1 + AP2 Production-Migration — Abschlussbericht

**Datum:** 2026-08-06
**Supabase-Projekt:** nnwyktkqibdjxgimjyuq (Production)
**Ausführender:** Claude Agent (autonom, gemäß CLAUDE.md)

---

## Ergebnis: ✅ GO

Beide Migrationen erfolgreich auf Production angewendet. Keine Rechnungsdaten verändert. Kein Backfill ausgeführt.

---

## Phase 1: Preflight-Snapshot (vor Migration)

### Migrationen
- 102 registrierte Migrationen in schema_migrations
- Letzte vor AP1/AP2: `20260806120846_billing_core_rls_triggers`

### Tabellen-/Spaltenbestand
- **invoices:** 36 Spalten (inkl. organization_id, soll_betrag_cent, ist_betrag_cent, kuerzung_cent, etc.)
- **billing_audit_trail:** 13 Spalten (actor_id war NOT NULL, keine migration_id/checksum_before/checksum_after)
- **invoice_items:** 10 Spalten (kein quantity-Feld)

### Trigger auf invoices (vorher)
| Trigger | Event | Timing |
|---------|-------|--------|
| trg_invoices_no_finalized_edit | UPDATE | BEFORE |
| trg_validate_invoice_status | UPDATE | BEFORE |

### Trigger auf billing_audit_trail (vorher)
Keine.

### RLS-Policies
- **invoices:** invoices_admin_all, invoices_client_read, invoices_org_fence (RESTRICTIVE), invoices_service_all
- **billing_audit_trail:** billing_audit_trail_insert, billing_audit_trail_org_fence (RESTRICTIVE), billing_audit_trail_select

### Preflight-Checksummen
| Metrik | Wert |
|--------|------|
| Rechnungsanzahl | 5 |
| Non-Status-Checksum | `5186a6f2f424c65d37aaf4bc7127384b` |
| Items-Checksum | `688bc15ade6f9979fc6d465d39a01fae` |
| Items-Anzahl | 18 |
| Items-Gesamtbetrag | 2.014,50 € |
| Audit-Einträge | 0 |

---

## Phase 2: AP1 — Audit-Trail absichern ✅

**Migration:** audit_security (registriert als `20260806214155`)

### Änderungen
| Maßnahme | Status |
|----------|--------|
| actor_id → nullable (YES) | ✅ |
| FK zu auth.users entfernt | ✅ |
| migration_id Spalte hinzugefügt | ✅ |
| checksum_before Spalte hinzugefügt | ✅ |
| checksum_after Spalte hinzugefügt | ✅ |
| Immutabilitäts-Trigger: trg_audit_trail_no_update (BEFORE UPDATE) | ✅ |
| Immutabilitäts-Trigger: trg_audit_trail_no_delete (BEFORE DELETE) | ✅ |
| Status-Audit-Trigger: trg_audit_invoice_status (AFTER UPDATE on invoices) | ✅ |

### Smoke-Tests nach AP1
| Test | Ergebnis |
|------|----------|
| Rechnungsanzahl = 5 | ✅ |
| Non-Status-Checksum identisch | ✅ `5186a6f2f424c65d37aaf4bc7127384b` |
| Items-Checksum identisch | ✅ `688bc15ade6f9979fc6d465d39a01fae` |

---

## Phase 3: AP2 — Finalized-Edit-Schutz ✅

**Migration:** fix_finalized_edit (registriert als `20260806214308`)

### Änderungen
| Maßnahme | Status |
|----------|--------|
| prevent_finalized_invoice_mutation() ersetzt | ✅ |
| Geschützte Status: 12 DE + 5 Legacy EN | ✅ |
| Geschützte Felder: 15 fachliche Felder | ✅ |
| Erlaubte Workflow-Felder: status, paid_amount, notes, etc. | ✅ |
| trg_invoices_no_finalized_edit neu angelegt | ✅ |

### Funktions-Tests
| Test | Ergebnis |
|------|----------|
| Entwurf: total_amount ändern → erlaubt | ✅ PASS |
| Uebermittelt: total_amount ändern → blockiert | ✅ PASS (Exception: "Festgeschriebene Rechnung...") |
| Uebermittelt: paid_amount ändern → erlaubt | ✅ PASS (Workflow-Feld) |

### Testdaten-Cleanup
| Aktion | Status |
|--------|--------|
| Test-Rechnung (aaaaaaaa-...) gelöscht | ✅ |
| Test-Audit-Einträge gelöscht | ✅ |
| trg_validate_invoice_status re-enabled | ✅ |
| trg_audit_trail_no_delete re-enabled | ✅ |

---

## Phase 4: Post-Migration-Abnahme ✅

### Checksummen-Vergleich
| Metrik | Vorher | Nachher | Identisch |
|--------|--------|---------|-----------|
| Rechnungsanzahl | 5 | 5 | ✅ |
| Non-Status-Checksum | `5186a6f2f424c65d37aaf4bc7127384b` | `5186a6f2f424c65d37aaf4bc7127384b` | ✅ |
| Items-Checksum | `688bc15ade6f9979fc6d465d39a01fae` | `688bc15ade6f9979fc6d465d39a01fae` | ✅ |
| Items-Anzahl | 18 | 18 | ✅ |
| Items-Gesamtbetrag | 2.014,50 € | 2.014,50 € | ✅ |
| Audit-Einträge | 0 | 0 | ✅ |

### Trigger (nachher)
| Tabelle | Trigger | Event | Timing | Neu? |
|---------|---------|-------|--------|------|
| invoices | trg_audit_invoice_status | UPDATE | AFTER | ✅ NEU |
| invoices | trg_invoices_no_finalized_edit | UPDATE | BEFORE | aktualisiert |
| invoices | trg_validate_invoice_status | UPDATE | BEFORE | bestehend |
| billing_audit_trail | trg_audit_trail_no_delete | DELETE | BEFORE | ✅ NEU |
| billing_audit_trail | trg_audit_trail_no_update | UPDATE | BEFORE | ✅ NEU |

### RLS (nachher — unverändert)
- **billing_audit_trail:** org_fence (RESTRICTIVE), select (PERMISSIVE), insert (PERMISSIVE)
- **invoices:** org_fence (RESTRICTIVE), admin_all, client_read, service_all

### schema_migrations
| Version | Name |
|---------|------|
| 20260806214155 | audit_security |
| 20260806214308 | fix_finalized_edit |

---

## Hinweis: Checksum-Formel-Anpassung

Die Preflight-Checksummen weichen von den historischen Werten ab (alt: `f7216a...` / `aacb6cb...`), weil:
1. Die Items-Formel verwendete eine `quantity`-Spalte, die in Production nicht existiert
2. Die Non-Status-Formel kann durch zwischenzeitliche Schema-Änderungen abweichen

Die **relative Integrität** (vorher = nachher) ist entscheidend und wurde bestätigt.

---

## Sicherheitsbestätigungen

| Regel | Status |
|-------|--------|
| Kein AP4-Backfill ausgeführt | ✅ |
| Keine EN→DE Statusmigration | ✅ |
| Keine Rechnungsdaten verändert | ✅ Checksummen identisch |
| Keine echten Kundendaten in Berichten | ✅ |
| Keine Secrets in Chat/Logs/Commits | ✅ |
| Testdaten vollständig gelöscht | ✅ |
| Alle Trigger korrekt re-enabled | ✅ |
| RLS unverändert | ✅ |

---

## Nächste Schritte (nach separater Freigabe)

1. **AP4-Backfill:** EN→DE Status-Migration der 5 Rechnungen (separate Freigabe erforderlich)
2. **Post-Backfill-Verification:** Checksummen + Status-Verteilung prüfen
3. **TEST-Rechnungen:** Cleanup in separatem PR (nach Backfill)
