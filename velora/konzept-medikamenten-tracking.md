# Konzept: Medikamenten-Tracking Feature

> Gilt für: **Velora** und **Alltagsengel**
> Stand: Juli 2026
> Status: Konzeptphase

---

## 1. Problemstellung

Medikamentenfehler sind eine der häufigsten vermeidbaren Ursachen für Krankenhauseinweisungen bei älteren Menschen. Typische Probleme:

- **Vergessene Einnahme** — besonders bei komplexen Medikationsplänen (3+ Medikamente)
- **Doppelte Einnahme** — Unsicherheit, ob bereits eingenommen wurde
- **Falsche Uhrzeit** — zeitkritische Medikamente (z.B. Schilddrüse nüchtern, Insulin vor dem Essen)
- **Angehörige ohne Überblick** — keine Möglichkeit, die Einnahme aus der Ferne zu überwachen
- **Wechselwirkungen** — bei mehreren Fachärzten fehlt oft die Gesamtübersicht

## 2. Lösung

Ein integriertes Medikamenten-Tracking-System mit drei Säulen:

### 2.1 Push-Benachrichtigungen für Medikamenteneinnahme

**Funktionsweise** — wie ein intelligenter Wecker, der nicht nur klingelt, sondern auch weiß *warum*:

- Konfigurierbare Erinnerungen pro Medikament (Uhrzeit, Häufigkeit, Mahlzeitenbezug)
- Eskalationsstufen bei Nicht-Bestätigung:
  1. **Erste Erinnerung** — Push-Nachricht mit Medikamentenname + Dosierung
  2. **Folge-Erinnerung** (nach 15 Min.) — erneute Push-Nachricht, auffälliger
  3. **Angehörigen-Alarm** (nach 30 Min.) — Push an verknüpfte Angehörige
  4. **Alltagsbegleiter-Info** (nach 60 Min.) — Benachrichtigung an zuständigen Begleiter
- Bestätigung durch einfaches Tippen ("Eingenommen") oder Wischen
- Optionale Foto-Bestätigung (Medikament in der Hand) für erhöhte Sicherheit

### 2.2 Angehörigen-Überwachung

**Funktionsweise** — wie ein geteilter Kalender, aber für Medikamente:

- **Dashboard** für Angehörige: Übersicht aller Medikamente und Einnahmestatus (heute/Woche/Monat)
- **Statusanzeige**: ✅ Eingenommen | ⏳ Ausstehend | ❌ Verpasst | ⚠️ Verspätet
- **Push an Angehörige** bei verpassten Einnahmen (konfigurierbar: sofort / Tagesübersicht)
- **Mehrere Angehörige** können verknüpft werden (z.B. Tochter + Sohn)
- **Wochenreport** per E-Mail: Zusammenfassung der Einnahmetreue
- **Berechtigungsstufen**:
  - *Beobachter* — sieht Status, keine Änderungen
  - *Mitverwalter* — kann Medikamente hinzufügen/ändern
  - *Koordinator* — voller Zugriff inkl. Arzt-Kontaktdaten

### 2.3 Überdosis-Schutz

**Funktionsweise** — wie eine digitale Sicherung, die bei Überlast abschaltet:

- **Einnahme-Limit**: Maximale Tagesdosis pro Medikament hinterlegt
- **Doppel-Einnahme-Warnung**: "Sie haben Metformin heute bereits um 08:15 eingenommen. Trotzdem bestätigen?"
- **Zeitfenster-Schutz**: Mindestabstand zwischen Einnahmen (z.B. Ibuprofen frühestens nach 6 Stunden)
- **Wechselwirkungs-Warnung**: Hinweis bei bekannten kritischen Kombinationen
- **Protokollierung**: Jede Einnahme wird mit Zeitstempel gespeichert — für Arztbesuche exportierbar

## 3. Datenmodell

### Tabelle: `medications`
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| id | UUID | Primärschlüssel |
| user_id | UUID → profiles | Pflegebedürftige Person |
| name | TEXT | Medikamentenname |
| dosierung | TEXT | z.B. "500mg", "2 Tabletten" |
| wirkstoff | TEXT | Wirkstoff (für Wechselwirkungen) |
| max_tagesdosis | INTEGER | Maximale Einnahmen pro Tag |
| mindest_abstand_minuten | INTEGER | Mindestzeit zwischen Einnahmen |
| hinweise | TEXT | z.B. "nüchtern einnehmen", "nicht mit Milch" |
| aktiv | BOOLEAN | Aktuell verschrieben |
| erstellt_am | TIMESTAMPTZ | Erstellungszeitpunkt |

### Tabelle: `medication_schedules`
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| id | UUID | Primärschlüssel |
| medication_id | UUID → medications | Verknüpftes Medikament |
| uhrzeit | TIME | Geplante Einnahmezeit |
| wochentage | INTEGER[] | Wochentage (1=Mo, 7=So), NULL = täglich |
| mahlzeit_bezug | ENUM | vor_essen / zum_essen / nach_essen / unabhängig |
| eskalation_aktiv | BOOLEAN | Erinnerungs-Eskalation an/aus |

### Tabelle: `medication_logs`
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| id | UUID | Primärschlüssel |
| schedule_id | UUID → medication_schedules | Geplante Einnahme |
| status | ENUM | eingenommen / verpasst / verspaetet / abgelehnt |
| bestaetigt_um | TIMESTAMPTZ | Tatsächlicher Einnahmezeitpunkt |
| bestaetigt_von | UUID → profiles | Wer bestätigt hat (Selbst/Angehöriger/Begleiter) |
| foto_url | TEXT | Optionales Bestätigungsfoto |
| notiz | TEXT | Optionale Notiz |

### Tabelle: `medication_watchers`
| Feld | Typ | Beschreibung |
|------|-----|-------------|
| id | UUID | Primärschlüssel |
| medication_user_id | UUID → profiles | Pflegebedürftige Person |
| watcher_id | UUID → profiles | Angehöriger |
| berechtigung | ENUM | beobachter / mitverwalter / koordinator |
| benachrichtigung | ENUM | sofort / tagesuebersicht / keine |

## 4. Push-Notification-Flow

```
┌─────────────┐
│  Cron-Job   │  Supabase Edge Function, läuft minütlich
│  (1x/Min)   │
└──────┬──────┘
       │ prüft medication_schedules
       ▼
┌─────────────────┐    Ja    ┌──────────────────┐
│ Einnahme fällig? │────────▶│  Push an User    │
└────────┬────────┘          │  (Expo Push)     │
         │ Nein              └────────┬─────────┘
         ▼                           │
    (nichts tun)                     ▼
                          ┌───────────────────┐
                          │ Bestätigt nach    │
                          │ 15 Min?           │
                          └────────┬──────────┘
                                   │ Nein
                                   ▼
                          ┌───────────────────┐
                          │ Folge-Erinnerung  │
                          │ + nach 30 Min:    │
                          │ Angehörigen-Alarm │
                          └───────────────────┘
```

## 5. Datenschutz & Sicherheit

Medikamentendaten sind **Gesundheitsdaten** nach Art. 9 DSGVO — besonders schützenswert:

- **Verschlüsselung**: Alle Medikamentendaten verschlüsselt at rest (Supabase) und in transit (TLS 1.3)
- **RLS-Policies**: Nur der User selbst und autorisierte Watcher sehen die Daten
- **Einwilligung**: Explizite Einwilligung des Pflegebedürftigen vor Freigabe an Angehörige
- **Löschung**: Vollständige Löschung aller Medikamentendaten auf Anfrage (Art. 17 DSGVO)
- **Audit-Log**: Jeder Zugriff auf Medikamentendaten wird protokolliert
- **Keine Weitergabe**: Medikamentendaten werden NICHT an Pflegekassen, Versicherungen oder Dritte weitergegeben

## 6. UI/UX-Skizze

### Hauptansicht (Pflegebedürftiger)
```
┌────────────────────────────────┐
│  Heute, 4. Juli                │
│                                │
│  ☀️ Morgens (08:00)            │
│  ┌──────────────────────────┐  │
│  │ ✅ Metformin 500mg       │  │
│  │    eingenommen 08:12     │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │ ✅ L-Thyroxin 75µg      │  │
│  │    eingenommen 08:05     │  │
│  └──────────────────────────┘  │
│                                │
│  🌤️ Mittags (12:00)           │
│  ┌──────────────────────────┐  │
│  │ ⏳ Metformin 500mg       │  │
│  │    [  Eingenommen  ]     │  │
│  └──────────────────────────┘  │
│                                │
│  🌙 Abends (18:00)            │
│  ┌──────────────────────────┐  │
│  │ ○ Metformin 500mg        │  │
│  │ ○ Ramipril 5mg           │  │
│  └──────────────────────────┘  │
└────────────────────────────────┘
```

### Angehörigen-Dashboard
```
┌────────────────────────────────┐
│  Mama — Medikamente            │
│                                │
│  Heute: 2/5 eingenommen        │
│  ████░░░░░░ 40%                │
│                                │
│  Diese Woche: 92% Treue        │
│  Letzter Alarm: keiner         │
│                                │
│  Nächste Einnahme:             │
│  Metformin 500mg — 12:00       │
└────────────────────────────────┘
```

## 7. Implementierungsplan

| Phase | Zeitraum | Inhalt |
|-------|----------|--------|
| 1 | Monat 1–2 | Datenmodell, Medikamenten-CRUD, einfache Push-Erinnerungen |
| 2 | Monat 3 | Eskalationslogik, Angehörigen-Verknüpfung, Watcher-Dashboard |
| 3 | Monat 4 | Überdosis-Schutz, Wechselwirkungs-Datenbank, Foto-Bestätigung |
| 4 | Monat 5 | Wochenreports, Export für Arztbesuche, Feinschliff |
| 5 | Monat 6 | Beta-Test mit 10–20 Nutzern, Feedback-Iteration |

## 8. Offene Fragen

- **Wechselwirkungs-Datenbank**: Eigene Datenbank aufbauen oder API-Anbindung (z.B. ABDA-Datenbank)?
- **Verifizierung**: Reicht Tap-Bestätigung oder brauchen wir Foto/NFC für Compliance?
- **Haftung**: Wie weit reicht unsere Verantwortung bei Medikamentenfehlern trotz Tracking?
- **Ärzte-Integration**: Sollen Ärzte direkt Medikationspläne in die App übertragen können?
- **Kosten**: Lizenzkosten für Wechselwirkungs-Datenbanken?
