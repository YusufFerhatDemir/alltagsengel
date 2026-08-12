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
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

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

/**
 * Legt einen Nutzer in auth.users an — ueber psql, nicht ueber PostgREST:
 * PostgREST exponiert nur `public`, das auth-Schema ist dort unerreichbar.
 * Die Trigger auf auth.users (Profil-Anlage) laufen dabei genauso wie in
 * Supabase, sonst waere die Registrierstrecke nur halb geprueft.
 */
async function neuenAuthUserAnlegen(uid, email, metadaten) {
  const dbUrl = process.env.SHADOW_DB_URL
  if (!dbUrl) return { ok: false, fehler: 'SHADOW_DB_URL nicht gesetzt' }
  // Werte als psql-Variablen uebergeben und mit :'name' einsetzen — psql
  // quotet dabei selbst. String-Verkettung waere hier eine Injektionsstelle,
  // die E-Mail kommt aus dem Request.
  // Nur die Spalten, die die Shadow-Variante von auth.users wirklich hat
  // (supabase/shadow/00_supabase_bootstrap.sql) — aud/role/email_confirmed_at
  // gibt es dort nicht. Der Trigger on_auth_user_created legt das Profil an,
  // genau wie in Supabase.
  const sql = `
    INSERT INTO auth.users (id, email, encrypted_password,
                            raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at)
    VALUES (:'uid'::uuid, :'email', 'shadow-shim-kein-hash',
            '{"provider":"email"}'::jsonb, :'meta'::jsonb, now(), now());`
  try {
    // Ueber stdin, nicht ueber -c: psql ersetzt :'var' nur in Datei-/
    // stdin-Eingabe, bei -c bleibt der Doppelpunkt stehen.
    const kind = execFile('psql', [
      dbUrl, '-v', 'ON_ERROR_STOP=1', '-q',
      '-v', `uid=${uid}`,
      '-v', `email=${email}`,
      '-v', `meta=${JSON.stringify(metadaten || {})}`,
      '-f', '-',
    ])
    const fertig = new Promise((auf, ab) => {
      let stderr = ''
      kind.stderr.on('data', d => { stderr += d })
      kind.on('close', code => (code === 0 ? auf() : ab(new Error(stderr))))
      kind.on('error', ab)
    })
    kind.stdin.end(sql)
    await fertig
    return { ok: true }
  } catch (e) {
    return { ok: false, fehler: String(e.stderr || e.message).slice(0, 300) }
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

  // POST /auth/v1/signup — Registrierung.
  // Ohne diesen Zweig fiel signUp() in den 204-Auffangzweig weiter unten;
  // supabase-js sah dann weder Nutzer noch Fehler und die Registrier-
  // strecke war im Browser schlicht nicht pruefbar. Legt den Nutzer in
  // auth.users an (per PostgREST-RPC ginge es nicht — auth ist kein
  // exponiertes Schema), damit der Profil-Trigger wie in Supabase greift.
  if (url.pathname === '/auth/v1/signup' && req.method === 'POST') {
    let body = {}
    try { body = JSON.parse(rawBody.toString() || '{}') } catch {}
    const email = String(body.email || '').trim().toLowerCase()
    if (!email || !body.password) {
      res.writeHead(400, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: 'validation_failed', msg: 'email und password erforderlich' }))
    }
    if (USERS[email]) {
      res.writeHead(422, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: 'user_already_exists', msg: 'User already registered' }))
    }
    const uid = crypto.randomUUID()
    const angelegt = await neuenAuthUserAnlegen(uid, email, body.data || {})
    if (!angelegt.ok) {
      res.writeHead(500, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: 'signup_failed', msg: angelegt.fehler }))
    }
    USERS[email] = uid
    const now = Math.floor(Date.now() / 1000)
    const token = signJwt({ sub: uid, email, role: 'authenticated', aud: 'authenticated', iss: 'shadow-shim', iat: now, exp: now + 3600 })
    const user = {
      id: uid, aud: 'authenticated', role: 'authenticated', email,
      app_metadata: { provider: 'email' }, user_metadata: body.data || {},
      // identities MUSS gefuellt sein. Ein leeres Array ist bei GoTrue das
      // Signal „diese E-Mail gibt es schon" (Enumeration-Schutz) — der
      // Registrier-Code steigt darauf aus, ohne das Profil zu schreiben.
      identities: [{
        identity_id: crypto.randomUUID(), id: uid, user_id: uid,
        identity_data: { sub: uid, email }, provider: 'email',
        created_at: new Date().toISOString(), last_sign_in_at: new Date().toISOString(),
      }],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      email_confirmed_at: null,
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    // Form wie GoTrue: { user, session }. Bei aktiver E-Mail-Bestaetigung
    // ist session null — genau der Fall, den die App mit
    // stashPendingProfile abfaengt. Mit SHADOW_AUTOCONFIRM=1 kommt eine
    // Sitzung zurueck, dann laeuft der Direkt-Upsert-Zweig.
    const autoconfirm = process.env.SHADOW_AUTOCONFIRM === '1'
    const session = autoconfirm
      ? { access_token: token, token_type: 'bearer', expires_in: 3600,
          expires_at: now + 3600, refresh_token: `shadow-refresh:${uid}`, user }
      : null
    return res.end(JSON.stringify({ user, session }))
  }

  if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type')
    let body = {}
    try { body = JSON.parse(rawBody.toString() || '{}') } catch {}

    let uid = null
    let email = ''

    if (grant === 'password') {
      email = body.email || ''
      uid = USERS[email]
      if (!uid || body.password !== PASSWORD) uid = null
    } else if (grant === 'refresh_token') {
      // Refresh-Token traegt die User-ID: shadow-refresh:<uid>.
      // Ohne diesen Zweig antwortet der Shim auf jeden Refresh mit 400 —
      // supabase-js verwirft dann die Sitzung, und ein Seitenwechsel wirft
      // den angemeldeten Nutzer wieder auf die Loginseite. Damit waere
      // „Session-Restore" nicht pruefbar.
      const rt = String(body.refresh_token || '')
      if (rt.startsWith('shadow-refresh:')) {
        const kandidat = rt.slice('shadow-refresh:'.length)
        for (const [e, id] of Object.entries(USERS)) {
          if (id === kandidat) { uid = id; email = e; break }
        }
      }
    }

    if (!uid) {
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
    return res.end(JSON.stringify({
      access_token: token, token_type: 'bearer', expires_in: 3600,
      expires_at: now + 3600, refresh_token: `shadow-refresh:${uid}`, user,
    }))
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
