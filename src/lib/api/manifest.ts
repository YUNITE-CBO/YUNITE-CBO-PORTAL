/**
 * YUNITE API — Endpoint manifest
 *
 * Single source of truth describing every /api/v1 endpoint. Drives:
 *  - the gateway handler (auth, rbac, logging metadata)
 *  - the API documentation
 *  - the API Management "Endpoints explorer" UI
 *
 * Adding an endpoint means adding a manifest entry AND its route file.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface EndpointSpec {
  id: string;
  method: HttpMethod;
  path: string;
  module: string;
  action: string;
  summary: string;
  description?: string;
  auth: 'required' | 'optional' | 'public';
  /** Required role for session auth (api-key clients use module.action scope). */
  minRole?: 'viewer' | 'staff' | 'admin' | 'super_admin';
  /** Whether the operation is financial (deletes are never casual for these). */
  financial?: boolean;
  /** Rate-limit override (requests/min) if different from tier default. */
  rateLimitPerMinute?: number;
}

export const ENDPOINTS: EndpointSpec[] = [
  // ----- System -----
  { id: 'system.health', method: 'GET', path: '/api/v1/health', module: 'system', action: 'health', summary: 'API & dependency health', auth: 'public', rateLimitPerMinute: 60 },

  // ----- Auth -----
  { id: 'auth.login', method: 'POST', path: '/api/v1/auth/login', module: 'auth', action: 'login', summary: 'Authenticate a portal user', auth: 'public', rateLimitPerMinute: 20 },
  { id: 'auth.logout', method: 'POST', path: '/api/v1/auth/logout', module: 'auth', action: 'logout', summary: 'End the current session', auth: 'required' },
  { id: 'auth.session', method: 'GET', path: '/api/v1/auth/session', module: 'auth', action: 'session', summary: 'Current session & user', auth: 'required' },
  { id: 'auth.profile', method: 'GET', path: '/api/v1/auth/profile', module: 'auth', action: 'profile', summary: 'Current user profile', auth: 'required' },
  { id: 'auth.profile.update', method: 'PUT', path: '/api/v1/auth/profile', module: 'auth', action: 'profile', summary: 'Update own profile', auth: 'required' },
  { id: 'auth.password', method: 'PUT', path: '/api/v1/auth/password', module: 'auth', action: 'password', summary: 'Change own password', auth: 'required', rateLimitPerMinute: 10 },

  // ----- Members -----
  { id: 'members.list', method: 'GET', path: '/api/v1/members', module: 'members', action: 'read', summary: 'List/search members', auth: 'required', minRole: 'viewer' },
  { id: 'members.create', method: 'POST', path: '/api/v1/members', module: 'members', action: 'create', summary: 'Register a member', auth: 'required', minRole: 'staff', financial: true },
  { id: 'members.get', method: 'GET', path: '/api/v1/members/{id}', module: 'members', action: 'read', summary: 'Member profile & balances', auth: 'required', minRole: 'viewer' },
  { id: 'members.update', method: 'PUT', path: '/api/v1/members/{id}', module: 'members', action: 'update', summary: 'Update member details', auth: 'required', minRole: 'staff' },
  { id: 'members.lookup', method: 'GET', path: '/api/v1/members/lookup', module: 'members', action: 'lookup', summary: 'Quick member lookup', auth: 'required', minRole: 'viewer' },

  // ----- Transactions -----
  { id: 'transactions.list', method: 'GET', path: '/api/v1/transactions', module: 'transactions', action: 'read', summary: 'List transactions', auth: 'required', minRole: 'viewer' },
  { id: 'transactions.create', method: 'POST', path: '/api/v1/transactions', module: 'transactions', action: 'create', summary: 'Post a financial transaction', auth: 'required', minRole: 'staff', financial: true },
  { id: 'transactions.get', method: 'GET', path: '/api/v1/transactions/{id}', module: 'transactions', action: 'read', summary: 'Transaction detail', auth: 'required', minRole: 'viewer' },
  { id: 'transactions.reverse', method: 'POST', path: '/api/v1/transactions/{id}/reverse', module: 'transactions', action: 'reverse', summary: 'Reverse a transaction (preserves audit trail)', auth: 'required', minRole: 'admin', financial: true },
  { id: 'transactions.balances', method: 'GET', path: '/api/v1/members/{id}/balances', module: 'transactions', action: 'read', summary: 'Authoritative member balances', auth: 'required', minRole: 'viewer' },

  // ----- Loans -----
  { id: 'loans.list', method: 'GET', path: '/api/v1/loans', module: 'loans', action: 'read', summary: 'List loans', auth: 'required', minRole: 'viewer' },
  { id: 'loans.eligibility', method: 'GET', path: '/api/v1/loans/eligibility/{memberId}', module: 'loans', action: 'read', summary: 'Loan eligibility for a member', auth: 'required', minRole: 'viewer' },
  { id: 'loans.apply', method: 'POST', path: '/api/v1/loans', module: 'loans', action: 'apply', summary: 'Apply for a loan', auth: 'required', minRole: 'staff', financial: true },
  { id: 'loans.approve', method: 'POST', path: '/api/v1/loans/{id}/approve', module: 'loans', action: 'approve', summary: 'Approve a loan', auth: 'required', minRole: 'admin', financial: true },
  { id: 'loans.disburse', method: 'POST', path: '/api/v1/loans/{id}/disburse', module: 'loans', action: 'disburse', summary: 'Disburse a loan', auth: 'required', minRole: 'admin', financial: true },
  { id: 'loans.repay', method: 'POST', path: '/api/v1/loans/{id}/repay', module: 'loans', action: 'repay', summary: 'Repay a loan', auth: 'required', minRole: 'staff', financial: true },

  // ----- Fines -----
  { id: 'fines.list', method: 'GET', path: '/api/v1/fines', module: 'fines', action: 'read', summary: 'List fines', auth: 'required', minRole: 'viewer' },
  { id: 'fines.create', method: 'POST', path: '/api/v1/fines', module: 'fines', action: 'create', summary: 'Issue a fine', auth: 'required', minRole: 'staff', financial: true },
  { id: 'fines.pay', method: 'POST', path: '/api/v1/fines/{id}/pay', module: 'fines', action: 'pay', summary: 'Pay a fine', auth: 'required', minRole: 'staff', financial: true },
  { id: 'fines.waive', method: 'POST', path: '/api/v1/fines/{id}/waive', module: 'fines', action: 'update', summary: 'Waive a fine', auth: 'required', minRole: 'admin', financial: true },

  // ----- Contributions -----
  { id: 'contributions.campaigns.list', method: 'GET', path: '/api/v1/contributions/campaigns', module: 'contributions', action: 'read', summary: 'List campaigns', auth: 'required', minRole: 'viewer' },
  { id: 'contributions.campaigns.create', method: 'POST', path: '/api/v1/contributions/campaigns', module: 'contributions', action: 'create', summary: 'Create a campaign', auth: 'required', minRole: 'admin' },
  { id: 'contributions.list', method: 'GET', path: '/api/v1/contributions', module: 'contributions', action: 'read', summary: 'List contributions', auth: 'required', minRole: 'viewer' },
  { id: 'contributions.pay', method: 'POST', path: '/api/v1/contributions', module: 'contributions', action: 'create', summary: 'Record a contribution', auth: 'required', minRole: 'staff', financial: true },

  // ----- Welfare -----
  { id: 'welfare.list', method: 'GET', path: '/api/v1/welfare', module: 'welfare', action: 'read', summary: 'Welfare balances & history', auth: 'required', minRole: 'viewer' },
  { id: 'welfare.deposit', method: 'POST', path: '/api/v1/welfare/deposit', module: 'welfare', action: 'create', summary: 'Record a welfare deposit', auth: 'required', minRole: 'staff', financial: true },

  // ----- Compliance -----
  { id: 'compliance.list', method: 'GET', path: '/api/v1/compliance', module: 'compliance', action: 'read', summary: 'Compliance records', auth: 'required', minRole: 'viewer' },
  { id: 'compliance.update', method: 'PUT', path: '/api/v1/compliance/{memberId}', module: 'compliance', action: 'update', summary: 'Update a member compliance record', auth: 'required', minRole: 'staff' },

  // ----- Documents -----
  { id: 'documents.list', method: 'GET', path: '/api/v1/documents', module: 'documents', action: 'read', summary: 'List documents', auth: 'required', minRole: 'viewer' },
  { id: 'documents.create', method: 'POST', path: '/api/v1/documents', module: 'documents', action: 'upload', summary: 'Upload a document', auth: 'required', minRole: 'staff' },
  { id: 'documents.get', method: 'GET', path: '/api/v1/documents/{id}', module: 'documents', action: 'read', summary: 'Document detail', auth: 'required', minRole: 'viewer' },
  { id: 'documents.delete', method: 'DELETE', path: '/api/v1/documents/{id}', module: 'documents', action: 'delete', summary: 'Delete a document', auth: 'required', minRole: 'admin' },

  // ----- Notifications -----
  { id: 'notifications.list', method: 'GET', path: '/api/v1/notifications', module: 'notifications', action: 'read', summary: 'List notifications', auth: 'required', minRole: 'viewer' },
  { id: 'notifications.send', method: 'POST', path: '/api/v1/notifications', module: 'notifications', action: 'create', summary: 'Send a notification', auth: 'required', minRole: 'staff' },

  // ----- Statements -----
  { id: 'statements.member', method: 'GET', path: '/api/v1/members/{id}/statement', module: 'statements', action: 'read', summary: 'Member statement', auth: 'required', minRole: 'viewer' },

  // ----- Organization / Settings -----
  { id: 'organization.settings.list', method: 'GET', path: '/api/v1/settings', module: 'settings', action: 'read', summary: 'List settings', auth: 'required', minRole: 'viewer' },
  { id: 'organization.settings.update', method: 'PUT', path: '/api/v1/settings', module: 'settings', action: 'update', summary: 'Update a setting', auth: 'required', minRole: 'admin' },

  // ----- Dashboard -----
  { id: 'dashboard.stats', method: 'GET', path: '/api/v1/dashboard', module: 'dashboard', action: 'read', summary: 'Organization dashboard stats', auth: 'required', minRole: 'viewer' },

  // ----- API Management (super_admin only) -----
  { id: 'api.overview', method: 'GET', path: '/api/v1/management/overview', module: 'api', action: 'manage', summary: 'API health & activity overview', auth: 'required', minRole: 'super_admin' },
  { id: 'api.endpoints', method: 'GET', path: '/api/v1/management/endpoints', module: 'api', action: 'manage', summary: 'Endpoint registry', auth: 'required', minRole: 'super_admin' },
  { id: 'api.endpoints.update', method: 'PUT', path: '/api/v1/management/endpoints/{endpointId}', module: 'api', action: 'manage', summary: 'Toggle/override an endpoint (active & rate limit)', auth: 'required', minRole: 'super_admin' },
  { id: 'api.clients.list', method: 'GET', path: '/api/v1/management/clients', module: 'api', action: 'manage', summary: 'List API clients', auth: 'required', minRole: 'super_admin' },
  { id: 'api.clients.create', method: 'POST', path: '/api/v1/management/clients', module: 'api', action: 'manage', summary: 'Create an API client', auth: 'required', minRole: 'super_admin' },
  { id: 'api.clients.get', method: 'GET', path: '/api/v1/management/clients/{id}', module: 'api', action: 'manage', summary: 'Get an API client with its permission scopes', auth: 'required', minRole: 'super_admin' },
  { id: 'api.clients.update', method: 'PUT', path: '/api/v1/management/clients/{id}', module: 'api', action: 'manage', summary: 'Update an API client (name/status/tier/description)', auth: 'required', minRole: 'super_admin' },
  { id: 'api.clients.permissions', method: 'PUT', path: '/api/v1/management/clients/{id}/permissions', module: 'api', action: 'manage', summary: 'Replace an API client permission scopes', auth: 'required', minRole: 'super_admin' },
  { id: 'api.keys.list', method: 'GET', path: '/api/v1/management/keys', module: 'api', action: 'manage', summary: 'List API keys', auth: 'required', minRole: 'super_admin' },
  { id: 'api.keys.create', method: 'POST', path: '/api/v1/management/keys', module: 'api', action: 'manage', summary: 'Generate an API key (raw key shown once)', auth: 'required', minRole: 'super_admin' },
  { id: 'api.keys.revoke', method: 'DELETE', path: '/api/v1/management/keys/{id}', module: 'api', action: 'manage', summary: 'Revoke an API key', auth: 'required', minRole: 'super_admin' },
  { id: 'api.logs', method: 'GET', path: '/api/v1/management/logs', module: 'api', action: 'manage', summary: 'API request logs', auth: 'required', minRole: 'super_admin' },
  { id: 'api.metrics', method: 'GET', path: '/api/v1/management/metrics', module: 'api', action: 'manage', summary: 'Aggregate gateway metrics for a time window', auth: 'required', minRole: 'super_admin' },
];

export function findEndpoint(method: string, path: string): EndpointSpec | undefined {
  // Match path templates like /api/v1/members/{id} against concrete paths.
  const segments = path.replace(/\/+$/, '').split('/').filter(Boolean);
  return ENDPOINTS.find((e) => {
    if (e.method !== method.toUpperCase()) return false;
    const eSegs = e.path.replace(/\/+$/, '').split('/').filter(Boolean);
    if (eSegs.length !== segments.length) return false;
    return eSegs.every((seg, i) => seg.startsWith('{') || seg === segments[i]);
  });
}

export function endpointById(id: string): EndpointSpec | undefined {
  return ENDPOINTS.find((e) => e.id === id);
}

/**
 * Distinct permission scopes (module.action) grantable to an API-key client,
 * derived from the endpoint manifest. Excludes the super_admin-only API
 * management scopes (api.manage), which are never granted to external clients.
 * Drives the scope selector in the API management UI.
 */
export const AVAILABLE_SCOPES: { module: string; action: string; label: string }[] = (() => {
  const seen = new Set<string>();
  const out: { module: string; action: string; label: string }[] = [];
  for (const e of ENDPOINTS) {
    if (e.module === 'api') continue; // management scopes are internal
    const key = `${e.module}.${e.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ module: e.module, action: e.action, label: key });
  }
  return out.sort((a, b) => (a.label < b.label ? -1 : 1));
})();
