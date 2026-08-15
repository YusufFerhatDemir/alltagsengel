# Briefing für ISO 27001 Zertifizierung — ISMS für den Digitalen PflegeCoach

**Produkt:** Digitaler PflegeCoach
**Hersteller:** Alltagsengel UG (haftungsbeschränkt), Neue Mainzer Straße 66-68, 60311 Frankfurt am Main
**Stand dieses Briefings:** 2026-08-15
**Status:** Briefing für Auftragsvergabe — **noch nicht beauftragt**
**DiPA-Matrix-Kennung:** SEC-05 — **EINGANGSBLOCKER** (Zeitklasse A, bei Antragstellung vorzulegen)

---

## Zweck und Leseanleitung

Dieses Dokument fasst zusammen, was eine **DAkkS-akkreditierte Zertifizierungsstelle**
benötigt, um ein Angebot für eine ISO-27001-Zertifizierung des ISMS der
Alltagsengel UG abzugeben. SEC-05 ist seit dem regulatorischen Final-Check
(15.08.2026) als **dritter Eingangsblocker** für den DiPA-Antrag identifiziert —
der BfArM-Leitfaden v1.3 verlangt das Zertifikat „bei der Antragstellung"
(Kap. 3.4.1, S. 50), nicht erst bei Aufnahme ins Verzeichnis.

**Rechtsgrundlage:** TR-03161-3 O.Org_1 (ISO 27001 / IT-Grundschutz, MUSS) +
DiPAV § 8 Abs. 3 S. 2 + BfArM-Leitfaden v1.3 Kap. 3.4.1 (S. 50).

**Ausdrücklich:**

- Es liegt **keine DiPA-Zulassung** vor, keine ist beantragt.
- Der PflegeCoach ist für Endnutzer **dauerhaft kostenlos**.
- Dieses Briefing dient ausschließlich der Vorbereitung.

---

## 1. Anforderung im Detail

### 1.1 Was gefordert ist

Ein **ISO/IEC 27001:2022-Zertifikat**, ausgestellt von einer **DAkkS-akkreditierten
Zertifizierungsstelle**, auf den Hersteller (Alltagsengel UG) ausgestellt. Der
Scope muss mindestens den Betrieb des Digitalen PflegeCoach (Entwicklung,
Bereitstellung, Wartung der DiPA) umfassen.

Alternativ wäre ein IT-Grundschutz-Zertifikat des BSI gleichwertig (TR-03161-3
O.Org_1 nennt beides). Aufgrund der höheren internationalen Verbreitung und
geringerer Komplexität für eine UG wird hier ISO 27001 empfohlen.

### 1.2 Erweiterter Scope aus TR-03161

Die TR-03161-3 benennt neben O.Org_1 weitere organisatorische Anforderungen,
die im ISMS-Scope abgedeckt sein sollten:

| TR-Anforderung | Inhalt | Relevanz für ISMS-Scope |
|---|---|---|
| O.Org_2 | C5-Typ-2-Testat der Cloud-Dienstleister | Supabase/Vercel müssen Testat vorweisen; ggf. im SoA referenzieren |
| O.Org_3 | Monitoring und Alarmprozesse | SOC-Prozess dokumentieren |
| O.Org_4 | Alarmprozesse | Incident-Response-Plan |
| O.Org_5 | Notfallvorsorgekonzept | Business Continuity / Disaster Recovery |

### 1.3 Zeitkritikalität

| Aspekt | Einschätzung |
|---|---|
| Typische ISMS-Aufbauzeit | 6–9 Monate (kleine Organisation, < 10 Personen) |
| Zertifizierungsaudit (Stufe 1 + 2) | 2–4 Wochen (nicht zusammenhängend) |
| Gesamtvorlaufzeit bis Zertifikat | **8–12 Monate** |
| Jährliches Überwachungsaudit | ca. 1–2 Tage |
| Rezertifizierung | alle 3 Jahre |

**SEC-05 hat damit die längste Vorlaufzeit aller DiPA-Blocker.**

---

## 2. Ist-Zustand der Organisation

### 2.1 Unternehmensprofil

| Merkmal | Wert |
|---|---|
| Rechtsform | UG (haftungsbeschränkt) |
| Standort | Frankfurt am Main (kein eigenes Rechenzentrum) |
| Mitarbeitende | < 10 |
| IT-Infrastruktur | Cloud-only (Supabase, Vercel, Resend, Stripe) |
| Eigenentwicklung | Next.js-Webanwendung, PostgreSQL-Datenbank |
| Physische Assets | Entwickler-Laptops, kein Server-Raum |

### 2.2 Bereits vorhandene Dokumentation

| Dokument | Pfad | Inhalt |
|---|---|---|
| ISMS-Scope-Vorbereitung | `audit/dipa/isms_scope_vorbereitung.md` | Erste Scope-Definition, Assetliste, Risikoidentifikation |
| QMS-Handbuch | `audit/dipa/qms_handbuch_pflegecoach.md` | Qualitäts- und Risikomanagement (überlappend, nicht ISO-27001-konform) |
| Sicherheitsarchitektur | `audit/dipa/sicherheitsarchitektur_pflegecoach.md` | Technische Maßnahmen, Vertrauensgrenzen, bekannte Schwächen |
| Verschlüsselungskonzept | `audit/dipa/verschluesselungskonzept.md` | Transport-/Ruhezustandsverschlüsselung |
| Rollen-/Rechtekonzept | `audit/dipa/rollen_rechtekonzept.md` | Zugriffskontrolle, RLS-Policies |
| Löschkonzept | `audit/dipa/loeschkonzept.md` | Löschfristen, Betroffenenrechte |

### 2.3 Bereits umgesetzte technische Maßnahmen

- Row Level Security als alleinige Zugriffswahrheit (68 Shadow-Tests)
- TLS in Transit, At-Rest-Verschlüsselung durch Supabase
- MFA (TOTP) implementiert, serverseitig fail-closed durchgesetzt
- Precommit-Guard mit 11+ Secret-Pattern-Erkennung
- CI-Pipeline mit Typecheck, Tests, Secret-Scan, E2E
- Append-only Audit-Log per Datenbank-Trigger
- CSP, HSTS (2 Jahre mit Preload), X-Frame-Options DENY
- `server-only`-Import + Runtime-Guard für service_role-Key

### 2.4 Bekannte Lücken zum ISO-27001-Standard

| ISO-27001-Anforderung | Ist-Zustand | Gap |
|---|---|---|
| Informationssicherheitspolitik (A.5.1) | Nicht formalisiert | Muss erstellt werden |
| Risikobewertungsprozess (6.1.2) | Technisch vorhanden, nicht ISO-konform dokumentiert | Methodik formalisieren |
| Statement of Applicability (SoA) | Nicht vorhanden | Kernstück, muss erstellt werden |
| Incident-Management-Prozess (A.5.24-28) | Kein formaler Prozess | Muss aufgebaut werden |
| Business Continuity (A.5.29-30) | Keine formale Planung, Backups via Supabase | Muss dokumentiert/getestet werden |
| Lieferantenbewertung (A.5.19-22) | AVVs nicht geschlossen (→ DS-04) | Parallel zum Datenschutzpaket |
| Awareness-/Schulungsprogramm (A.6.3) | Nicht vorhanden | Muss aufgebaut werden |
| Asset-Management (A.5.9-13) | ISMS-Vorbereitung enthält Assetliste | Vervollständigen |
| Internes Audit (9.2) | Nicht durchgeführt | Mindestens 1x vor Zertifizierung |
| Managementbewertung (9.3) | Nicht durchgeführt | Mindestens 1x vor Zertifizierung |

---

## 3. Anforderungen an die Zertifizierungsstelle

### 3.1 Zwingende Anforderungen

- **DAkkS-Akkreditierung** für ISO/IEC 27001:2022 (nicht nur 27001:2013)
- Erfahrung mit **kleinen Organisationen** (< 10 Personen, Cloud-only)
- Bereitschaft zur Zertifizierung einer **UG (haftungsbeschränkt)**
- Idealerweise Erfahrung im **Gesundheitswesen / DiGA / DiPA** (TR-03161-Kontext)

### 3.2 Geeignete DAkkS-akkreditierte Zertifizierungsstellen

| Anbieter | Standort | Profil | Relevanz |
|---|---|---|---|
| **DQS GmbH** | Frankfurt am Main | Deutsche Gesellschaft zur Zertifizierung von Managementsystemen; breit aufgestellt, Healthcare-Erfahrung, KMU-freundlich | **Empfohlen** — Standortnähe, KMU-Erfahrung |
| **TÜV SÜD Management Service GmbH** | München | Großer Zertifizierer, Healthcare-Sektor-Erfahrung, ISO-27001-Kompetenz gut dokumentiert | Geeignet |
| **TÜV Rheinland Cert GmbH** | Köln | Breites Portfolio, ISO 27001 + IT-Grundschutz, Healthcare-Projekte | Geeignet |
| **TÜV Nord CERT GmbH** | Hannover | IT-Sicherheit als Schwerpunkt, Erfahrung mit Startups | Geeignet |
| **DEKRA Certification GmbH** | Stuttgart | ISO-27001-Zertifizierung, KMU-Pakete vorhanden | Geeignet |
| **BSI Group Deutschland GmbH** | Frankfurt | Originale ISO-Entwickler; nicht zu verwechseln mit dem Bundesamt (BSI) | Geeignet |

**Hinweis:** Die DAkkS-Akkreditierungsdatenbank (dakks.de) ist die verbindliche
Referenz. Die obige Liste ist eine Vorauswahl, keine abschließende Empfehlung.

### 3.3 Ergänzend: ISMS-Beratung (optional, empfohlen)

Da die Zertifizierungsstelle selbst nicht beraten darf (Unabhängigkeit), wird
ein **separater ISMS-Berater** für den Aufbau empfohlen. Geeignete Anbieter:

| Anbieter | Profil |
|---|---|
| Secunet Security Networks AG | BSI-Partnerunternehmen, Gesundheitswesen-Fokus |
| HiSolutions AG (Berlin) | ISMS-Beratung, DiGA/DiPA-Erfahrung dokumentiert |
| Althammer & Kill GmbH & Co. KG | Datenschutz + ISMS im Gesundheitswesen |
| carmasec GmbH & Co. KG | ISMS für Startups/KMU, Healthcare-Branche |

---

## 4. Realistischer Kostenrahmen

### 4.1 ISMS-Aufbau (Beratung, optional aber empfohlen)

| Posten | Kostenrahmen | Anmerkung |
|---|---|---|
| ISMS-Beratung (Aufbau, Dokumentation, SoA) | 15.000–30.000 € | Abhängig vom Scope, für < 10 Personen am unteren Ende |
| Gap-Analyse | 3.000–5.000 € | Oft als Paket mit Aufbauberatung |
| Internes Audit (durch Berater) | 2.000–4.000 € | Mindestens 1x vor Zertifizierung |

### 4.2 Zertifizierung (Zertifizierungsstelle)

| Posten | Kostenrahmen | Anmerkung |
|---|---|---|
| Stufe-1-Audit (Dokumentenprüfung) | 3.000–5.000 € | 1–2 Tage |
| Stufe-2-Audit (Vor-Ort-/Remote-Prüfung) | 5.000–10.000 € | 2–4 Tage |
| Zertifikatsausstellung | 500–1.500 € | Einmalig |
| **Erstzertifizierung gesamt** | **8.500–16.500 €** | Zertifizierungsstelle allein |

### 4.3 Laufende Kosten

| Posten | Kostenrahmen / Jahr | Anmerkung |
|---|---|---|
| Überwachungsaudit (jährlich) | 3.000–6.000 € | 1–2 Tage |
| Rezertifizierungsaudit (alle 3 Jahre) | 6.000–12.000 € | Wie Erstzertifizierung, etwas kürzer |
| ISMS-Pflege (intern oder Berater) | 5.000–10.000 € | Dokumentenpflege, Risikobewertung, Management-Review |

### 4.4 Gesamtinvestition erstes Jahr

| Szenario | Kosten |
|---|---|
| Minimum (Eigenaufbau + Zertifizierung) | 10.000–20.000 € |
| Empfohlen (Beratung + Zertifizierung) | 25.000–50.000 € |
| Maximum (umfangreiche Beratung + Premium-Zertifizierer) | 40.000–55.000 € |

---

## 5. Vorgehensmodell (empfohlen)

### Phase 1: Gap-Analyse und Scope-Definition (Monat 1–2)

- Scope festlegen: „Entwicklung, Bereitstellung und Wartung des Digitalen PflegeCoach"
- Gap-Analyse gegen ISO 27001:2022 + Annex A
- Risikobewertungsmethodik definieren
- Informationssicherheitspolitik entwerfen

### Phase 2: ISMS-Aufbau und Dokumentation (Monat 2–6)

- Statement of Applicability (SoA) erstellen
- Risikobehandlungsplan
- Pflichtdokumente erstellen (Informationssicherheitspolitik, Risikobewertung,
  Incident-Management, Business Continuity, Lieferantenbewertung, Asset-Register)
- Bestehende Dokumentation (Sicherheitsarchitektur, Verschlüsselungskonzept, etc.)
  in ISMS-Struktur überführen
- Awareness-Schulung durchführen

### Phase 3: Betrieb und internes Audit (Monat 6–8)

- ISMS mindestens 2–3 Monate betreiben (Nachweisbarkeit)
- Internes Audit durchführen
- Managementbewertung durchführen
- Korrekturmaßnahmen umsetzen

### Phase 4: Zertifizierungsaudit (Monat 8–12)

- Stufe-1-Audit (Dokumentenprüfung, remote möglich): 1–2 Tage
- Nachbesserungen aus Stufe 1 umsetzen (typisch 4–8 Wochen)
- Stufe-2-Audit (Wirksamkeitsprüfung): 2–4 Tage
- Zertifikatsausstellung (bei Bestehen): 2–4 Wochen

---

## 6. Intern vorzubereitende Dokumentation

Diese Dokumente sollten **vor** der Beauftragung eines ISMS-Beraters vorbereitet
werden, um Beratungskosten zu reduzieren:

| Dokument | Status | Aktion |
|---|---|---|
| Asset-Inventar (Hardware, Software, Cloud-Dienste) | Teilweise in `isms_scope_vorbereitung.md` | Vervollständigen |
| Org-Chart / Verantwortlichkeiten | Nicht formalisiert | Erstellen |
| Bestehende Sicherheitsmaßnahmen (Übersicht) | In mehreren Audit-Dokumenten verteilt | Konsolidieren |
| Lieferantenliste mit Kritikalität | In `avv_dossier_pflegecoach.md` | Aktualisieren |
| Bestehende Prozesse (Entwicklung, Deployment, Incident) | deploy.sh, CI-Pipeline, precommit-guard | Dokumentieren |
| C5-Testate der Cloud-Anbieter | Nicht eingeholt | Supabase/Vercel anfragen (O.Org_2) |

---

## 7. Abhängigkeiten zu anderen Paketen

| Abhängigkeit | Richtung | Auswirkung |
|---|---|---|
| DS-04 (AVV-Kette) | SEC-05 → DS-04 | Lieferantenbewertung braucht geschlossene AVVs; kann parallel laufen |
| SEC-01 (TR-03161) | unabhängig | Andere Prüfstelle, anderer Scope; kann parallel laufen |
| QMS-01 (QM-System) | überlappend | QMS-Handbuch kann ins ISMS integriert werden |

---

## 8. Ansprechpartner

Ansprechpartner: **[wird von Alltagsengel benannt]**

---

## 9. Nächste Schritte

1. **Angebote einholen** bei 2–3 DAkkS-akkreditierten Zertifizierungsstellen
   (Empfehlung: DQS, TÜV SÜD, DEKRA)
2. **Parallel:** Angebot für ISMS-Beratung einholen (getrennt von Zertifizierung)
3. **C5-Testate** bei Supabase und Vercel anfragen (benötigt für O.Org_2)
4. Gap-Analyse beauftragen
5. ISMS-Aufbau starten (kritischer Pfad — je früher desto besser)

---

## 10. Bereitzustellende Unterlagen

| Dokument | Inhalt |
|---|---|
| `audit/dipa/isms_scope_vorbereitung.md` | Erste Scope-Definition und Assetliste |
| `audit/dipa/qms_handbuch_pflegecoach.md` | Qualitäts- und Risikomanagement |
| `audit/dipa/sicherheitsarchitektur_pflegecoach.md` | Technische Maßnahmen, bekannte Schwächen |
| `audit/dipa/verschluesselungskonzept.md` | Kryptographie-Konzept |
| `audit/dipa/rollen_rechtekonzept.md` | Rollen und Rechte |
| `audit/dipa/loeschkonzept.md` | Löschfristen und -prozesse |
| dieses Dokument | Gesamtübersicht für Angebotsanfrage |

---

## 11. Klassifizierung

| Kriterium | Bewertung |
|---|---|
| MUSS EXTERN | **Ja** — DAkkS-akkreditierte Zertifizierungsstelle gesetzlich zwingend |
| Intern vorbereitbar | Ja — ISMS-Dokumentation, Asset-Inventar, Prozessdokumentation |
| Zeitklasse | **A** — bei Antragstellung vorzulegen (Eingangsblocker) |
| Priorität | **P0** — kritischer Pfad, längste Vorlaufzeit |
