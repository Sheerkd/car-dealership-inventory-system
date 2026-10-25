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

On 25 October 2026, a second local run used Vitest's V8 provider against a temporary PostgreSQL 17 database. All **36 API tests and 20 frontend tests passed**, including the new static-web routing test. The database migrations applied, and the deployment admin bootstrap command succeeded both when creating the admin and when run again. The coverage process exited successfully. Run `pnpm coverage` with the same database settings to reproduce the measurement; output is written under the ignored `coverage/` directory.

| Source set | Lines | Branches | Functions |
| --- | ---: | ---: | ---: |
| API `src/**/*.ts` | 69.84% | 87.33% | 82.85% |
| Web `src/**/*.{ts,tsx}` | 96.67% | 84.30% | 80.59% |

These figures include startup scripts, entry points, and type-only repository files. The API's route and service files have stronger line coverage: authentication routes 96.66%, authentication service 96.22%, vehicle routes 100%, and the Prisma vehicle repository 89.28%. The broad API line percentage is lower because startup scripts and type-only files are not exercised by the Vitest process. This is a measured result, not a claim that every source line is covered.

The updated production build passed. With the built web app served by Express, local HTTP checks returned 200 for `/` and a direct browser route, and `/api/health` returned `ok`. These checks do not establish a live hosted deployment.

## Reproduce the full check

Follow the [README local setup](../README.md#run-locally) with a disposable database. After migration and admin creation, set `RUN_DB_TESTS=1`, `TEST_ADMIN_EMAIL`, and `TEST_ADMIN_PASSWORD` to the provisioned admin credentials. Then run:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install --only-shell chromium
pnpm test:e2e
```

The GitHub Actions workflow in [`.github/workflows/checks.yml`](../.github/workflows/checks.yml) configures PostgreSQL and performs the same categories of checks on push and pull request.

## GitHub Actions result

The [Checks workflow run for commit `39c7e54`](https://github.com/Sheerkd/car-dealership-inventory-system/actions/runs/40202548172) completed successfully on 25 October 2026. It ran the configured frozen install, PostgreSQL migration and admin setup, type checks, API and frontend tests, production build, and Playwright journey on GitHub Actions. This remote result is separate from the local clean-checkout run above.

## Limits of this report

The clean-checkout run was **local**; the linked GitHub Actions result provides a separate remote check. No hosted deployment, non-Chromium browser result, or human manual test is claimed. The project repository had no commits at the time of the local run. The initial implementation is now recorded in AI-authored snapshot commit `ac3e882` in the [public repository](https://github.com/Sheerkd/car-dealership-inventory-system). That snapshot does not establish the brief's requested red–green–refactor history.
