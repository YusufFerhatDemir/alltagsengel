-- ═══════════════════════════════════════════════════════════════════════════
-- is_internal_staff(): die Rolle `buero` entfernen
--
-- BEFUND (npm run audit:rls-rollen, Pruefung F1, 31.08.2026)
--
-- Drei Stellen fuehren unabhaengig voneinander eine Rollenliste:
--
--   1. der CHECK auf profiles.role
--        kunde, engel, fahrer, angehoerige, pdl, qm, buchhaltung,
--        admin, superadmin
--   2. public.is_internal_staff()
--        admin, superadmin, pdl, buero          ← buero
--   3. ROLLEN_MATRIX in lib/auth/rollen.ts
--        superadmin, admin, pdl, qm, buchhaltung, engel, fahrer, kunde,
--        angehoerige
--
-- `buero` steht NUR in (2). Der CHECK laesst den Wert nicht zu, die
-- Anwendung kennt ihn nicht, und live traegt kein Konto ihn (geprueft:
-- 0 Zeilen). Heute ist der Eintrag also wirkungslos.
--
-- ── WARUM ER TROTZDEM WEG MUSS ────────────────────────────────────────────
--
-- Er ist eine gestellte Falle. Wer den CHECK eines Tages um eine
-- Bueroverwaltung erweitert — ein voellig naheliegender Schritt —, gibt
-- dieser Rolle in DERSELBEN Minute Zugriff auf alles, was hinter
-- is_internal_staff() liegt: unter anderem die Verordnungen
-- (verordnungen_staff_read). Und zwar ohne einen einzigen Eintrag in
-- ROLLEN_MATRIX, also vorbei an dem Ort, an dem Berechtigungen sonst
-- entschieden werden. Der Fehler entstuende an einer Stelle (CHECK) und
-- wirkte an einer ganz anderen (RLS), Monate spaeter, ohne Zusammenhang
-- im Diff.
--
-- Eine Rolle, die es nicht geben kann, gehoert nicht in eine
-- Vertrauensliste. Soll `buero` spaeter wirklich kommen, ist der richtige
-- Weg: in den CHECK, in ROLLEN_MATRIX, und DANN — als bewusste
-- Entscheidung — hierher.
--
-- ── WAS SICH DADURCH AENDERT ──────────────────────────────────────────────
--
-- Fuer den laufenden Betrieb: nichts. Kein Konto traegt `buero`, also
-- aendert sich keine einzige Zeilensichtbarkeit. Die Migration nimmt
-- ausschliesslich zukuenftiges Risiko heraus.
--
-- ── ANWENDEN ──────────────────────────────────────────────────────────────
-- Im Supabase-SQL-Editor als `postgres`. Ueber den Dienstschluessel
-- scheitert CREATE OR REPLACE FUNCTION am Eigentuemer (42501).
-- Danach `npm run audit:rls-rollen` — F1 muss verschwinden.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_internal_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      -- Die Liste deckt sich mit dem CHECK auf profiles.role UND mit
      -- ROLLEN_MATRIX. Wer sie erweitert, erweitert damit den Zugriff auf
      -- jede Tabelle mit einer is_internal_staff()-Policy — das ist eine
      -- Berechtigungsentscheidung und gehoert zuerst in ROLLEN_MATRIX.
      AND role = ANY (ARRAY['admin', 'superadmin', 'pdl'])
  );
$function$;

COMMENT ON FUNCTION public.is_internal_staff() IS
  'Interne Leitungsrollen (admin, superadmin, pdl). Die Liste muss sich mit dem CHECK '
  'auf profiles.role und mit ROLLEN_MATRIX in lib/auth/rollen.ts decken; '
  'npm run audit:rls-rollen (Pruefung F) haelt das fest. `buero` stand hier bis zum '
  '31.08.2026 und war vom CHECK nie zugelassen.';

-- Die Grants der Funktion bleiben, wie sie waren: CREATE OR REPLACE aendert
-- sie nicht. `authenticated` braucht EXECUTE, weil die Policies sie
-- auswerten; `anon` hat es nicht und soll es nicht bekommen.
REVOKE ALL ON FUNCTION public.is_internal_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_internal_staff() TO authenticated, service_role;

-- Gegenprobe im selben Lauf.
DO $$
DECLARE
  quelle text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO quelle
    FROM pg_proc
   WHERE proname = 'is_internal_staff' AND pronamespace = 'public'::regnamespace;

  IF quelle ILIKE '%buero%' THEN
    RAISE EXCEPTION 'is_internal_staff() nennt weiterhin buero — die Ersetzung hat nicht gegriffen.';
  END IF;
  IF quelle NOT ILIKE '%pdl%' THEN
    RAISE EXCEPTION 'is_internal_staff() kennt pdl nicht mehr — das waere ein Rueckschritt.';
  END IF;
END $$;
