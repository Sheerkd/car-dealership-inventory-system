# Test Report

## Local verification result

On 25 October 2026, the project files were copied into a temporary Git repository, committed there as a verification snapshot, then cloned into a fresh checkout. This checked the source and lockfile without relying on the working directory's existing `node_modules` or build output. The temporary snapshot did **not** create a commit in the project repository.

The run used Windows, Node.js 24.19.0, pnpm 11.25.0, PostgreSQL 17, and Playwright Chromium. A disposable database and administrator account were created for the run.

| Check | Command or step | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | Passed; lockfile unchanged |
| Database | Prisma client generation, migration deployment, admin creation | Passed |
| Type checking | `pnpm typecheck` | Passed for API and web |
| Automated tests | `RUN_DB_TESTS=1 pnpm test` with test admin credentials | **35 API tests and 20 frontend tests passed; no skips** |
| Production build | `pnpm build` | Passed for API and web |
| Browser journey | `pnpm test:e2e` | **1 Playwright test passed** |

## What the tests exercised

- **API and database:** registration and login, token and role checks, admin vehicle CRUD, search filters and pagination, input and database constraints, purchase and restock, safe JSON errors, and competing purchases of the final unit.
- **Frontend:** customer registration, sign-in, filtering, stock and purchase states, errors and retries, expired-session guidance, pagination recovery, admin management actions, permission errors, and dialog keyboard focus.
- **Browser journey:** in Chromium, an admin created a vehicle, a customer registered and purchased its final unit, and the admin viewed the sold-out state, edited details, restocked, cancelled a deletion, then confirmed deletion. The customer and admin contexts used the same PostgreSQL database.

The database concurrency test confirmed that two purchases competing for the final unit produce exactly one successful purchase and leave stock at zero.

The suite includes API and React tests, PostgreSQL integration tests, and an end-to-end browser test. The database tests run only when `RUN_DB_TESTS=1` and the required database and test admin settings are present. The counts above come from the full configured run.

## Coverage measurement and deployment preparation

On 25 October 2026, the latest local run used Vitest's V8 provider against a temporary PostgreSQL 17 database. All **42 API tests and 20 frontend tests passed**, including startup configuration, admin provisioning, and static-web routing tests. The database migrations applied, and the deployment admin bootstrap command succeeded both when creating the admin and when run again. The coverage process exited successfully. Run `pnpm coverage` with the same database settings to reproduce the measurement; output is written under the ignored `coverage/` directory.

| Source set | Lines | Branches | Functions |
| --- | ---: | ---: | ---: |
| API `src/**/*.ts` | 81.95% | 88.82% | 91.66% |
| Web `src/**/*.{ts,tsx}` | 96.67% | 84.30% | 80.59% |

These figures include startup scripts, entry points, and type-only repository files; the type-only files count as uncovered because they do not execute at runtime. The API's route and service files have stronger line coverage: authentication routes 96.66%, authentication service 96.22%, vehicle routes 100%, and the Prisma vehicle repository 89.28%. Startup and admin provisioning behavior now has dedicated tests. Vitest enforces minimum API coverage of 80% lines, 85% branches, and 85% functions, plus frontend minimums of 90% lines, 80% branches, and 75% functions. This is a measured result, not a claim that every source line is covered.

The coverage improvement has a genuine test-first sequence: commit `5e4b52f` recorded failing startup tests, `233e575` made them pass, and `d752b7c` refactored shared admin validation while keeping the suite green. This later sequence does not establish how Phases 1–8 were originally built.

The updated production build passed. With the built web app served by Express, local HTTP checks returned 200 for `/` and a direct browser route, and `/api/health` returned `ok`.

## Live deployment smoke checks

On 25 October 2026, Render reported the web service deployed and the PostgreSQL database available. At the [live URL](https://car-dealership-inventory-z1tg.onrender.com/), the React sign-in page loaded and `/api/health` returned `{"status":"ok"}`. A login attempt using a synthetic, nonexistent address returned the expected invalid-credentials message. The login path calls the PostgreSQL user repository, so that result also checks a database-backed request without creating test data. These are read-only smoke checks; a full customer purchase and admin management journey has not been run against the hosted database.

## Reproduce the full check

Follow the [README local setup](../README.md#run-locally) with a disposable database. After migration and admin creation, set `RUN_DB_TESTS=1`, `TEST_ADMIN_EMAIL`, and `TEST_ADMIN_PASSWORD` to the provisioned admin credentials. Then run:

```sh
pnpm typecheck
pnpm test
pnpm coverage
pnpm build
pnpm exec playwright install --only-shell chromium
pnpm test:e2e
```

The GitHub Actions workflow in [`.github/workflows/checks.yml`](../.github/workflows/checks.yml) configures PostgreSQL and performs the same categories of checks on push and pull request.

## GitHub Actions result

The [Checks workflow run for commit `39c7e54`](https://github.com/Sheerkd/car-dealership-inventory-system/actions/runs/40202548172) completed successfully on 25 October 2026. It ran the configured frozen install, PostgreSQL migration and admin setup, type checks, API and frontend tests, production build, and Playwright journey on GitHub Actions. The [later run for `b788231`](https://github.com/Sheerkd/car-dealership-inventory-system/actions/runs/40212156128) also passed, including the coverage command. These remote results are separate from the local clean-checkout and coverage runs above.

## Limits of this report

The clean-checkout and coverage runs were **local**; the linked GitHub Actions results provide separate remote checks. Hosted smoke checks cover the sign-in page, API health, and invalid login only. No hosted full customer/admin journey, non-Chromium browser result, or human manual test is claimed. The project repository had no commits at the time of the original local run. The initial implementation is now recorded in AI-authored snapshot commit `ac3e882` in the [public repository](https://github.com/Sheerkd/car-dealership-inventory-system). That snapshot does not establish the brief's requested red–green–refactor history.
