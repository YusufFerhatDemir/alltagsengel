import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
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
