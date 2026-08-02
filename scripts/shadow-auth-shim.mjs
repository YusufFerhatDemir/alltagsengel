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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
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
