// Preload-Hook fuer den Trockenlauf der Automatisierungsketten.
//
// ── DAS PROBLEM ───────────────────────────────────────────────────
// `nurLesenderClient` (lib/automation/trockenlauf.ts) umhuellt den
// Client, der den Ketten UEBERGEBEN wird. Vier Module holen sich aber
// ihren eigenen, direkt aus der Fabrik:
//
//   lib/audit-log.ts              (2 Stellen)
//   lib/notifications/delivery-log.ts
//   lib/notifications/retry-worker.ts
//   lib/notifications/retry.ts
//
// Deren Schreibvorgaenge liefen am Proxy vorbei und landeten wirklich in
// der Produktionsdatenbank. Am 14.09.2026 beim ersten Probelauf genau so
// beobachtet: der Audit-Eintrag der Lead-Kette erreichte die Datenbank
// und wurde nur deshalb nicht geschrieben, weil er am CHECK
// `mis_audit_log_action_check` scheiterte. Mit einem gueltigen Wert waere
// er durchgegangen — und die Zusage „es wird nichts geschrieben" waere
// falsch gewesen.
//
// ── DIE LOESUNG ───────────────────────────────────────────────────
// Dieser Hook ersetzt das Fabrikmodul, BEVOR irgendetwas es laedt.
// `createAdminClient()` gibt dann denselben lesenden Proxy zurueck, den
// auch die Ketten bekommen. Damit gibt es im Prozess keinen scharfen
// Schreibweg mehr.
//
// Der Proxy wird vom Prueflauf unter `globalThis.__TROCKENLAUF_ADMIN__`
// hinterlegt. Fehlt er, wird ABGEBROCHEN statt den echten Client
// durchzureichen — fail-closed: lieber kein Lauf als ein schreibender.
//
// Aktivierung: tsx --require ./scripts/test-stubs/admin-client-trockenlauf.cjs
const Module = require('module')
const originalLoad = Module._load

/** Trifft '@/lib/supabase/admin' und jede relative Schreibweise davon. */
function istAdminModul(request) {
  return /(^|[\\/])lib[\\/]supabase[\\/]admin(\.ts|\.js)?$/.test(request)
    || request === '@/lib/supabase/admin'
}

Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {}

  if (istAdminModul(request)) {
    return {
      createAdminClient() {
        const proxy = globalThis.__TROCKENLAUF_ADMIN__
        if (!proxy) {
          throw new Error(
            'Trockenlauf: createAdminClient() wurde aufgerufen, bevor der lesende '
            + 'Proxy bereitstand. Es wurde KEIN echter Client ausgeliefert — sonst '
            + 'haette dieser Aufruf scharf in die Produktion geschrieben.',
          )
        }
        return proxy
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}
