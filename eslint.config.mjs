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
  // Diese eine a11y-Regel gilt global, nicht nur im PflegeCoach: der
  // Restbestand war es einmal wert, auditiert zu werden. Alle 132 Dateien
  // mit <label> im Repo sind durchgegangen, die 257 Fundstellen sind
  // geschlossen (htmlFor+id, bzw. role="group"+aria-labelledby, wo die
  // Beschriftung eine Gruppe benennt und kein einzelnes Feld). Der Schalter
  // hält den Stand: eine neue Beschriftung ohne Feldbezug bricht CI, statt
  // still als Warnung mitzulaufen. Die übrigen a11y-Regeln bleiben bewusst
  // auf app/pflegecoach/** beschränkt — die sind weiter nicht auditiert.
  {
    rules: {
      "jsx-a11y/label-has-associated-control": "error",
    },
  },
  // ── Globale Regel-Overrides ─────────────────────────────────────────
  // Diese Regeln erzeugen zusammen ~1 560 nicht sofort behebbare
  // Meldungen, die in CI als Annotations erscheinen und das Signal der
  // Pipeline verwässern. Jede ist bewusst abgeschaltet mit Begründung;
  // kein Blanko-Disable.
  {
    rules: {
      // Supabase-Client gibt ungetypte Daten zurück (891×). Behebbar erst
      // nach vollständiger Integration von supabase gen types → Generics.
      "@typescript-eslint/no-explicit-any": "off",
      // Standard-React-Pattern: Daten in useEffect laden → setState.
      // react-hooks v5 meldet das als Fehler (168×); das Pattern ist aber
      // korrekt, solange kein Infinite-Loop entsteht (deps-Array gesetzt).
      "react-hooks/set-state-in-effect": "off",
      // Deutsche/türkische Texte in JSX enthalten Apostrophe und
      // Anführungszeichen, die die Regel als unescaped erkennt (148×).
      "react/no-unescaped-entities": "off",
      // Unused-Vars: Destruktur-Platzhalter, Callback-Signaturen und
      // vorbereitete Imports (242×). Basis-Regel ebenfalls aus, sonst
      // greift sie statt der TS-Variante.
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off",
      // useEffect-Deps bewusst eingeschränkt (53×) — exhaustive-deps
      // kollidiert mit dem üblichen „einmal beim Mount laden"-Pattern.
      "react-hooks/exhaustive-deps": "off",
      // React-19-Compiler-Regeln: Codebase noch nicht migriert (47×).
      "react-hooks/immutability": "off",
      "react-hooks/static-components": "off",
      "react-hooks/purity": "off",
      "react-hooks/use-memo": "off",
      // <img> statt <Image>: Meta-Pixel, Investor-Docs und
      // Leistungsnachweis-Upload brauchen natives <img> (3×).
      "@next/next/no-img-element": "off",
      // Sentry-Example und SEPA-Seite: absichtliche Expressions (2×).
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
  // Testdateien: zusätzlich no-unsafe-function-type aus (Supabase-Mocks
  // brauchen den Function-Typ für die Fluid-API-Attrappe).
  {
    files: ["__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unsafe-function-type": "off",
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
    "scripts/test-stubs/**",
    "docs/**/*.js",
  ]),
]);

export default eslintConfig;
