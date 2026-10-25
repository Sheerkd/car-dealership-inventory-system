# Test First Development Evidence

The repository contains two verified Red–Green–Refactor sequences for backend improvements made after the initial implementation. Each sequence records a failing test commit, a passing implementation commit, and a refactor commit. The commits are authored by Codex. They demonstrate the development order for these improvements only.

| Behavior | Red test commit and observed failure | Green implementation | Refactor and verification |
| --- | --- | --- | --- |
| API startup and admin setup | `5e4b52f`: the startup tests failed because importing `server.ts` immediately threw `JWT_SECRET is required` | `233e575`: startup and admin provisioning were extracted into testable functions; focused tests passed | `d752b7c`: admin validation was shared; PostgreSQL-backed coverage run passed 42 API and 20 web tests |
| Bounded inventory restocking | `1fff7f7`: the inventory test failed because an over-limit restock returned `200` instead of `400`; a concurrent PostgreSQL test was added in the same commit | `e1ed8bd`: restocking used an atomic conditional database update and returned `STOCK_LIMIT_EXCEEDED`; PostgreSQL-backed coverage run passed 44 API and 20 web tests, and typecheck and build passed | `49c9010`: the quantity limit was shared by validation and persistence; focused inventory tests and typecheck passed |

The initial application for Phases 1–8 was committed as one AI-authored snapshot, `ac3e882`. No earlier red or green commits exist for those phases. These later cycles cannot prove the order in which the original features were written, and the repository does not claim otherwise.
