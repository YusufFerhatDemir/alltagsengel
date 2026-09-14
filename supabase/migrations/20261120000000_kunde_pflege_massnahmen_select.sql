-- ════════════════════════════════════════════════════════════════════════════
-- Block 31 — Die Kundin sah ihren Maßnahmenplan, aber nicht die Maßnahmen
-- ════════════════════════════════════════════════════════════════════════════
--
-- BEFUND (14.09.2026)
--
-- `app/kunde/pflegedoku` liest drei Tabellen. Zwei davon tragen eine
-- Kundenbindung, eine nicht:
--
--   pflege_massnahmenplaene   kunde_pflege_massnahmenplaene_select   ✓
--   pflege_verlauf            kunde_pflege_verlauf_select            ✓
--   pflege_massnahmen         — nur is_admin() und die Engel-Policy   ✗
--
-- Die Seite holt zuerst den aktiven Plan, dann dessen Maßnahmen. Der Plan
-- kam durch, die Maßnahmen nicht. Und weil PostgREST eine RLS-Verweigerung
-- als `200 []` beantwortet und nicht als Fehler, fiel das nirgends auf:
-- die Seite zeigte einen Pflegeplan ohne Inhalt. Eine stille Null über die
-- Pflege eines Menschen.
--
-- ── WARUM ES LIVE NOCH KEINEN SCHADEN GAB ──────────────────────────────────
--
-- Alle drei Tabellen sind am 14.09.2026 leer (0 Zeilen). Die Lücke ist
-- latent, nicht eingetreten — sie greift beim ersten echten Maßnahmenplan.
--
-- ── DIE REGEL ──────────────────────────────────────────────────────────────
--
-- Wortgleich zur Schwesterpolicy auf `pflege_massnahmenplaene`, nur über
-- den Plan hinweg: die Maßnahme gehört der Kundin, wenn der Plan ihr
-- gehört. Enger als die Engel-Policy, die auch `abgelaufen` sieht — der
-- Kundin wird der AKTIVE Plan gezeigt, und nur dessen Maßnahmen.
--
-- Der RESTRICTIVE org_fence bleibt unberührt und wirkt weiter zusätzlich.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "kunde_pflege_massnahmen_select" ON public.pflege_massnahmen;

CREATE POLICY "kunde_pflege_massnahmen_select" ON public.pflege_massnahmen
  FOR SELECT
  USING (
    plan_id IN (
      SELECT mp.id
      FROM public.pflege_massnahmenplaene mp
      WHERE mp.status = 'aktiv'
        AND mp.client_id IN (
          SELECT c.id FROM public.clients c WHERE c.user_id = auth.uid()
        )
    )
  );

COMMENT ON POLICY "kunde_pflege_massnahmen_select" ON public.pflege_massnahmen IS
  'Block 31: Die Kundin sieht die Maßnahmen ihres aktiven Plans. Ohne diese Policy zeigte /kunde/pflegedoku den Plan ohne Inhalt (PostgREST antwortet auf RLS-Verweigerung mit 200 []).';
