import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ==================== WHATSAPP UTILITIES ====================

/**
 * Format phone number to WhatsApp JID
 * @param phone - Phone number (e.g., "+201155547529" or "201155547529")
 * @returns WhatsApp JID (e.g., "201155547529@s.whatsapp.net")
 */
export function formatPhoneToJID(phone: string): string {
  // Remove all non-digit characters except '+'
  const cleaned = phone.replace(/[^\d+]/g, '');
  // Remove leading '+'
  const number = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  return `${number}@s.whatsapp.net`;
}

/**
 * Format WhatsApp JID to readable phone number
 * @param jid - WhatsApp JID (e.g., "201155547529@s.whatsapp.net")
 * @returns Phone number (e.g., "+20 115 554 7529")
 */
export function formatJIDToPhone(jid: string): string {
  const number = jid.split('@')[0];
  // Add '+' prefix and format with spaces
  return `+${number.replace(/(\d{2})(\d{3})(\d{3})(\d{4})/, '$1 $2 $3 $4')}`;
}

/**
 * Check if string is a valid WhatsApp group JID
 * @param jid - JID to check
 * @returns true if it's a group JID
 */
export function isGroupJID(jid: string): boolean {
  return jid.endsWith('@g.us');
}

/**
 * Check if string is a valid WhatsApp contact JID
 * @param jid - JID to check
 * @returns true if it's a contact JID
 */
export function isContactJID(jid: string): boolean {
  return jid.endsWith('@s.whatsapp.net');
}

/**
 * Format timestamp to readable date/time
 * @param timestamp - Unix timestamp (seconds)
 * @returns Formatted date string
 */
export function formatMessageTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.toDateString() === now.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  if (isToday) {
    return timeStr;
  } else if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  } else if (now.getFullYear() === date.getFullYear()) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }) + `, ${timeStr}`;
  } else {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }) + `, ${timeStr}`;
  }
}

/**
 * Get message type icon name
 * @param messageType - Message type
 * @returns Icon name for the message type
 */
export function getMessageTypeIcon(messageType: string): string {
  const icons: Record<string, string> = {
    text: 'MessageSquare',
    image: 'Image',
    video: 'Video',
    audio: 'Music',
    voice: 'Mic',
    document: 'FileText',
    sticker: 'Smile',
    location: 'MapPin',
    contact: 'User',
    poll: 'BarChart3',
    reaction: 'Heart',
    deleted: 'Trash2',
  };
  return icons[messageType] || 'MessageCircle';
}

/**
 * Get message type display name
 * @param messageType - Message type
 * @returns Display name for the message type
 */
export function getMessageTypeDisplayName(messageType: string): string {
  const names: Record<string, string> = {
    text: 'Text',
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    voice: 'Voice Message',
    document: 'Document',
    sticker: 'Sticker',
    location: 'Location',
    contact: 'Contact',
    poll: 'Poll',
    reaction: 'Reaction',
    deleted: 'Deleted Message',
  };
  return names[messageType] || 'Message';
}

/**
 * Format file size to human-readable format
 * @param bytes - File size in bytes
 * @returns Formatted size string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format duration (seconds) to readable format
 * @param seconds - Duration in seconds
 * @returns Formatted duration (e.g., "2:35")
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Truncate text to specified length
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text with ellipsis
 */
export function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Extract mentions from message text
 * @param text - Message text
 * @returns Array of mentioned phone numbers
 */
export function extractMentions(text: string): string[] {
  const mentionRegex = /@(\d+)/g;
  const matches = text.matchAll(mentionRegex);
  return Array.from(matches, m => m[1]);
}

/**
 * Create vCard string for contact
 * @param displayName - Contact display name
 * @param phone - Phone number
 * @returns vCard string
 */
export function createVCard(displayName: string, phone: string): string {
  return `BEGIN:VCARD
VERSION:3.0
FN:${displayName}
TEL;type=CELL;type=VOICE:${phone}
END:VCARD`;
}

/**
 * Validate phone number format
 * @param phone - Phone number to validate
 * @returns true if valid
 */
export function isValidPhoneNumber(phone: string): boolean {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  // Check if it's between 10-15 digits (typical range for international numbers)
  return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * Get color for message type badge
 * @param messageType - Message type
 * @returns Tailwind color class
 */
export function getMessageTypeBadgeColor(messageType: string): string {
  const colors: Record<string, string> = {
    text: 'bg-blue-100 text-blue-700',
    image: 'bg-purple-100 text-purple-700',
    video: 'bg-pink-100 text-pink-700',
    audio: 'bg-green-100 text-green-700',
    voice: 'bg-yellow-100 text-yellow-700',
    document: 'bg-indigo-100 text-indigo-700',
    sticker: 'bg-orange-100 text-orange-700',
    location: 'bg-red-100 text-red-700',
    contact: 'bg-teal-100 text-teal-700',
    poll: 'bg-cyan-100 text-cyan-700',
    reaction: 'bg-rose-100 text-rose-700',
    deleted: 'bg-gray-100 text-gray-700',
  };
  return colors[messageType] || 'bg-gray-100 text-gray-700';
}
