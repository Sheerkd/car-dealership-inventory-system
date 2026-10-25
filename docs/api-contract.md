# Authentication API Contract

All responses use JSON. Passwords and password hashes are never returned. Public registration creates a regular user even if the request includes a `role` field.

## Register

`POST /api/auth/register`

Request: `{ "name": "Asha Kumar", "email": "asha@example.com", "password": "StrongPass123!" }`

Success: `201` with `{ "user": { "id": "...", "name": "Asha Kumar", "email": "asha@example.com", "role": "USER" } }`.

Names are trimmed and must contain 2 to 100 characters. Emails are trimmed, lowercased, valid, and at most 254 characters. Passwords must contain 12 to 128 characters. Invalid input returns `400`; duplicate email returns `409`.

## Login

`POST /api/auth/login`

Request: `{ "email": "asha@example.com", "password": "StrongPass123!" }`

Success: `200` with `accessToken`, `tokenType` (`Bearer`), `expiresIn` (seconds), and safe `user` details. Wrong credentials return `401`. Tokens expire after 15 minutes.

## Current user

`GET /api/auth/me` with `Authorization: Bearer <accessToken>`.

Success: `200` with safe `user` details. Missing, invalid, expired, or revoked-by-deletion tokens return `401`. The current role is loaded from the database for every authenticated request.

Errors use `{ "error": { "code": "...", "message": "..." } }`.

# Vehicle API Contract

Every vehicle route requires a bearer token. Admin permission is required for create, update, and delete. The catalogue includes sold-out listings; stock filtering arrives in Phase 4.

## Create

`POST /api/vehicles` (admin only)

Request: `{ "make": "Toyota", "model": "Corolla", "category": "Sedan", "price": "1250000.00", "quantity": 2 }`

Success: `201` with a `vehicle` object containing a UUID ID and the supplied fields. Text fields are trimmed and limited to 1–80 characters. Price is a positive decimal string with at most 10 whole digits and 2 fractional digits. Quantity is an integer from 0 to 1,000,000. The database also rejects nonpositive prices and negative quantities.

## List and detail

`GET /api/vehicles` returns `200` with `{ "vehicles": [...] }`, including sold-out vehicles. Listings are ordered newest first. `GET /api/vehicles/:id` returns `200` with `{ "vehicle": {...} }`; a missing ID returns `404`.

## Update

`PUT /api/vehicles/:id` (admin only) replaces make, model, category, and price. All four fields are required. Quantity is rejected in an update request; stock changes have dedicated endpoints in Phase 5. Success is `200` with the updated `vehicle` object.

## Delete

`DELETE /api/vehicles/:id` (admin only) returns `204` on success or `404` when the listing does not exist.

Invalid requests return `400`, missing tokens return `401`, and a regular user attempting an admin operation receives `403`.

## Search and filtering

`GET /api/vehicles/search` is available to signed-in users. All filters are optional and combine with AND:

| Parameter | Meaning |
| --- | --- |
| `make`, `model`, `category` | Case-insensitive substring match, 1–80 characters |
| `minPrice`, `maxPrice` | Inclusive decimal price boundaries, up to 2 decimal places |
| `inStock` | `true` for quantity above zero; `false` for sold-out listings |
| `page` | Page number starting at 1; default 1 |
| `pageSize` | Results per page, 1–100; default 12 |
| `sort` | `newest` (default), `price_asc`, or `price_desc` |

Example: `/api/vehicles/search?make=toyota&category=sedan&minPrice=1000000&maxPrice=2000000&inStock=true&page=1&pageSize=12&sort=price_asc`.

Success returns `{ "vehicles": [...], "total": 4, "page": 1, "pageSize": 12, "totalPages": 1 }`. `total` counts all matches before pagination. Invalid values, unknown parameters, or a minimum price above the maximum return `400`. No matches return an empty `vehicles` array, `total: 0`, and `totalPages: 0`.

## Purchase and restock

`POST /api/vehicles/:id/purchase` requires a signed-in user. Send no request body or `{}`. Each successful request buys exactly one unit and returns `200` with the updated `vehicle`. The database decreases stock only when the current quantity is above zero, so concurrent requests cannot oversell. A sold-out vehicle returns `409` with error code `OUT_OF_STOCK`; a missing vehicle returns `404`. A supplied purchase quantity is rejected with `400`. This action changes inventory only; payment and order processing are outside the project scope.

`POST /api/vehicles/:id/restock` requires an admin. Send `{ "quantity": 3 }`, where quantity is an integer from 1 to 1,000,000. Success returns `200` with the updated `vehicle`. Invalid amounts return `400`, a missing vehicle returns `404`, and a regular user receives `403`.

## General API errors

Unknown `/api` paths return JSON `404` with code `NOT_FOUND`. Malformed JSON returns `400` with code `INVALID_JSON`, and oversized JSON returns `413` with code `REQUEST_TOO_LARGE`. Unexpected server failures return `500` with code `INTERNAL_ERROR` and a generic message; internal error details are not sent to the browser.
