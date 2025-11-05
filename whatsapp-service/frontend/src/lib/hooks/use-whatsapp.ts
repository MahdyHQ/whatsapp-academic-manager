'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/api';

/**
 * Hook to get WhatsApp connection status
 * Automatically refreshes every 10 seconds
 * 
 * @example
 * const { data, isLoading, error } = useWhatsAppStatus();
 * console.log(data?.status); // 'connected' | 'disconnected'
 */
export function useWhatsAppStatus() {
  return useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: () => api.whatsapp.getStatus(),
    refetchInterval: 10000, // Refresh every 10 seconds
    retry: 3,
    retryDelay: 1000,
    staleTime: 5000, // Consider data stale after 5 seconds
  });
}

/**
 * Hook to get all WhatsApp groups
 * Cached for 1 minute to reduce API calls
 * 
 * @example
 * const { data, isLoading, error, refetch } = useWhatsAppGroups();
 * console.log(data?.groups); // Array of groups
 */
export function useWhatsAppGroups() {
  return useQuery({
    queryKey: ['whatsapp-groups'],
    queryFn: () => api.whatsapp.getGroups(),
    staleTime: 60000, // Cache for 1 minute
    retry: 2,
    retryDelay: 1000,
  });
}

/**
 * Hook to get messages from a specific WhatsApp group
 * Only fetches when groupId is provided
 * 
 * @param groupId - The WhatsApp group ID (null to disable fetching)
 * @param limit - Number of messages to fetch (default: 50)
 * 
 * @example
 * const { data, isLoading } = useGroupMessages('120363...@g.us', 100);
 * console.log(data?.messages); // Array of messages
 */
export function useGroupMessages(groupId: string | null, limit: number = 50) {
  return useQuery({
    queryKey: ['group-messages', groupId, limit],
    queryFn: () => {
      if (!groupId) throw new Error('No group selected');
      return api.whatsapp.getMessages(groupId, limit);
    },
    enabled: !!groupId, // Only fetch when groupId is provided
    staleTime: 30000, // Cache for 30 seconds
    retry: 2,
    retryDelay: 1000,
  });
}
/**
 * Hook to send a message to a WhatsApp group
 * Automatically invalidates messages cache after sending
 * 
 * @example
 * const sendMessage = useSendMessage();
 * 
 * sendMessage.mutate({ 
 *   groupId: '120363...@g.us', 
 *   message: 'Hello!' 
 * });
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ groupId, message }: { groupId: string; message: string }) => 
      api.whatsapp.sendMessage(groupId, message),
    
    onSuccess: (data, variables) => {
      // Invalidate messages cache for the specific group
      queryClient.invalidateQueries({ 
        queryKey: ['group-messages', variables.groupId] 
      });
      
      console.log('✅ Message sent successfully');
    },
    
    onError: (error) => {
      console.error('❌ Failed to send message:', error);
    },
  });
}

/**
 * Hook to manually refresh WhatsApp groups
 * Useful for refresh buttons
 * 
 * @example
 * const { refetch, isRefetching } = useRefreshGroups();
 * 
 * <button onClick={() => refetch()} disabled={isRefetching}>
 *   {isRefetching ? 'Refreshing...' : 'Refresh Groups'}
 * </button>
 */
export function useRefreshGroups() {
  const queryClient = useQueryClient();
  
  const refetch = () => {
    return queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
  };
  
  const isRefetching = queryClient.isFetching({ queryKey: ['whatsapp-groups'] }) > 0;
  
  return { refetch, isRefetching };
}

/**
 * Hook to manually refresh messages for a specific group
 * 
 * @param groupId - The WhatsApp group ID
 * 
 * @example
 * const { refetch, isRefetching } = useRefreshMessages(groupId);
 * 
 * <button onClick={() => refetch()}>
 *   Refresh Messages
 * </button>
 */
export function useRefreshMessages(groupId: string | null) {
  const queryClient = useQueryClient();
  
  const refetch = () => {
    if (groupId) {
      return queryClient.invalidateQueries({ 
        queryKey: ['group-messages', groupId] 
      });
    }
  };
  
  const isRefetching = groupId 
    ? queryClient.isFetching({ queryKey: ['group-messages', groupId] }) > 0
    : false;
  
  return { refetch, isRefetching };
}

/**
 * Hook to prefetch group messages
 * Useful for improving perceived performance
 * 
 * @example
 * const prefetchMessages = usePrefetchMessages();
 * 
 * // Prefetch on hover
 * <div onMouseEnter={() => prefetchMessages(groupId)}>
 *   Group Name
 * </div>
 */
export function usePrefetchMessages() {
  const queryClient = useQueryClient();
  
  return (groupId: string, limit: number = 50) => {
    queryClient.prefetchQuery({
      queryKey: ['group-messages', groupId, limit],
      queryFn: () => api.whatsapp.getMessages(groupId, limit),
      staleTime: 30000,
    });
  };
}

/**
 * Hook to get real-time polling for messages
 * Automatically fetches new messages at specified interval
 * 
 * @param groupId - The WhatsApp group ID
 * @param interval - Polling interval in milliseconds (default: 5000)
 * @param enabled - Enable/disable polling (default: true)
 * 
 * @example
 * const { data, isLoading } = useMessagePolling(groupId, 3000);
 */
export function useMessagePolling(
  groupId: string | null, 
  interval: number = 5000,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ['group-messages-polling', groupId],
    queryFn: () => {
      if (!groupId) throw new Error('No group selected');
      return api.whatsapp.getMessages(groupId, 50);
    },
    enabled: !!groupId && enabled,
    refetchInterval: interval,
    staleTime: 0, // Always consider data stale for real-time updates
  });
}

/**
 * Hook to get WhatsApp service health status
 * Checks both connection status and phone number
 * 
 * @example
 * const { isConnected, phone, isLoading } = useWhatsAppHealth();
 */
export function useWhatsAppHealth() {
  const { data, isLoading, error } = useWhatsAppStatus();
  
  return {
    isConnected: data?.status === 'connected',
    phone: data?.phone || null,
    status: data?.status || 'unknown',
    isLoading,
    error,
  };
}

// ==================== ADVANCED MESSAGING HOOKS ====================

/**
 * Hook to send media messages
 * Automatically invalidates messages cache after sending
 * 
 * @example
 * const sendMedia = useSendMedia();
 * sendMedia.mutate({ 
 *   groupId, 
 *   mediaUrl: 'https://...', 
 *   mediaType: 'image',
 *   caption: 'Check this out!'
 * });
 */
export function useSendMedia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      groupId: string;
      mediaUrl: string;
      mediaType: 'image' | 'video' | 'audio' | 'document';
      caption?: string;
      fileName?: string;
      mimetype?: string;
    }) => api.whatsapp.sendMedia(params),
    
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['group-messages', variables.groupId] 
      });
      console.log('✅ Media sent successfully');
    },
  });
}

/**
 * Hook to send location messages
 */
export function useSendLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      groupId: string;
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
    }) => api.whatsapp.sendLocation(params),
    
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['group-messages', variables.groupId] 
      });
      console.log('✅ Location sent successfully');
    },
  });
}

/**
 * Hook to send polls
 */
export function useSendPoll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      groupId: string;
      question: string;
      options: string[];
      selectableCount?: number;
    }) => api.whatsapp.sendPoll(params),
    
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['group-messages', variables.groupId] 
      });
      console.log('✅ Poll sent successfully');
    },
  });
}

/**
 * Hook to reply to messages
 */
export function useReplyToMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      groupId: string;
      messageId: string;
      text: string;
    }) => api.whatsapp.replyToMessage(params),
    
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['group-messages', variables.groupId] 
      });
      console.log('✅ Reply sent successfully');
    },
  });
}

/**
 * Hook to react to messages
 */
export function useReactToMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      groupId: string;
      messageId: string;
      emoji: string;
    }) => api.whatsapp.reactToMessage(params),
    
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['group-messages', variables.groupId] 
      });
      console.log('✅ Reaction sent successfully');
    },
  });
}

/**
 * Hook to edit messages
 */
export function useEditMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      groupId: string;
      messageId: string;
      newText: string;
    }) => api.whatsapp.editMessage(params),
    
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['group-messages', variables.groupId] 
      });
      console.log('✅ Message edited successfully');
    },
  });
}

/**
 * Hook to delete messages
 */
export function useDeleteMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      groupId: string;
      messageId: string;
    }) => api.whatsapp.deleteMessage(params),
    
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['group-messages', variables.groupId] 
      });
      console.log('✅ Message deleted successfully');
    },
  });
}

// ==================== GROUP MANAGEMENT HOOKS ====================

/**
 * Hook to create a group
 */
export function useCreateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      name: string;
      participants: string[];
    }) => api.whatsapp.createGroup(params),
    
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
      console.log('✅ Group created successfully');
    },
  });
}

/**
 * Hook to update group subject
 */
export function useUpdateGroupSubject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      groupId: string;
      subject: string;
    }) => api.whatsapp.updateGroupSubject(params),
    
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
      console.log('✅ Group name updated successfully');
    },
  });
}

/**
 * Hook to manage group participants (add/remove)
 */
export function useManageGroupParticipants() {
  const queryClient = useQueryClient();

  return {
    add: useMutation({
      mutationFn: (params: { groupId: string; participants: string[] }) => 
        api.whatsapp.addGroupParticipants(params),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
        console.log('✅ Participants added successfully');
      },
    }),
    remove: useMutation({
      mutationFn: (params: { groupId: string; participants: string[] }) => 
        api.whatsapp.removeGroupParticipants(params),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
        console.log('✅ Participants removed successfully');
      },
    }),
    promote: useMutation({
      mutationFn: (params: { groupId: string; participants: string[] }) => 
        api.whatsapp.promoteGroupParticipants(params),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
        console.log('✅ Participants promoted successfully');
      },
    }),
    demote: useMutation({
      mutationFn: (params: { groupId: string; participants: string[] }) => 
        api.whatsapp.demoteGroupParticipants(params),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
        console.log('✅ Participants demoted successfully');
      },
    }),
  };
}

/**
 * Hook to leave a group
 */
export function useLeaveGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { groupId: string }) => 
      api.whatsapp.leaveGroup(params),
    
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
      console.log('✅ Left group successfully');
    },
  });
}

// ==================== CHAT MANAGEMENT HOOKS ====================

/**
 * Hook to manage chat operations
 */
export function useChatOperations() {
  const queryClient = useQueryClient();

  return {
    markRead: useMutation({
      mutationFn: (params: { groupId: string; messageIds: string[] }) => 
        api.whatsapp.markAsRead(params),
      onSuccess: () => console.log('✅ Messages marked as read'),
    }),
    archive: useMutation({
      mutationFn: (params: { groupId: string; archive: boolean }) => 
        api.whatsapp.archiveChat(params),
      onSuccess: (data, variables) => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
        console.log(`✅ Chat ${variables.archive ? 'archived' : 'unarchived'}`);
      },
    }),
    pin: useMutation({
      mutationFn: (params: { groupId: string; pin: boolean }) => 
        api.whatsapp.pinChat(params),
      onSuccess: (data, variables) => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
        console.log(`✅ Chat ${variables.pin ? 'pinned' : 'unpinned'}`);
      },
    }),
    mute: useMutation({
      mutationFn: (params: { groupId: string; mute: boolean; duration?: number }) => 
        api.whatsapp.muteChat(params),
      onSuccess: (data, variables) => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
        console.log(`✅ Chat ${variables.mute ? 'muted' : 'unmuted'}`);
      },
    }),
    delete: useMutation({
      mutationFn: (params: { groupId: string }) => 
        api.whatsapp.deleteChat(params),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
        console.log('✅ Chat history deleted');
      },
    }),
  };
}

// ==================== PRESENCE HOOKS ====================

/**
 * Hook to update presence (typing indicator)
 */
export function useUpdatePresence() {
  return useMutation({
    mutationFn: (params: {
      groupId: string;
      type: 'composing' | 'recording' | 'paused' | 'available';
    }) => api.whatsapp.updatePresence(params),
  });
}

// ==================== PROFILE HOOKS ====================

/**
 * Hook to get profile picture
 */
export function useProfilePicture(jid: string | null) {
  return useQuery({
    queryKey: ['profile-picture', jid],
    queryFn: () => {
      if (!jid) throw new Error('No JID provided');
      return api.whatsapp.getProfilePicture(jid);
    },
    enabled: !!jid,
    staleTime: 300000, // Cache for 5 minutes
  });
}

/**
 * Hook to update profile
 */
export function useUpdateProfile() {
  return {
    updateName: useMutation({
      mutationFn: (params: { name: string }) => 
        api.whatsapp.updateProfileName(params),
      onSuccess: () => console.log('✅ Profile name updated'),
    }),
    updateStatus: useMutation({
      mutationFn: (params: { status: string }) => 
        api.whatsapp.updateProfileStatus(params),
      onSuccess: () => console.log('✅ Profile status updated'),
    }),
  };
}

// ==================== ADMIN/UTILITY HOOKS ====================

/**
 * Hook to get QR code for WhatsApp connection
 * Useful for admin pages or connection setup
 * 
 * @example
 * const { data, isLoading, refetch } = useQRCode();
 * if (data?.qr) {
 *   <img src={data.qr} alt="QR Code" />
 * }
 */
export function useQRCode() {
  return useQuery({
    queryKey: ['whatsapp-qr'],
    queryFn: () => api.admin.getQRCode(),
    refetchInterval: 5000, // Refresh QR every 5 seconds
    staleTime: 0, // Always fetch fresh QR
    retry: 2,
  });
}

/**
 * Hook to get session information
 * Returns detailed session stats, backup status, connection info
 * 
 * @example
 * const { data, isLoading } = useSessionInfo();
 * console.log(data?.session?.file_count);
 */
export function useSessionInfo() {
  return useQuery({
    queryKey: ['session-info'],
    queryFn: () => api.admin.getSessionInfo(),
    staleTime: 30000, // Cache for 30 seconds
    retry: 2,
  });
}

/**
 * Hook to request pairing code (alternative to QR)
 * Admin only - requires x-api-key
 * 
 * @example
 * const getPairingCode = useGetPairingCode();
 * getPairingCode.mutate({ phone: '+201155547529' });
 */
export function useGetPairingCode() {
  return useMutation({
    mutationFn: (params: { phone: string }) => 
      api.admin.getPairingCode(params.phone),
    onSuccess: (data) => {
      console.log('✅ Pairing code generated:', data.code);
    },
    onError: (error) => {
      console.error('❌ Failed to generate pairing code:', error);
    },
  });
}

/**
 * Hook to reset WhatsApp session
 * Admin only - requires x-api-key
 * WARNING: This will disconnect and require re-authentication
 * 
 * @example
 * const resetSession = useResetSession();
 * resetSession.mutate();
 */
export function useResetSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.admin.resetSession(),
    onSuccess: () => {
      console.log('✅ Session reset successfully');
      // Invalidate all cached data
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
      queryClient.invalidateQueries({ queryKey: ['session-info'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-qr'] });
    },
    onError: (error) => {
      console.error('❌ Failed to reset session:', error);
    },
  });
}

/**
 * Hook to add authorized phone (admin only)
 * Requires x-api-key authentication
 * 
 * @example
 * const addPhone = useAddAuthorizedPhone();
 * addPhone.mutate({ phone: '+201155547529' });
 */
export function useAddAuthorizedPhone() {
  return useMutation({
    mutationFn: (params: { phone: string }) => 
      api.auth.addAuthorizedPhone(params.phone),
    onSuccess: (data) => {
      console.log('✅ Phone added to authorized list:', data.phone);
    },
    onError: (error) => {
      console.error('❌ Failed to add authorized phone:', error);
    },
  });
}

/**
 * Hook to get list of authorized phones (admin only)
 * Requires x-api-key authentication
 * 
 * @example
 * const { data, isLoading } = useAuthorizedPhones();
 * console.log(data?.phones); // Array of phone numbers
 */
export function useAuthorizedPhones() {
  return useQuery({
    queryKey: ['authorized-phones'],
    queryFn: () => api.auth.getAuthorizedPhones(),
    staleTime: 60000, // Cache for 1 minute
    retry: 2,
  });
}

/**
 * Hook to get OTP for specific phone (admin only)
 * Requires x-api-key authentication
 * 
 * @example
 * const { data, isLoading, refetch } = useOTPForPhone('+201155547529');
 * console.log(data?.code); // 6-digit OTP
 */
export function useOTPForPhone(phone: string | null) {
  return useQuery({
    queryKey: ['otp-for-phone', phone],
    queryFn: () => {
      if (!phone) throw new Error('Phone number required');
      return api.auth.getOTPForPhone(phone);
    },
    enabled: !!phone,
    staleTime: 10000, // Cache for 10 seconds
    retry: 2,
  });
}

