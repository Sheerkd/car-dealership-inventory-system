# Car Dealership Inventory Architecture

The system is a React single-page application backed by a TypeScript REST API and PostgreSQL. The backend is a modular monolith with authentication, vehicle catalogue, and inventory modules. Request validation and permission checks precede business logic. Services own business rules; repositories own database access.

```text
Browser -> React SPA -> Express API -> services -> Prisma -> PostgreSQL
```

## Data

Users have a unique normalized email, password hash, and USER or ADMIN role. Public registration always creates USER. Vehicles have UUID IDs, make, model, category, positive decimal price, and nonnegative integer quantity. Stock changes occur through dedicated purchase and restock operations. A purchase uses a conditional atomic database update so simultaneous requests cannot oversell.

## Access

Registration and login are public. Viewing and purchasing vehicles require a signed-in user. Creating, editing, deleting, and restocking vehicles require ADMIN. This resolves the brief's ambiguity between protected API operations and admin-only UI controls. The first admin is created through a controlled setup command, never through public registration.

## Customer browser

The React app submits registration and login requests, then sends the returned bearer token with inventory requests. The token stays in memory for the current page session; reloading the page requires signing in again. The search form sends filters, sort order, and page number to the API. After a purchase, the app reloads results so stock counts and in-stock filters reflect the database. A stock conflict refreshes the listing while keeping its error visible.

## Admin browser

An admin login opens a management view with vehicle counts and controls to add listings, edit details, restock, and delete after confirmation. Admins can switch to the customer catalogue and back. The interface uses the role in the login response to choose a view; the API independently checks the current database role on every protected request. Stock changes use the restock endpoint, while ordinary edits send only make, model, category, and price.

## Boundaries

The purchase action means one inventory unit is removed. Payments, checkout, and orders are outside the required scope. Sold-out vehicles remain visible, with purchasing disabled. INR is the initial display currency. Prices are stored as decimal values and serialized as strings.

## Quality

Tests cover service rules, API behaviour, database concurrency, React interactions, and a Playwright journey through customer purchase and admin management. The CI workflow is configured to run type checks, database-backed tests, builds, and the browser journey; a remote CI run has not yet been recorded. The repository does not have a commit history showing a red–green–refactor sequence. Unexpected API failures return a generic JSON error without exposing internal details. The browser surfaces failed requests and expired sessions, and admin dialogs manage keyboard focus.
