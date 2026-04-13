# Security-Rotation Checkliste — 14.04.2026

**Analogie:** Die Schlösser am Haus sind zwar zu — aber die alten Schlüssel lagen mal auf der Straße. Jeder, der sie damals eingesteckt hat, kommt immer noch rein. → **Alle Schlösser tauschen.**

---

## 1. Supabase Service-Role-Key rotieren (KRITISCH)

**Grund:** Laut Security Audit lag der Key in `.env` / `.env.local` und ist wahrscheinlich in älteren Git-Commits. Wer ihn hat, umgeht RLS komplett.

**Ablauf:**
1. Supabase Dashboard → Projekt `nnwyktkqibdjxgimjyuq` → Settings → API
2. "Service role key" → **Roll secret** klicken
3. Neuen Key kopieren
4. In Vercel: Settings → Environment Variables → `SUPABASE_SERVICE_ROLE_KEY` ersetzen
5. In `.env.local` lokal ersetzen (nur lokal, nicht committen — ist in `.gitignore`)
6. Redeploy auf Vercel

**Zusätzlich:** Anon-Key ist laut Audit auch exponiert (ist aber absichtlich public-safe, solange RLS sauber ist — wir haben heute RLS gehärtet ✓).

---

## 2. Company-E-Mail-Passwort rotieren (GitGuardian-Alert 02.03.2026)

**Grund:** GitGuardian hat ein E-Mail-Passwort im GitHub-Repo gefunden.

**Ablauf:**
1. STRATO-Login (Kundennr. 78372956)
2. E-Mail-Konto `info@alltagsengel.care` → Passwort ändern
3. In Resend (falls dort SMTP-Credentials liegen): neues Passwort eintragen
4. In Zadarma / sonstigen Tools, die das Passwort verwenden: ersetzen
5. Prüfen wo das Passwort im Repo lag: `git log -S "<teil-des-passworts>" --all`
6. Falls in Git-History: Commit-Historie bereinigen mit `git filter-repo --replace-text`

---

## 3. Git-History von Secrets säubern (empfohlen)

Wenn `.env` / Service-Role-Key jemals committed wurden:

```bash
# Backup!
git clone --mirror git@github.com:YusufFerhatDemir/alltagsengel.git alltagsengel-backup.git

# Secrets aus History entfernen
pip install git-filter-repo
cd /Users/work/alltagsengel
git filter-repo --path .env --invert-paths
git filter-repo --path .env.local --invert-paths

# Force-Push
git push --force --all
git push --force --tags
```

**Achtung:** Force-Push zerstört fremde Clones. Alle Mitarbeiter müssen neu klonen.

---

## 4. Erledigt heute ✓

- [x] RLS-Hardening auf `profiles`: "true"-SELECT-Policies entfernt
  - `profiles_select_own` — eigenes Profil
  - `profiles_select_admin` — Admin/Superadmin
  - `profiles_select_engels` — authentifizierte Nutzer sehen Engel-Profile
  - `profiles_select_booking_partner` — Booking-Partner sichtbar
- [x] VisitorTracker war bereits DSGVO-konform (`consent !== 'accepted'` Check ist im Code)
- [x] `.gitignore` deckt `.env`, `.env.*`, `*firebase-adminsdk*.json`, `*service-account*.json` ab

---

## 5. Noch offen (aus Security Audit, nicht heute)

- [ ] `angels`-Tabelle: `"Herkes engelleri okuyabilir"` (public SELECT). Für Marktplatz-Discovery nötig, aber ggf. sensible Felder (hourly_rate?) nur für authentifizierte Nutzer zeigen.
- [ ] Admin-Endpoints: Audit der `/api/admin/*` Routes auf authz-Checks
- [ ] API-Endpoint `/api/visitor-alert`: ggf. Rate-Limiting
- [ ] Upload-Validation (Dateigröße, Mime-Types) auf allen Upload-Routes
