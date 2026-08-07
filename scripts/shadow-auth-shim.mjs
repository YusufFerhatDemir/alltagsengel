// ════════════════════════════════════════════════════════════════════
// shadow-auth-shim.mjs — minimaler GoTrue-Ersatz für die lokale Shadow-DB
// ════════════════════════════════════════════════════════════════════
//
// Supabase-js braucht für die dynamischen Tenant-Tests zwei HTTP-Dienste:
//   /auth/v1/token  (GoTrue: Login → JWT)
//   /rest/v1/*      (PostgREST: Datenzugriff mit RLS)
//
// GoTrue ist ohne Docker nicht lokal lauffähig. Dieser Shim ersetzt NUR
// den Token-Endpunkt: er prüft das feste Shadow-Testpasswort, schlägt die
// User-UUID in einer beim Start übergebenen Map nach und signiert ein
// HS256-JWT mit demselben Secret wie PostgREST. Die Passwortprüfung ist
// damit ausdrücklich NICHT Testgegenstand — getestet wird, was PostgREST
// aus den JWT-Claims macht (RLS, current_org_id()). Alle /rest/v1-Requests
// werden unverändert an PostgREST durchgereicht.
//
// Start über scripts/shadow-db-http.sh — nicht direkt.
import http from 'node:http'
import crypto from 'node:crypto'

const PORT = Number(process.env.SHIM_PORT || 55440)
const PGRST = process.env.PGRST_URL || 'http://127.0.0.1:55434'
const SECRET = process.env.SHADOW_JWT_SECRET
const USERS = JSON.parse(process.env.SHADOW_USERS || '{}') // { email: uuid }
const PASSWORD = process.env.SHADOW_TEST_PASSWORD || 'ShadowTest123!'
if (!SECRET) { console.error('SHADOW_JWT_SECRET fehlt'); process.exit(1) }

const b64url = (buf) => Buffer.from(buf).toString('base64url')
function signJwt(claims) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(claims))
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

/** Prueft Signatur und Ablauf und gibt die Claims zurueck (sonst null). */
function verifyJwt(token) {
  if (!token || token.split('.').length !== 3) return null
  const [header, body, sig] = token.split('.')
  const erwartet = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url')
  if (sig !== erwartet) return null
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null
    return claims
  } catch { return null }
}

// Supabase-js laeuft im Browser auf einem anderen Port als der Shim. Ohne
// CORS-Header blockiert der Browser jeden Aufruf noch vor dem Absenden —
// die Anmeldung scheitert dann mit „Anmeldung fehlgeschlagen", obwohl der
// Shim per curl einwandfrei antwortet. Rein lokale Testinfrastruktur.
function corsHeaders(req) {
  return {
    'access-control-allow-origin': req.headers.origin || '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD',
    'access-control-allow-headers':
      'authorization,apikey,content-type,x-client-info,prefer,range,accept-profile,content-profile,x-supabase-api-version',
    'access-control-expose-headers': 'content-range,content-profile,x-supabase-api-version',
    'access-control-max-age': '86400',
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)

  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    return res.end()
  }
  // Auf JEDER Antwort mitschicken — auch auf Fehlern, sonst sieht der
  // Browser statt der Fehlermeldung nur „Network error".
  const writeHead = res.writeHead.bind(res)
  res.writeHead = (status, headers) => writeHead(status, { ...cors, ...(headers || {}) })
  const chunks = []
  for await (const c of req) chunks.push(c)
  const rawBody = Buffer.concat(chunks)

  if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
    let email = '', password = ''
    try { ({ email = '', password = '' } = JSON.parse(rawBody.toString() || '{}')) } catch {}
    const uid = USERS[email]
    if (url.searchParams.get('grant_type') !== 'password' || !uid || password !== PASSWORD) {
      res.writeHead(400, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }))
    }
    const now = Math.floor(Date.now() / 1000)
    const token = signJwt({ sub: uid, email, role: 'authenticated', aud: 'authenticated', iss: 'shadow-shim', iat: now, exp: now + 3600 })
    const user = {
      id: uid, aud: 'authenticated', role: 'authenticated', email,
      app_metadata: { provider: 'email' }, user_metadata: {}, identities: [],
      created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(),
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'shadow-refresh', user }))
  }

  // GET /auth/v1/user — supabase-js ruft das bei jedem getUser() auf.
  // Ohne echte Antwort haelt der Client jede Sitzung fuer abgelaufen und die
  // Admin-Oberflaeche leitet sofort zum Login um.
  if (url.pathname === '/auth/v1/user' && (req.method === 'GET' || req.method === 'PUT')) {
    const auth = req.headers.authorization || ''
    const token = auth.replace(/^Bearer\s+/i, '')
    const claims = verifyJwt(token)
    if (!claims || !claims.sub || claims.role !== 'authenticated') {
      res.writeHead(401, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ message: 'invalid claim: missing sub claim' }))
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({
      id: claims.sub, aud: 'authenticated', role: 'authenticated',
      email: claims.email || '', app_metadata: { provider: 'email' },
      user_metadata: {}, identities: [],
      created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(),
    }))
  }

  if (url.pathname.startsWith('/auth/v1/')) {
    res.writeHead(204); return res.end()
  }

  if (url.pathname.startsWith('/rest/v1/')) {
    const target = `${PGRST}${url.pathname.replace('/rest/v1', '')}${url.search}`
    const headers = { ...req.headers }
    delete headers.host; delete headers.connection; delete headers['content-length']
    try {
      const upstream = await fetch(target, {
        method: req.method, headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : rawBody,
      })
      const buf = Buffer.from(await upstream.arrayBuffer())
      const outHeaders = Object.fromEntries(upstream.headers.entries())
      delete outHeaders['content-encoding']; delete outHeaders['transfer-encoding']; delete outHeaders['content-length']
      res.writeHead(upstream.status, outHeaders)
      return res.end(buf)
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: 'postgrest_unreachable', detail: String(e) }))
    }
  }

  res.writeHead(404); res.end()
})

server.listen(PORT, '127.0.0.1', () => console.log(`shadow-auth-shim auf http://127.0.0.1:${PORT} → ${PGRST}`))
