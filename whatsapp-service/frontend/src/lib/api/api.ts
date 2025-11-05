// Backend Python API URL (port 8000)
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://wam-api-production.up.railway.app';

// WhatsApp Service URL (Railway - for direct auth calls)
const WHATSAPP_URL = process.env.NEXT_PUBLIC_API_URL || 'https://whatsapp-academic-manager-production.up.railway.app';

// Optional public API key for admin flows (used when no Bearer token is present)
const PUBLIC_API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

/**
 * Custom API Error class
 */
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Fetch with automatic authentication
 * @param endpoint - API endpoint path
 * @param options - Fetch options
 * @param useBackend - If true, use Python backend URL; if false, use Railway WhatsApp URL
 */
async function fetchWithAuth(
  endpoint: string, 
  options: RequestInit = {}, 
  useBackend: boolean = false
) {
  const token = typeof window !== 'undefined' 
    ? localStorage.getItem('auth_token') 
    : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers && typeof options.headers === 'object' && !Array.isArray(options.headers) && !(options.headers instanceof Headers)
      ? (options.headers as Record<string, string>)
      : {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (PUBLIC_API_KEY) {
    // Fallback for admin/SSR scenarios where we don't have a user token
    headers['x-api-key'] = PUBLIC_API_KEY;
  }

  // Choose base URL based on useBackend flag
  const baseURL = useBackend ? BACKEND_URL : WHATSAPP_URL;

  try {
    const response = await fetch(`${baseURL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new APIError(
        data.error || data.detail || 'Request failed',
        response.status,
        data
      );
    }

    return data;
  } catch (error) {
    // Re-throw APIError as-is
    if (error instanceof APIError) {
      throw error;
    }

    // Handle network errors
    if (error instanceof TypeError) {
      throw new APIError(
        'Network error. Please check your connection.',
        0,
        { originalError: error.message }
      );
    }

    // Handle other errors
    throw new APIError(
      error instanceof Error ? error.message : 'Unknown error occurred',
      0,
      { originalError: error }
    );
  }
}

/**
 * Main API object with all endpoints
 */
export const api = {
  // ==================== AUTH ENDPOINTS ====================
  // These call Railway WhatsApp service directly
  auth: {
    /**
     * Request OTP code via WhatsApp
     * @param phone - Phone number in international format (e.g., +201155547529)
     */
    requestOTP: async (phone: string) => {
      return fetchWithAuth('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      }, false); // Direct to Railway
    },

    /**
     * Verify OTP code and get authentication token
     * @param phone - Phone number in international format
     * @param code - 6-digit OTP code received via WhatsApp
     */
    verifyOTP: async (phone: string, code: string) => {
      return fetchWithAuth('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ phone, code }),
      }, false); // Direct to Railway
    },

    /**
     * Logout and invalidate current session
     */
    logout: async () => {
      return fetchWithAuth('/api/auth/logout', {
        method: 'POST',
      }, false); // Direct to Railway
    },

    /**
     * Get current authenticated user information
     */
    getMe: async () => {
      return fetchWithAuth('/api/auth/me', {}, false); // Direct to Railway
    },
  },

  // ==================== WHATSAPP ENDPOINTS ====================
  // These call Python backend (which then calls Railway)
  whatsapp: {
    /**
     * Get all WhatsApp groups
     * Requires authentication
     */
    getGroups: async () => {
      return fetchWithAuth('/api/whatsapp/groups', {}, false);
    },

    /**
     * Get messages from a specific WhatsApp group
     * @param groupId - WhatsApp group ID
     * @param limit - Number of messages to fetch (default: 50)
     */
    getMessages: async (groupId: string, limit: number = 50) => {
      return fetchWithAuth(
        `/api/whatsapp/messages/${groupId}?limit=${limit}`,
        {},
        false
      );
    },

    /**
     * Send a text message to a WhatsApp group or contact
     * @param groupId - WhatsApp group or contact ID
     * @param message - Message text to send
     */
    sendMessage: async (groupId: string, message: string) => {
      return fetchWithAuth('/api/send', {
        method: 'POST',
        body: JSON.stringify({ groupId, message }),
      }, false);
    },

    /**
     * Get WhatsApp connection status
     */
    getStatus: async () => {
      return fetchWithAuth('/api/whatsapp/status', {}, false);
    },

    // ==================== ADVANCED MESSAGING ====================
    
    /**
     * Send media message (image, video, audio, document)
     * @param groupId - WhatsApp group or contact ID
     * @param mediaUrl - URL of the media file
     * @param mediaType - Type of media: 'image' | 'video' | 'audio' | 'document'
     * @param caption - Optional caption for the media
     * @param fileName - Optional filename (for documents)
     * @param mimetype - Optional mimetype
     */
    sendMedia: async (params: {
      groupId: string;
      mediaUrl: string;
      mediaType: 'image' | 'video' | 'audio' | 'document';
      caption?: string;
      fileName?: string;
      mimetype?: string;
    }) => {
      return fetchWithAuth('/api/send-media', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Send location message
     * @param groupId - WhatsApp group or contact ID
     * @param latitude - Latitude coordinate
     * @param longitude - Longitude coordinate
     * @param name - Optional location name
     * @param address - Optional location address
     */
    sendLocation: async (params: {
      groupId: string;
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
    }) => {
      return fetchWithAuth('/api/send-location', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Send contact message
     * @param groupId - WhatsApp group or contact ID
     * @param displayName - Contact display name
     * @param vcard - vCard string
     */
    sendContact: async (params: {
      groupId: string;
      displayName: string;
      vcard: string;
    }) => {
      return fetchWithAuth('/api/send-contact', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Send poll message
     * @param groupId - WhatsApp group or contact ID
     * @param question - Poll question
     * @param options - Array of poll options
     * @param selectableCount - Number of options that can be selected (default: 1)
     */
    sendPoll: async (params: {
      groupId: string;
      question: string;
      options: string[];
      selectableCount?: number;
    }) => {
      return fetchWithAuth('/api/send-poll', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Reply to a message
     * @param groupId - WhatsApp group or contact ID
     * @param messageId - ID of the message to reply to
     * @param text - Reply text
     */
    replyToMessage: async (params: {
      groupId: string;
      messageId: string;
      text: string;
    }) => {
      return fetchWithAuth('/api/reply', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * React to a message with an emoji
     * @param groupId - WhatsApp group or contact ID
     * @param messageId - ID of the message to react to
     * @param emoji - Emoji reaction (e.g., '👍', '❤️')
     */
    reactToMessage: async (params: {
      groupId: string;
      messageId: string;
      emoji: string;
    }) => {
      return fetchWithAuth('/api/react', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Edit a sent message
     * @param groupId - WhatsApp group or contact ID
     * @param messageId - ID of the message to edit
     * @param newText - New message text
     */
    editMessage: async (params: {
      groupId: string;
      messageId: string;
      newText: string;
    }) => {
      return fetchWithAuth('/api/edit-message', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Delete a message for everyone
     * @param groupId - WhatsApp group or contact ID
     * @param messageId - ID of the message to delete
     */
    deleteMessage: async (params: {
      groupId: string;
      messageId: string;
    }) => {
      return fetchWithAuth('/api/delete-message', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    // ==================== GROUP MANAGEMENT ====================
    
    /**
     * Create a new WhatsApp group
     * @param name - Group name
     * @param participants - Array of participant JIDs
     */
    createGroup: async (params: {
      name: string;
      participants: string[];
    }) => {
      return fetchWithAuth('/api/group/create', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Update group name/subject
     * @param groupId - WhatsApp group ID
     * @param subject - New group name
     */
    updateGroupSubject: async (params: {
      groupId: string;
      subject: string;
    }) => {
      return fetchWithAuth('/api/group/update-subject', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Update group description
     * @param groupId - WhatsApp group ID
     * @param description - New group description
     */
    updateGroupDescription: async (params: {
      groupId: string;
      description: string;
    }) => {
      return fetchWithAuth('/api/group/update-description', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Add participants to a group
     * @param groupId - WhatsApp group ID
     * @param participants - Array of participant JIDs to add
     */
    addGroupParticipants: async (params: {
      groupId: string;
      participants: string[];
    }) => {
      return fetchWithAuth('/api/group/add-participants', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Remove participants from a group
     * @param groupId - WhatsApp group ID
     * @param participants - Array of participant JIDs to remove
     */
    removeGroupParticipants: async (params: {
      groupId: string;
      participants: string[];
    }) => {
      return fetchWithAuth('/api/group/remove-participants', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Promote participants to admin
     * @param groupId - WhatsApp group ID
     * @param participants - Array of participant JIDs to promote
     */
    promoteGroupParticipants: async (params: {
      groupId: string;
      participants: string[];
    }) => {
      return fetchWithAuth('/api/group/promote', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Demote participants from admin
     * @param groupId - WhatsApp group ID
     * @param participants - Array of participant JIDs to demote
     */
    demoteGroupParticipants: async (params: {
      groupId: string;
      participants: string[];
    }) => {
      return fetchWithAuth('/api/group/demote', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Update group settings
     * @param groupId - WhatsApp group ID
     * @param announce - Only admins can send messages
     * @param locked - Only admins can edit group info
     */
    updateGroupSettings: async (params: {
      groupId: string;
      announce?: boolean;
      locked?: boolean;
    }) => {
      return fetchWithAuth('/api/group/update-settings', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Leave a group
     * @param groupId - WhatsApp group ID
     */
    leaveGroup: async (params: {
      groupId: string;
    }) => {
      return fetchWithAuth('/api/group/leave', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Get group invite code
     * @param groupId - WhatsApp group ID
     */
    getGroupInviteCode: async (groupId: string) => {
      return fetchWithAuth(`/api/group/${groupId}/invite-code`, {}, false);
    },

    /**
     * Revoke group invite code
     * @param groupId - WhatsApp group ID
     */
    revokeGroupInvite: async (params: {
      groupId: string;
    }) => {
      return fetchWithAuth('/api/group/revoke-invite', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Accept group invite
     * @param inviteCode - Group invite code
     */
    acceptGroupInvite: async (params: {
      inviteCode: string;
    }) => {
      return fetchWithAuth('/api/group/accept-invite', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    // ==================== CHAT MANAGEMENT ====================
    
    /**
     * Mark messages as read
     * @param groupId - WhatsApp group or contact ID
     * @param messageIds - Array of message IDs to mark as read
     */
    markAsRead: async (params: {
      groupId: string;
      messageIds: string[];
    }) => {
      return fetchWithAuth('/api/chat/read', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Archive or unarchive a chat
     * @param groupId - WhatsApp group or contact ID
     * @param archive - true to archive, false to unarchive
     */
    archiveChat: async (params: {
      groupId: string;
      archive: boolean;
    }) => {
      return fetchWithAuth('/api/chat/archive', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Pin or unpin a chat
     * @param groupId - WhatsApp group or contact ID
     * @param pin - true to pin, false to unpin
     */
    pinChat: async (params: {
      groupId: string;
      pin: boolean;
    }) => {
      return fetchWithAuth('/api/chat/pin', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Mute or unmute a chat
     * @param groupId - WhatsApp group or contact ID
     * @param mute - true to mute, false to unmute
     * @param duration - Duration in seconds (optional, null for unmute)
     */
    muteChat: async (params: {
      groupId: string;
      mute: boolean;
      duration?: number;
    }) => {
      return fetchWithAuth('/api/chat/mute', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Delete chat history
     * @param groupId - WhatsApp group or contact ID
     */
    deleteChat: async (params: {
      groupId: string;
    }) => {
      return fetchWithAuth('/api/chat/delete', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    // ==================== USER/PROFILE ====================
    
    /**
     * Get user profile picture
     * @param jid - WhatsApp JID
     */
    getProfilePicture: async (jid: string) => {
      return fetchWithAuth(`/api/profile-picture/${jid}`, {}, false);
    },

    /**
     * Update profile name
     * @param name - New profile name
     */
    updateProfileName: async (params: {
      name: string;
    }) => {
      return fetchWithAuth('/api/profile/update-name', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Update profile status message
     * @param status - New status message
     */
    updateProfileStatus: async (params: {
      status: string;
    }) => {
      return fetchWithAuth('/api/profile/update-status', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Get user status message
     * @param jid - WhatsApp JID
     */
    getUserStatus: async (jid: string) => {
      return fetchWithAuth(`/api/user/${jid}/status`, {}, false);
    },

    /**
     * Check if JID exists on WhatsApp
     * @param jid - WhatsApp JID
     */
    checkUserExists: async (jid: string) => {
      return fetchWithAuth(`/api/user/${jid}/exists`, {}, false);
    },

    /**
     * Block or unblock a user
     * @param jid - WhatsApp JID
     * @param block - true to block, false to unblock
     */
    blockUser: async (params: {
      jid: string;
      block: boolean;
    }) => {
      return fetchWithAuth('/api/user/block', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    // ==================== PRESENCE ====================
    
    /**
     * Update presence (typing, recording, etc.)
     * @param groupId - WhatsApp group or contact ID
     * @param type - Presence type: 'composing' | 'recording' | 'paused' | 'available'
     */
    updatePresence: async (params: {
      groupId: string;
      type: 'composing' | 'recording' | 'paused' | 'available';
    }) => {
      return fetchWithAuth('/api/presence/update', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Subscribe to presence updates
     * @param jid - WhatsApp JID
     */
    subscribePresence: async (params: {
      jid: string;
    }) => {
      return fetchWithAuth('/api/presence/subscribe', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    // ==================== UTILITIES ====================
    
    /**
     * Download media from a message
     * @param messageId - Message ID containing media
     * @param groupId - WhatsApp group or contact ID
     */
    downloadMedia: async (params: {
      messageId: string;
      groupId: string;
    }) => {
      return fetchWithAuth('/api/download-media', {
        method: 'POST',
        body: JSON.stringify(params),
      }, false);
    },

    /**
     * Get business profile information
     * @param jid - WhatsApp business JID
     */
    getBusinessProfile: async (jid: string) => {
      return fetchWithAuth(`/api/business/${jid}/profile`, {}, false);
    },
  },
};

/**
 * Authentication helper functions
 */
export const authHelpers = {
  /**
   * Check if user is authenticated
   * @returns true if user has valid token
   */
  isAuthenticated: (): boolean => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('auth_token');
  },

  /**
   * Get current authentication token
   * @returns token string or null
   */
  getToken: (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('auth_token');
  },

  /**
   * Get current user information from localStorage
   * @returns user object with phone and role, or null
   */
  getUser: (): { phone: string; role: string } | null => {
    if (typeof window === 'undefined') return null;
    const phone = localStorage.getItem('user_phone');
    const role = localStorage.getItem('user_role');
    return phone ? { phone, role: role || 'user' } : null;
  },

  /**
   * Clear all authentication data from localStorage
   */
  clearAuth: (): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_phone');
    localStorage.removeItem('user_role');
  },

  /**
   * Save authentication data to localStorage
   * @param token - JWT token
   * @param phone - User phone number
   * @param role - User role (default: 'admin')
   */
  saveAuth: (token: string, phone: string, role: string = 'admin'): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user_phone', phone);
    localStorage.setItem('user_role', role);
  },
};

/**
 * Configuration object (for debugging/monitoring)
 */
export const apiConfig = {
  backendURL: BACKEND_URL,
  whatsappURL: WHATSAPP_URL,
  
  /**
   * Check if backend is accessible
   */
  checkBackend: async (): Promise<boolean> => {
    try {
      const response = await fetch(`${BACKEND_URL}/health`);
      return response.ok;
    } catch {
      return false;
    }
  },

  /**
   * Check if WhatsApp service is accessible
   */
  checkWhatsApp: async (): Promise<boolean> => {
    try {
      const response = await fetch(`${WHATSAPP_URL}/health`);
      return response.ok;
    } catch {
      return false;
    }
  },
};