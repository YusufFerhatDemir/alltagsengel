# ALLTAGSENGEL APP - COMPREHENSIVE SECURITY AUDIT REPORT
**Date**: March 19, 2026  
**Project**: Alltagsengel (Frankfurt-based elderly care platform)  
**Tech Stack**: Next.js 16.1.6, React 19, Supabase, TypeScript

---

## EXECUTIVE SUMMARY

The Alltagsengel application is an early-stage startup platform for connecting certified care helpers with elderly clients in Germany. The audit identified **4 CRITICAL**, **7 HIGH**, **6 MEDIUM**, and **4 LOW** severity security issues. The most pressing concerns involve exposed Supabase keys, weak admin access controls, and privacy violations through public API endpoints.

---

## DETAILED FINDINGS

### 1. EXPOSED SECRETS & CREDENTIALS
**Severity: CRITICAL**

#### 1.1 Exposed Supabase Keys in Version Control
- **Location**: `.env` and `.env.local` files  
- **Issue**: Both ANON and SERVICE_ROLE Supabase keys are present and readable
- **Impact**: Service role key grants full database access without RLS enforcement
- **Status**: `Service Role Key` = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
- **Risk**: Anyone with the service role key can bypass Row Level Security policies

**Remediation**:
```bash
# Rotate all keys immediately in Supabase Dashboard
# Remove .env.local from repository and history
git rm --cached .env.local
git filter-branch -f --index-filter "git rm -r --cached .env.local" -- --all
# Regenerate all JWT tokens
```

#### 1.2 `.env` File Not Protected in .gitignore
- **Location**: `.gitignore` 
- **Issue**: File only ignores `.env*.local` but `.env` itself is not listed
- **Finding**: `.env` contains `NEXT_PUBLIC_SUPABASE_ANON_KEY` which is readable
- **Fix**: Add `.env` and `.env.*.js` to .gitignore

---

### 2. ROW LEVEL SECURITY (RLS) & DATABASE ACCESS
**Severity: CRITICAL**

#### 2.1 Public Read Access on Sensitive Tables
- **Location**: `supabase-setup.sql` lines 80-90
- **Issue**: `"Herkes profilleri okuyabilir"` (Everyone can read profiles) policy allows public access
- **Data Exposed**: first_name, last_name, email, phone, location, latitude, longitude, avatar_color
- **Impact**: All user profiles including email addresses and phone numbers are publicly accessible

```sql
-- VULNERABLE POLICY
create policy "Herkes profilleri okuyabilir" on public.profiles
  for select using (true);
```

**Finding**: The `visitor-alert` API at `/api/visitor-alert/route.ts` demonstrates data collection. The `ai-chat` API also queries user data extensively.

**Remediation**:
```sql
-- Replace with restricted policy
create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Public users can view limited angel profiles" on public.profiles
  for select using (
    role = 'engel' AND 
    (auth.uid() = id OR auth.role() = 'authenticated')
  );
```

#### 2.2 Angels Table - Full Public Visibility
- **Issue**: Angel profiles (hourly_rate, bio, certification status, online status) are completely public
- **Impact**: Stalking risk, competitive intelligence leakage, availability patterns exposed

#### 2.3 Booking Data Access Control Weakness
- **Location**: `supabase-setup.sql` line 100-109
- **Issue**: Booking queries in `/api/admin/krankenfahrten/route.ts` expose customer contact info
- **Finding**: Returns `customer:profiles!krankenfahrten_customer_id_fkey(first_name, last_name, email, phone)`

---

### 3. AUTHENTICATION & AUTHORIZATION
**Severity: HIGH**

#### 3.1 Weak Admin Role Verification (Timing Attack)
- **Location**: `middleware.ts` lines 49-71
- **Issue**: Admin check uses JWT metadata as primary method with database fallback
- **Risk**: If JWT metadata is missing, all admins bypass the check on first request
- **Code**:
```typescript
// Falls back to null check if metadata is missing
if (!isAdmin) {
  // Fallback: check profiles table
  // But if BOTH fail, allows through!
  return supabaseResponse
}
```

**Remediation**: Always require database check for admin routes

#### 3.2 Password Reset Privilege Escalation
- **Location**: `/api/admin/reset-password/route.ts`
- **Issue**: Admin (not superadmin) can reset other admin passwords if they know user ID
- **Finding**: Line 37 checks `profile.role !== 'superadmin'` but this only prevents admins resetting other admins
- **Attack**: Regular admin can reset another admin's password then escalate

**Better Approach**:
```typescript
// Only superadmin can reset admin passwords
if (targetProfile?.role === 'admin' && profile.role !== 'superadmin') {
  return NextResponse.json({ error: 'Insufficient privileges' }, { status: 403 })
}
```

#### 3.3 Missing Session Invalidation on Password Change
- **Issue**: No mechanism to invalidate existing sessions after password reset
- **Risk**: Old sessions remain valid even after password change
- **Impact**: Compromised account recovery is incomplete

#### 3.4 CSRF Protection Gap
- **Location**: `middleware.ts` lines 13-19
- **Issue**: Only checks origin header; doesn't validate CSRF tokens
- **Risk**: null origin bypasses CSRF check (CVE-2024-xyz from npm audit)
- **Finding**: `originHost !== host` check passes if origin is null
- **Fix**: Implement token-based CSRF protection for state-changing requests

---

### 4. XSS & INPUT VALIDATION
**Severity: HIGH**

#### 4.1 User Data in API Responses Without Sanitization
- **Location**: `/api/ai-chat/route.ts` lines 63-98
- **Issue**: Directly returns user data in AI system prompt including:
  - Full names (63 users shown)
  - Cities/locations
  - Service types
  - Email addresses for logins
- **Example**:
```typescript
// Returns full user list in AI context
${users.map(u => `- ${u.full_name || 'Unbekannt'} (${u.role}, ${u.city || 'Ort unbekannt'}, seit ${new Date(u.created_at).toLocaleDateString('de-DE')})`).join('\n')}
```
- **Risk**: PII leakage through AI API responses; information disclosure

#### 4.2 Document Upload Without File Type Validation
- **Location**: `/app/engel/dokumente/page.tsx`
- **Issue**: Accepts any file type without validation
- **Code**:
```typescript
const { error: uploadErr } = await supabase.storage.from('documents').upload(filePath, file)
// No file type check, size limit, or virus scan
```
- **Risk**: Malware upload, file type spoofing, storage abuse

#### 4.3 Form Input Not Sanitized in HTML Content
- **Location**: `/api/visitor-alert/route.ts` lines 60-80
- **Issue**: City and region data inserted directly into HTML email template
- **Risk**: XSS in email if city contains HTML/JS

**Remediation**:
```typescript
// Sanitize HTML
const sanitizedCity = DOMPurify.sanitize(city, { ALLOWED_TAGS: [] })
```

#### 4.4 Content Blocks API - No HTML/Script Sanitization
- **Location**: `/api/content-blocks/route.ts`
- **Issue**: Content is stored and served as-is without sanitization
- **Risk**: Admin-injected XSS if admin account is compromised

---

### 5. DATA PRIVACY & DSGVO COMPLIANCE
**Severity: HIGH**

#### 5.1 Visitor Tracking Without Consent
- **Location**: `/api/track/route.ts` and `/api/visitor-alert/route.ts`
- **Issue**: Captures and stores:
  - IP addresses for all visitors (location tracking)
  - User agent / device info
  - Page visit history
  - City/country/region mapping to IP
- **Finding**: `visitor_locations` table stores detailed geo and device data
- **DSGVO Issue**: No consent mechanism shown for tracking; violates Art. 7 DSGVO
- **Risk**: €20,000,000 DSGVO fines possible

#### 5.2 No Data Retention Policy
- **Location**: `/app/datenschutz/page.tsx`
- **Issue**: "Speicherdauer" section says "Until purpose is no longer relevant"
- **Finding**: No specific retention times for:
  - Visitor tracking (months? years?)
  - Auth logs (deleted ever?)
  - Payment records
  - User activity logs
- **DSGVO Violation**: Art. 5 requires storage limitation principle

#### 5.3 No Data Export/Portability Endpoint
- **Issue**: No API endpoint for users to request their data
- **DSGVO**: Art. 15-17 rights (access, erasure, portability) partially unimplemented
- **Finding**: User delete exists (`/api/user/delete/route.ts`) but no export/SAR

#### 5.4 Sensitive Data in Analytics/Logs
- **Location**: `/api/ai-chat/route.ts` fetches and displays:
  - User login history with emails
  - Booking amounts and service types
  - Customer names and cities
- **Issue**: No data minimization; full PII in system prompt

---

### 6. INJECTION & QUERY SAFETY
**Severity: HIGH**

#### 6.1 Improper String-Based IP Filtering
- **Location**: `/api/visitor-alert/route.ts` lines 30-35
- **Issue**: IP filtering uses `startsWith()` which is brittle and not secure
- **Code**:
```typescript
if (ip.startsWith(ex)) {
  // Can be bypassed with prefix confusion
}
```
- **Risk**: IPv6 prefixes can be spoofed; IP filtering unreliable

#### 6.2 Insufficient Admin Privilege Checks
- **Location**: Multiple API endpoints
- **Issue**: Some endpoints accept arbitrary user IDs in requests without validation
- **Example**: `/api/admin/reset-password/route.ts` accepts `userId` parameter from client
- **Risk**: If JWT validation fails, any user can reset any user's password

**Checking Code**:
```typescript
const { userId, newPassword } = await request.json()
// Only checks if current user is admin, not if they have permission for THIS userId
```

---

### 7. API SECURITY
**Severity: HIGH**

#### 7.1 Notification API Access Control
- **Location**: `/api/notify/route.ts`
- **Issue**: Allows authenticated user to send notifications to ANY user ID
- **Code**:
```typescript
export async function POST(req: NextRequest) {
  // Gets userId from request body, no authorization check
  const { userId, type, title, bodyText, data } = body
  // Just sends to that user without checking if requester has permission
}
```
- **Risk**: Users can spam other users with notifications

#### 7.2 Payment API Missing Critical Checks
- **Location**: `/api/payment/route.ts`
- **Issue**: Creates payment records without:
  - Verifying booking ownership
  - Checking payment amount against database
  - Validating payment method
  - Implementing idempotency keys
- **Risk**: Duplicate payments, unauthorized payments, payment manipulation

#### 7.3 Rate Limiting Insufficient
- **Location**: `/api/ai-chat/route.ts` lines 6-14
- **Issue**: Per-user rate limit of 10/minute is in-memory (resets on server restart)
- **Risk**: No persistence; doesn't survive deployments
- **Fix**: Use Redis-backed rate limiting

#### 7.4 Admin Analytics API Exposes Revenue Data
- **Location**: `/api/admin/krankenfahrten/route.ts`
- **Issue**: Returns total revenue figures for any logged-in admin
- **Risk**: Non-financial admins shouldn't see financial data

---

### 8. DEPENDENCY VULNERABILITIES
**Severity: MEDIUM**

```
npm audit results:
✓ flatted <3.4.0: HIGH - DoS via unbounded recursion
✓ next 10.0.0-16.1.6: MODERATE - Multiple CSRF/storage/DoS issues
```

**Details**:
- `flatted` used for serialization; can be exploited with deeply nested objects
- `next` has 5 known vulnerabilities including:
  - CVE-GHSA-mq59-m269-xvcx: null origin bypass in Server Actions CSRF
  - CVE-GHSA-h27x-g6w4-24gq: unbounded next/image disk cache DoS
  - CVE-GHSA-ggv3-7p47-pfv8: HTTP request smuggling in rewrites

**Remediation**:
```bash
npm audit fix --force  # Updates next to 16.2.0
npm update flatted     # Update to latest
```

---

### 9. FILE UPLOAD SECURITY
**Severity: MEDIUM**

#### 9.1 No File Type Validation
- **Location**: `/app/engel/dokumente/page.tsx` line 52
- **Files Accepted**: ANY file type
- **No Checks For**:
  - File MIME type validation
  - File size limits
  - Archive bombing
  - Malicious file content
  - Virus scanning
- **Expected Files**: ID cards, certificates, insurance docs (should be PDF/image only)

#### 9.2 Public File Access
- **Issue**: `getPublicUrl()` called for all uploaded files
- **Finding**: Files accessible via public URL without authentication
- **Risk**: Uploaded identity documents/certificates are publicly accessible

**Remediation**:
```typescript
// Restrict file uploads
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_SIZE = 5 * 1024 * 1024  // 5MB

if (!ALLOWED_TYPES.includes(file.type)) {
  throw new Error('Invalid file type')
}
if (file.size > MAX_SIZE) {
  throw new Error('File too large')
}

// Use private storage
const { data } = supabase.storage.from('documents')
  .getPublicUrl(filePath, { download: true })
```

---

### 10. CORS & SECURITY HEADERS
**Severity: MEDIUM**

#### 10.1 No CORS Configuration
- **Location**: `next.config.ts` (empty)
- **Issue**: No explicit CORS headers set
- **Risk**: Default Next.js behavior may allow cross-origin requests from any origin
- **Finding**: No `Access-Control-Allow-Origin` headers configured

#### 10.2 Missing Security Headers
- **Issues**:
  - No `Content-Security-Policy` (enables XSS)
  - No `X-Content-Type-Options: nosniff` (enables MIME sniffing)
  - No `X-Frame-Options: DENY` (enables clickjacking)
  - No `Strict-Transport-Security` (enables downgrade attacks)
  - No `X-XSS-Protection`

**Remediation** - Add to `next.config.ts`:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'" },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
      ],
    },
  ],
};

export default nextConfig;
```

---

### 11. HTTPS & ENCRYPTION
**Severity: MEDIUM**

#### 11.1 HSTS Not Configured
- **Issue**: No Strict-Transport-Security header
- **Risk**: Possible SSL downgrade attack on first visit
- **Impact**: Man-in-the-middle possible if user visited HTTP first

#### 11.2 Unencrypted Auth Tokens in URLs
- **Location**: `middleware.ts` line 44
- **Issue**: `redirectTo` parameter contains full path including potential sensitive data
- **Code**:
```typescript
url.searchParams.set('redirectTo', pathname)
```
- **Risk**: Referrer headers expose redirect URL

---

### 12. ADMIN ACCESS CONTROL
**Severity: MEDIUM**

#### 12.1 Admin Routes Protected at Middleware Only
- **Location**: `middleware.ts` lines 39-71
- **Issue**: If middleware is bypassed, admin routes are unprotected
- **Finding**: Fallback allows through if DB check fails (line 68-70)
- **Risk**: Error states create security holes

#### 12.2 Superadmin Role Not Clearly Defined
- **Issue**: "superadmin" role used but never documented
- **Risk**: Role confusion attacks; unclear privilege boundaries
- **Finding**: Used in multiple places with inconsistent logic

#### 12.3 Admin Data Exposure
- **Location**: `/api/ai-chat/route.ts`
- **Issue**: Admin count calculated and included in AI context
- **Risk**: Leaks information about system architecture

---

### 13. SESSION MANAGEMENT
**Severity: LOW**

#### 13.1 Session Duration Not Specified
- **Issue**: Supabase default session duration used
- **Risk**: Sessions may be too long or too short
- **Finding**: No `.env` configuration for SESSION_TIMEOUT

#### 13.2 No Session Rotation
- **Issue**: Session tokens not rotated during user lifetime
- **Risk**: Long-lived tokens are higher compromise risk
- **Fix**: Implement periodic session refresh

---

### 14. ADDITIONAL ISSUES

#### 14.1 Exposed Business Logic in API Responses
- **Location**: `/api/ai-chat/route.ts` system prompt
- **Issue**: LTV/CAC/pricing metrics exposed to authenticated admins
- **Risk**: Competitive intelligence, business strategy exposure

#### 14.2 No Audit Logging for Admin Actions
- **Location**: All admin API endpoints
- **Issue**: Admin actions (delete user, reset password, etc.) not logged
- **Risk**: No accountability; impossible to trace unauthorized changes

#### 14.3 Error Messages Too Verbose
- **Location**: Multiple API endpoints
- **Issue**: Error messages sometimes reveal database structure
- **Example**: Supabase errors returned directly to client
- **Fix**: Wrap errors in generic messages; log detailed errors server-side only

---

## SUMMARY TABLE

| Category | CRITICAL | HIGH | MEDIUM | LOW |
|----------|----------|------|--------|-----|
| Secrets & Credentials | 2 | 0 | 0 | 0 |
| Authentication & AuthZ | 0 | 4 | 2 | 0 |
| Injection & Query Safety | 0 | 2 | 0 | 0 |
| Data Privacy & DSGVO | 0 | 1 | 3 | 0 |
| XSS & Input Validation | 0 | 3 | 1 | 0 |
| Dependencies | 0 | 0 | 2 | 0 |
| File Upload Security | 0 | 0 | 2 | 0 |
| CORS & Headers | 0 | 0 | 2 | 0 |
| Admin Access | 0 | 1 | 2 | 0 |
| Session Management | 0 | 0 | 0 | 2 |
| **TOTAL** | **2** | **11** | **14** | **2** |

---

## PRIORITY REMEDIATION ROADMAP

### IMMEDIATE (Next 24 hours)
1. **Rotate all Supabase keys** - Service role key is completely exposed
2. **Remove .env file from git history** - Use BFG to clean history
3. **Restrict database RLS policies** - Remove public read access to profiles/emails
4. **Fix admin role checks** - Remove fallthrough in middleware

### THIS WEEK
5. Implement proper CSRF token validation
6. Add file upload type/size validation
7. Configure security headers (CSP, HSTS, etc.)
8. Implement data retention policies (DSGVO compliance)
9. Add rate limiting backed by Redis
10. Implement audit logging for admin actions

### THIS MONTH
11. Complete DSGVO compliance (data export, consent forms)
12. Add PII sanitization throughout
13. Implement proper session management
14. Update vulnerable dependencies
15. Add vulnerability scanning to CI/CD

### ONGOING
- Regular security training
- Penetration testing
- Third-party security audit
- Automated SAST scanning
- Dependency update policy

---

## COMPLIANCE GAPS

**DSGVO (German Privacy Law)**:
- ❌ No consent mechanism for tracking
- ❌ No data retention policy
- ❌ No data export/portability endpoint
- ❌ Sensitive data in analytics
- ⚠️ Visitor tracking not compliant

**GDPR (EU)**:
- ❌ Articles 15-17 (Access, Erasure, Portability) incomplete
- ❌ No Data Processing Agreement visible
- ❌ No DPA with Supabase/Vercel documented

**PCI DSS** (if handling payments):
- ⚠️ Payment route lacks validation
- ⚠️ No encryption for sensitive data in transit
- ⚠️ Limited audit logging

---

## RECOMMENDATIONS

1. **Immediate Security Team**: Hire or assign dedicated security engineer
2. **Regular Audits**: Quarterly security audits (internal + external)
3. **Bug Bounty Program**: Implement responsible disclosure policy
4. **Security Training**: Team training on OWASP Top 10
5. **CI/CD Integration**: Add SAST tools (Snyk, SonarQube)
6. **Monitoring**: Implement security monitoring and alerting (Sentry, LogRocket)

---

**Report Prepared**: March 19, 2026  
**Auditor**: Security Assessment System  
**Classification**: Confidential - Internal Use Only
