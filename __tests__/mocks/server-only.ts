// Test-Stub für das `server-only`-Marker-Package.
//
// Das echte Package wirft in JEDEM Node-Kontext ohne die "react-server"-
// Export-Condition (siehe node_modules/server-only/package.json) — das ist
// bei plain Node/Vitest immer der Fall, nicht nur im Browser. Next.js löst
// das beim Build über eine eigene Webpack-Resolve-Condition; Vitest kennt
// die nicht. Ohne diesen Alias würde JEDER Test, der transitiv
// lib/supabase/admin.ts importiert, beim Import sofort abbrechen.
export {}
