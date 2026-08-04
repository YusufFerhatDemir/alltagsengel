-- ════════════════════════════════════════════════════════════════════
-- CLEANUP: Phantom ASCII-Varianten türkischer Policy-Namen
-- ════════════════════════════════════════════════════════════════════
--
-- Problem: Supabase MCP API degradiert UTF-8 in Policy-Namen zu ASCII.
-- core_tables_baseline erstellt z.B. "Admin bookingleri yönetebilir"
-- (mit ö=c3b6), aber die DB speichert "Admin bookingleri yonetebilir"
-- (mit o=6f). Die consolidation-Migration (20260803100000) droppt nur
-- die UTF-8-Variante — die ASCII-Phantom-Policy überlebt.
--
-- Diese Migration räumt alle ASCII-Varianten auf, die durch die
-- Encoding-Degradierung entstanden sein könnten.
--
-- Idempotent: DROP POLICY IF EXISTS ist ein No-Op wenn bereits weg.
-- ════════════════════════════════════════════════════════════════════

-- ── bookings ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin bookingleri yonetebilir"            ON public.bookings;
DROP POLICY IF EXISTS "Musteri booking olusturabilir"             ON public.bookings;
DROP POLICY IF EXISTS "Kullanici kendi bookinglerini okuyabilir"  ON public.bookings;
DROP POLICY IF EXISTS "Ilgili kisi bookingi guncelleyebilir"      ON public.bookings;

-- ── profiles ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Herkes profilleri okuyabilir"              ON public.profiles;
DROP POLICY IF EXISTS "Kullanici kendi profilini guncelleyebilir" ON public.profiles;
DROP POLICY IF EXISTS "Kullanici kendi profilini olusturabilir"   ON public.profiles;
DROP POLICY IF EXISTS "Admin profilleri yonetebilir"              ON public.profiles;

-- ── angels ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Herkes engelleri okuyabilir"               ON public.angels;
DROP POLICY IF EXISTS "Engel kendi profilini guncelleyebilir"     ON public.angels;
DROP POLICY IF EXISTS "Engel kendi profilini olusturabilir"       ON public.angels;
DROP POLICY IF EXISTS "Admin engelleri yonetebilir"               ON public.angels;

-- ── reviews ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Herkes reviewleri okuyabilir"              ON public.reviews;
DROP POLICY IF EXISTS "Musteri review yazabilir"                  ON public.reviews;
