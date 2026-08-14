// Preload-Hook für `npm run test:unit` (tsx --test, plain Node CJS-Require).
//
// Das echte `server-only`-Package wirft in JEDEM Node-Kontext ohne die
// "react-server"-Export-Condition — das betrifft auch Test-Runner, nicht
// nur Browser-Bundles (siehe node_modules/server-only/package.json).
// Next.js löst das beim Build über eine eigene Webpack-Resolve-Condition;
// tsx/node:test kennen die nicht. Ohne diesen Stub bricht jeder Test ab,
// der transitiv lib/supabase/admin.ts importiert (z. B. über audit-log.ts).
//
// Aktivierung: NODE_OPTIONS="--require ./scripts/test-stubs/server-only-stub.cjs"
// (siehe package.json → test:unit)
const Module = require('module')
const originalLoad = Module._load

Module._load = function (request, parent, isMain) {
  if (request === 'server-only') {
    return {}
  }
  return originalLoad.call(this, request, parent, isMain)
}
