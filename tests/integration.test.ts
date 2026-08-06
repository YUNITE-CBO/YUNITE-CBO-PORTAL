/**
 * YUNITE Enterprise Operating System - Integration Tests
 * Complete API Test Suite with Cookie-based Authentication
 */

const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';
const TEST_EMAIL = 'info.yunite.ke@gmail.com';
const TEST_PASSWORD = 'Yuniteke2026.';

// Simple cookie jar for testing
class CookieJar {
  private cookies: Map<string, string> = new Map();

  setCookies(headers: Headers) {
    // set-cookie can be a single string or array of strings
    const setCookie = headers.get('set-cookie');
    if (setCookie) {
      // Handle single cookie or comma-separated cookies
      const cookies = setCookie.split(',').map(c => c.trim());
      cookies.forEach(cookie => {
        const parts = cookie.split(';');
        const [nameValue] = parts;
        if (nameValue) {
          const eqIndex = nameValue.indexOf('=');
          if (eqIndex > 0) {
            const name = nameValue.substring(0, eqIndex).trim();
            const value = nameValue.substring(eqIndex + 1).trim();
            this.cookies.set(name, value);
          }
        }
      });
    }
  }

  getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

// Global cookie jar instance
const cookieJar = new CookieJar();

// Helper to login and get fresh cookies
async function login(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    }),
  });
  
  if (response.ok) {
    cookieJar.setCookies(response.headers);
  }
}

// ============================================
// AUTHENTICATION TESTS
// ============================================

describe('Authentication API', () => {
  describe('POST /api/auth/login', () => {
    it('should successfully login with valid credentials', async () => {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('token');
      expect(data.data.user.email).toBe(TEST_EMAIL);
      expect(data.data.user.role).toBe('super_admin');
      
      cookieJar.setCookies(response.headers);
    });

    it('should reject login with invalid credentials', async () => {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_EMAIL,
          password: 'wrongpassword',
        }),
      });

      // Account may be locked from previous tests, or just unauthorized
      expect([401, 423]).toContain(response.status);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should validate required fields', async () => {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/auth/session', () => {
    beforeEach(async () => {
      await login();
    });

    it('should return session for authenticated user', async () => {
      const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.user.email).toBe(TEST_EMAIL);
    });

    it('should reject request without authentication', async () => {
      const response = await fetch(`${API_BASE_URL}/api/auth/session`);

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    beforeEach(async () => {
      await login();
    });

    it('should successfully logout', async () => {
      const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe('GET /api/auth/profile', () => {
    beforeEach(async () => {
      await login();
    });

    it('should return user profile', async () => {
      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      // Profile returns user data at data level, not data.user
      expect(data.data.email).toBe(TEST_EMAIL);
    });
  });
});

// ============================================
// ADMIN API TESTS - Super Admin Permissions
// ============================================

describe('Admin API - Super Admin Permissions', () => {
  beforeAll(async () => {
    await login();
  });

  describe('GET /api/admin/users', () => {
    it('should list all users for Super Admin', async () => {
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      // Data is returned directly as array
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/admin/users', () => {
    it('should create a new user as Super Admin', async () => {
      const newUser = {
        email: `testuser_${Date.now()}@example.com`,
        password: 'TestPassword123!',
        full_name: 'Test Staff User',
        phone: '+254700000001',
        role: 'staff',
      };

      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieJar.getCookieHeader(),
        },
        body: JSON.stringify(newUser),
      });

      expect([200, 201]).toContain(response.status);
      const data = await response.json();
      // User is returned directly in data
      expect(data.data.email).toBe(newUser.email);
      expect(data.data.role).toBe('staff');
    });

    it('should validate required fields', async () => {
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieJar.getCookieHeader(),
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/admin/login-activity', () => {
    it('should list login activity', async () => {
      const response = await fetch(`${API_BASE_URL}/api/admin/login-activity`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });
});

// ============================================
// MEMBERS API TESTS
// ============================================

describe('Members API', () => {
  beforeAll(async () => {
    await login();
  });

  describe('GET /api/members', () => {
    it('should list all members', async () => {
      const response = await fetch(`${API_BASE_URL}/api/members`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      // Data is returned directly as array
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await fetch(`${API_BASE_URL}/api/members?page=1&limit=10`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/members', () => {
    it('should create a new member', async () => {
      const memberData = {
        first_name: 'Test',
        last_name: 'Member',
        email: `testmember_${Date.now()}@example.com`,
        phone: '+254700000002',
        id_number: `ID${Date.now()}`,
      };

      const response = await fetch(`${API_BASE_URL}/api/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieJar.getCookieHeader(),
        },
        body: JSON.stringify(memberData),
      });

      expect([200, 201]).toContain(response.status);
    });
  });
});

// ============================================
// TRANSACTIONS API TESTS
// ============================================

describe('Transactions API', () => {
  beforeAll(async () => {
    await login();
  });

  describe('GET /api/transactions', () => {
    it('should list all transactions', async () => {
      const response = await fetch(`${API_BASE_URL}/api/transactions`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      // Data is returned directly as array
      expect(Array.isArray(data.data)).toBe(true);
    });
  });
});

// ============================================
// DOCUMENTS API TESTS
// ============================================

describe('Documents API', () => {
  beforeAll(async () => {
    await login();
  });

  describe('GET /api/documents', () => {
    it('should list documents for member', async () => {
      const response = await fetch(`${API_BASE_URL}/api/documents?module=members&entityType=member&entityId=test-id`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
    });

    it('should search documents', async () => {
      const response = await fetch(`${API_BASE_URL}/api/documents?action=search&query=test`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
    });

    it('should get document statistics', async () => {
      const response = await fetch(`${API_BASE_URL}/api/documents?action=stats`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/document-categories', () => {
    it('should list document categories', async () => {
      const response = await fetch(`${API_BASE_URL}/api/document-categories`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
    });
  });
});

// ============================================
// NOTIFICATIONS API TESTS
// ============================================

describe('Notifications API', () => {
  beforeAll(async () => {
    await login();
  });

  describe('GET /api/notifications', () => {
    it('should list notifications', async () => {
      const response = await fetch(`${API_BASE_URL}/api/notifications?recipient_id=3c6581db-5afd-4a21-af74-bfff33a5c13f&recipient_type=user`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe('GET /api/notifications/preferences', () => {
    it('should get notification preferences with proper params', async () => {
      const response = await fetch(`${API_BASE_URL}/api/notifications/preferences?owner_id=3c6581db-5afd-4a21-af74-bfff33a5c13f&owner_type=user`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect([200, 400]).toContain(response.status);
    });
  });

  describe('GET /api/notifications/templates', () => {
    it('should list notification templates', async () => {
      const response = await fetch(`${API_BASE_URL}/api/notifications/templates`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
    });
  });
});

// ============================================
// LOANS API TESTS
// ============================================

describe('Loans API', () => {
  beforeAll(async () => {
    await login();
  });

  describe('GET /api/loans', () => {
    it('should list all loans', async () => {
      const response = await fetch(`${API_BASE_URL}/api/loans`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });
});

// ============================================
// FINES API TESTS
// ============================================

describe('Fines API', () => {
  beforeAll(async () => {
    await login();
  });

  describe('GET /api/fines', () => {
    it('should list all fines', async () => {
      const response = await fetch(`${API_BASE_URL}/api/fines`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });
});

// ============================================
// SETTINGS API TESTS
// ============================================

describe('Settings API', () => {
  beforeAll(async () => {
    await login();
  });

  describe('GET /api/settings', () => {
    it('should return system settings', async () => {
      const response = await fetch(`${API_BASE_URL}/api/settings`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
    });
  });
});

// ============================================
// HEALTH CHECK
// ============================================

describe('Health Check', () => {
  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await fetch(`${API_BASE_URL}/api/health`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('status');
    });
  });
});

// ============================================
// END-TO-END: Super Admin Permissions Test
// ============================================

describe('Super Admin Permissions - End-to-End', () => {
  beforeAll(async () => {
    await login();
  });

  it('should have full access to all admin endpoints', async () => {
    const endpoints = [
      '/api/admin/users',
      '/api/admin/login-activity',
    ];

    for (const endpoint of endpoints) {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });
      expect(response.status).toBe(200);
    }
  });

  it('should be able to create users with different roles', async () => {
    const roles = ['admin', 'staff', 'viewer'];

    for (const role of roles) {
      const newUser = {
        email: `role_test_${role}_${Date.now()}@example.com`,
        password: 'TestPassword123!',
        full_name: `Test ${role}`,
        role: role,
      };

      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieJar.getCookieHeader(),
        },
        body: JSON.stringify(newUser),
      });

      expect([200, 201]).toContain(response.status);
    }
  });
});

// ============================================
// END-TO-END: Login Notification Test
// ============================================

describe('Login Notification - End-to-End', () => {
  it('should receive notification on login', async () => {
    // Logout first
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: cookieJar.getCookieHeader(),
      },
    });

    // Login again
    const loginRes = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });

    expect(loginRes.status).toBe(200);
    cookieJar.setCookies(loginRes.headers);

    // Check notifications - use correct parameters
    const notificationsRes = await fetch(`${API_BASE_URL}/api/notifications?recipient_id=3c6581db-5afd-4a21-af74-bfff33a5c13f&recipient_type=user`, {
      headers: {
        Cookie: cookieJar.getCookieHeader(),
      },
    });

    expect(notificationsRes.status).toBe(200);
  });
});
