# Projekt-Analyse: Skills & Verbesserungen

## 7 Pattern-Skills gespeichert (Langzeitgedaechtnis)

### 1. Next.js Pattern
- App Router, Server/Client-Split, ISR, Middleware, CSS Variables
- Quelle: Alltagsengel + ChairMatch

### 2. Supabase Pattern
- RLS, Auth, Migrations, Edge Functions, Typgenerierung
- Quelle: Alle 3 Projekte

### 3. SEO/GEO Pattern
- Schema.org, Meta Tags, City-Pages, AI-Crawler, IndexNow
- Quelle: Alltagsengel + ChairMatch

### 4. Deploy Pattern
- deploy.sh, Precommit Guards, Vercel, Worktree-Branches
- Quelle: Alle 3 Projekte

### 5. Expo/RN Pattern
- Screen-Wrapper, Theme-System, Feature-Module, Offline-Sync
- Quelle: efy care

### 6. Admin Dashboard
- Modul-Architektur, CRUD-Pattern, KPI-Cards, Auth
- Quelle: Alltagsengel

### 7. Verbesserungsbedarf (dokumentiert)
- Sicherheitsluecken + Tech Debt aller 3 Projekte

---

## Kritische Verbesserungen

### Alltagsengel
- Public Upload-URLs -> Signed URLs verwenden
- Auth Guards serverseitig machen (Middleware)
- TypeScript `any` massiv reduzieren

### ChairMatch
- `ignoreBuildErrors: true` entfernen, Type Errors fixen
- Anon Key Hardcoded-Fallback eliminieren
- ESLint-Warnings ernst nehmen

### efy care
- Types automatisieren (750 Zeilen Hand-gepflegt) -> `supabase gen types`
- Tests + ESLint einfuehren
- Mock-Daten auf Home Screen durch echte Daten ersetzen

---

Bei jedem zukuenftigen Projekt oder Feature werden diese Patterns automatisch angewendet.
