/**
 * Custom React Query hook for fetching WhatsApp groups
 */

import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { api } from '../api';

interface WhatsAppGroup {
  id: string;
  name: string;
  participants: number;
}

interface WhatsAppGroupsData {
  groups: WhatsAppGroup[];
}

/**
 * Hook to fetch WhatsApp groups data
 * Uses React Query for caching, background updates, and automatic refetching
 */
export function useWhatsAppGroups(): UseQueryResult<WhatsAppGroupsData, Error> {
  return useQuery<WhatsAppGroupsData, Error>({
    queryKey: ['whatsapp', 'groups'],
    queryFn: async () => {
      const data = await api.whatsapp.getGroups();
      return data;
    },
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep unused data in cache for 10 minutes
    retry: 2, // Retry failed requests twice
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });
}
