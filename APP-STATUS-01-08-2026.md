# App-Status — Samstag 01.08.2026

## Alltagsengel (Next.js) — LIVE auf alltagsengel.care

### Was gebaut ist
- **17 öffentliche Seiten** + 36 Blog-Artikel + SEO/Schema.org
- **4 Portale**: Kunde, Engel, Fahrer, Admin — rollenbasierte Auth (5 Rollen)
- **55+ API-Endpunkte** (REST + Webhooks)
- **19-seitiges MIS** (Management-Informationssystem)
- **Investor Data-Room** (DE + EN)

### Stripe
Fertig — 5 Tarife (free / starter 99€ / pro 199€ / scale 349€), Checkout, Portal, Webhooks, Settings UI. Lazy-Proxy-Fix war der letzte Commit (Vercel-Build gefixt).

### Multi-Mandant SaaS
Komplett codiert (organizations, members, subscriptions, org_id auf 63 Tabellen, RLS, OrgSwitcher UI). **ABER: Migration noch NICHT auf Prod-DB angewendet.** Läuft aktuell im Single-Org-Modus.

### Eylems Betriebssystem-Plan (Admin Dashboard)
27+ Admin-Seiten — Phase 1 komplett umgesetzt:

| Modul | Status |
|-------|--------|
| Klientenverwaltung | ✅ Fertig |
| Aktenführung + Budgets | ✅ Fertig |
| Rechnungen + Verordnungen | ✅ Fertig |
| EDIFACT-Abrechnung | ✅ Fertig |
| SECON-Verschlüsselung | ✅ Fertig |
| Dienstplanung | ✅ Fertig |
| Qualitätsmanagement | ✅ Fertig |
| Partnerverwaltung | ✅ Fertig |
| Multi-Mandant auf Prod | ⚠️ Offen |

### Kritische Lücken
- Multi-Mandant-Migration nicht auf Prod aktiviert
- database.types.ts fehlt
- WhatsApp-Webhook ohne Signatur-Verifizierung
- Kein CI/CD
- Pflegebox deaktiviert

---

## efy care (Expo / React Native) — SDK 57 / RN 0.86

### Was gebaut ist
- **28 Screens** über 5 Tabs + 13 Stack-Routes
- **Offline-First-Architektur** (Crypto, Queue, Sync)
- **30+ Tabellen** mit 10 Migrationen
- **4 Edge Functions** (OCR via Claude Sonnet 5 + 3x Stripe)

### Features
- ✅ Multi-Mandant + RLS (komplett)
- ✅ Stripe (5 Tarife, Checkout, Portal, Webhook)
- ✅ EDIFACT §105 SGB XI
- ✅ OCR (Claude Sonnet)
- ✅ Offline-First + Crypto + Sync

### Kritische Lücken
- Keine Tests
- Keine Push-Notifications
- SECON-Verschlüsselung deferred
- Kalender/Nachrichten/Suche-Tabs möglicherweise unvollständig
- Kein config.toml

---

## Zusammenfassung

Beide Apps sind weit fortgeschritten. **Eylems Betriebssystem Phase 1** ist im Admin-Dashboard komplett umgesetzt. Die größte offene Baustelle: **Multi-Mandant-Migration muss noch auf Prod aktiviert werden**. Kalender und Nachrichten in efy care sind noch nicht fertig.

**Heute Samstag = App-Arbeit.** Was soll als erstes angegangen werden?
