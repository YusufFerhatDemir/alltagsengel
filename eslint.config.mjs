import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Barrierefreiheit im PflegeCoach-Produktbereich: eslint-config-next bringt
  // nur eine Teilmenge der jsx-a11y-Regeln mit. Hier gilt der volle
  // recommended-Satz als Fehler — die Zielgruppe (ältere und pflegebedürftige
  // Menschen, Screenreader-Nutzung) ist der Grund, und es ist der einzige
  // Bereich, in dem Barrierefreiheit nachweispflichtig ist
  // (docs/DIPA_BFARM_READINESS.md, Punkt 7). Bewusst NICHT global: der
  // Restbestand ist nicht auditiert, ein globaler Schalter wäre nur Rauschen.
  // Nur die Regeln übernehmen, nicht das Plugin: eslint-config-next
  // registriert "jsx-a11y" bereits, ein zweites Mal wäre ein Config-Fehler.
  {
    files: ["app/pflegecoach/**/*.{ts,tsx}"],
    rules: jsxA11y.flatConfigs.recommended.rules,
  },
  // Testdateien: no-explicit-any und no-unused-vars lockern. Supabase-Mocks
  // und PGlite-Attrappen brauchen zwangsläufig `any`; Destruktur-Variablen
  // mit Unterstrich-Präfix sind absichtlich unbenutzte Platzhalter. Ohne
  // diesen Override erzeugt ESLint ~600 nicht-behebbare Annotations in CI.
  {
    files: ["__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-unused-vars": "off",
      // Basis-Regel ebenfalls aus — sonst greift sie statt der TS-Variante.
      "no-unused-vars": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Alt-Build-Artefakt und Worktree-Kopien: minifizierter Fremdcode bzw.
    // Duplikate der App. Ohne diese beiden Pfade lintet ESLint ~880 MB
    // Build-Output mit (~63 800 der 66 109 Meldungen) — das Gate wird wertlos.
    ".next-old/**",
    ".claude/worktrees/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Nicht Teil der Next.js-App — eigenständige Node/CommonJS-Skripte
    // bzw. separates Expo-Projekt. tsconfig.json exkludiert sie bereits
    // vom Typecheck; ESLint sollte sie aus demselben Grund nicht mit den
    // Next/TS-Regeln der App bewerten (require()-Imports dort sind korrekt,
    // package.json ist "type": "commonjs").
    "archive/**",
    "native/**",
    "investor/**/*.js",
    "marketing/scripts/**",
    "scripts/*.js",
    "docs/**/*.js",
  ]),
]);

export default eslintConfig;
