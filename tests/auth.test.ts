/**
 * YUNITE Enterprise Operating System - Integration Tests
 * Authentication API Tests
 */

export {};

const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';
const TEST_EMAIL = 'info.yunite.ke@gmail.com';
const TEST_PASSWORD = 'Yuniteke2026.';

// Simple cookie jar for testing
class CookieJar {
  private cookies: Map<string, string> = new Map();

  setCookies(headers: Headers) {
    const setCookie = headers.get('set-cookie');
    if (setCookie) {
      setCookie.split(',').forEach(cookie => {
        const [nameValue] = cookie.trim().split(';');
        const [name, value] = nameValue.split('=');
        this.cookies.set(name.trim(), value.trim());
      });
    }
  }

  getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

describe('Authentication API Integration Tests', () => {
  const cookieJar = new CookieJar();

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
      expect(data).toHaveProperty('data');
      expect(data.data.user.email).toBe(TEST_EMAIL);
      
      // Store cookies for subsequent requests
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

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject login with non-existent email', async () => {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: TEST_PASSWORD,
        }),
      });

      expect(response.status).toBe(401);
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
    it('should return session for authenticated user', async () => {
      // Make request with cookies
      const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('user');
      expect(data.data.user.email).toBe(TEST_EMAIL);
    });

    it('should reject request without authentication', async () => {
      const response = await fetch(`${API_BASE_URL}/api/auth/session`);

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should successfully logout authenticated user', async () => {
      const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('logged out');
      
      // Update cookies from logout response
      cookieJar.setCookies(response.headers);
    });
  });

  describe('GET /api/auth/profile', () => {
    it('should return user profile for authenticated user', async () => {
      // Login first and get fresh session
      const loginRes = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        }),
      });
      
      cookieJar.setCookies(loginRes.headers);

      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        headers: {
          Cookie: cookieJar.getCookieHeader(),
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('user');
      expect(data.data.user.email).toBe(TEST_EMAIL);
    });
  });

  describe('PUT /api/auth/profile', () => {
    it('should update user profile', async () => {
      // Login first and get fresh session
      const loginRes = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        }),
      });
      
      cookieJar.setCookies(loginRes.headers);

      const updateData = {
        full_name: 'Test User Updated',
        phone: '+254700000000',
      };

      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieJar.getCookieHeader(),
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.user.full_name).toBe(updateData.full_name);
    });
  });
});
