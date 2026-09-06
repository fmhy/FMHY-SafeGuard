import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/**", "dist/**", "test-builds/**", "artifacts/**"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js", "docs/script.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        SafeGuard: "readonly",
        importScripts: "readonly",
      },
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
  },
  {
    files: ["tools/**/*.mjs", "*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
    },
  },
];
