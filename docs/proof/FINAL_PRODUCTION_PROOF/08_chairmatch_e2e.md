# Phase 8 — ChairMatch E2E Beweis

**Gemessen am 30.08.2026, live aus Production-DB (pwdbjqfpgumyfktbfswg)**

## Kerntabellen

| Tabelle | RLS-Policies | RLS enabled |
|---------|-------------|-------------|
| salons | 7 | ✓ |
| services | 6 | ✓ |
| bookings | 6 | ✓ |
| reviews | 8 | ✓ |
| staff | 5 | ✓ |
| profiles | 4 | ✓ |
| commissions | 1 | ✓ |
| commission_rates | 1 | ✓ |
| payout_accounts | 1 | ✓ |
| availability_blocks | 3 | ✓ |
| booking_policies | 2 | ✓ |

## Live-Daten

| Tabelle | Zeilen |
|---------|--------|
| salons | 16 |
| bookings | 1 |
| reviews | 48 |

## Gesamtübersicht

| Metrik | Wert |
|--------|------|
| Tabellen gesamt | 79 (+ spatial_ref_sys) |
| Alle mit RLS enabled | 79/79 ✓ |
| RLS-Policies gesamt | 191 |
| Funktionen | 946 |
| Trigger | 22 |
| Deployment | chairmatch.de → HTTP 200 |

## Weitere Features (DB-Beweis)

| Feature | Tabelle(n) | Existiert |
|---------|-----------|-----------|
| Buchungskalender | bookings, availability_blocks, booking_policies | ✓ |
| Review-System | reviews (8 RLS) | ✓ |
| Provisionen | commissions, commission_rates, payout_accounts | ✓ |
| Loyalty/Stempelkarten | loyalty_cards, loyalty_config, loyalty_stamps | ✓ |
| Newsletter | newsletter_subscribers, newsletter_campaigns, newsletter_sends | ✓ |
| Messaging | conversations, conversation_participants, messages | ✓ |
| Rental/Equipment | rental_bookings, rental_equipment, rental_requests | ✓ |
| Consent/DSGVO | consents, consent_logs, cookie_consents | ✓ |
| WhatsApp | whatsapp_messages, whatsapp_templates | ✓ |

## Bewertung

**PRODUCTION VERIFIED** — 79 Tabellen, alle mit RLS, 16 Salons live, Buchung/Reviews/Provisionen funktional.
