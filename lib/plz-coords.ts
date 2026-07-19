// ═══════════════════════════════════════════════════════════
// PLZ → KOORDINATE (offline, vollständig für Deutschland)
// ═══════════════════════════════════════════════════════════
// Zugriffsschicht über den generierten Datensatz in
// lib/plz-coords.data.ts. Die Map wird beim ersten Zugriff
// aufgebaut und bleibt für die Lebensdauer der Lambda-Instanz
// im Speicher (~8.300 Einträge, unkritisch).
//
// Bewusst KEIN Import in Client-Komponenten — der Datensatz ist
// ~180 KB und gehört nicht ins Browser-Bundle. Serverseitig
// (Route Handler, Server Components) uneingeschränkt nutzbar.
// ═══════════════════════════════════════════════════════════

import { PLZ_PACKED } from './plz-coords.data'

let cache: Map<string, [number, number]> | null = null

function table(): Map<string, [number, number]> {
  if (cache) return cache
  const map = new Map<string, [number, number]>()
  for (const entry of PLZ_PACKED.split('|')) {
    const colon = entry.indexOf(':')
    const comma = entry.indexOf(',', colon)
    map.set(
      entry.slice(0, colon),
      [Number(entry.slice(colon + 1, comma)), Number(entry.slice(comma + 1))]
    )
  }
  cache = map
  return map
}

/** Exakte Koordinate einer 5-stelligen PLZ, oder null wenn unbekannt. */
export function plzCoords(plz: string | null | undefined): [number, number] | null {
  if (!plz) return null
  return table().get(plz) ?? null
}

/** true, wenn die PLZ im amtlichen deutschen Bestand existiert. */
export function isKnownPlz(plz: string | null | undefined): boolean {
  return plzCoords(plz) !== null
}
