/**
 * Supabase-Schluessel fuer die Verifikations-Skripte.
 *
 * Supabase loest das Legacy-JWT-Modell (`anon` / `service_role`) durch die
 * neuen API-Keys ab (`sb_publishable_…` / `sb_secret_…`, Abkuendigung der
 * Legacy-Keys Ende 2026). Beide Modelle laufen parallel — die Umstellung ist
 * deshalb rein additiv: neuer Name zuerst, Legacy-Name als Fallback.
 *
 * ZWEI FALLEN, die dieses Modul schliesst:
 *
 * 1. `Authorization: Bearer <key>` ist bei den neuen Keys VERBOTEN. Sie sind
 *    keine JWTs; die API antwortet mit „Invalid JWT". Ein Sicherheitsskript
 *    wuerde daraus faelschlich „kein Zugriff moeglich" lesen und gruen melden,
 *    obwohl es gar nicht geprueft hat. `apiHeaders()` setzt den Bearer-Header
 *    deshalb nur bei Legacy-JWTs.
 *
 * 2. Die Skripte lesen `.env` / `.env.local` selbst, wenn die Variable nicht
 *    im Prozess-Environment steht. `envWert()` bildet dieselbe Reihenfolge ab.
 */
import fs from 'node:fs'

const dateiInhalt = (f) => { try { return fs.readFileSync(f, 'utf8') } catch { return '' } }
const envDateien = () => dateiInhalt('.env') + '\n' + dateiInhalt('.env.local')

/** Liest eine Variable aus dem Prozess-Env, sonst aus `.env` / `.env.local`. */
export function envWert(name) {
  if (process.env[name]) return process.env[name]
  const treffer = envDateien().match(new RegExp('^' + name + '=(.*)$', 'm'))
  return treffer ? treffer[1].trim() : undefined
}

/** Oeffentlicher Key: Publishable vor Legacy-Anon. */
export function publishableKey() {
  return envWert('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || envWert('NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

/** Geheimer Key: Secret vor Legacy-service_role. */
export function secretKey() {
  return envWert('SUPABASE_SECRET_KEY') || envWert('SUPABASE_SERVICE_ROLE_KEY')
}

/** Legacy-JWTs beginnen mit `eyJ`; die neuen Keys mit `sb_publishable_` / `sb_secret_`. */
export function istLegacyJwtKey(key) {
  return typeof key === 'string' && key.startsWith('eyJ')
}

/**
 * Header fuer direkte PostgREST-Aufrufe.
 * `Authorization: Bearer` nur bei Legacy-JWT-Keys — siehe Falle 1 oben.
 * Ein in `extra` mitgegebener Authorization-Header hat immer Vorrang.
 */
export function apiHeaders(key, extra = {}) {
  const headers = { apikey: key, ...extra }
  const hatAuth = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization')
  if (!hatAuth && istLegacyJwtKey(key)) headers.Authorization = `Bearer ${key}`
  return headers
}

/** Menschenlesbare Herkunft — fuer die Kopfzeile der Verifikationslaeufe. */
export function keyModellBericht() {
  const pub = publishableKey()
  const sec = secretKey()
  return [
    `oeffentlicher Key: ${pub ? (istLegacyJwtKey(pub) ? 'Legacy anon (JWT)' : 'Publishable (sb_publishable_)') : 'FEHLT'}`,
    `geheimer Key: ${sec ? (istLegacyJwtKey(sec) ? 'Legacy service_role (JWT)' : 'Secret (sb_secret_)') : 'FEHLT'}`,
  ].join(' · ')
}
