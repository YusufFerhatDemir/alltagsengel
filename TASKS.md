# Tasks

## Active

- [ ] Sosyal medya kampanya içerikleri oluştur (Instagram, Facebook, TikTok) — AlltagsEngel lansmanı
- [ ] Ürün lansmanı duyurusu / Pressemitteilung hazırla
- [ ] App Store & Play Store listing metinlerini hazırla

**Optional / kann warten:**

- [ ] `supabase/migrations/fix_rls_policies.sql` enthaelt RLS-Policies fuer
      `care_eligibility` + `carebox_cart` — die Tabellen existieren nicht in DB,
      Migration crasht beim Re-Run. Bei naechstem Migrations-Reset bereinigen.
- [ ] P1.4 Bundle-Size lokal messen: `ANALYZE=true npm run build`, dann
      `.next/analyze/*.html` in Browser oeffnen.

## Completed

- [x] Phase 5: Pflegebox-Code entfernt (Option B per User-Entscheidung 20.04.2026)
      → Stubs in pflegebox-Ordnern, Pflegedaten-UI im Profil raus, Admin-Menue
        bereinigt, Tracking-Helper raus, Typen raus, Account-Hard-Delete bereinigt
        (Commit b90dc92)
- [x] Pflegebox-Stub-Ordner physisch geloescht + Cleanup-Skript Phase 2+3
      ausgefuehrt: ~26 MB Archive, 3 ungenutzte Icons, tote API-Endpoints
      raus, .gitignore um /.next.stale.*/ erweitert (Commit 2f7042d)
- [x] Entscheidung: marketing/fonts-for-claude-design/ (Cormorant + Jost,
      2.6 MB, freie SIL-OFL-Fonts) bleibt im Repo — werden im App-Build
      ueber next/font/google geladen, die TTFs sind fuer Print/Pitch-Material.

## Someday / Later

- [ ] SEO ve ASO (App Store Optimization) stratejisi
- [ ] Influencer / Kooperasyon araştırması (Pflege & Senioren alanı)
- [ ] Pflegebox-Feature (Option A) reaktivieren — DB-Migration fuer
      `care_eligibility`, `carebox_catalog_items`, `carebox_order_requests`,
      `carebox_cart`, RLS-Policies, Katalog-Items befuellen, §40 SGB XI
      Abrechnung an Pflegekasse klaeren. Aufwand 1-2 Wochen Vollzeit.
