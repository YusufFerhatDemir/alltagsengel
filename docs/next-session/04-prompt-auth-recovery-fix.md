# Prompt 4 — Auth-Recovery-Bug fixen (KRITISCH, P0)

**Erstellt:** 2026-05-28
**Anlass:** Echte Kundin (Jacqueline Eßer, esser_jacqueline@yahoo.de) ausgesperrt.
Passwort-vergessen funktioniert nicht. Diagnose ergibt: globales Problem, betrifft alle Nutzer.

---

## Der eine Satz für Yusuf (in Code-Session kopieren)

```
Arbeite docs/next-session/04-prompt-auth-recovery-fix.md vollständig 
und autonom ab. P0-Bug — Kundin wartet. Committe und pushe selbst.
```

---

## Befund aus der Diagnose

Direkte Datenbank-Abfrage gegen `auth.users` ergab:

- **Frau Eßer existiert**, E-Mail bestätigt, einmal eingeloggt am 18.05.2026.
- Trotz mehrfachem „Passwort vergessen"-Klick: `recovery_sent_at = NULL`.
- **Globaler Befund:** `SELECT COUNT(*) FROM auth.users WHERE recovery_sent_at > NOW() - INTERVAL '30 days'` → **0**.
  Bei 36 Profilen wäre das statistisch unmöglich, wenn die Funktion liefe.

**Verdachtsdiagnose:**
Der AUTH-005-Fix (Email-Enumeration-Prävention) verhindert vermutlich nicht
nur für unbekannte E-Mails den Versand, sondern für ALLE — vermutlich
wegen eines fehlerhaft platzierten Early-Return oder weil der `signInWithPassword`-
und `resetPasswordForEmail`-Code-Pfad an derselben Stelle stumm geschaltet wurde.

---

## Aufgaben

### Schritt 1 — Recovery-Flow reparieren (P0)

1. Code-Pfad analysieren: `app/auth/forgot-password/page.tsx` (oder ähnlich)
   und das API-Route, das `supabase.auth.resetPasswordForEmail()` aufruft.
2. AUTH-005-Implementierung prüfen: stellt sicher, dass „silent redirect"
   NUR bei nicht existierenden E-Mails greift, nicht generell.
3. Korrekt: bei JEDER eingegebenen E-Mail die UI-Antwort identisch halten
   (Enumeration-Schutz), aber im Hintergrund den Recovery-Send für
   existierende User AUSFÜHREN. Für unbekannte E-Mails kein Send,
   aber identische UI-Antwort.
4. Unit/E2E-Test ergänzen: Mock-Setup das verifiziert, dass für eine
   existierende E-Mail `resetPasswordForEmail` tatsächlich aufgerufen wird.
5. Verify nach Deploy: `SELECT recovery_sent_at FROM auth.users WHERE email='<test>'`
   nach Reset-Versuch — muss aktualisiert sein.

### Schritt 2 — Frau Eßer manuell entsperren (parallel, JETZT)

Yusuf macht das selbst im Supabase-Dashboard:
Authentication → Users → Suche `esser_jacqueline` → Klick → „Send password recovery".
Das ist ein User-Action-Item, KEIN Code-Schritt.

### Schritt 3 — SMTP für Zustellung an Yahoo/Hotmail/Outlook (P0)

Yahoo, Outlook und Hotmail filtern Supabase-Default-Mails (`noreply@mail.app.supabase.io`)
sehr aggressiv. Lösung: Custom SMTP mit verifizierter eigener Domain.

1. SMTP-Anbieter wählen (Empfehlung: **Postmark** oder **AWS SES** —
   beide haben exzellente Zustellraten und sind günstig).
2. Sender-Domain einrichten: `noreply@alltagsengel.care` (oder `support@`)
3. SPF, DKIM, DMARC-DNS-Einträge bei Domain-Provider setzen
4. In Supabase Dashboard → Authentication → SMTP Settings → Custom SMTP eintragen
5. Test-Send an Yahoo-, Outlook- und GMail-Adresse — alle drei müssen INBOX ankommen, nicht Spam
6. Mail-Templates in Supabase auf Deutsch und mit AlltagsEngel-Branding setzen

### Schritt 4 — JWT Expiry verlängern (P0, USER-ACTION)

Im Supabase-Dashboard durch Yusuf (KEIN Code):
Project Settings → Auth → JWT Expiry: **604800** (7 Tage) statt 3600 (1 Stunde).
Effekt: Senioren müssen nicht alle 60 Minuten neu einloggen.

### Schritt 5 — Onboarding-Reminder (P1)

Frau Eßer hat `onboarding_completed = false`. Das gilt vermutlich für mehr Nutzer:

```sql
SELECT COUNT(*) FROM profiles 
WHERE onboarding_completed = false 
  AND created_at < NOW() - INTERVAL '3 days';
```

Wenn die Zahl > 0 ist: Reminder-Mail-Workflow aufsetzen (Supabase Edge Function +
pg_cron, ähnlich zum Soft-Delete-Cron), der nach 1, 3, 7 Tagen mit unvollendetem
Onboarding einen freundlichen Hinweis sendet.

### Schritt 6 — Verifizieren

- Nach Deploy: Test-Account anlegen → Logout → „Passwort vergessen" → Mail muss in INBOX kommen → Link funktioniert
- `recovery_sent_at` in auth.users wird gesetzt
- `npm run lint`, `npm run build` grün
- Commits + Push pro Schritt

---

## Definition of Done

- [ ] Recovery-Mail wird für existierende E-Mails tatsächlich gesendet
- [ ] Yahoo / Outlook / GMail erhalten die Mail in der Inbox (Spam-Test bestanden)
- [ ] Frau Eßer (esser_jacqueline@yahoo.de) hat ihren Zugang zurück
- [ ] JWT Expiry auf 604800 gesetzt (User-Action durch Yusuf)
- [ ] Onboarding-Reminder-Skizze in `docs/growth/ONBOARDING_REMINDER.md`

## Wichtig

- Bug ist P0: solange er offen ist, verlieren wir jeden Kunden, der einmal das Passwort vergisst.
- Email-Enumeration-Schutz NICHT aufgeben — sondern korrekt implementieren (siehe Schritt 1.3).
