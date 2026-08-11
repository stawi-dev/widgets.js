# AI Coding Instructions — @stawi/aiwidgets

## Critical Rule: One Widget at a Time

**You MUST work on exactly one widget per session/task.** Never modify code in multiple widget packages simultaneously. Each widget under `packages/` is an independent npm package with its own versioning, build, and release lifecycle. Treat them as isolated projects that happen to share tooling.

If asked to work on multiple widgets, complete one fully before starting the next.

## Monorepo Structure

```
aiwidgets/
├── packages/<widget>/       # Independent widget packages (one per widget)
│   ├── src/index.tsx        # Entry point
│   ├── package.json         # @stawi/<widget>, own version, own deps
│   ├── tsconfig.json        # Extends ../../tsconfig.base.json
│   └── tsup.config.ts       # Builds ESM + CJS + DTS via tsup
├── shared/utils/            # Shared internal utilities (private, not published)
├── .changeset/              # Changesets for independent versioning
├── tsconfig.base.json       # Base TS config — all packages extend this
├── turbo.json               # Turborepo pipeline config
├── eslint.config.mjs        # Root ESLint flat config
└── pnpm-workspace.yaml      # Workspace definitions
```

## Working on a Widget

### Scope your changes

- Only touch files inside `packages/<widget>/` and optionally `shared/utils/`.
- Never edit another widget's folder as a side effect.
- Never modify root config files unless the task explicitly requires it.

### Creating a new widget

Every new widget MUST follow this exact structure:

```
packages/<widget-name>/
├── src/
│   └── index.tsx
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

**package.json** must include:

- `"name": "@stawi/<widget-name>"`
- `"version": "0.0.1"` (starting version)
- `"sideEffects": false`
- `"exports"` with `types` first, then `import`, then `require`
- Scripts: `"build": "tsup"`, `"lint": "eslint src/"`, `"test": "vitest run --passWithNoTests"`
- React as a `peerDependency`, not a direct dependency

**tsconfig.json** must extend the root: `"extends": "../../tsconfig.base.json"`

**tsup.config.ts** must output ESM + CJS + DTS with sourcemaps.

### Modifying an existing widget

1. Read the widget's `package.json` and source files first to understand its current state.
2. Keep changes scoped to that single widget's directory.
3. Run `pnpm --filter @stawi/<widget-name> build` to verify the build.
4. Run `pnpm --filter @stawi/<widget-name> test` to verify tests pass.
5. Run `pnpm --filter @stawi/<widget-name> lint` to verify lint passes.

## Tech Stack (do not deviate)

| Concern       | Tool                          |
| ------------- | ----------------------------- |
| Package mgr   | pnpm (workspaces)             |
| Orchestration | Turborepo                     |
| Language      | TypeScript 5                  |
| Build         | tsup (esbuild)                |
| Test          | Vitest                        |
| Lint/Format   | ESLint 9 + Prettier           |
| Versioning    | Changesets (independent mode) |

## What NOT to Do

- Do not add widget dependencies to the root `package.json` — only shared dev tooling goes there.
- Do not create widgets outside the `packages/` directory.
- Do not use any build tool other than tsup for widget packages.
- Do not modify `pnpm-workspace.yaml` unless adding a new workspace category.
- Do not bundle React into widgets — it must be a `peerDependency`.
- Do not skip TypeScript strict mode or disable it in widget tsconfigs.
