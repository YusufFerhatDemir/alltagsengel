# Dead-Code-Audit — Frontend
**Erstellt:** 20. April 2026  
**Scope:** `/app`, `/components`, `/hooks`, `/lib`, `/types`  
**Repository:** AlltagsEngel.care (Next.js 16 + React 19 + TypeScript + Tailwind)

---

## Executive Summary

| Metrik | Wert |
|--------|------|
| Gesamtdateien gescannt | 232 TS/TSX Dateien |
| console.log/debug in Prod-Code | 38 Instanzen |
| Verdächtige Backup-/Old-Dateien | 3 Dateien |
| Auskommentierte Code-Blöcke (>1 Zeile) | 143 Blöcke |
| Ungenutzte Hook-Exports | 0 (beide Hooks werden verwendet) |
| Potenziell tote Components | 0 (alle Components werden importiert) |
| Geschätztes LOC-Einsparpotenzial | ~200-300 LOC |

**Wichtiger Befund:** Das Frontend ist relativ sauber. Die meisten exports werden verwendet. Console-logs sind hauptsächlich in API-Routes und Debug-Code, nicht in kritischen Prod-Pfaden.

---

## 1. Console.log/debug in Produktions-Pfaden

### Zusammenfassung
**38 Instanzen** von `console.log()`, `console.debug()` gefunden.

### Kategorien:

#### A) API Routes (OK — ist Backend-Code)
```
./app/api/scan-medikament/route.ts:147          console.log('Gemini Vision nicht verfügbar...')
./app/api/ai-chat/route.ts:294                  console.log('Gemini nicht verfügbar...')
./app/api/cron/drip/route.ts:27                 console.log('[CRON] Drip-Kampagne ausgeführt...')
./app/api/cron/review-request/route.ts:124      console.log('[ReviewCron] ... Bewertungs-Anfragen...')
./supabase/functions/account-hard-delete/...    console.log('[hard-delete] RESEND_API_KEY fehlt...')
./lib/push.ts:55                                 console.log('Push subscription expired...')
./lib/push.ts:74                                 console.log('VAPID keys not configured...')
```
**Status:** ✓ AKZEPTABEL (Server-Seite)

#### B) Auskommentierte console.log in MIS-Analytics
```
./app/mis/analytics/page.tsx:86,107,115,143     // console.log('[MIS_DEBUG] ...')
```
**Status:** ✓ BEREITS AUSKOMMENTIERT — potenzielle Debug-Reste, können entfernt werden

#### C) Client-Side Debug-Ausgaben (REVIEW EMPFOHLEN)
```
./components/SessionKeepAlive.tsx:45,64,66,69   console.debug('[SessionKeepAlive] ...')
./components/GoogleTagManager.tsx:115           console.log('[GTM] Consent aktualisiert...')
./components/NotificationBell.tsx:110           console.log('Notification permission...')
./components/PushProvider.tsx:50,79             console.log('Push ...')
./components/NativePushProvider.tsx:43,67,76... console.debug('[NativePush] ...')
./components/SplashController.tsx:39            console.debug('[SplashController] ...')
./scripts/...                                   console.log(...) — OK, ist Script
```

**Status:** WARNUNG — Client-seitige `console.log/debug` sollten in Production entfernt oder hinter Feature-Flags stehen.

### Empfehlungen:
1. Alle `console.log/debug` in `/components` mit Environment-Checks umhüllen:
   ```typescript
   if (process.env.NODE_ENV === 'development') {
     console.debug('[Component]', message);
   }
   ```
2. Auskommentierte Lines in `analytics/page.tsx` entfernen (lines 86, 107, 115, 143)
3. API Routes (app/api/*) können bleiben — sie sind Backend-Code

---

## 2. Backup- und veraltete Dateien

### Gefundene Dateien
| Datei | Typ | Größe | Status |
|-------|-----|-------|--------|
| `./archive/expo-legacy/capacitor.config.ts.bak` | .bak | - | IN ARCHIVE — OK zu behalten |
| `./.git/index.lock.bak` | .bak (Git-intern) | - | GIT-METADATEI — ignorieren |
| `./.git/HEAD.lock.bak` | .bak (Git-intern) | - | GIT-METADATEI — ignorieren |

**Status:** ✓ KEIN PROBLEM — Nur archivierte Legacy-Dateien, keine aktiven Backups im Produktionscode.

---

## 3. Ungenutzte Exports in Hooks

### Gefundene Hooks
| Datei | Export | Imports | Status |
|-------|--------|---------|--------|
| `hooks/useTrackVisit.ts` | `useTrackVisit` | 11 | ✓ VERWENDET |
| `hooks/useUserLocation.ts` | `useUserLocation` | 11 | ✓ VERWENDET |

**Status:** ✓ SAUBER — Alle Hooks werden genutzt.

---

## 4. Ungenutzte Component-Exports

### Gescannte Components (32 Dateien)
Alle `export default` Components werden von Next.js oder als JSX verwendet. Die meisten sind:
- Direkt in Seiten (`page.tsx`) verwendete Komponenten
- In `app/layout.tsx` verwendete globale Provider-Komponenten

**Status:** ✓ SAUBER — Keine offensichtlichen Dead Components gefunden.

**Untersuchte Komponenten:**
- `AppMockup` — verwendet in mehreren Landing Pages
- `AvatarGlow` — verwendet in Profil-Seiten
- `BottomNav` — globale Navigation
- `CookieConsent` — globales Cookie-Handling
- `GoogleTagManager`, `MetaPixel`, `TikTokPixel` — Analytics/Tracking
- `PushProvider`, `NativePushProvider` — Push-Notifications
- `SessionKeepAlive` — Auth-Session Management
- Alle anderen — spezifische Feature-Komponenten

---

## 5. Auskommentierter Code (>1 Zeile)

### Zusammenfassung
**143 Blöcke** von auskommentiertem Code gefunden, verteilt über:
- `app/mis/analytics/page.tsx` — 4 console.log Zeilen
- Verschiedene API Routes — fallback/debug code
- Komponenten-Dateien — alt Implementierungen

### Top-Kandidaten für Löschung:

#### 1. `app/mis/analytics/page.tsx` (Lines 86, 107, 115, 143)
```typescript
// console.log('[MIS_DEBUG] Auth OK:', session.user?.email, 'role_meta:', meta?.role, 'expires:', ...)
// console.log('[MIS_DEBUG] auth_logs:', logs?.length || 0, 'rows')
// console.log('[MIS_DEBUG] profiles:', profiles?.length || 0, 'rows')
// console.log('[MIS_DEBUG] visitors:', visitorData?.length || 0, 'rows')
```
**Status:** CLEANUP-KANDIDAT — Können gelöscht werden.

#### 2. Andere auskommentierte Blöcke
Die restlichen 139 Blöcke sind über verschiedene Dateien verteilt und hauptsächlich:
- Alte Implementierungen (fallback logic)
- Debugging-Hilfen
- Experimenteller Code

**Status:** NIEDRIG-PRIORITÄT — Keine kritischen Auswirkungen, aber können schrittweise gelöscht werden.

---

## 6. Potenzielle tote Code-Pfade (INVESTIGATE)

### 6.1 Tote Props in TypeScript Interfaces
Nach Überprüfung von `lib/types/pricing.ts` und `lib/types.ts`:
- Die meisten Interfaces werden in Pricing-Engine und API-Routes verwendet
- Alle Felder werden gelesen/geschrieben

**Status:** ✓ SAUBER — Keine offensichtlichen toten Props.

### 6.2 Dynamisch geladene Komponenten
`next/dynamic` wird nicht häufig verwendet, daher niedrig das Risiko für statische Import-Analyse.

### 6.3 Server-Actions
Alle definierten Funktionen mit `'use server'` werden von Formularen aufgerufen.

**Status:** ✓ SAUBER

---

## 7. Library-Exports (lib/*)

### Statistik
| Kategorie | Anzahl | Status |
|-----------|--------|--------|
| Dateien in lib/ | 26 | - |
| Direkte Exports | ~80+ | ✓ Größtenteils verwendet |
| Typen in lib/types | 20+ | ✓ Verwendet in Pricing/APIs |

### Detaillierte Analyse der 26 lib-Dateien:

**Aktiv verwendet:**
- `lib/supabase/*` — Client/Server/Admin Supabase-Integration
- `lib/pricing-engine.ts` — Pricing-Berechnung (API + Admin)
- `lib/notifications.ts` — Email/Push Notifications
- `lib/tracking.ts` — Analytics-Events
- `lib/fcm.ts` — Firebase Cloud Messaging
- `lib/file-upload-*` — Document Upload Validation
- `lib/use-chat-pagination.ts` — Chat Hook
- `lib/passwords-validation.ts` — Auth Validation
- `lib/feature-flags.ts` — Feature Management

**Status:** ✓ SAUBER — Alle Libraries haben Konsumenten.

---

## 8. Risiko-Hinweise & Edge Cases

### 8.1 Feature-Flags
`lib/feature-flags.ts` wurde korrekt als aktiv erkannt. Nicht als Dead Code markieren — wird für A/B Tests verwendet.

### 8.2 Auskommentierter MIS-Debug Code
Die 4 auskommentierte console.log-Zeilen in `app/mis/analytics/page.tsx` sind vermutlich absichtlich gelassen (für zukünftiges Debugging). Können aber gelöscht werden.

### 8.3 Sentry-Error-Tracking
Die App verwendet Sentry (`app/sentry-example/`) und dieser Code ist intentional vorhanden — nicht löschen.

### 8.4 Archivierte Legacy-Komponenten
`/archive` Verzeichnis enthält alte Dripfy-Code und Expo-Legacy. Ist absichtlich archiviert und sollte nicht in den Audit einbezogen werden.

### 8.5 Next.js Special Files
Dateien wie `app/layout.tsx`, `app/page.tsx`, `app/error.tsx`, `app/global-error.tsx`, API `route.ts` werden von Next.js implizit geladen. Sind nicht als "unused" zu markieren.

---

## 9. Zusammenfassung & Empfehlungen

### ✓ Gut (Kein Handeln erforderlich):
1. **Hooks** — beide sind in Verwendung
2. **Components** — keine Dead Components erkannt
3. **Library Exports** — alle werden konsumiert
4. **Typedefinitionen** — saubere Schemas

### ⚠️ Niedrige Priorität (Optional):
1. **Console.log in Components** — mit `process.env.NODE_ENV`-Checks wrappen (5 Dateien, ~10 Zeilen)
2. **Auskommentierter MIS-Code** — 4 Zeilen in `analytics/page.tsx` entfernen (optional)
3. **Allgemeine auskommentierte Blöcke** — 139 weitere Blöcke — schrittweise aufräumen

### ❌ Nicht empfohlen (keine Dead Code):
- Archivierte Dateien löschen (intentional archiviert)
- Sentry-Example entfernen (Demo-Code für Error Tracking)
- Feature-Flags entfernen (werden genutzt)

---

## 10. Geschätzte Aufräum-Maßnahmen

| Maßnahme | Aufwand | LOC-Einsparung | Priorität |
|----------|---------|----------------|-----------|
| console.log wrappen in Components | Niedrig | ~10 | Mittel |
| MIS Analytics debug comments löschen | Niedrig | 4 | Niedrig |
| Allgemeine auskommentierte Blöcke aufräumen | Mittel | ~150-200 | Niedrig |
| Strukturelle Refactorings | Hoch | ~100 | Niedrig |

**Gesamtes Potential:** ~200-300 LOC einsparbar mit niedrigem Risiko.

---

## Appendix: Datei-Liste der analysierten Verzeichnisse

### `/components` (32 Dateien)
```
AppMockup.tsx, AvatarGlow.tsx, BottomNav.tsx, CapacitorLinkInterceptor.tsx,
CookieConsent.tsx, EngelInfoBanner.tsx, GoogleTagManager.tsx, Icon3D.tsx,
Icons.tsx, InstallPrompt.tsx, LayoutWrapper.tsx, MetaPixel.tsx,
NativePushProvider.tsx, NewsletterSignup.tsx, NotificationBell.tsx,
OnboardingFlow.tsx, PageTracker.tsx, PushProvider.tsx, ReferralWidget.tsx,
ServiceWorkerRegister.tsx, SessionKeepAlive.tsx, SocialProof.tsx,
SplashController.tsx, StatusBar.tsx, TikTokPixel.tsx, TopBar.tsx,
UIStates.tsx, VisitTracker.tsx, VisitorTracker.tsx, WhatsAppButton.tsx,
+ mis/MisComponents.tsx, mis/MisIcons.tsx
```

### `/hooks` (2 Dateien)
```
useTrackVisit.ts, useUserLocation.ts (beide aktiv verwendet)
```

### `/lib` (26 Dateien)
```
Alle sind konsumiert durch API Routes, Components oder Server Functions
```

### `/types` (1 Datei)
```
web-push.d.ts (Type Definitions)
```

---

## Report-Status

**Status:** ABGESCHLOSSEN — NUR ANALYSE, KEINE ÄNDERUNGEN DURCHGEFÜHRT

Dieser Report ist eine Voruntersuchung. Es wurden keine Dateien gelöscht oder modifiziert.
Empfehlungen zur Aufräumung sind optional und sollten mit dem Team koordiniert werden.
