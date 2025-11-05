/**
 * Centralized API helper module for the WhatsApp Academic Manager frontend
 * Handles API calls, authentication, and error handling
 */

// Custom error class for API errors
export class APIError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

// Get the base API URL from environment or default
const getBaseURL = (): string => {
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  // Fallback to Railway deployment URL - this is the same URL used in login page
  // and is safe to expose as it's a public-facing API endpoint
  return 'https://pleasant-eagerness-production-6be8.up.railway.app';
};

// Helper to get auth token
const getAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token');
};

// Generic fetch wrapper with auth and error handling
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseURL = getBaseURL();
  const url = `${baseURL}${endpoint}`;
  
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Merge with any provided headers
  if (options.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    });
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  let data;
  try {
    data = await response.json();
  } catch (parseError) {
    // Log parsing errors for debugging, but continue with empty object
    if (!response.ok) {
      console.error('Failed to parse error response:', parseError);
    }
    data = {};
  }

  if (!response.ok) {
    throw new APIError(
      data.error || data.message || `HTTP ${response.status}: ${response.statusText}`,
      response.status,
      data
    );
  }

  return data as T;
}

// API endpoints organized by domain
export const api = {
  // Authentication endpoints
  auth: {
    async getMe(): Promise<{ user: { phone: string; role: string } }> {
      return apiFetch('/api/auth/me');
    },

    async logout(): Promise<void> {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    },

    async requestOTP(phone: string): Promise<{ dev_otp?: string }> {
      return apiFetch('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });
    },

    async verifyOTP(phone: string, code: string): Promise<{
      token: string;
      user: { phone: string; role: string };
    }> {
      return apiFetch('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ phone, code }),
      });
    },
  },

  // WhatsApp endpoints
  whatsapp: {
    async getGroups(): Promise<{
      groups: Array<{
        id: string;
        name: string;
        participants: number;
      }>;
    }> {
      return apiFetch('/api/whatsapp/groups');
    },

    async getMessages(
      groupId: string,
      limit: number = 50
    ): Promise<{
      messages: Array<{
        id: string;
        from_user: string;
        content: string;
        date?: string;
        timestamp?: number;
      }>;
      group_name?: string;
      success?: boolean;
      error?: string;
    }> {
      return apiFetch(`/api/whatsapp/messages/${groupId}?limit=${limit}`);
    },
  },
};

// Authentication helper utilities
export const authHelpers = {
  isAuthenticated(): boolean {
    if (typeof window === 'undefined') return false;
    const token = localStorage.getItem('auth_token');
    return !!token;
  },

  getUser(): { phone: string; role: string } | null {
    if (typeof window === 'undefined') return null;
    const phone = localStorage.getItem('user_phone');
    const role = localStorage.getItem('user_role');
    if (!phone || !role) return null;
    return { phone, role };
  },

  clearAuth(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_phone');
    localStorage.removeItem('user_role');
  },
};
