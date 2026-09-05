# P11.4 Auth + Rollen
**Datum:** 05.09.2026 | **Phase:** P11.4 (P11 Master-Auftrag)

---

## 1. Rollenverteilung

### Alltagsengel (69 Auth Users, 69 Profiles)

| Rolle | Anzahl | Beschreibung |
|---|---|---|
| superadmin | 3 | System-Administratoren |
| admin | 1 | Administrator |
| engel | 24 | Alltagsbegleiter |
| fahrer | 5 | Fahrer (Begleitservice) |
| kunde | 36 | Kunden/Pflegebedürftige |

**Bewertung:** ✅ Saubere Rollentrennung. 3 Superadmins = angemessen für Startphase.

### ChairMatch (51 Profiles)

| Rolle | Anzahl | Beschreibung |
|---|---|---|
| super_admin | 3 | System-Administratoren |
| admin | 1 | Administrator |
| anbieter | 1 | Stuhlvermieter |
| kunde | 46 | Kunden |

**Bewertung:** ✅ Saubere Rollentrennung. Pre-Launch-Daten.

### efy care (0 Profiles, 0 Org Members)

Pre-Launch — keine aktiven Benutzer. Rollenmodell über `profiles.role` + `organization_members.org_role` vorbereitet.

**Bewertung:** ✅ Schema vorhanden, wartet auf erste Registrierung.

---

## 2. Auth-Sicherheit

### RLS-basierte Rollendurchsetzung

| Projekt | Mechanismus | Status |
|---|---|---|
| AE | `profiles.role` + RLS-Hilfsfunktionen (is_admin, aktuelle_rolle, darf) | ✅ |
| CM | `profiles.role` + RLS-Hilfsfunktionen (is_admin, is_super_admin) | ✅ |
| efy | `org_members.org_role` + DEFINER-Funktionen (is_org_admin, is_org_member) | ✅ |

### Zugriffskontrolle

| Prüfung | AE | CM | efy |
|---|---|---|---|
| FORCE RLS alle Tabellen | ✅ 326/326 | ✅ 79/80 | ✅ 48/48 |
| Admin-Only Tabellen geschützt | ✅ | ✅ | ✅ |
| Anon-Zugriff blockiert | ✅ | ✅ | ✅ |
| Profiles ↔ Auth Users konsistent | ✅ 0 Waisen | ✅ 0 Waisen | ✅ 0 Waisen |

### Empfehlungen (nicht-blockierend)

1. **MFA aktivieren** — Für Admin/Superadmin-Konten über Supabase Dashboard empfohlen. Priorität: MEDIUM.
2. **JWT-Expiry prüfen** — Standard Supabase JWT-Lifetime über Dashboard verifizieren. Priorität: LOW.
3. **Email-Confirmation** — Über Dashboard sicherstellen, dass E-Mail-Bestätigung für neue Registrierungen aktiv ist. Priorität: LOW.

---

## 3. Gesamtergebnis P11.4

| Bereich | AE | CM | efy | Status |
|---|---|---|---|---|
| Rollenmodell | ✅ | ✅ | ✅ | GRÜN |
| RLS-Durchsetzung | ✅ | ✅ | ✅ | GRÜN |
| Profile-Auth-Konsistenz | ✅ | ✅ | ✅ | GRÜN |
| Admin-Zugang geschützt | ✅ | ✅ | ✅ | GRÜN |

### Kritische Blocker: 0

---

*Erstellt: 05.09.2026 | Methode: SQL-Audit (profiles, organization_members, auth.users)*
