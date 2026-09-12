# SECURITY & PRIVACY AUDIT — 12.09.2026

**Repo:** YusufFerhatDemir/alltagsengel  
**Datum:** 12. September 2026  
**Auditor:** Automatisierter Security-Scan (Claude)

---

## Gesamtbewertung: SECURITY_PRIVACY_CRITICAL

---

## 1. Kartenscan (~/Downloads)

**Status: SENSITIVE_FILE_USER_ACTION_REQUIRED**

Ein Kartenscan wurde in einem früheren Report gemeldet. Im aktuellen Downloads-Ordner wurde kein Dateiname mit Karten-Bezug gefunden. Der User sollte manuell prüfen, ob die Datei noch existiert und sie sicher löschen. Keine Karteninformationen werden in diesem Report reproduziert.

---

## 2. Öffentliches Repository & Personenbezogene Dokumente

### 2a. Repo-Sichtbarkeit

**Status: SECURITY_PRIVACY_CRITICAL**

| Prüfpunkt | Ergebnis |
|---|---|
| Repo öffentlich? | **JA — `"private": false, "visibility": "public"`** |
| GitHub URL | `github.com/YusufFerhatDemir/alltagsengel` |

**Das gesamte Repository ist weltweit ohne Authentifizierung einsehbar.**

### 2b. Personenbezogene Dokumente im aktuellen Tree

**Status: SECURITY_PRIVACY_CRITICAL**

Folgende Dateien mit personenbezogenen Daten sind JETZT ÖFFENTLICH ERREICHBAR:

| Datei | Kategorie |
|---|---|
| `anerkennung-hessen/Anlage-02-Berufserlaubnis-Fachkraft-[NAME].pdf` | Berufserlaubnis (Personenname im Dateinamen) |
| `anerkennung-hessen/Anlage-04-Arbeitsvertrag-Fachkraft-[NAME].pdf` | Arbeitsvertrag (Personenname im Dateinamen) |
| `anerkennung-hessen/Erweitertes-Fuehrungszeugnis-[NAME]-2026.pdf` | Erweitertes Führungszeugnis |
| `anerkennung-hessen/Anlage-08-Erklaerung-Fuehrungszeugnisse.pdf` | Führungszeugnis-Erklärung |
| `anerkennung-hessen/Anlage-10-Handelsregisterauszug.pdf` | Handelsregister |
| `anerkennung-hessen/Anlage-03-ARGE-IK-Bestaetigung-[IK-NR].pdf` | IK-Nummer im Dateinamen |
| `anerkennung-hessen/Anlage-15-Betriebshaftpflicht-Police.pdf` | Versicherungspolice |
| `docs/genehmigung/06_Fuehrungszeugnis.pdf` | Führungszeugnis |
| `docs/genehmigung/17a_Berufserlaubnis_Fachkraft.pdf` | Berufserlaubnis |
| `docs/genehmigung/17b_Arbeitsvertrag_Fachkraft.pdf` | Arbeitsvertrag |
| `docs/genehmigung/17c_Erklaerung_Fuehrungszeugnisse.pdf` | Führungszeugnis-Erklärung |
| `docs/genehmigung/03_Handelsregisterauszug.pdf` | Handelsregister |
| `docs/genehmigung/hessen/final/Anlage-04-Arbeitsvertrag-Fachkraft-[NAME].pdf` | Arbeitsvertrag (Duplikat) |
| `docs/genehmigung/hessen/final/Anlage-08-Erklaerung-Fuehrungszeugnisse.pdf` | Führungszeugnis (Duplikat) |
| `docs/genehmigung/hessen/final/Anlage-10-Handelsregisterauszug.pdf` | Handelsregister (Duplikat) |
| `HRB-140351-Handelsregisterauszug.pdf` | Handelsregister (HRB-Nr. im Dateinamen) |

**Insgesamt: 16 personenbezogene Dokumente im aktuellen Tree.**

### 2c. Git-Historie

**Status: SECURITY_PRIVACY_CRITICAL**

Alle oben genannten Dateien sind auch in der Git-Historie verankert. Keine der sensiblen Dateien wurde jemals gelöscht — sie sind alle noch im aktuellen HEAD. Das bedeutet: selbst nach Entfernung aus dem Tree müsste die Historie bereinigt werden (`git filter-repo` / BFG Repo-Cleaner).

Zusätzlich befinden sich insgesamt **1.046 PDF/Bild-Dateien** in der Git-Historie.

### 2d. Öffentliche Erreichbarkeit

**JA — über GitHub raw URLs sind alle Dateien direkt herunterladbar:**
`https://raw.githubusercontent.com/YusufFerhatDemir/alltagsengel/main/[PFAD]`

---

## 3. Secrets-Scan

### 3a. .env-Dateien

**Status: CLEAN (lokal) — nicht in Git getrackt**

| Datei | In Git? | Inhalt |
|---|---|---|
| `.env` | NEIN | Supabase URL + Anon Key |
| `.env.local` | NEIN | Supabase, Service Role Key, Resend, VAPID |
| `.env.staging.local` | NEIN | Staging Supabase Credentials |
| `native/.env` | NEIN | Expo Supabase Credentials |

`.gitignore` enthält korrekte Ausschlüsse: `.env`, `.env.*`, `.env*.local`.

### 3b. .env.example mit ECHTEN Secrets

**Status: SECURITY_PRIVACY_CRITICAL**

Die Datei `.env.example` ist in Git getrackt und öffentlich einsehbar. Sie enthält **ECHTE API-Keys** (keine Platzhalter):

| Key-Typ | Echtes Muster erkannt? |
|---|---|
| Supabase URL (*.supabase.co) | JA |
| Stripe Secret Key (sk_test_/sk_live_) | JA |
| Stripe Publishable Key (pk_) | JA |
| Resend API Key (re_) | JA |
| Stripe Webhook Secret (whsec_) | JA |
| Firebase Keys | Muster nicht geprüft |
| OpenAI API Key | Muster nicht geprüft |
| Gemini API Key | Muster nicht geprüft |
| TikTok CAPI Token | Muster nicht geprüft |
| Meta CAPI Token | Muster nicht geprüft |
| VAPID Keys | Vorhanden |

**Alle diese Keys sind öffentlich lesbar.**

### 3c. Eingebettete Supabase JWT-Tokens in Archive

**Status: SECURITY_PRIVACY_CRITICAL**

Im Verzeichnis `archive/next-old/dotnext-march2026/` befinden sich **81 kompilierte JS-Dateien**, die in Git getrackt sind. Mindestens 2 Dateien enthalten eingebettete Supabase JWT-Tokens (eyJ...-Muster):

- `archive/.../server/chunks/mnt_alltagsengel-app_d3e2055b._.js`
- `archive/.../static/chunks/d3d05329c648086e.js`

### 3d. GitHub Access Token in Git Remote URL

**Status: SENSITIVE_FILE**

Die `.git/config` enthält einen GitHub Access Token (`gho_...`) in der Remote-URL. Dieser ist lokal und nicht im Repository getrackt, aber sollte rotiert werden.

### 3e. Hardcoded Keys in Source Code

**Status: CLEAN**

Kein Hardcoded-Secret in den aktiven Source-Dateien (*.ts, *.tsx) gefunden. Supabase-Keys werden korrekt über `process.env` referenziert.

---

## 4. Zusammenfassung

| Kategorie | Status | Priorität |
|---|---|---|
| Repo öffentlich sichtbar | SECURITY_PRIVACY_CRITICAL | SOFORT |
| Führungszeugnisse öffentlich | SECURITY_PRIVACY_CRITICAL | SOFORT |
| Berufserlaubnis/Arbeitsverträge öffentlich | SECURITY_PRIVACY_CRITICAL | SOFORT |
| .env.example mit echten Keys | SECURITY_PRIVACY_CRITICAL | SOFORT |
| Archive mit eingebetteten JWT-Tokens | SECURITY_PRIVACY_CRITICAL | SOFORT |
| Kartenscan in Downloads | SENSITIVE_FILE_USER_ACTION_REQUIRED | HOCH |
| GitHub Token in Remote URL | SENSITIVE_FILE | MITTEL |
| .env-Dateien (lokal) | CLEAN | — |
| Hardcoded Keys in Source | CLEAN | — |

---

## 5. Empfohlene Sofortmaßnahmen (KEINE ohne Freigabe)

### Schritt 1 — SOFORT: Repo auf PRIVAT stellen
```
GitHub → Settings → Danger Zone → Change repository visibility → Private
```

### Schritt 2 — Personenbezogene Dokumente entfernen
1. Alle PDFs aus `anerkennung-hessen/`, `docs/genehmigung/` und Root aus dem Tree entfernen
2. `.gitignore` um `*.pdf`, `anerkennung-hessen/`, `docs/genehmigung/` erweitern
3. Git-Historie bereinigen mit `git filter-repo` oder BFG Repo-Cleaner

### Schritt 3 — Secrets rotieren
1. `.env.example` durch Platzhalter ersetzen (KEINE echten Keys)
2. `archive/` Verzeichnis aus Git entfernen + .gitignore
3. ALLE in `.env.example` enthaltenen Keys rotieren:
   - Supabase Anon Key + Service Role Key
   - Stripe Secret + Publishable + Webhook Secret
   - Resend API Key + Webhook Secret
   - Firebase Keys
   - OpenAI + Gemini API Keys
   - TikTok + Meta CAPI Tokens
   - VAPID Keys
4. GitHub Access Token (`gho_...`) rotieren

### Schritt 4 — Prävention
1. GitHub Push Protection aktivieren
2. `git-secrets` oder `trufflehog` als Pre-Commit-Hook einrichten
3. Branch Protection Rules für `main` aktivieren

---

**WICHTIG:** Keine der oben genannten destruktiven Aktionen (Löschen, Historie bereinigen) wird ohne explizite Freigabe des Repo-Owners durchgeführt.

---

## Nachtrag 12.09.2026 — Kartenscan ist auffindbar, nur nicht am Namen

Abschnitt 1 sagt, im Downloads-Ordner sei „kein Dateiname mit Karten-Bezug" gefunden
worden. Das stimmt — und führt in die Irre: Die Datei heißt
`Gescanntes Dokument 14.pdf` und trägt deshalb keinen sprechenden Namen. Sie wurde am
12.09.2026 **visuell geöffnet** und zeigt Vorder- und Rückseite einer Geschäfts-Debitkarte.

Eine Suche nach Dateinamen findet Kamerascans grundsätzlich nicht — die Geräte vergeben
durchnummerierte Namen. Belastbar ist nur, die PDFs zu rendern und anzusehen.

**Unverändert gilt:** Die Datei liegt **nicht** im Repository (per SHA-256 über alle PDFs
im Arbeitsbaum und in der Git-Historie geprüft). Es ist nichts aus dem Projekt zu
entfernen. Das Löschen in `~/Downloads` und das Sperren der Karte bleiben
USER_ACTION_REQUIRED.
