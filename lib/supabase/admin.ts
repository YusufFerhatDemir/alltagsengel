// ═══════════════════════════════════════════════════════════════
// SICHERHEITSHINWEIS: Dieser Client nutzt den SERVICE_ROLE_KEY und
// darf NIEMALS im Browser-Bundle landen.
//
// Zwei Schichten:
// 1. `server-only` wirft schon beim BUILD, sobald ein Client-Modul
//    (transitiv) diese Datei importiert — verhindert, dass der Code
//    überhaupt kompiliert wird.
// 2. Der Runtime-Guard unten fängt den Fall ab, dass trotzdem Code
//    im Browser landet (z. B. bei zukünftigen Bundler-Wechseln).
// ═══════════════════════════════════════════════════════════════
import 'server-only'

if (typeof window !== 'undefined') {
  throw new Error(
    'SECURITY: lib/supabase/admin.ts darf nicht in Client-Komponenten importiert werden. ' +
    'Dieser Modul nutzt den SERVICE_ROLE_KEY und gehört ausschließlich auf den Server.'
  )
}

import { createClient } from '@supabase/supabase-js'

/**
 * Geheimer Serverschlüssel. Reihenfolge: neuer Secret-Key (`sb_secret_…`) vor
 * dem Legacy-`service_role`-JWT. Beide Modelle laufen bei Supabase parallel,
 * die Umstellung ist deshalb rein additiv.
 *
 * Bewusst hier und NICHT in `lib/supabase/keys.ts`: jene Datei landet über
 * `client.ts` im Browser-Bundle. Diese hier ist per `server-only` gesperrt.
 */
function supabaseSecretKey(): string {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseSecretKey(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
