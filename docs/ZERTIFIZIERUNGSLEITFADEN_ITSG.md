# Zertifizierungsleitfaden: ITSG-Zertifikat für DTA/EDIFACT

**Stand:** 2026-08-12  
**Betrifft:** B1 — ITSG-Zertifikat für elektronische Datenübermittlung an Kostenträger  
**Grundlage:** § 105 SGB XI, § 302 SGB V

---

## Übersicht

Das ITSG-Zertifikat wird vom Trust-Center der ITSG (Informationstechnische Servicestelle der Gesetzlichen Krankenversicherung) GmbH ausgestellt. Es berechtigt zur verschlüsselten elektronischen Datenübermittlung an Datenannahmestellen der Kostenträger im Rahmen des DTA-Verfahrens (Datenträgeraustausch).

**Ohne ITSG-Zertifikat:** Rechnungen können nur per Papier/PDF an Pflegekassen gesendet werden.  
**Mit ITSG-Zertifikat:** Elektronische Übermittlung via EDIFACT/SECON über Datenannahmestellen.

---

## Voraussetzungen

### Technisch (im System vorhanden)
- [x] EDIFACT-Generator (PLGA/PLAA) mit Stufe-1-3-Validierung
- [x] SECON-Verschlüsselung (PKCS#7-Stub, produktionsreif für Zertifikatsintegration)
- [x] ISO-8859-1 Encoding (Latin-1) für Nutzdaten und Auftragsdatei
- [x] IK-Prüfziffern-Validierung
- [x] SFTP-Transport-Layer (`lib/abrechnung/transport.ts`)
- [x] Readiness-Dashboard mit Ampelsystem
- [x] Test/Echt-Dateiindikator (0 vs. 2)

### Organisatorisch (zu beschaffen)
- [ ] Gültige IK-Nummer (Institutionskennzeichen) — konfiguriert als `460629986`
- [ ] Ansprechpartner für technische Anbindung benannt
- [ ] Vertrag mit einer Datenannahmestelle (z.B. BITMARCK, DIGA, ARGE)

---

## Schritt-für-Schritt: Zertifizierungsprozess

### Schritt 1: ITSG-Registrierung

**Website:** https://www.itsg.de/produkte/trust-center/

1. Registrierung als Leistungserbringer im ITSG Trust-Center
2. Angabe der IK-Nummer: `460629986`
3. Benennung eines technischen Ansprechpartners
4. Angabe der verwendeten Abrechnungssoftware (Eigenentwicklung)

### Schritt 2: Schlüsselpaar generieren

1. RSA-Schlüsselpaar (2048 Bit oder höher) generieren
2. Certificate Signing Request (CSR) erstellen mit:
   - Common Name (CN): IK-Nummer oder Organisationsname
   - Organization (O): Alltagsengel [Firmenname]
   - Email: [Kontakt-E-Mail]
3. CSR an ITSG Trust-Center übermitteln

**Technisch:** Der SECON-Stub in `lib/abrechnung/secon.ts` muss um die Integration des ITSG-Zertifikats erweitert werden. Die PKCS#7-Infrastruktur ist vorbereitet.

### Schritt 3: Zertifikat erhalten und installieren

1. ITSG prüft den Antrag
2. Zertifikat wird ausgestellt (X.509)
3. Zertifikat im System konfigurieren:
   - Privater Schlüssel: Sicher speichern (Supabase Vault oder Umgebungsvariable)
   - Öffentliches Zertifikat: Im SECON-Modul für Verschlüsselung nutzen
   - CA-Zertifikat des Trust-Centers: Für Validierung der Empfängerzertifikate

### Schritt 4: Anbindungstest mit Datenannahmestelle

1. Test-Datenannahmestelle auswählen (z.B. DIGA Testumgebung)
2. SFTP-Zugangsdaten konfigurieren (`/api/admin/abrechnung/sftp-key`)
3. Verbindungstest durchführen (`testeVerbindung()`)
4. Test-EDIFACT-Datei senden (Dateiindikator = 0 für Test)
5. Antwortdateien empfangen und prüfen (`pruefeAntworten()`)

### Schritt 5: Produktivfreigabe

1. Erfolgreiche Testübermittlung dokumentieren
2. Dateiindikator auf 2 (Echtdaten) umstellen
3. Readiness-Dashboard auf „Grün" prüfen
4. Erste Echtabrechnung übermitteln

---

## Zeitrahmen

| Schritt | Geschätzter Zeitaufwand |
|---------|------------------------|
| Registrierung | 1-2 Wochen |
| Schlüsselgenerierung + CSR | 1 Tag (technisch) |
| Zertifikatsausstellung | 2-4 Wochen |
| Anbindungstest | 1-2 Wochen |
| Produktivfreigabe | 1 Woche |
| **Gesamt** | **ca. 6-10 Wochen** |

---

## Kosten

- Registrierung und Zertifikat: Gebühren nach ITSG-Preisliste (typisch einige Hundert Euro/Jahr)
- Datenannahmestelle: Ggf. monatliche Gebühr je nach Anbieter

---

## Kontakt

- **ITSG GmbH:** https://www.itsg.de/
- **Trust-Center:** https://www.itsg.de/produkte/trust-center/
- **Telefon:** 069 / 95 71 57 - 0
- **E-Mail:** trustcenter@itsg.de

---

## Technische Integration in Alltagsengel

### Betroffene Dateien

| Datei | Änderung |
|-------|---------|
| `lib/abrechnung/secon.ts` | PKCS#7-Stub → echte Verschlüsselung mit ITSG-Zertifikat |
| `lib/abrechnung/transport.ts` | SFTP-Anbindung ist fertig, nur Credentials nötig |
| `lib/abrechnung/versand-guard.ts` | Readiness-Check für Zertifikatsstatus ergänzen |
| `.env` / Supabase Vault | Privaten Schlüssel + Zertifikat speichern |

### SECON-Erweiterung

Der aktuelle SECON-Stub (`secon.ts`) muss erweitert werden um:
1. Laden des privaten Schlüssels aus Vault/Env
2. Laden des ITSG-Zertifikats
3. Laden des Empfänger-Zertifikats (Datenannahmestelle)
4. Echte PKCS#7 Enveloped-Data Verschlüsselung
5. PKCS#7 Signed-Data Signatur

Die PKCS#7-Bibliothek `node-forge` oder `pkcs7` kann dafür verwendet werden.
