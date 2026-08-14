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

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
