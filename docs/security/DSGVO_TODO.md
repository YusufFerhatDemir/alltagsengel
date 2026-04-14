# DSGVO Cookie Consent TODO

## Current Status

The application has a **CookieConsent component** (`components/CookieConsent.tsx`) that provides a cookie banner for users. The VisitorTracker checks consent before tracking:

```typescript
const consent = getCookieConsent()
if (consent === 'rejected') return
```

## Issue Found

**POTENTIAL ISSUE**: The consent check in `VisitorTracker.tsx` has a subtle problem:

1. If `getCookieConsent()` returns `null` (user hasn't made a choice yet, new visitor):
   - The function does NOT return early
   - The tracking code STILL EXECUTES
   - IP address and geolocation are sent to `/api/visitor-alert` via `ipapi.co`
   - This happens BEFORE the cookie banner is shown

2. The tracking only stops if consent is explicitly `'rejected'`
   - `null` (no decision yet) is treated the same as `'accepted'` (tracked)

## DSGVO Compliance Requirements

Under DSGVO (Datenschutzgrundverordnung), visitor tracking that stores:
- IP addresses
- Geolocation data (city, region, country)
- User agent information

...requires **explicit opt-in consent BEFORE any tracking occurs**. This is "tracking" not just "analytics" because it:
1. Stores personal data (IP = PII under DSGVO)
2. Includes geolocation (sensitive under German privacy law)
3. Can be combined with other data to identify individuals

## Required Fixes

### 1. Update VisitorTracker.tsx (REQUIRED)
Change the consent check to require explicit acceptance:

```typescript
const consent = getCookieConsent()
// DSGVO: Only track if EXPLICITLY accepted, not if decision is pending
if (consent !== 'accepted') return
```

**Current behavior (PROBLEMATIC)**:
```typescript
if (consent === 'rejected') return  // ❌ Tracks if consent is null
```

**Why this matters**: New visitors see the banner appear (800ms delay) while tracking is already happening. Cookie banner should appear FIRST.

### 2. Improve CookieConsent.tsx (RECOMMENDED)
Add more explicit language about what data is collected:

Current: "Analyse-Cookies: Helfen uns zu verstehen, wie Besucher unsere Website nutzen"

Should be more explicit:
"Analyse-Cookies und Besuchertracking: Erfasst Ihre IP-Adresse und Standort (Stadt, Region). Dienste: ipapi.co für Standortbestimmung, Supabase für Datenspeicherung."

### 3. Consider Storing Consent Before Showing Banner (RECOMMENDED)
Current flow:
1. Page loads
2. 800ms delay (during which tracking may execute)
3. Banner appears

Better flow:
1. Page loads
2. Check consent immediately
3. Show banner if needed (blocking)
4. Only track after consent

### 4. Ensure Tracking Respects "Nur Notwendige" (REQUIRED)
Current: Button text is "Nur Notwendige" (Essential Only)
- This should NOT enable tracking
- Only necessary cookies (auth, security) should be set

## Visitor Tracking Data Stored

Via `/api/track` and `/api/visitor-alert`:

**Stored in `visitors` table**:
- `ip` - IP address (PII)
- `country`, `city`, `region` - Geolocation (sensitive)
- `user_agent` - Browser fingerprinting
- `referrer` - Referral source
- `page` - Page visited

**Stored in `visitor_locations` table**:
- `ip_address` - IP address (PII)
- `city`, `country`, `region` - Geolocation
- `latitude`, `longitude` - Precise geolocation (very sensitive)
- `user_agent` - Browser fingerprinting
- `page_path` - Page visited

## Action Items

- [ ] **CRITICAL**: Fix VisitorTracker.tsx to require explicit consent (change `if (consent === 'rejected')` to `if (consent !== 'accepted')`)
- [ ] Update cookie banner text to explicitly mention IP/location tracking
- [ ] Add data retention policy (how long is visitor data stored?)
- [ ] Document in Datenschutzerklärung which services receive visitor data
- [ ] Consider adding IP anonymization (e.g., last octet to 0)
- [ ] Review ipapi.co ToS for DSGVO compliance (3rd party data sharing)
- [ ] Test: Verify tracking is blocked when consent is "rejected" AND "null"

## Resources

- [DSGVO Recital 32 - Consent](https://gdpr-info.eu/recitals/recital-32/)
- [EDPB Guidelines 05/2020 on Consent](https://edpb.ec.europa.eu/sites/default/files/files/file1/edpb_guidelines_202005_consent_en.pdf)
- German regulators: Consent must be freely given, specific, informed, and unambiguous
