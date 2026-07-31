# Phase 3: Multi-Mandant SaaS-Architektur

Stand: 01.08.2026 · Bauplan: [BAUPLAN_ABRECHNUNGSPLATTFORM.md](./BAUPLAN_ABRECHNUNGSPLATTFORM.md) Abschnitt 4

## Was gebaut wurde

### 1. Datenmodell (`supabase/migrations/20260801_phase3_multi_mandant_saas.sql`)

| Objekt | Zweck |
|---|---|
| `organizations` | Mandanten (name, ik_nummer mit Format-Check, address JSONB, bundesland, settings JSONB, billing_plan, status, onboarding_step) |
| `organization_members` | User↔Org (role: owner/admin/staff), bestehende Plattform-Admins werden automatisch Owner der Stamm-Org |
| `organization_subscriptions` | Billing (plan, stripe_customer_id, stripe_subscription_id, current_period_start/end, features JSONB) |
| `current_org_id()` | Aktive Org: JWT `app_metadata.org_id` → Membership-Lookup → Stamm-Org-Fallback |
| `is_org_member()`, `has_org_role()` | RLS-/API-Guards |
| `organization_id`-Spalte | Auf **63 mandantenfähigen Tabellen** (Betriebssystem-Kern, Finanzen/Abrechnung, MIS) — Backfill auf Stamm-Org, Default `current_org_id()` |
| RLS-Fence | Je Tabelle eine **RESTRICTIVE**-Policy `organization_id = current_org_id()` — schneidet alle bestehenden permissiven Policies (inkl. `is_admin()`) auf die aktive Org zu |

**Stamm-Org Alltagsengel** hat die feste UUID `00000000-0000-4000-8000-000460629986` (kodiert IK 460629986), Konstante `DEFAULT_ORG_ID` in `lib/organizations/types.ts`.

**Warum nichts bricht:** `current_org_id()` fällt für Nutzer ohne Org-Kontext (Kunden, Engel, anon) auf die Stamm-Org zurück; alle Bestandsdaten liegen per Backfill in der Stamm-Org → jede bestehende Query verhält sich identisch. `service_role` hat BYPASSRLS → alle Server-API-Routen laufen unverändert.

### 2. Code

| Datei | Inhalt |
|---|---|
| `lib/organizations/types.ts` | Typen, `DEFAULT_ORG_ID`, `ACTIVE_ORG_COOKIE`, Tarif-Feature-Matrix (Bauplan 7.1) |
| `lib/organizations/ik.ts` | IK-Prüfziffern-Validierung (Luhn über Stellen 3–8, verifiziert gegen IK 460629986) |
| `lib/organizations/server.ts` | `getActiveOrgId()`, `getUserOrganizations()`, `requireOrgRole()` |
| `app/api/organizations/route.ts` | GET (meine Orgs + aktive), POST (Org anlegen: IK-Validierung, Owner-Membership, Free-Subscription, Org-Kontext in JWT+Cookie) |
| `app/api/organizations/switch/route.ts` | Org-Wechsel: Membership-Check → Cookie + `app_metadata.org_id` |
| `app/api/organizations/zertifikat/route.ts` | ITSG-Zertifikat-Upload je Org (Onboarding Schritt 3, IK-Abgleich Zertifikat↔Org) |
| `components/OrgSwitcher.tsx` | Dropdown im Admin-Sidebar (degradiert bei 1 Org auf statisches Label) |
| `app/admin/layout.tsx` | OrgSwitcher eingebunden |
| `app/onboarding/page.tsx` | 4-Schritte-Flow: Konto → Organisation & IK → ITSG-Zertifikat → Erste Verordnung (noindex) |

## ⚠️ Noch offen / Kontrakte

1. **Migration ist committet, aber NICHT auf der Live-DB angewendet** (in dieser Session war kein Supabase-MCP/DB-Zugang verfügbar — gleiches Muster wie `20260719_booking_request_workflow.sql`). Bis zum Apply degradiert die UI sauber: Switcher zeigt statisch „Alltagsengel", `getActiveOrgId()` liefert die Stamm-Org, Onboarding-POST liefert eine klare Fehlermeldung. **Apply via Supabase-MCP-Session oder SQL-Editor, danach Verifikations-Queries am Ende der Migrationsdatei ausführen.**
2. **Server-Kontrakt:** Serverseitige Queries (Service-Role, BYPASSRLS) müssen für org-bewusste Features `organization_id` explizit über `getActiveOrgId()` setzen/filtern. Bestehende Admin-Seiten sind bis dahin faktisch Stamm-Org-only — korrekt, solange nur Alltagsengel sie nutzt; bei SaaS-Mandanten-Features Query für Query nachziehen.
3. **Stripe:** Tabellen sind Stripe-ready (customer/subscription-IDs, Perioden, Features); Checkout + Webhook-Handler sind Phase-3-Folgearbeit.
4. **Onboarding Schritt 6 (Test-Automation Annahmestellen)** laut Bauplan W11 — noch nicht gebaut.
5. Separates SaaS-Supabase-Projekt (Bauplan 4.1) bewusst zurückgestellt — auf Wunsch wurde im Bestandsprojekt `nnwyktkqibdjxgimjyuq` gebaut; die Architektur (org_id überall + RLS-Fence) ist projektneutral und später 1:1 umziehbar.
