# Zertifizierungsleitfaden: gematik KIM/TI-Anbindung

**Stand:** 2026-08-12  
**Betrifft:** B3 — KIM/TI-Anbindung, B4 — FHIR/ISiP-Zertifizierung  
**Grundlage:** § 311 SGB V (gematik), § 395 SGB V (Interoperabilität)

---

## 1. KIM (Kommunikation im Medizinwesen)

### Was ist KIM?
KIM ist der sichere E-Mail-Dienst der Telematikinfrastruktur (TI). Über KIM können Leistungserbringer verschlüsselt und signiert kommunizieren (z.B. Arztbriefe, Befunde, Verordnungen).

### Ist-Zustand in Alltagsengel
- [x] KIM-Verwaltungsschicht vollständig implementiert
- [x] Postfachverwaltung, Formatversionen, Kartenverwaltung
- [x] Nachrichtenwarteschlange mit Readiness-Ampel
- [x] 25 Tests grün
- [x] `versendeKimNachricht()` wirft absichtlich (fail-closed)

### Voraussetzungen für KIM-Anbindung

#### Hardware
- [ ] **Konnektor:** TI-Konnektor (z.B. von secunet, RISE, CGM)
- [ ] **SMC-B Karte:** Institutionskarte für die Organisation (Alltagsengel)
- [ ] **eHBA:** Elektronischer Heilberufsausweis (falls pflegefachliches Personal vorhanden)
- [ ] **Kartenterminal:** Für SMC-B und ggf. eHBA

#### Verträge
- [ ] **KIM-Provider:** Vertrag mit einem zugelassenen KIM-Anbieter (z.B. T-Systems/TI-Messenger, CGM KIM, kv.dox)
- [ ] **TI-Zugang:** Vertrag mit VPN-Zugangsdienst zur TI

#### Zulassung
- [ ] **gematik-Registrierung:** Als Leistungserbringerinstitution in der TI registrieren
- [ ] **SMC-B Beantragung:** Bei einem zugelassenen Kartenhersteller (z.B. D-Trust, medisign)

### Schritt-für-Schritt

1. **VPN-Zugangsdienst auswählen und beauftragen** (z.B. über die Deutsche Telekom)
2. **Konnektor beschaffen und installieren** (On-Premise oder als TI-as-a-Service in der Cloud)
3. **SMC-B beantragen** bei einem TSP (Trust Service Provider)
4. **KIM-Dienst beauftragen** bei einem zugelassenen KIM-Provider
5. **KIM-Adresse registrieren** (Format: `alltagsengel@[provider].kim.telematik`)
6. **Technische Integration:** `versendeKimNachricht()` mit echtem KIM-API-Aufruf ersetzen
7. **Test:** Nachricht an Testadresse senden und empfangen

### Zeitrahmen und Kosten
- Gesamtprozess: **3-6 Monate**
- Konnektor: ca. 2.000-4.000 € (Kauf) oder 100-200 €/Monat (TI-as-a-Service)
- SMC-B: ca. 300-500 € (einmalig, Gültigkeit 5 Jahre)
- KIM-Dienst: ca. 20-50 €/Monat

### Relevanz für §45b-Betrieb
**NICHT ERFORDERLICH.** KIM ist für die direkte Kommunikation zwischen Leistungserbringern im Gesundheitswesen gedacht. Für §45b-Entlastungsleistungen gibt es keine KIM-Pflicht. Relevant wird KIM erst bei:
- Erweiterung auf Behandlungspflege (§ 37 SGB V)
- Integration mit Arztpraxen/Krankenhäusern
- ePA-Anbindung (elektronische Patientenakte)

---

## 2. FHIR/ISiP-Zertifizierung

### Was ist ISiP/ISiK?
- **ISiK** (Informationstechnische Systeme im Krankenhaus): gematik-Spezifikation für Krankenhaus-IT
- **ISiP** (Informationstechnische Systeme in der Pflege): Pendant für Pflegesoftware

### Ist-Zustand in Alltagsengel
- [x] FHIR R4-Endpunkte implementiert
- [x] Export/Import mit Vorschau
- [x] Audit-Log für FHIR-Zugriffe
- [x] 56 Tests grün
- [ ] ISiK/ISiP-Profilkonformität nicht geprüft

### ISiP-Profile (öffentlich verfügbar)

Die ISiP-Spezifikation von gematik ist öffentlich zugänglich:
- **Simplifier:** https://simplifier.net/isip
- **gematik GitHub:** https://github.com/gematik/spec-ISiP
- **Spezifikationsportal:** https://fachportal.gematik.de/informationen-fuer/isip

### Konformitätstests vorbereiten

1. **Profile herunterladen:** ISiP-StructureDefinitions von Simplifier
2. **FHIR-Validator:** Offiziellen HL7 FHIR Validator nutzen (`validator_cli.jar`)
3. **Testdaten generieren:** FHIR-Ressourcen gegen ISiP-Profile validieren
4. **Fehlende Profile identifizieren:** Abgleich unserer Endpunkte mit ISiP-Anforderungen

### Relevanz für §45b-Betrieb
**NICHT ERFORDERLICH.** ISiP-Zertifizierung wird perspektivisch für die Interoperabilität mit anderen Pflegesystemen relevant, ist aber keine Voraussetzung für den Betrieb.

---

## 3. BSI TR-03161 / Pentest (B7)

### BSI TR-03161 (Sicherheitsanforderungen an DiGA/DiPA)

Die BSI TR-03161 definiert technische Sicherheitsanforderungen für Digitale Gesundheitsanwendungen.

**Teile der TR-03161:**
- Teil 1: Mobile Anwendungen
- Teil 2: Web-Anwendungen
- Teil 3: Hintergrundsysteme

**Zertifizierungsprozess:**
1. **Prüflabor auswählen:** BSI-anerkanntes Prüflabor (z.B. SRC, TÜV, atsec)
2. **Prüfung beauftragen:** Gegen TR-03161 Teil 2 (Web) und ggf. Teil 1 (Mobile/PWA)
3. **Prüfung durchführen:** 4-8 Wochen
4. **Bericht erhalten:** Prüfbericht mit Feststellungen
5. **Nachbesserungen:** Feststellungen beheben
6. **Zertifikat:** BSI-Zertifikat nach erfolgreicher Prüfung

**Kosten:** ca. 20.000-50.000 € (je nach Umfang)  
**Zeitrahmen:** 3-6 Monate

### Penetrationstest

**Was ein Pentester braucht:**

| # | Information | Wo zu finden |
|---|------------|-------------|
| 1 | Staging-URL | Vercel Preview-Deployment oder separate Staging-Instanz |
| 2 | Testkonten (alle Rollen) | Admin, Engel, Kunde, Fahrer — Supabase Auth |
| 3 | API-Dokumentation | OpenAPI-Spec oder Routenübersicht (`app/api/`) |
| 4 | Architekturübersicht | Next.js + Supabase + Vercel + Stripe |
| 5 | Scope-Definition | In-Scope: Web-App, API, Auth, RLS; Out-of-Scope: Supabase-Infrastruktur |
| 6 | Bisherige Findings | `docs/FINALE_BETRIEBSABNAHME.md` (9 kritische Fixes) |
| 7 | Besondere Risikobereiche | Gesundheitsdaten, Multi-Tenant, SEPA, EDIFACT |
| 8 | Kontaktperson | Für Rückfragen während des Tests |

**Empfohlener Scope für den Pentest:**
- Authentication und Authorization (inkl. RLS-Bypass-Versuche)
- Multi-Tenant-Isolation (Cross-Org-Zugriff)
- API-Security (alle 94+ Admin-Routen)
- IDOR/Broken Access Control
- Injection (SQL über Supabase-Client, XSS)
- Business Logic (Abrechnungsmanipulation, Budget-Bypass)
- Session Management
- Rate Limiting

**Kosten:** ca. 10.000-25.000 € (Web-App-Pentest)  
**Zeitrahmen:** 2-4 Wochen aktive Testphase

### MFA-Implementierung

MFA kann technisch JETZT implementiert werden — Supabase Auth v2 unterstützt TOTP nativ:
- `supabase.auth.mfa.enroll()` — TOTP-Faktor registrieren
- `supabase.auth.mfa.challengeAndVerify()` — Code verifizieren
- `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` — AAL1/AAL2 prüfen

**Geschätzter Aufwand:** 4-6 Tage (Enrollment-UI, Login-Flow, Middleware-Guard, Admin-Panel, Tests)

**Empfehlung:** MFA für Admin- und Engel-Konten verpflichtend, für Kunden optional.

---

## Zusammenfassung: Prioritäten

| # | Maßnahme | Für §45b nötig | Aufwand | Empfehlung |
|---|----------|---------------|---------|-----------|
| B3 KIM | Nein | 3-6 Monate + Hardware | Erst bei HKP-Erweiterung |
| B4 ISiP | Nein | 2-3 Monate | Erst bei Systemintegration |
| B7 MFA | Empfohlen | 4-6 Tage | Zeitnah implementieren |
| B7 Pentest | Empfohlen | 2-4 Wochen + Kosten | Vor DiPA-Antrag |
| B7 BSI | Nur für DiPA | 3-6 Monate + Kosten | Erst bei DiPA-Listung |
