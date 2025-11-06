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

// ==================== ADVANCED FEATURES UTILITIES ====================

/**
 * Format privacy setting value to readable text
 * @param value - Privacy value
 * @returns Readable text
 */
export function formatPrivacyValue(value: string): string {
  const values: Record<string, string> = {
    all: 'Everyone',
    contacts: 'My Contacts',
    contact_blacklist: 'My Contacts Except...',
    none: 'Nobody',
  };
  return values[value] || value;
}

/**
 * Format privacy setting name to readable text
 * @param setting - Privacy setting name
 * @returns Readable text
 */
export function formatPrivacySetting(setting: string): string {
  const settings: Record<string, string> = {
    last: 'Last Seen',
    online: 'Online Status',
    profile: 'Profile Photo',
    status: 'Status/About',
    readreceipts: 'Read Receipts',
    groupadd: 'Groups',
  };
  return settings[setting] || setting;
}

/**
 * Format disappearing message duration to readable text
 * @param seconds - Duration in seconds
 * @returns Readable duration (e.g., "24 hours", "7 days", "Off")
 */
export function formatDisappearingDuration(seconds: number): string {
  if (seconds === 0) return 'Off';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days`;
  return `${Math.floor(seconds / 604800)} weeks`;
}

/**
 * Get presence type display name
 * @param type - Presence type
 * @returns Display name
 */
export function getPresenceDisplayName(type: string): string {
  const types: Record<string, string> = {
    composing: 'Typing...',
    recording: 'Recording...',
    paused: 'Online',
    available: 'Available',
    unavailable: 'Offline',
  };
  return types[type] || type;
}

/**
 * Get presence type icon
 * @param type - Presence type
 * @returns Icon name
 */
export function getPresenceIcon(type: string): string {
  const icons: Record<string, string> = {
    composing: 'MessageCircle',
    recording: 'Mic',
    paused: 'CheckCircle',
    available: 'CheckCircle',
    unavailable: 'Circle',
  };
  return icons[type] || 'Circle';
}

/**
 * Format broadcast recipient count
 * @param count - Number of recipients
 * @returns Formatted text (e.g., "5 recipients", "1 recipient")
 */
export function formatRecipientCount(count: number): string {
  return count === 1 ? '1 recipient' : `${count} recipients`;
}

/**
 * Validate newsletter ID format
 * @param newsletterId - Newsletter ID to validate
 * @returns true if valid
 */
export function isValidNewsletterID(newsletterId: string): boolean {
  return /^[0-9]+@newsletter$/.test(newsletterId);
}

/**
 * Format connection state to readable status
 * @param state - Connection state
 * @returns Readable status with color class
 */
export function formatConnectionState(state: string): { text: string; color: string } {
  const states: Record<string, { text: string; color: string }> = {
    open: { text: 'Connected', color: 'bg-green-100 text-green-700' },
    connecting: { text: 'Connecting...', color: 'bg-yellow-100 text-yellow-700' },
    close: { text: 'Disconnected', color: 'bg-red-100 text-red-700' },
  };
  return states[state] || { text: state, color: 'bg-gray-100 text-gray-700' };
}

/**
 * Format bytes per second to readable speed
 * @param bytesPerSecond - Speed in bytes per second
 * @returns Formatted speed (e.g., "1.5 MB/s")
 */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return '0 B/s';
  
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  
  return `${parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Parse poll options from text
 * @param text - Text with options (one per line or comma-separated)
 * @returns Array of poll options
 */
export function parsePollOptions(text: string): string[] {
  // Try splitting by newlines first
  let options = text.split('\n').map(opt => opt.trim()).filter(opt => opt.length > 0);
  
  // If only one option, try splitting by commas
  if (options.length === 1) {
    options = text.split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);
  }
  
  return options;
}

/**
 * Validate poll options
 * @param options - Array of poll options
 * @returns Validation result with error message if invalid
 */
export function validatePollOptions(options: string[]): { valid: boolean; error?: string } {
  if (options.length < 2) {
    return { valid: false, error: 'Poll must have at least 2 options' };
  }
  if (options.length > 12) {
    return { valid: false, error: 'Poll cannot have more than 12 options' };
  }
  if (options.some(opt => opt.length === 0)) {
    return { valid: false, error: 'Poll options cannot be empty' };
  }
  if (options.some(opt => opt.length > 100)) {
    return { valid: false, error: 'Poll options cannot exceed 100 characters' };
  }
  return { valid: true };
}

/**
 * Format group settings to readable text
 * @param announce - Only admins can send messages
 * @param locked - Only admins can edit group info
 * @returns Formatted text
 */
export function formatGroupSettings(announce: boolean, locked: boolean): string {
  const settings: string[] = [];
  if (announce) settings.push('Admins only messaging');
  if (locked) settings.push('Admins only info');
  return settings.length > 0 ? settings.join(', ') : 'Open group';
}

/**
 * Get media type from URL or filename
 * @param urlOrFilename - URL or filename
 * @returns Media type ('image' | 'video' | 'audio' | 'document')
 */
export function getMediaTypeFromUrl(urlOrFilename: string): 'image' | 'video' | 'audio' | 'document' {
  const ext = urlOrFilename.toLowerCase().split('.').pop() || '';
  
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
  const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm'];
  const audioExts = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'];
  
  if (imageExts.includes(ext)) return 'image';
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  return 'document';
}

/**
 * Format story/status expiry time
 * @param expiryTimestamp - Unix timestamp when story expires
 * @returns Formatted time remaining (e.g., "23h left", "5m left")
 */
export function formatStoryExpiry(expiryTimestamp: number): string {
  const now = Date.now();
  const remaining = expiryTimestamp - now;
  
  if (remaining <= 0) return 'Expired';
  
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  
  if (hours > 0) return `${hours}h left`;
  return `${minutes}m left`;
}

/**
 * Validate media URL
 * @param url - URL to validate
 * @returns true if valid HTTP/HTTPS URL
 */
export function isValidMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Format location coordinates
 * @param latitude - Latitude coordinate
 * @param longitude - Longitude coordinate
 * @returns Formatted coordinates (e.g., "40.7128° N, 74.0060° W")
 */
export function formatCoordinates(latitude: number, longitude: number): string {
  const latDir = latitude >= 0 ? 'N' : 'S';
  const lonDir = longitude >= 0 ? 'E' : 'W';
  return `${Math.abs(latitude).toFixed(4)}° ${latDir}, ${Math.abs(longitude).toFixed(4)}° ${lonDir}`;
}

/**
 * Get Google Maps URL for coordinates
 * @param latitude - Latitude coordinate
 * @param longitude - Longitude coordinate
 * @returns Google Maps URL
 */
export function getGoogleMapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}
