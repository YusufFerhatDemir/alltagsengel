# Tasks

## Active

- [ ] Sosyal medya kampanya içerikleri oluştur (Instagram, Facebook, TikTok) — AlltagsEngel lansmanı
- [ ] Ürün lansmanı duyurusu / Pressemitteilung hazırla
- [ ] App Store & Play Store listing metinlerini hazırla

## Lokal auf deinem Rechner ausfuehren (Sandbox-FUSE-Mount blockt unlink)

Diese Aktionen kann ich in der Sandbox nicht durchfuehren — bitte einmal lokal:

```bash
# 1) Pflegebox-Ordner physisch loeschen (Phase 5, Option B)
#    Aktuell sind nur Redirect-Stubs drin (1x file pro Ordner).
git rm -rf app/admin/pflegebox app/kunde/pflegebox

# 2) Cleanup-Skript ausfuehren (Stripe + 25 MB Archive + ungenutzte Icons + send-verification)
./scripts/cleanup-deadcode.sh           # erst dry-run pruefen
./scripts/cleanup-deadcode.sh --apply   # dann ausfuehren

# 3) Sanity-Check + Commit
npm run lint:forbidden
git add -A
git commit -m "chore: Pflegebox-Stubs entfernt + Cleanup-Skript Phase 2+3"
git push
```

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

## Someday / Later

- [ ] SEO ve ASO (App Store Optimization) stratejisi
- [ ] Influencer / Kooperasyon araştırması (Pflege & Senioren alanı)
- [ ] Pflegebox-Feature (Option A) reaktivieren — DB-Migration fuer
      `care_eligibility`, `carebox_catalog_items`, `carebox_order_requests`,
      `carebox_cart`, RLS-Policies, Katalog-Items befuellen, §40 SGB XI
      Abrechnung an Pflegekasse klaeren. Aufwand 1-2 Wochen Vollzeit.
