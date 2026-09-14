// Typdeklaration zu lese-orakel.mjs — der Helfer bleibt JavaScript, damit
// ihn auch die .mjs-Prueflaeufe ohne tsx benutzen koennen.
export declare const ORAKEL_CODE: 'P0001'
export declare function deuteOrakelAntwort(
  status: number,
  rohtext: string,
): { ok: true; wert: string } | { ok: false; grund: string }
export declare function frageOrakel(url: string, key: string, sql: string): Promise<string>
