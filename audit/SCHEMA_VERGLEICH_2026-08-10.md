# Schema-Vergleich — 2026-08-10

Branch: `staging/expansion-abnahme`
Supabase-MCP: **NICHT VERFÜGBAR** (kein direkter DB-Zugriff möglich)

---

## 1. Repo-Migrationen (107 Forward-Migrations)

Gesamt: 154 SQL-Dateien (107 Forward + 47 Rollbacks)

### Bekannt LIVE (applied auf Production)

Basierend auf vorherigem Audit (MIGRATION_STATUS_2026-08-10.md):

| Zeitraum | Module | Status |
|----------|--------|--------|
| 20250101 — 20260706 | Core, SEO, MIS, RLS, Billing-Basis, Bookings | LIVE |
| 20260719 | Bookings-Workflow, Eylem-Audit, Availability | LIVE |
| 20260730 — 20260731 | Verordnungen | LIVE |
| 20260801 | Phase-3 Multi-Mandant | LIVE |
| 20260802 — 20260804 | Baseline-Corrections, Documents, FK-Fixes | LIVE |

### Bekannt AUSSTEHEND (noch nicht auf Production applied)

| Migration | Modul | Risiko |
|-----------|-------|--------|
| 20260806100000 — 20260806600001 | Org-Fence, B2C-Hardening, Billing-Core | MITTEL |
| 20260807100000 — 20260807180000 | Tariff-Model, Draft-Atomic | MITTEL |
| 20260808100000 — 20260808220000 | Expansion, Einsatzplanung, Kassenabrechnung | HOCH |
| 20260809010000 — 20260809120000 | Dokumentenmanagement, Tourenplanung | NIEDRIG |
| 20260810010000 — 20260813010000 | Pflegedoku, Personal, Aufgaben, Workflow | NIEDRIG |
| 20260814010000 — 20260817040000 | Leistungsnachweis, RLS-Fixes, SECDEF | HOCH |
| 20260818010000 — 20260819020000 | SIS, Vitalwerte, Wunddoku, Coach, Billing-Fence | NIEDRIG |
| 20260820010000 — 20260821020000 | Medikamente, Angehörige, Signaturen | NIEDRIG |
| **20260822010000** | **mis_audit_log org_id (NEU)** | **P0** |
| **20260822020000** | **Billing-Policies is_admin() (NEU)** | **P1** |

### Zusammenfassung

- **~50 Migrationen LIVE** auf Production
- **~57 Migrationen AUSSTEHEND** (davon 2 NEU in dieser Session)
- Shadow-DB: **107/0 sauber** — alle Migrationen syntaktisch korrekt

---

## 2. Schema-Divergenz (ohne Live-Zugriff)

### Bekannte Divergenzen (aus Memory/Audit-History)

1. **profiles.deleted_at** — Soft-Delete-Migration gehärtet, aber Live-Apply offen
2. **profiles RLS 42P17** — Rekursionsbug über bookings; Migration 20260817040000 wartet
3. **SECDEF RPCs** — 6+ wf_*/next_billing_number stehen live offen für anon
4. **Buchungs-Workflow** — Migration 20260719 committet, Apply-Status unklar
5. **state_settings/expansion** — Migrationen 20260808* vorbereitet, NICHT auf Production

### Nicht-verifizierbar ohne Supabase-MCP

- Exakte Liste der applied Migrationen in `supabase_migrations.schema_migrations`
- Live-Tabellenliste vs. Repo-Tabellenliste
- Live-RLS-Policy-Status vs. Repo-Stand
- Live-Function-Signaturen vs. Repo-Stand

---

## 3. Empfehlung

1. **Supabase-MCP aktivieren** — ohne DB-Zugriff bleibt der Vergleich unvollständig
2. **Migrationen in Blöcken applyen** — Security-Fixes zuerst, dann Module
3. **Reihenfolge**: RLS-Fixes → SECDEF-Härtung → Expansion → Module
