const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, string | number | boolean | undefined>;
}

class ApiService {
  private baseUrl: string;
  private token: string | null = null;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) localStorage.setItem('auth_token', token);
      else localStorage.removeItem('auth_token');
    }
  }

  getToken(): string | null {
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', headers = {}, body, params } = options;

    // Build URL with query params
    let url = `${this.baseUrl}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) url += `?${queryString}`;
    }

    // Build headers
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    const token = this.getToken();
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string) {
    return this.request<{ success: boolean; data: { token: string; user: any } }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
  }

  async getProfile() {
    return this.request<{ success: boolean; data: any }>('/auth/profile');
  }

  // Dashboard
  async getDashboardMetrics() {
    return this.request<{ success: boolean; data: any }>('/dashboard/metrics');
  }

  async getDashboardCharts() {
    return this.request<{ success: boolean; data: any }>('/dashboard/charts');
  }

  async getRecentTransactions(limit = 10) {
    return this.request<{ success: boolean; data: any[] }>('/dashboard/recent-transactions', {
      params: { limit },
    });
  }

  async getRecentActivities(limit = 10) {
    return this.request<{ success: boolean; data: any[] }>('/dashboard/recent-activities', {
      params: { limit },
    });
  }

  // Members
  async getMembers(params?: any) {
    return this.request<{ success: boolean; data: any[]; total: number }>('/members', { params });
  }

  async getMember(id: string) {
    return this.request<{ success: boolean; data: any }>(`/members/${id}`);
  }

  async createMember(data: any) {
    return this.request<{ success: boolean; data: any }>('/members', {
      method: 'POST',
      body: data,
    });
  }

  async updateMember(id: string, data: any) {
    return this.request<{ success: boolean; data: any }>(`/members/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteMember(id: string) {
    return this.request<{ success: boolean }>(`/members/${id}`, {
      method: 'DELETE',
    });
  }

  // Savings
  async getSavingsAccounts(params?: any) {
    return this.request<{ success: boolean; data: any[]; total: number }>('/savings', { params });
  }

  async getSavingsAccount(id: string) {
    return this.request<{ success: boolean; data: any }>(`/savings/${id}`);
  }

  async createSavingsAccount(data: any) {
    return this.request<{ success: boolean; data: any }>('/savings', {
      method: 'POST',
      body: data,
    });
  }

  // Loans
  async getLoans(params?: any) {
    return this.request<{ success: boolean; data: any[]; total: number }>('/loans', { params });
  }

  async getLoan(id: string) {
    return this.request<{ success: boolean; data: any }>(`/loans/${id}`);
  }

  async createLoan(data: any) {
    return this.request<{ success: boolean; data: any }>('/loans', {
      method: 'POST',
      body: data,
    });
  }

  async approveLoan(id: string, data: any) {
    return this.request<{ success: boolean; data: any }>(`/loans/${id}/approve`, {
      method: 'POST',
      body: data,
    });
  }

  // Transactions
  async getTransactions(params?: any) {
    return this.request<{ success: boolean; data: any[]; total: number }>('/transactions', { params });
  }

  async createTransaction(data: any) {
    return this.request<{ success: boolean; data: any }>('/transactions', {
      method: 'POST',
      body: data,
    });
  }

  // Organizations
  async getOrganizations(params?: any) {
    return this.request<{ success: boolean; data: any[]; total: number }>('/organizations', { params });
  }

  async getOrganization(id: string) {
    return this.request<{ success: boolean; data: any }>(`/organizations/${id}`);
  }

  // Branches
  async getBranches(params?: any) {
    return this.request<{ success: boolean; data: any[]; total: number }>('/branches', { params });
  }

  // Reports
  async getReports(params?: any) {
    return this.request<{ success: boolean; data: any[]; total: number }>('/reports', { params });
  }

  async generateReport(type: string, params?: any) {
    return this.request<{ success: boolean; data: any }>(`/reports/generate/${type}`, {
      method: 'POST',
      body: params,
    });
  }

  // AI Center
  async getAIAnalysis(type: string, params?: any) {
    return this.request<{ success: boolean; data: any }>(`/ai/analyze/${type}`, {
      method: 'POST',
      body: params,
    });
  }

  async getAIInsights() {
    return this.request<{ success: boolean; data: any[] }>('/ai/insights');
  }

  async getFraudAlerts() {
    return this.request<{ success: boolean; data: any[] }>('/ai/fraud-alerts');
  }

  // Notifications
  async getNotifications(params?: any) {
    return this.request<{ success: boolean; data: any[]; total: number }>('/notifications', { params });
  }

  async markNotificationRead(id: string) {
    return this.request<{ success: boolean }>(`/notifications/${id}/read`, {
      method: 'PUT',
    });
  }

  async markAllNotificationsRead() {
    return this.request<{ success: boolean }>('/notifications/read-all', {
      method: 'PUT',
    });
  }

  // Audit Logs
  async getAuditLogs(params?: any) {
    return this.request<{ success: boolean; data: any[]; total: number }>('/audit-logs', { params });
  }

  // Settings
  async getSettings() {
    return this.request<{ success: boolean; data: any }>('/settings');
  }

  async updateSettings(data: any) {
    return this.request<{ success: boolean; data: any }>('/settings', {
      method: 'PUT',
      body: data,
    });
  }

  // System Health
  async getSystemHealth() {
    return this.request<{ success: boolean; data: any }>('/system-monitor/health');
  }

  // Generic CRUD
  async get<T>(endpoint: string, params?: any) {
    return this.request<T>(endpoint, { params });
  }

  async post<T>(endpoint: string, data?: any) {
    return this.request<T>(endpoint, { method: 'POST', body: data });
  }

  async put<T>(endpoint: string, data?: any) {
    return this.request<T>(endpoint, { method: 'PUT', body: data });
  }

  async delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiService();
export default api;