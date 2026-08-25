-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Storage-Bucket-Härtung (P2-a)
-- Datum: 2026-08-25, Phase 5
--
-- BEFUND (P2-a)
--   Fünf private Buckets wurden ohne `file_size_limit` UND ohne
--   `allowed_mime_types` angelegt. Beides NULL heißt in Supabase Storage:
--   beliebige Dateigröße, beliebiger MIME-Typ. Ein authentifizierter Nutzer
--   mit Upload-Policy kann damit den Speicher fluten (DoS/Kosten) oder
--   aktive Inhalte (HTML, SVG mit Script) ablegen, die über eine signierte
--   URL auf der Storage-Origin ausgeliefert werden.
--
--     verordnungen    20260730_verordnungen_workflow_complete.sql
--     abrechnung      20260802000200_baseline_live_only_columns_and_bucket.sql
--     service-proofs  20260706_monatsabschluss_ki_pruefzentrale.sql
--     documents       20260804200000_create_documents_table.sql
--     mis-documents   20260302_mis_schema.sql
--
-- FIX
--   file_size_limit = 20 MB (20971520 Bytes) für alle fünf, dazu je eine
--   Allowlist, die sich an dem orientiert, was der Code tatsächlich hochlädt.
--   Die Bucket-Grenze ist die letzte Instanz — die Client-Prüfungen
--   (lib/upload-document.ts, lib/upload-service-proof.ts: je 15 MB) bleiben
--   strenger und liefern weiterhin die freundliche Fehlermeldung.
--
-- BEWUSST NICHT in den Allowlists
--   image/svg+xml — SVG trägt ausführbares Script und würde über die
--   signierte URL auf der Storage-Origin laufen. Die Client-Prüfungen
--   akzeptierten bisher jedes `image/*`; sie werden im selben Commit
--   nachgezogen, damit der Nutzer eine Meldung statt eines rohen
--   Storage-400 sieht.
--
-- NICHT enthalten
--   kim-attachments hat bereits ein file_size_limit (25 MB, Migration
--   20260919000000), aber keine MIME-Allowlist. Eine Allowlist ist dort
--   nicht gefahrlos nachrüstbar: KIM/TI transportiert beliebige ärztliche
--   Anhänge, eine zu enge Liste bricht den Empfang stillschweigend.
--   Bewusst offen gelassen und im Bericht vermerkt.
--
-- ROLLBACK
--   UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL
--     WHERE id IN ('verordnungen','abrechnung','service-proofs',
--                  'documents','mis-documents');
--
-- Idempotent: INSERT ... ON CONFLICT (id) DO UPDATE — ein zweiter Lauf
-- schreibt dieselben Werte erneut und ist damit folgenlos.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Gemeinsame Bausteine ───────────────────────────────────────────────────
-- Raster-Bildformate inkl. HEIC/HEIF: iPhone-Kameras liefern seit iOS 11
-- standardmäßig HEIC. Fehlt der Typ, schlagen Foto-Uploads aus der
-- Pflege-Dokumentation fehl.

-- 1) verordnungen — ärztliche Verordnungs-Scans + Abtretungserklärungen
--    Upload: app/admin/verordnungen/page.tsx (accept="image/*,application/pdf")
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verordnungen', 'verordnungen', false, 20971520,
  ARRAY['application/pdf',
        'image/jpeg','image/png','image/webp',
        'image/heic','image/heif','image/gif','image/tiff',
        'image/bmp','image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) abrechnung — serverseitig erzeugte DTA-/EDIFACT-Dateien
--    Upload: lib/abrechnung/kassenabrechnung-engine.ts — lädt die
--    Latin-1-kodierten Abrechnungsdateien als 'application/octet-stream'
--    hoch. Ohne diesen Typ bricht der komplette Kassenabrechnungslauf.
--    Der Bucket hat bewusst keine authenticated-Policies (nur service_role),
--    ist also keine Nutzer-Upload-Fläche — hier wirkt vor allem das
--    Größenlimit.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'abrechnung', 'abrechnung', false, 20971520,
  ARRAY['application/octet-stream',
        'application/pdf','application/xml','text/xml',
        'text/plain','text/csv']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3) service-proofs — Leistungsnachweise (Foto, Scan, PDF)
--    Upload: lib/upload-service-proof.ts (image/* + PDF, 15 MB) und
--    app/api/native/leistungsnachweis-upload/route.ts (image/jpeg|png).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'service-proofs', 'service-proofs', false, 20971520,
  ARRAY['application/pdf',
        'image/jpeg','image/png','image/webp',
        'image/heic','image/heif','image/gif','image/tiff',
        'image/bmp','image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 4) documents — Kundendokumente und Pflege-Fotos
--    Upload: lib/upload-document.ts (image/* + PDF, 15 MB).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents', 'documents', false, 20971520,
  ARRAY['application/pdf',
        'image/jpeg','image/png','image/webp',
        'image/heic','image/heif','image/gif','image/tiff',
        'image/bmp','image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 5) mis-documents — MIS-Uploads
--    Upload: app/mis/documents/page.tsx. Die dortige Client-Allowlist
--    (PDF, JPEG, PNG, WebP, DOCX, XLSX) und das dortige 20-MB-Limit sind
--    bereits auf genau diesen Bucket-Zustand geschrieben ("= Bucket-Limit",
--    Commit dcb52fe) — diese Migration stellt ihn endlich her.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mis-documents', 'mis-documents', false, 20971520,
  ARRAY['application/pdf',
        'image/jpeg','image/png','image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Gegenprobe: kein Bucket der fünf darf ungehärtet zurückbleiben ─────────
DO $$
DECLARE
  offen text;
BEGIN
  SELECT string_agg(id, ', ' ORDER BY id) INTO offen
  FROM storage.buckets
  WHERE id IN ('verordnungen','abrechnung','service-proofs','documents','mis-documents')
    AND (file_size_limit IS NULL OR allowed_mime_types IS NULL);

  IF offen IS NOT NULL THEN
    RAISE EXCEPTION 'Bucket-Härtung unvollständig: %', offen;
  END IF;

  RAISE NOTICE 'Bucket-Härtung P2-a: 5 Buckets auf 20 MB + MIME-Allowlist gesetzt.';
END $$;

COMMIT;
