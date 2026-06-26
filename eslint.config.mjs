// hiredesq lint rules — flat config (ESLint 9+).
//
// These enforce the CLAUDE.md invariants that are *statically* checkable. The
// ones that aren't (the workspaceId predicate on every query, money-as-Decimal)
// are caught by the review agents under .claude/agents/, not by lint.
//
// Requires dev deps: eslint, typescript-eslint, prettier (the post-edit-quality
// hook runs prettier --check + eslint on changed files). Extend per-app as needed.

import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/generated/**",
      "release/**",
      // Auxiliary (non-app) trees — not part of the product source.
      "ai-recruitment-session/**",
      "marketing/**",
      // Cloudflare Email Worker (F9) — deploys via wrangler, not in any tsconfig.
      "deploy/email-worker/**",
      // Config files and generated declarations live outside the tsconfig
      // projects, so typed linting (projectService) can't type them. They are
      // not product source — exclude rather than force them into a project.
      "**/*.config.{js,cjs,mjs,ts}",
      "eslint.config.mjs",
      "**/next-env.d.ts",
      "packages/database/prisma/seed.ts",
    ],
  },

  ...tseslint.configs.recommended,

  // Baseline rules everywhere.
  {
    // Typed linting: the baseline enables type-aware rules (no-floating-promises),
    // so the parser needs project type information. `projectService` lets
    // typescript-eslint discover the nearest tsconfig per file across the monorepo.
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // §2 (no PII in logs) + §6 (no secrets in logs). Structured logging only;
      // console.warn/error allowed for genuine diagnostics (still: no PII).
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // Test files (node:test). `it()`/`describe()` return promises the runner
  // tracks internally — floating them is the expected idiom, not a bug.
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/*.itest.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
    },
  },

  // §4 — the AI provider is reachable ONLY through packages/ai behind the credit
  // gate. Ban the raw SDK everywhere except packages/ai itself.
  {
    files: ["**/*.ts"],
    ignores: ["packages/ai/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@anthropic-ai/sdk",
              message:
                "Call the AI provider only through packages/ai, behind the credit gate (CLAUDE.md §4, /credit-gate).",
            },
          ],
        },
      ],
    },
  },

  // Architecture / tactical DDD — packages/core is PURE domain logic: no Prisma,
  // no NestJS, no AI SDK. Persistence and framework wiring live in apps/*.
  // (Listed last so this stricter set wins for core files.)
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              message:
                "packages/core is pure domain — no Prisma. Persist via a repository in apps/api or apps/worker (CLAUDE.md → Architecture).",
            },
            {
              name: "@hiredesq/database",
              message:
                "packages/core must not import the database package (DDD boundary).",
            },
            {
              name: "@anthropic-ai/sdk",
              message: "packages/core must not call the AI provider directly.",
            },
          ],
          patterns: [
            {
              group: ["@nestjs/*"],
              message:
                "packages/core is framework-agnostic domain logic — no NestJS imports.",
            },
          ],
        },
      ],
    },
  },
);
