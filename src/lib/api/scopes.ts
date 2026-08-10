/**
 * YUNITE API — Permission scope parsing & validation
 *
 * A grantable scope is a `module.action` string derived from the endpoint
 * manifest (see AVAILABLE_SCOPES). The API management routes accept arrays of
 * such strings from the UI / API clients; this helper parses and validates them
 * against the single source of truth so only real scopes are ever stored.
 *
 * Storing only validated scopes keeps the `api_client_permissions` table free
 * of typos / dead grants, and guarantees that a granted scope actually matches
 * what `authorize()` checks at request time.
 */

import { AVAILABLE_SCOPES } from './manifest';
import { ApiError } from './error';

export interface ScopeParts {
  module: string;
  action: string;
}

const GRANTABLE = new Set(AVAILABLE_SCOPES.map((s) => s.label));

/** True when `scope` is a known grantable `module.action` scope. */
export function isGrantableScope(scope: string): boolean {
  return GRANTABLE.has(scope);
}

/**
 * Parse an array of raw scope strings into `{ module, action }` rows, rejecting
 * malformed strings and any scope that is not in AVAILABLE_SCOPES.
 *
 * @param raw   The incoming `permissions` array from a request body.
 * @param field Name used in the validation error message (defaults to "permissions").
 */
export function parseScopeList(raw: unknown, field = 'permissions'): ScopeParts[] {
  if (!Array.isArray(raw)) {
    throw ApiError.validation(`${field} must be an array of "module.action" strings`);
  }

  const out: ScopeParts[] = [];
  for (const entry of raw as unknown[]) {
    const scope = String(entry).trim();
    if (!scope) continue; // tolerate empty strings (UI may send trailing commas)

    const idx = scope.indexOf('.');
    if (idx <= 0 || idx === scope.length - 1) {
      throw ApiError.validation(`Invalid permission scope "${scope}". Expected "module.action".`);
    }

    if (!GRANTABLE.has(scope)) {
      throw ApiError.validation(
        `Unknown permission scope "${scope}". Only declared endpoint scopes may be granted.`
      );
    }

    out.push({ module: scope.slice(0, idx), action: scope.slice(idx + 1) });
  }
  return out;
}
