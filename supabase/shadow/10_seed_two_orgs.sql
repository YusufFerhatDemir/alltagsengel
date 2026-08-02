-- ════════════════════════════════════════════════════════════════════
-- SHADOW-SEED: zwei Mandanten (Org A / Org B) — NUR für Testdatenbanken
-- ════════════════════════════════════════════════════════════════════
--
-- Enthält ausschließlich erfundene Testdaten. Keine Produktivdaten,
-- keine echten Namen, Adressen, IKs oder Versichertennummern.
--
-- Baut den kleinsten Datensatz, mit dem sich Mandantentrennung prüfen
-- lässt: je Organisation ein Admin, ein Kunde, ein Engel, ein Klient,
-- ein Leistungsnachweis und eine Rechnung.
--
-- Feste UUIDs, damit 20_tenant_tests.sql ohne Lookups darauf zeigen kann.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Organisationen ───────────────────────────────────────────────────
INSERT INTO public.organizations (id, name)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Testorg A'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Testorg B')
ON CONFLICT (id) DO NOTHING;

-- ── auth.users (in der Shadow-DB von 00_supabase_bootstrap.sql) ──────
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-0000000000a1', 'admin-a@shadow.test'),
  ('a0000000-0000-4000-8000-0000000000a2', 'kunde-a@shadow.test'),
  ('b0000000-0000-4000-8000-0000000000b1', 'admin-b@shadow.test'),
  ('b0000000-0000-4000-8000-0000000000b2', 'kunde-b@shadow.test')
ON CONFLICT (id) DO NOTHING;

-- ── Profile ──────────────────────────────────────────────────────────
INSERT INTO public.profiles (id, role, first_name, last_name, email) VALUES
  ('a0000000-0000-4000-8000-0000000000a1', 'admin', 'Anna',  'AdminA', 'admin-a@shadow.test'),
  ('a0000000-0000-4000-8000-0000000000a2', 'kunde', 'Karl',  'KundeA', 'kunde-a@shadow.test'),
  ('b0000000-0000-4000-8000-0000000000b1', 'admin', 'Bernd', 'AdminB', 'admin-b@shadow.test'),
  ('b0000000-0000-4000-8000-0000000000b2', 'kunde', 'Bea',   'KundeB', 'kunde-b@shadow.test')
-- DO UPDATE, nicht DO NOTHING: der handle_new_user-Trigger aus
-- initial-setup.sql legt beim auth.users-INSERT oben bereits ein Profil
-- mit role='kunde' an. Ohne UPDATE bliebe Anna/Bernd ohne Adminrolle und
-- alle is_admin()-Tests wären falsch-negativ.
ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role,
      first_name = EXCLUDED.first_name,
      last_name  = EXCLUDED.last_name,
      email      = EXCLUDED.email;

-- ── Mitgliedschaften — steuern current_org_id() ──────────────────────
-- Rollen laut CHECK-Constraint: owner | admin | staff
INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a2', 'staff'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-0000000000b1', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-0000000000b2', 'staff')
ON CONFLICT DO NOTHING;

-- ── Klienten je Organisation ─────────────────────────────────────────
INSERT INTO public.clients
  (id, organization_id, user_id, customer_number, first_name, last_name, zip_code, care_level)
VALUES
  ('c1a00000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-0000000000a2', 'A-1001', 'Klient', 'EinsA', '60311', 2),
  ('c2a00000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001',
   NULL, 'A-1002', 'Klient', 'ZweiA', '60313', 3),
  ('c1b00000-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002',
   'b0000000-0000-4000-8000-0000000000b2', 'B-2001', 'Klient', 'EinsB', '65183', 1)
ON CONFLICT (id) DO NOTHING;

-- ── Engel (caregivers) ───────────────────────────────────────────────
INSERT INTO public.caregivers
  (id, organization_id, user_id, first_name, last_name, initials, status)
VALUES
  ('e1a00000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   NULL, 'Engel', 'EinsA', 'EEA', 'active'),
  ('e1b00000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002',
   NULL, 'Engel', 'EinsB', 'EEB', 'active')
ON CONFLICT (id) DO NOTHING;

-- ── Leistungsnachweise ───────────────────────────────────────────────
INSERT INTO public.service_records
  (id, organization_id, client_id, caregiver_id, date, start_time, end_time,
   service_type, budget_type, caregiver_initials, status)
VALUES
  ('51a00000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'c1a00000-0000-4000-8000-000000000001', 'e1a00000-0000-4000-8000-000000000001',
   DATE '2026-07-01', TIME '09:00', TIME '11:00',
   'alltagsbegleitung', 'entlastung', 'EEA', 'draft'),
  ('51b00000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002',
   'c1b00000-0000-4000-8000-000000000003', 'e1b00000-0000-4000-8000-000000000002',
   DATE '2026-07-02', TIME '10:00', TIME '12:00',
   'alltagsbegleitung', 'entlastung', 'EEB', 'draft')
ON CONFLICT (id) DO NOTHING;

-- ── Rechnungen ───────────────────────────────────────────────────────
INSERT INTO public.invoices
  (id, organization_id, client_id, invoice_number,
   period_start, period_end, total_amount, status)
VALUES
  ('91a00000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'c1a00000-0000-4000-8000-000000000001', 'RE-A-0001',
   DATE '2026-07-01', DATE '2026-07-31', 250.00, 'draft'),
  ('91b00000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002',
   'c1b00000-0000-4000-8000-000000000003', 'RE-B-0001',
   DATE '2026-07-01', DATE '2026-07-31', 180.00, 'draft')
ON CONFLICT (id) DO NOTHING;

-- ── Storage: ein privater Bucket + je Org ein Objekt ─────────────────
INSERT INTO storage.buckets (id, name, public) VALUES
  ('shadow-documents', 'shadow-documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('shadow-documents', 'aaaaaaaa-0000-4000-8000-000000000001/vertrag-a.pdf',
   'a0000000-0000-4000-8000-0000000000a1'),
  ('shadow-documents', 'bbbbbbbb-0000-4000-8000-000000000002/vertrag-b.pdf',
   'b0000000-0000-4000-8000-0000000000b1')
ON CONFLICT (bucket_id, name) DO NOTHING;

COMMIT;
