/**
 * WhatsApp Web API Service - Complete Edition
 * Enhanced UI/UX with WhatsApp Theme Colors + Phone Authentication
 * With Session Backup & Auto-Restore (Platform Independent)
 * 
 * @author MahdyHQ
 * @version 2.4.0
 * @date 2025-11-01
 */

// Import Baileys default and named exports correctly.
// Older code imported the package default as `pkg` and destructured from it,
// which fails because the default export is the socket function itself.
// Importing the default and named exports directly ensures helpers like
// `useMultiFileAuthState` and `fetchLatestBaileysVersion` are available.
import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import express from 'express';
import QRCode from 'qrcode';
import pino from 'pino';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { Buffer } from 'buffer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    PORT,
    AUTH_DIR,
    AUTHORIZED_PHONES,
    PHONE_LIMIT,
    PHONE_WINDOW_MS,
    IP_LIMIT,
    IP_WINDOW_MS,
    MAX_RECONNECT_ATTEMPTS,
    validateEnv
} from './config.mjs';

// ES Module dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Make crypto and Buffer globally available for Baileys when missing
// In newer Node versions (>=24) `globalThis.crypto` may be present and read-only.
// Only assign when not already defined to avoid TypeErrors.
try {
    if (typeof globalThis.crypto === 'undefined') {
        globalThis.crypto = crypto;
    }
} catch (e) {
    // Ignore if globalThis.crypto is read-only (Node 24+); Baileys will use the native Web Crypto
}

if (typeof globalThis.Buffer === 'undefined') {
    globalThis.Buffer = Buffer;
}

dotenv.config();

const app = express();

// Enhanced CORS - Allow all origins
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true
}));

app.use(bodyParser.json());

// Serve static assets from /public
app.use(express.static(path.join(__dirname, 'public')));

const logger = pino({ level: 'info' });

// WhatsApp connection state
let sock = null;
let qrCodeData = null;
let connectionState = 'disconnected';
let connectedPhone = null;
let sessionRestored = false;
let connectionAttempts = 0;
// MAX_RECONNECT_ATTEMPTS comes from config.mjs (imported)

// Session backup
let sessionBackup = null;
const BACKUP_FILE = path.join(__dirname, '../session_backup.json');
// Global holder for saveCreds function returned by Baileys auth helper
let globalSaveCreds = null;

// ==================== PHONE AUTHENTICATION STORAGE ====================
const otpStorage = new Map();
const sessionTokens = new Map();

// Simple in-memory rate limiting logs for OTP requests
const otpRequestLog = new Map(); // phone -> [timestamps]
const ipRequestLog = new Map();  // ip -> [timestamps]

// OTP / rate-limit configuration imported from config.mjs
// PHONE_LIMIT, PHONE_WINDOW_MS, IP_LIMIT, IP_WINDOW_MS are provided by config.mjs

function _pruneAndCount(map, key, windowMs) {
    const now = Date.now();
    const arr = map.get(key) || [];
    const pruned = arr.filter(ts => ts > now - windowMs);
    map.set(key, pruned);
    return pruned.length;
}

function _recordTimestamp(map, key) {
    const arr = map.get(key) || [];
    arr.push(Date.now());
    map.set(key, arr);
}

// Authorized phone numbers - centralized in config
const authorizedPhones = AUTHORIZED_PHONES;

logger.info(`📱 Authorized phones: ${Array.from(authorizedPhones).join(', ')}`);

// ==================== ICON HELPER ====================
function getIconSVG(iconName, className = 'w-6 h-6') {
    const icons = {
        check: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
        phone: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`,
        database: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`,
        shield: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
        refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`,
        qrcode: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><rect x="3" y="3" width="5" height="5"></rect><rect x="16" y="3" width="5" height="5"></rect><rect x="3" y="16" width="5" height="5"></rect><path d="M21 16h-3a2 2 0 0 0-2 2v3"></path><path d="M21 21v.01"></path><path d="M12 7v3a2 2 0 0 1-2 2H7"></path><path d="M3 12h.01"></path><path d="M12 3h.01"></path><path d="M12 16v.01"></path><path d="M16 12h1"></path><path d="M21 12v.01"></path><path d="M12 21v-1"></path></svg>`,
        file: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`,
        clock: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
        info: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
        home: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
        
    // Additional icons
    trash: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>`,
    bell: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`,
    user: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M20 21v-2a4 4 0 0 0-3-3.87"></path><path d="M4 21v-2a4 4 0 0 1 3-3.87"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    };
    return icons[iconName] || '';
}

// ==================== UTILITY FUNCTIONS ====================
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

function isValidPhoneNumber(phone) {
    return /^\+\d{10,15}$/.test(phone);
}

// -------------------------
// Baileys v7+ migration helpers
// -------------------------
// Prefer LID-aware and alternate JID fields introduced in Baileys 6.8+/7.x
function getPreferredIdFromKey(key) {
    // message key may contain participantAlt / remoteJidAlt (alternate JIDs),
    // or participant / remoteJid (legacy). Prefer the Alt fields when present.
    if (!key) return null;
    return key.participantAlt || key.participant || key.remoteJidAlt || key.remoteJid || null;
}

function extractMessageContent(m) {
    // Support several common message shapes. Prefer readable text fields.
    if (!m || !m.message) return '';
    const msg = m.message;
    // conversation (simple text), extendedTextMessage, imageMessage caption, etc.
    return msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption || '';
}

function extractMessageTimestamp(m) {
    // Defensive extraction of timestamp fields across Baileys versions
    return m?.messageTimestamp || m?.message?.messageTimestamp || m?.messageTimestampSeconds || null;
}

// ==================== AUTH MIDDLEWARE ====================
/**
 * Middleware to authenticate requests using API Key
 * Checks x-api-key header or Authorization header
 */
const authenticateAPIKey = (req, res, next) => {
    // If no API_KEY is configured, skip authentication
    if (!process.env.API_KEY) {
        logger.warn('⚠️  No API_KEY configured - skipping authentication');
        return next();
    }
    
    // Get API key from headers
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    // Debug logging
    logger.info('🔑 API Key Authentication:');
    logger.info(`   Received: ${apiKey ? apiKey.substring(0, 15) + '...' : 'None'}`);
    logger.info(`   Expected: ${process.env.API_KEY ? process.env.API_KEY.substring(0, 15) + '...' : 'None'}`);
    logger.info(`   Match: ${apiKey === process.env.API_KEY}`);
    
    // Validate API key
    if (!apiKey || apiKey !== process.env.API_KEY) {
        logger.warn('❌ API key validation failed');
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    logger.info('✅ API key validated');
    next();
};

/**
 * Middleware to authenticate requests using user session tokens
 * Checks Bearer token in Authorization header
 */
function requireAuth(req, res, next) {
    try {
        const token = req.headers['authorization']?.replace('Bearer ', '');
        
        logger.info('🔐 User Token Authentication:');
        logger.info(`   Token: ${token ? token.substring(0, 20) + '...' : 'None'}`);
        
        if (!token) {
            logger.warn('❌ No token provided');
            return res.status(401).json({ 
                success: false, 
                error: 'Authentication required' 
            });
        }
        
        const session = sessionTokens.get(token);
        
        if (!session) {
            logger.warn('❌ Token not found in sessions');
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid session token' 
            });
        }
        
        if (Date.now() > session.expiresAt) {
            logger.warn('❌ Token expired');
            sessionTokens.delete(token);
            return res.status(401).json({ 
                success: false, 
                error: 'Session expired. Please login again.' 
            });
        }
        
        // Update last activity
        session.lastActivity = Date.now();
        
        // Attach user to request
        req.user = {
            phone: session.phone,
            role: 'admin'
        };
        
        logger.info(`✅ User authenticated: ${req.user.phone}`);
        next();
    } catch (error) {
        logger.error('❌ Auth middleware error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Authentication failed' 
        });
    }
}

/**
 * Flexible middleware that accepts EITHER API key OR user token
 * Use this for endpoints that can be accessed by both admin (API key) and users (token)
 */
function requireAuthOrAPIKey(req, res, next) {
    // Try API key first
    const apiKey = req.headers['x-api-key'];
    if (apiKey && process.env.API_KEY && apiKey === process.env.API_KEY) {
        logger.info('✅ Authenticated via API key');
        req.user = {
            phone: 'API_KEY_ADMIN',
            role: 'admin',
            authMethod: 'api_key'
        };
        return next();
    }
    
    // Try Bearer token
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (token) {
        const session = sessionTokens.get(token);
        if (session && Date.now() <= session.expiresAt) {
            session.lastActivity = Date.now();
            req.user = {
                phone: session.phone,
                role: 'admin',
                authMethod: 'bearer_token'
            };
            logger.info(`✅ Authenticated via token: ${req.user.phone}`);
            return next();
        }
    }
    
    // No valid authentication found
    logger.warn('❌ No valid authentication provided');
    return res.status(401).json({ 
        success: false, 
        error: 'Authentication required. Provide either x-api-key or Bearer token.' 
    });
}

// ==================== SESSION MANAGEMENT ====================
function ensureAuthDir() {
    if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        logger.info(`📁 Created auth directory: ${AUTH_DIR}`);
    }
}

function hasExistingSession() {
    return fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0;
}

function getSessionStats() {
    if (!hasExistingSession()) {
        return { exists: false, location: AUTH_DIR };
    }
    
    const files = fs.readdirSync(AUTH_DIR);
    let totalSize = 0;
    let oldestFile = null;
    
    files.forEach(file => {
        const filePath = path.join(AUTH_DIR, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        
        if (!oldestFile || stats.mtime < oldestFile) {
            oldestFile = stats.mtime;
        }
    });
    
    return {
        exists: true,
        location: AUTH_DIR,
        file_count: files.length,
        total_size_bytes: totalSize,
        total_size_kb: Math.round(totalSize / 1024),
        created_hours_ago: oldestFile ? Math.floor((Date.now() - oldestFile) / 1000 / 60 / 60) : null
    };
}

function createSessionBackup() {
    try {
        if (!hasExistingSession()) {
            logger.warn('⚠️  No session to backup');
            return null;
        }
        
        const files = fs.readdirSync(AUTH_DIR);
        const backup = {};
        
        files.forEach(file => {
            const filePath = path.join(AUTH_DIR, file);
            const content = fs.readFileSync(filePath, 'utf8');
            backup[file] = content;
        });
        
        const backupStr = Buffer.from(JSON.stringify(backup)).toString('base64');
        const backupSizeKB = Math.round(backupStr.length / 1024);
        
        try {
            fs.writeFileSync(BACKUP_FILE, JSON.stringify({ 
                backup: backupStr, 
                created: new Date().toISOString(),
                phone: connectedPhone 
            }));
            logger.info(`💾 Session backup created (${backupSizeKB} KB) and saved to disk`);
        } catch (err) {
            logger.warn('⚠️  Could not save backup to disk:', err.message);
        }
        
        sessionBackup = backupStr;
        return backupStr;
    } catch (error) {
        logger.error('❌ Failed to create backup:', error.message);
        return null;
    }
}

function restoreSessionFromBackup(backupStr) {
    try {
        if (!backupStr) {
            logger.warn('⚠️  No backup string provided');
            return false;
        }
        
        logger.info('🔄 Restoring session from backup...');
        
        const backup = JSON.parse(Buffer.from(backupStr, 'base64').toString('utf8'));
        ensureAuthDir();
        
        let restoredFiles = 0;
        Object.entries(backup).forEach(([filename, content]) => {
            const filePath = path.join(AUTH_DIR, filename);
            fs.writeFileSync(filePath, content, 'utf8');
            restoredFiles++;
        });
        
        logger.info(`✅ Session restored successfully (${restoredFiles} files)`);
        return true;
    } catch (error) {
        logger.error('❌ Failed to restore backup:', error.message);
        return false;
    }
}

function loadBackupFromDisk() {
    try {
        if (fs.existsSync(BACKUP_FILE)) {
            const data = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
            sessionBackup = data.backup;
            logger.info(`💾 Loaded session backup from disk (created: ${data.created})`);
            return data.backup;
        }
    } catch (error) {
        logger.warn('⚠️  Could not load backup from disk:', error.message);
    }
    return null;
}

function clearSessionBackup() {
    sessionBackup = null;
    if (fs.existsSync(BACKUP_FILE)) {
        fs.unlinkSync(BACKUP_FILE);
        logger.info('🗑️  Session backup cleared');
    }
}

// ==================== WHATSAPP CONNECTION ====================
async function connectWhatsApp() {
    try {
        ensureAuthDir();
        
        connectionAttempts++;
        logger.info(`🔄 Connecting to WhatsApp (Attempt ${connectionAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
        logger.info(`📁 Using auth directory: ${AUTH_DIR}`);
        
        if (!hasExistingSession()) {
            const diskBackup = loadBackupFromDisk();
            const backupToUse = sessionBackup || diskBackup;
            
            if (backupToUse) {
                logger.info('🔄 No session found, attempting restore from backup...');
                const restored = restoreSessionFromBackup(backupToUse);
                if (restored) {
                    sessionRestored = true;
                }
            } else {
                logger.info('📱 No session or backup found - will generate QR code');
                sessionRestored = false;
            }
        } else {
            logger.info('💾 Found existing session - attempting to use...');
            sessionRestored = true;
        }
        
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    // expose saveCreds globally so graceful shutdown can persist credentials
    try { globalSaveCreds = saveCreds; } catch (e) { logger.warn('Could not set globalSaveCreds', e.message); }
        const { version } = await fetchLatestBaileysVersion();

        logger.info(`📦 Using Baileys version: ${version.join('.')}`);

        // Baileys socket configuration notes:
        // - logger: pass a pino-compatible logger (we use pino)
        // - auth: provide an auth state implementation (useMultiFileAuthState is convenient for dev)
        // - getMessage: should load a stored message by key for decrypting/placeholder resends
        // - syncFullHistory: when true, emulates a desktop client to retrieve full history
        // - markOnlineOnConnect: set to false to avoid spamming mobile notifications

        const BAILEYS_LOG_LEVEL = process.env.BAILEYS_LOG_LEVEL || 'info';
        const BAILEYS_LOGGER = pino({ level: BAILEYS_LOG_LEVEL });
        const SYNC_FULL_HISTORY = process.env.SYNC_FULL_HISTORY === 'true';
        const MARK_ONLINE_ON_CONNECT = process.env.MARK_ONLINE_ON_CONNECT === 'true';

        // Group metadata cache: prefer Redis (production) but fall back to in-memory Map
        let redisClient = null;
        let groupCacheIsRedis = false;
        const groupCache = new Map();

        // Initialize Redis client if available and configured. We use dynamic import so the
        // project doesn't crash when redis package isn't installed (dev convenience).
        async function initGroupCache() {
            try {
                const { createClient } = await import('redis');
                const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`;
                const opts = { url: redisUrl };
                if (process.env.REDIS_PASSWORD) opts.password = process.env.REDIS_PASSWORD;
                redisClient = createClient(opts);
                redisClient.on('error', (e) => {
                    logger.warn('Redis client error:', e && e.message ? e.message : e);
                });
                await redisClient.connect();
                groupCacheIsRedis = true;
                logger.info('✅ Connected to Redis for cachedGroupMetadata');
            } catch (err) {
                logger.warn('⚠️  Redis not available for cachedGroupMetadata - falling back to in-memory cache');
                logger.debug(err && err.message ? err.message : err);
                redisClient = null;
                groupCacheIsRedis = false;
            }
        }

        // initialize cache (will silently fall back if redis not present)
        await initGroupCache();

        // NOTE: useMultiFileAuthState is convenient but may be IO-heavy for prod. Consider a DB-backed auth state.
        sock = makeWASocket({
            version,
            logger: BAILEYS_LOGGER,
            printQRInTerminal: true,
            auth: state,
            browser: ['Academic Manager', 'Chrome', '1.0.0'],
            // timeouts and keepalive
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            // If the library asks for a message (for decryption or polls), fetch it from any persisted store we have.
            getMessage: async (key) => {
                try {
                    // Prefer an in-memory store bound to the socket if available
                    if (sock?.store && sock.store.messages && key?.remoteJid) {
                        const chat = sock.store.messages[key.remoteJid] || {};
                        const list = Object.values(chat);
                        const found = list.find(m => m && m.key && m.key.id === key.id);
                        if (found && found.message) return found.message;
                    }

                    // Fallback: return a harmless stub so Baileys can continue
                    return { conversation: 'Message not available' };
                } catch (err) {
                    BAILEYS_LOGGER.warn('getMessage fallback triggered', err && err.message ? err.message : err);
                    return { conversation: 'Message not available' };
                }
            },
            // Optional features recommended by the docs
            syncFullHistory: SYNC_FULL_HISTORY,
            markOnlineOnConnect: MARK_ONLINE_ON_CONNECT,
            cachedGroupMetadata: async (jid) => {
                try {
                    if (groupCacheIsRedis && redisClient) {
                        const raw = await redisClient.get(`group:${jid}`);
                        if (raw) return JSON.parse(raw);
                        return null;
                    }
                    return groupCache.get(jid) || null;
                } catch (err) {
                    BAILEYS_LOGGER.warn('cachedGroupMetadata error', err && err.message ? err.message : err);
                    return null;
                }
            }
        });

        // -------------------------
        // Backwards-compatible helper
        // Ensure `sock.fetchMessagesFromWA` exists. Some Baileys versions or custom
        // wrappers may not provide this helper; create a safe shim that attempts
        // multiple strategies to load messages and falls back to an empty array
        // while logging diagnostics instead of causing a crash.
        // -------------------------
        if (typeof sock.fetchMessagesFromWA !== 'function') {
            sock.fetchMessagesFromWA = async (groupId, limit = 50) => {
                try {
                    // Preferred: if a helper exists (e.g., sock.loadMessages or sock.fetchMessages)
                    if (typeof sock.loadMessages === 'function') {
                        // Some wrappers expose loadMessages(chatId, count)
                        logger.info('Using sock.loadMessages to fetch messages');
                        return await sock.loadMessages(groupId, limit);
                    }

                    if (typeof sock.fetchMessages === 'function') {
                        logger.info('Using sock.fetchMessages to fetch messages');
                        return await sock.fetchMessages(groupId, limit);
                    }

                    // If an internal store is available, try to read from it
                    if (sock.store && sock.store.messages) {
                        try {
                            logger.info('Attempting to read messages from sock.store');
            // Migration check: ensure auth directory contains lid-mapping and device-index files
            try {
                const authFiles = fs.readdirSync(AUTH_DIR);
                const hasLid = authFiles.some(f => /lid/i.test(f) || /lid-mapping/i.test(f));
                const hasDeviceIndex = authFiles.some(f => /device-index/i.test(f) || /deviceindex/i.test(f));
                if (!hasLid || !hasDeviceIndex) {
                    logger.warn('⚠️  Auth directory appears missing LID/device-index files required by Baileys v7+');
                    logger.warn('    See migration guide: https://whiskey.so/migrate-latest');
                    logger.warn('    If you are upgrading from an older session, consider creating a new session via QR or follow the migration steps to add lid-mapping and device-index to your auth state.');
                }
            } catch (e) {
                logger.warn('Could not inspect auth directory for LID/device-index files:', e.message);
            }
                            const chatMsgs = sock.store.messages[groupId] || {};
                            const items = Object.values(chatMsgs).sort((a, b) => (b.messageTimestamp || 0) - (a.messageTimestamp || 0));
                            return items.slice(0, limit);
                        } catch (e) {
                            logger.warn('Reading from sock.store failed:', e.message);
                        }
                    }

                    // As a last resort return an empty array but don't throw — caller will handle
                    logger.warn('sock.fetchMessagesFromWA: no native fetch method found, returning empty array');
                    return [];
                } catch (err) {
                    logger.error('sock.fetchMessagesFromWA error:', err);
                    throw err;
                }
            };
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                qrCodeData = qr;
                logger.info('📱 QR Code generated - Available at /qr endpoint');
                connectionState = 'qr_ready';
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message;
                
                logger.warn('⚠️  Connection closed');
                logger.warn(`   Status Code: ${statusCode}`);
                logger.warn(`   Error: ${errorMessage || 'Unknown'}`);
                logger.warn(`   Should reconnect: ${shouldReconnect}`);
                
                connectionState = 'disconnected';
                connectedPhone = null;
                
                if (statusCode === DisconnectReason.loggedOut) {
                    logger.error('🚫 Logged out from device - clearing all session data');
                    qrCodeData = null;
                    sessionRestored = false;
                    
                    if (fs.existsSync(AUTH_DIR)) {
                        logger.info('🗑️  Clearing auth directory...');
                        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                        ensureAuthDir();
                    }
                    
                    clearSessionBackup();
                    connectionAttempts = 0;
                }
                
                if (shouldReconnect && connectionAttempts < MAX_RECONNECT_ATTEMPTS) {
                    const delay = Math.min(3000 * connectionAttempts, 30000);
                    logger.info(`🔄 Reconnecting in ${delay/1000} seconds...`);
                    setTimeout(() => connectWhatsApp(), delay);
                } else if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    logger.error('❌ Max reconnection attempts reached');
                    logger.error('   💡 Visit /qr to scan QR code again');
                } else {
                    logger.error('🚫 Not reconnecting - scan QR code at /qr');
                }
            } else if (connection === 'open') {
                logger.info('✅ WhatsApp Connected Successfully!');
                connectionState = 'connected';
                connectedPhone = sock.user?.id?.split(':')[0];
                qrCodeData = null;
                connectionAttempts = 0;
                
                setTimeout(() => {
                    createSessionBackup();
                }, 2000);
                
                if (sessionRestored) {
                    logger.info('💾 Session restored from backup');
                } else {
                    logger.info('🆕 New session created');
                }
                
                logger.info(`📱 Connected as: +${connectedPhone}`);
            } else if (connection === 'connecting') {
                logger.info('🔗 Establishing connection...');
            }
        });

        sock.ev.on('creds.update', async () => {
            await saveCreds();
            logger.info('💾 Session credentials updated');
            
            setTimeout(() => {
                createSessionBackup();
            }, 1000);
        });

        // Expose lid-mapping store helpers when available (Baileys v7+)
        try {
            const lidStore = sock.signalRepository?.lidMapping;
            if (lidStore) {
                logger.info('🔁 LID mapping store available on socket');
                // Optional convenience wrappers
                sock.getLIDForPN = async (pn) => {
                    if (typeof lidStore.getLIDForPN === 'function') return lidStore.getLIDForPN(pn);
                    return null;
                };
                sock.getPNForLID = async (lid) => {
                    if (typeof lidStore.getPNForLID === 'function') return lidStore.getPNForLID(lid);
                    return null;
                };
            } else {
                logger.info('ℹ️  No lid-mapping store available on this socket');
            }

            // Listen for lid-mapping updates (Baileys v7+)
            sock.ev.on('lid-mapping.update', async (update) => {
                    try {
                        logger.info('🔄 lid-mapping.update event received');
                        logger.debug({ update });
                        // If the socket exposes a store helper, attempt to persist mapping
                        const store = sock.signalRepository?.lidMapping;
                        if (store) {
                            // update may be a single mapping or an array
                            if (Array.isArray(update) && typeof store.storeLIDPNMappings === 'function') {
                                store.storeLIDPNMappings(update);
                            } else if (update && typeof store.storeLIDPNMapping === 'function') {
                                store.storeLIDPNMapping(update);
                            }
                        }
                    } catch (err) {
                        logger.warn('Failed handling lid-mapping.update:', err && err.message ? err.message : err);
                    }
    
                        // Close redis client if it was initialized for caching
                        try {
                            if (redisClient) {
                                logger.info('🔌 Closing Redis client...');
                                await redisClient.quit();
                                logger.info('✅ Redis client closed');
                            }
                        } catch (err) {
                            logger.warn('Error closing Redis client:', err && err.message ? err.message : err);
                        }
                });
        } catch (err) {
            logger.debug('Could not attach lid-mapping helpers:', err && err.message ? err.message : err);
        }

    } catch (error) {
        logger.error('❌ Fatal Connection Error:');
        logger.error(`   Message: ${error.message}`);
        logger.error(`   Name: ${error.name}`);
        logger.error(`   Code: ${error.code || 'N/A'}`);
        console.error('Full stack trace:', error);
        
        connectionState = 'error';
        
        if (connectionAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(5000 * connectionAttempts, 30000);
            logger.info(`🔄 Retrying connection in ${delay/1000} seconds...`);
            setTimeout(() => connectWhatsApp(), delay);
        } else {
            logger.error('❌ Max reconnection attempts reached');
        }
    }
}

// Centralized helper to fetch messages for a group in a safe way.
// Tries known socket methods and fallbacks. Returns an array of message objects.
async function fetchMessagesFromWAWrapper(groupId, limit = 50) {
    if (!sock) throw new Error('WhatsApp socket not initialized');

    logger.info(`fetchMessagesFromWAWrapper: fetching messages for group=${groupId} limit=${limit}`);

    // Helper to safely attempt a call and log results/errors
    async function tryCall(name, fn) {
        logger.info(`fetchMessagesFromWAWrapper: attempting ${name}()`);
        try {
            const res = await fn();
            const len = Array.isArray(res) ? res.length : (res && typeof res === 'object' && 'messages' in res ? (Array.isArray(res.messages) ? res.messages.length : 'non-array') : 'non-array-or-undefined');
            logger.info(`fetchMessagesFromWAWrapper: ${name}() succeeded — result length: ${len}`);
            return res;
        } catch (err) {
            logger.error(`fetchMessagesFromWAWrapper: ${name}() threw: ${err && err.stack ? err.stack : err}`);
            return null;
        }
    }

    // Try known socket helpers in order of preference
    if (typeof sock.fetchMessagesFromWA === 'function') {
        const r = await tryCall('sock.fetchMessagesFromWA', () => sock.fetchMessagesFromWA(groupId, limit));
        if (r) return Array.isArray(r) ? r : (r.messages || []);
    } else {
        logger.info('fetchMessagesFromWAWrapper: sock.fetchMessagesFromWA not available');
    }

    if (typeof sock.loadMessages === 'function') {
        const r = await tryCall('sock.loadMessages', () => sock.loadMessages(groupId, limit));
        if (r) return Array.isArray(r) ? r : (r.messages || []);
    } else {
        logger.info('fetchMessagesFromWAWrapper: sock.loadMessages not available');
    }

    if (typeof sock.fetchMessages === 'function') {
        const r = await tryCall('sock.fetchMessages', () => sock.fetchMessages(groupId, limit));
        if (r) return Array.isArray(r) ? r : (r.messages || []);
    } else {
        logger.info('fetchMessagesFromWAWrapper: sock.fetchMessages not available');
    }

    // Try reading from an in-memory store if present (many Baileys wrappers expose a `store`)
    if (sock.store && sock.store.messages) {
        logger.info('fetchMessagesFromWAWrapper: attempting in-memory store lookup');
        try {
            // Support multiple store shapes: Map-like, object-of-objects, etc.
            // 1) Map-like (store.messages.get(chatId) -> Map of messages)
            if (typeof sock.store.messages.get === 'function') {
                const chatMap = sock.store.messages.get(groupId);
                if (chatMap && (typeof chatMap.values === 'function')) {
                    const msgs = Array.from(chatMap.values());
                    logger.info(`fetchMessagesFromWAWrapper: store.get returned ${msgs.length} messages`);
                    return msgs;
                }
            }

            // 2) Plain object where sock.store.messages[chatId] is an object or map
            if (sock.store.messages[groupId]) {
                const raw = sock.store.messages[groupId];
                const msgs = Array.isArray(raw) ? raw : Object.values(raw || {});
                logger.info(`fetchMessagesFromWAWrapper: store[index] returned ${msgs.length} messages`);
                return msgs;
            }

            // 3) Fallback: iterate all entries and collect messages belonging to groupId
            const collected = [];
            if (typeof Object.entries === 'function') {
                for (const [chatId, container] of Object.entries(sock.store.messages)) {
                    if (!chatId) continue;
                    if (chatId === groupId || chatId.endsWith(groupId)) {
                        const vals = Array.isArray(container) ? container : Object.values(container || {});
                        for (const v of vals) collected.push(v);
                    }
                }
            }
            if (collected.length) {
                logger.info(`fetchMessagesFromWAWrapper: collected ${collected.length} messages by scanning store entries`);
                return collected;
            }

            logger.info('fetchMessagesFromWAWrapper: store present but no messages found for this group');
        } catch (err) {
            logger.error('fetchMessagesFromWAWrapper: error reading store:', err && err.stack ? err.stack : err);
        }
    } else {
        logger.info('fetchMessagesFromWAWrapper: no sock.store.messages available');
    }

    // Additional active-fetch fallbacks: try to ask the socket to query history
    // These are best-effort and may not be supported by all Baileys versions.
    if (typeof sock.query === 'function') {
        logger.info('fetchMessagesFromWAWrapper: attempting sock.query() as an active history fetch');
        try {
            // Try a generic JSON query payload — many Baileys wrappers accept a `query` helper.
            const payload = { json: ['query', 'history', { jid: groupId, count: limit }] };
            const result = await tryCall('sock.query(history)', () => sock.query(payload));
            if (result) {
                // normalize a few possible shapes
                if (Array.isArray(result)) return result;
                if (result.messages && Array.isArray(result.messages)) return result.messages;
                if (result[2] && Array.isArray(result[2])) return result[2];
            }
        } catch (err) {
            logger.error('fetchMessagesFromWAWrapper: sock.query fallback threw:', err && err.stack ? err.stack : err);
        }
    } else {
        logger.info('fetchMessagesFromWAWrapper: sock.query not available');
    }

    if (typeof sock.sendNode === 'function') {
        logger.info('fetchMessagesFromWAWrapper: attempting sock.sendNode() with IQ history request');
        try {
            const node = {
                tag: 'iq',
                attrs: { type: 'get', to: groupId },
                content: [ { tag: 'history', attrs: { count: String(limit) } } ]
            };
            const r = await tryCall('sock.sendNode(iq history)', () => sock.sendNode(node));
            if (r && r.content) {
                // try to extract messages from response
                const msgs = [];
                try {
                    for (const c of r.content) {
                        if (c.tag && (c.tag === 'message' || c.tag === 'm')) {
                            msgs.push(c);
                        }
                    }
                } catch (e) { /* ignore */ }
                if (msgs.length) return msgs;
            }
        } catch (err) {
            logger.error('fetchMessagesFromWAWrapper: sock.sendNode fallback threw:', err && err.stack ? err.stack : err);
        }
    } else {
        logger.info('fetchMessagesFromWAWrapper: sock.sendNode not available');
    }

    // No method available — return empty array but include diagnostic info
    logger.error('fetchMessagesFromWAWrapper: no method available to fetch messages from WhatsApp socket — returning empty array');
    return [];
}

// ==================== PHONE AUTH ENDPOINTS ====================

// POST /api/auth/request-otp - Request OTP code
app.post('/api/auth/request-otp', async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({ 
                success: false, 
                error: 'Phone number is required' 
            });
        }
        
        if (!isValidPhoneNumber(phone)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid phone number format. Use international format: +1234567890' 
            });
        }
        
        // Check if phone is authorized
        if (!authorizedPhones.has(phone)) {
            logger.warn(`❌ Unauthorized login attempt: ${phone}`);
            return res.status(403).json({ 
                success: false, 
                error: 'This phone number is not authorized. Please contact administrator.' 
            });
        }
        
        // NOTE: We allow OTP generation even when WhatsApp is not connected so
        // the two linking methods (QR scanning to connect the WhatsApp session
        // vs phone OTP login) are independent. If WhatsApp is connected we will
        // attempt delivery via WhatsApp; otherwise we store the OTP and return
        // a response that clearly indicates delivery did not occur.

        // Rate limiting: per-phone and per-IP
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.connection?.remoteAddress || 'unknown';
        const phoneCount = _pruneAndCount(otpRequestLog, phone, PHONE_WINDOW_MS);
        if (phoneCount >= PHONE_LIMIT) {
            logger.warn(`Rate limit hit for phone ${phone}`);
            return res.status(429).json({ success: false, error: `Too many OTP requests for this phone. Try again later.` });
        }
        const ipCount = _pruneAndCount(ipRequestLog, ip, IP_WINDOW_MS);
        if (ipCount >= IP_LIMIT) {
            logger.warn(`Rate limit hit for IP ${ip}`);
            return res.status(429).json({ success: false, error: `Too many requests from this IP. Try again later.` });
        }
        
        // Generate OTP
        const otp = generateOTP();
        const expiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes
        
        // Store OTP
        otpStorage.set(phone, {
            code: otp,
            expiresAt,
            attempts: 0,
            maxAttempts: 3
        });

        // Record request timestamps for rate limiting
        _recordTimestamp(otpRequestLog, phone);
        _recordTimestamp(ipRequestLog, ip);
        
        // Send OTP via WhatsApp
        const message = `🔐 *Academic Manager - Login Verification*\n\nYour verification code is:\n\n*${otp}*\n\nThis code expires in 5 minutes.\n\n_If you didn't request this code, please ignore this message._\n\n— Academic Manager by MahdyHQ`;
        
        // Attempt delivery only if the WhatsApp socket is connected.
        if (sock && connectionState === 'connected') {
            try {
                await sock.sendMessage(phone + '@s.whatsapp.net', { text: message });
                logger.info(`📱 OTP sent to ${phone}: ${otp}`);
                return res.json({
                    success: true,
                    message: 'Verification code sent to your WhatsApp',
                    expiresIn: 300,
                    phone: phone,
                    dev_otp: process.env.NODE_ENV === 'development' ? otp : undefined
                });
            } catch (sendError) {
                logger.error(`Failed to send OTP via WhatsApp to ${phone}:`, sendError);
                logger.info(`📝 OTP for ${phone} (WhatsApp delivery failed): ${otp}`);
                return res.json({
                    success: true,
                    message: 'Verification code generated. Check server logs if not received.',
                    expiresIn: 300,
                    phone: phone,
                    warning: 'WhatsApp delivery may have failed',
                    dev_otp: process.env.NODE_ENV === 'development' ? otp : undefined
                });
            }
        } else {
            // WhatsApp not connected — return success but inform caller delivery did not occur.
            logger.warn(`⚠️ OTP generated for ${phone} but WhatsApp is not connected`);
            logger.info(`📝 OTP for ${phone} (not delivered): ${otp}`);
            return res.json({
                success: true,
                message: 'Verification code generated but WhatsApp service is not connected. Delivery via WhatsApp was not performed.',
                expiresIn: 300,
                phone: phone,
                warning: 'WhatsApp not connected - OTP not delivered',
                dev_otp: process.env.NODE_ENV === 'development' ? otp : undefined
            });
        }
        
    } catch (error) {
        logger.error('Request OTP error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to send verification code. Please try again.' 
        });
    }
});

// POST /api/auth/verify-otp - Verify OTP and login
app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        const { phone, code } = req.body;
        
        if (!phone || !code) {
            return res.status(400).json({ 
                success: false, 
                error: 'Phone number and verification code are required' 
            });
        }
        
        // Get stored OTP
        const storedOTP = otpStorage.get(phone);
        
        if (!storedOTP) {
            return res.status(404).json({ 
                success: false, 
                error: 'No verification code found. Please request a new one.' 
            });
        }
        
        // Check expiry
        if (Date.now() > storedOTP.expiresAt) {
            otpStorage.delete(phone);
            return res.status(410).json({ 
                success: false, 
                error: 'Verification code has expired. Please request a new one.' 
            });
        }
        
        // Check max attempts
        if (storedOTP.attempts >= storedOTP.maxAttempts) {
            otpStorage.delete(phone);
            return res.status(429).json({ 
                success: false, 
                error: 'Too many failed attempts. Please request a new code.' 
            });
        }
        
        // Verify code
        if (storedOTP.code !== code) {
            storedOTP.attempts++;
            const remainingAttempts = storedOTP.maxAttempts - storedOTP.attempts;
            
            logger.warn(`❌ Failed OTP attempt for ${phone}. Remaining: ${remainingAttempts}`);
            
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid verification code',
                attemptsRemaining: remainingAttempts
            });
        }
        
        // Success! Generate session token
        const token = generateSessionToken();
        const sessionExpiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
        
        sessionTokens.set(token, {
            phone,
            createdAt: Date.now(),
            expiresAt: sessionExpiresAt,
            lastActivity: Date.now()
        });
        
        // Clear OTP
        otpStorage.delete(phone);
        
        logger.info(`✅ User logged in: ${phone}`);
        
        res.json({ 
            success: true, 
            message: 'Login successful',
            token,
            user: {
                phone,
                role: 'admin'
            },
            expiresIn: 30 * 24 * 60 * 60 // 30 days in seconds
        });
        
    } catch (error) {
        logger.error('Verify OTP error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Verification failed. Please try again.' 
        });
    }
});

// POST /api/auth/logout - Logout
app.post('/api/auth/logout', (req, res) => {
    try {
        const token = req.headers['authorization']?.replace('Bearer ', '');
        
        if (token && sessionTokens.has(token)) {
            const session = sessionTokens.get(token);
            sessionTokens.delete(token);
            logger.info(`👋 User logged out: ${session.phone}`);
        }
        
        res.json({ 
            success: true, 
            message: 'Logged out successfully' 
        });
        
    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Logout failed' 
        });
    }
});

// GET /api/auth/me - Get current user info
app.get('/api/auth/me', requireAuthOrAPIKey, (req, res) => {
    try {
        res.json({ 
            success: true, 
            user: req.user
        });
    } catch (error) {
        logger.error('Get user error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get user info' 
        });
    }
});

// POST /api/auth/add-phone - Add authorized phone (admin only)
app.post('/api/auth/add-phone', authenticateAPIKey, async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone || !isValidPhoneNumber(phone)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Valid phone number is required' 
            });
        }
        
        authorizedPhones.add(phone);
        
        logger.info(`📱 Added authorized phone: ${phone}`);
        
        res.json({ 
            success: true, 
            message: 'Phone number authorized successfully',
            phone,
            total_authorized: authorizedPhones.size
        });
        
    } catch (error) {
        logger.error('Add phone error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to add phone number' 
        });
    }
});

// GET /api/auth/authorized-phones - List authorized phones (admin only)
app.get('/api/auth/authorized-phones', authenticateAPIKey, (req, res) => {
    try {
        res.json({ 
            success: true, 
            phones: Array.from(authorizedPhones),
            count: authorizedPhones.size
        });
    } catch (error) {
        logger.error('List phones error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to list authorized phones' 
        });
    }
});

// GET /api/auth/otp/:phone - Admin only (free fallback)
// Returns the currently-generated OTP for a phone if available.
// Protected by API key via `authenticateAPIKey` middleware.
app.get('/api/auth/otp/:phone', authenticateAPIKey, (req, res) => {
    try {
        const phone = req.params.phone;
        if (!phone) return res.status(400).json({ success: false, error: 'Phone number required' });

        const stored = otpStorage.get(phone);
        if (!stored) {
            return res.status(404).json({ success: false, error: 'No OTP found for this phone' });
        }

        const expiresIn = Math.max(0, Math.floor((stored.expiresAt - Date.now()) / 1000));

        return res.json({
            success: true,
            phone,
            code: stored.code,
            expiresAt: stored.expiresAt,
            expiresInSeconds: expiresIn
        });
    } catch (error) {
        logger.error('Admin OTP fetch error:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch OTP' });
    }
});

// Cleanup expired OTPs and sessions (runs every 5 minutes)
setInterval(() => {
    const now = Date.now();
    let cleanedOTPs = 0;
    let cleanedSessions = 0;
    
    // Clean expired OTPs
    for (const [phone, data] of otpStorage.entries()) {
        if (now > data.expiresAt) {
            otpStorage.delete(phone);
            cleanedOTPs++;
        }
    }
    
    // Clean expired sessions
    for (const [token, session] of sessionTokens.entries()) {
        if (now > session.expiresAt) {
            sessionTokens.delete(token);
            cleanedSessions++;
        }
    }
    
    if (cleanedOTPs > 0 || cleanedSessions > 0) {
        logger.info(`🗑️  Cleaned ${cleanedOTPs} expired OTPs and ${cleanedSessions} expired sessions`);
    }
}, 5 * 60 * 1000);

// ==================== STANDARD ROUTES ====================

app.get('/', (req, res) => {
    const sessionStats = getSessionStats();
    
    res.json({
        service: 'WhatsApp Academic Manager API',
        status: connectionState,
        phone: connectedPhone,
        version: '2.4.0 - WhatsApp Themed + Complete Auth',
        author: 'MahdyHQ',
        timestamp: new Date().toISOString(),
        session: {
            ...sessionStats,
            restored: sessionRestored,
            backup_available: !!sessionBackup,
            backup_size_kb: sessionBackup ? Math.round(sessionBackup.length / 1024) : 0
        },
        connection: {
            attempts: connectionAttempts,
            max_attempts: MAX_RECONNECT_ATTEMPTS
        },
        auth: {
            authorized_phones_count: authorizedPhones.size,
            active_sessions: sessionTokens.size,
            pending_otps: otpStorage.size
        },
        railway: {
            storage: '/tmp/auth_info (ephemeral)',
            backup: 'In-memory + disk fallback',
            volumes_required: false,
            free_tier_compatible: true
        }
    });
});

// QR CODE ROUTE - WHATSAPP THEMED
app.get('/qr', async (req, res) => {
    try {
        const whatsappColors = {
            primary: '#25D366',      // WhatsApp Green
            secondary: '#128C7E',    // Dark Green
            background: '#DCF8C6',   // Light Green
            dark: '#075E54',         // Darker Green
            light: '#ECE5DD'         // Light Gray
        };
        
        if (connectionState === 'connected') {
            const sessionStats = getSessionStats();
            
            return res.send(`
                <!DOCTYPE html>
                        <html lang="en">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
                            <title>WhatsApp Connected | Academic Manager</title>
                                <link rel="icon" type="image/svg+xml" href="/favicon.svg">
                                <link rel="shortcut icon" href="/favicon.ico">
                            <style>
                                :root{
                                    --wa-primary: ${whatsappColors.primary};
                                    --wa-secondary: ${whatsappColors.secondary};
                                    --wa-bg: ${whatsappColors.background};
                                    --wa-dark: ${whatsappColors.dark};
                                    --wa-light: ${whatsappColors.light};
                                    --icon-size: 20px;
                                    --radius-lg: 16px;
                                    --shadow-strong: 0 20px 60px rgba(7, 94, 84, 0.3);
                                }

                                * { margin: 0; padding: 0; box-sizing: border-box; }
                        
                                body {
                                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
                                    background: linear-gradient(135deg, var(--wa-primary) 0%, var(--wa-secondary) 100%);
                                    min-height: 100vh;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    padding: 20px;
                                }

                                /* Icon utility */
                                .icon {
                                    width: var(--icon-size);
                                    height: var(--icon-size);
                                    display: inline-block;
                                    vertical-align: -3px;
                                    margin-right: 8px;
                                }
                        
                        .container {
                            background: white;
                            border-radius: 16px;
                            box-shadow: 0 20px 60px rgba(7, 94, 84, 0.3);
                            max-width: 600px;
                            width: 100%;
                            overflow: hidden;
                        }
                        
                        .header {
                            background: linear-gradient(135deg, ${whatsappColors.primary} 0%, ${whatsappColors.secondary} 100%);
                            color: white;
                            padding: 32px;
                            text-align: center;
                        }
                        
                        .status-badge {
                            display: inline-flex;
                            align-items: center;
                            gap: 8px;
                            background: rgba(255, 255, 255, 0.25);
                            backdrop-filter: blur(10px);
                            padding: 10px 20px;
                            border-radius: 50px;
                            margin-bottom: 16px;
                            font-size: 14px;
                            font-weight: 600;
                        }
                        
                        .pulse {
                            width: 10px;
                            height: 10px;
                            background: #fff;
                            border-radius: 50%;
                            animation: pulse 2s infinite;
                        }
                        
                        @keyframes pulse {
                            0%, 100% { opacity: 1; transform: scale(1); }
                            50% { opacity: 0.5; transform: scale(1.2); }
                        }
                        
                        h1 {
                            font-size: 28px;
                            font-weight: 600;
                            margin-bottom: 8px;
                        }
                        
                        .phone-display {
                            font-size: 22px;
                            font-weight: 500;
                            opacity: 0.95;
                        }
                        
                        .content { padding: 32px; }
                        
                        .info-grid {
                            display: grid;
                            grid-template-columns: repeat(2, 1fr);
                            gap: 16px;
                            margin-bottom: 24px;
                        }
                        
                        .info-card {
                            background: linear-gradient(135deg, ${whatsappColors.background} 0%, ${whatsappColors.light} 100%);
                            padding: 20px;
                            border-radius: 12px;
                            border-left: 4px solid ${whatsappColors.primary};
                        }
                        
                        .info-card-header {
                            color: ${whatsappColors.dark};
                            font-size: 12px;
                            font-weight: 600;
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                            margin-bottom: 8px;
                        }
                        
                        .info-card-value {
                            font-size: 20px;
                            font-weight: 700;
                            color: ${whatsappColors.secondary};
                        }
                        
                        .feature-box {
                            background: ${whatsappColors.background};
                            border-left: 4px solid ${whatsappColors.primary};
                            padding: 20px;
                            border-radius: 12px;
                            margin-bottom: 24px;
                        }
                        
                        .feature-box h3 {
                            font-size: 16px;
                            font-weight: 600;
                            color: ${whatsappColors.dark};
                            margin-bottom: 12px;
                        }
                        
                        .feature-list {
                            list-style: none;
                            display: flex;
                            flex-direction: column;
                            gap: 8px;
                        }
                        
                        .feature-list li {
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            color: ${whatsappColors.secondary};
                            font-size: 14px;
                        }
                        
                        .feature-list li::before {
                            content: '✓';
                            background: ${whatsappColors.primary};
                            color: white;
                            width: 20px;
                            height: 20px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-weight: bold;
                            font-size: 12px;
                        }
                        
                        .actions {
                            display: flex;
                            gap: 12px;
                        }
                        
                        .btn {
                            flex: 1;
                            padding: 14px 24px;
                            border-radius: 8px;
                            border: none;
                            font-size: 15px;
                            font-weight: 600;
                            cursor: pointer;
                            text-decoration: none;
                            text-align: center;
                            transition: all 0.3s ease;
                        }
                        
                        .btn-primary {
                            background: ${whatsappColors.primary};
                            color: white;
                        }
                        
                        .btn-primary:hover {
                            background: ${whatsappColors.secondary};
                            transform: translateY(-2px);
                            box-shadow: 0 10px 20px rgba(37, 211, 102, 0.3);
                        }
                        
                        .btn-secondary {
                            background: white;
                            color: ${whatsappColors.primary};
                            border: 2px solid ${whatsappColors.primary};
                        }
                        
                        .btn-secondary:hover {
                            background: ${whatsappColors.primary};
                            color: white;
                        }
                        
                        @media (max-width: 640px) {
                            .info-grid { grid-template-columns: 1fr; }
                            .actions { flex-direction: column; }
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <div class="status-badge">
                                <span class="pulse"></span>
                                <span aria-hidden="true">${getIconSVG('check','icon')}</span>
                                <span>Connected & Active</span>
                            </div>
                            <h1><span aria-hidden="true">${getIconSVG('check','icon')}</span>WhatsApp Connected</h1>
                            <div class="phone-display">+${connectedPhone}</div>
                        </div>
                        
                        <div class="content">
                            <div class="info-grid">
                                <div class="info-card">
                                    <div class="info-card-header">Session Status</div>
                                    <div class="info-card-value">${sessionStats.exists ? getIconSVG('check','icon') + ' Saved' : 'Not Saved'}</div>
                                </div>
                                
                                <div class="info-card">
                                    <div class="info-card-header">Backup Status</div>
                                    <div class="info-card-value">${sessionBackup ? getIconSVG('check','icon') + ' Available' : 'Creating'}</div>
                                </div>
                                
                                ${sessionStats.file_count ? `
                                <div class="info-card">
                                    <div class="info-card-header">Session Files</div>
                                    <div class="info-card-value">${sessionStats.file_count} files</div>
                                </div>
                                ` : ''}
                                
                                ${sessionStats.created_hours_ago ? `
                                <div class="info-card">
                                    <div class="info-card-header">Session Age</div>
                                    <div class="info-card-value">${Math.floor(sessionStats.created_hours_ago / 24)}d ${sessionStats.created_hours_ago % 24}h</div>
                                </div>
                                ` : ''}
                            </div>
                            
                            <div class="feature-box">
                                <h3><span aria-hidden="true">${getIconSVG('shield','icon')}</span>Session Persistence Features</h3>
                                <ul class="feature-list">
                                    <li>Auto-saved to secure storage</li>
                                    <li>Automatic backup system</li>
                                    <li>Restores on service restart</li>
                                    <li>Platform-independent</li>
                                </ul>
                            </div>
                            
                            <div class="actions">
                                <a href="/api/session-info" class="btn btn-primary">View Details</a>
                                <a href="/" class="btn btn-secondary">API Status</a>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `);
        }
        
        if (!qrCodeData) {
            return res.send(`
                <!DOCTYPE html>
                        <html lang="en">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <meta http-equiv="refresh" content="3">
                            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
                            <link rel="icon" type="image/svg+xml" href="/favicon.svg">
                            <link rel="shortcut icon" href="/favicon.ico">
                            <title>Initializing WhatsApp | Academic Manager</title>
                            <style>
                                :root{ --wa-primary: #25D366; --wa-secondary: #128C7E; --wa-bg: #DCF8C6; --wa-dark: #075E54; --wa-light: #ECE5DD; --icon-size:20px; }
                                * { margin: 0; padding: 0; box-sizing: border-box; }
                        
                                body {
                                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
                                    background: linear-gradient(135deg, var(--wa-primary) 0%, var(--wa-secondary) 100%);
                                    min-height: 100vh;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    padding: 20px;
                                }

                                .icon { width: var(--icon-size); height: var(--icon-size); display:inline-block; vertical-align: -3px; margin-right:8px; }

                                .loader-container {
                                    background: white;
                                    padding: 50px;
                                    border-radius: 16px;
                                    box-shadow: 0 20px 60px rgba(7, 94, 84, 0.3);
                                    text-align: center;
                                    max-width: 400px;
                                }
                        
                        .spinner {
                            width: 60px;
                            height: 60px;
                            margin: 0 auto 30px;
                            border: 4px solid #DCF8C6;
                            border-top-color: #25D366;
                            border-radius: 50%;
                            animation: spin 1s linear infinite;
                        }
                        
                        @keyframes spin {
                            to { transform: rotate(360deg); }
                        }
                        
                        h2 {
                            font-size: 22px;
                            color: #075E54;
                            margin-bottom: 12px;
                        }
                        
                        p {
                            color: #128C7E;
                            font-size: 14px;
                            line-height: 1.6;
                        }
                    </style>
                </head>
                <body>
                    <div class="loader-container">
                        <div class="spinner"></div>
                        <h2>Initializing WhatsApp</h2>
                        <p>Checking for saved session...</p>
                        <p style="margin-top: 16px; font-size: 12px; opacity: 0.7;">This page will auto-refresh</p>
                    </div>
                </body>
                </html>
            `);
        }
        
        const qrImage = await QRCode.toDataURL(qrCodeData);
        res.send(`
            <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
                    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
                    <link rel="shortcut icon" href="/favicon.ico">
                    <title>Scan QR Code | Academic Manager</title>
                    <style>
                        :root{ --wa-primary:#25D366; --wa-secondary:#128C7E; --wa-bg:#DCF8C6; --wa-dark:#075E54; --wa-light:#ECE5DD; --icon-size:20px }
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                    
                        body {
                            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
                            background: linear-gradient(135deg, var(--wa-primary) 0%, var(--wa-secondary) 100%);
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            padding: 20px;
                        }

                        .icon { width: var(--icon-size); height: var(--icon-size); display:inline-block; vertical-align:-3px; margin-right:8px }
                    
                    .container {
                        background: white;
                        border-radius: 16px;
                        box-shadow: 0 20px 60px rgba(7, 94, 84, 0.3);
                        max-width: 550px;
                        width: 100%;
                        overflow: hidden;
                    }
                    
                    .header {
                        background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
                        color: white;
                        padding: 32px;
                        text-align: center;
                    }
                    
                    h1 {
                        font-size: 26px;
                        font-weight: 600;
                        margin-bottom: 8px;
                    }
                    
                    .subtitle {
                        font-size: 14px;
                        opacity: 0.9;
                    }
                    
                    .content { padding: 32px; }
                    
                    .qr-wrapper {
                        background: #DCF8C6;
                        padding: 24px;
                        border-radius: 12px;
                        text-align: center;
                        margin-bottom: 24px;
                        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
                    }
                    
                    .qr-wrapper img {
                        max-width: 100%;
                        height: auto;
                        border-radius: 8px;
                        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
                    }
                    
                    .instructions {
                        background: #FFFEF5;
                        border-left: 4px solid #FFC107;
                        padding: 20px;
                        border-radius: 8px;
                        margin-bottom: 24px;
                    }
                    
                    .instructions h3 {
                        font-size: 15px;
                        color: #E65100;
                        margin-bottom: 12px;
                    }
                    
                    .step-list {
                        list-style: none;
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }
                    
                    .step-list li {
                        display: flex;
                        align-items: start;
                        gap: 12px;
                        color: #5D4037;
                        font-size: 14px;
                        line-height: 1.5;
                    }
                    
                    .step-number {
                        background: #FFA000;
                        color: white;
                        min-width: 22px;
                        height: 22px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: 700;
                        font-size: 11px;
                        flex-shrink: 0;
                    }
                    
                    .info-box {
                        background: #DCF8C6;
                        border-left: 4px solid #25D366;
                        padding: 20px;
                        border-radius: 8px;
                        margin-bottom: 24px;
                    }
                    
                    .info-box h4 {
                        color: #075E54;
                        font-size: 14px;
                        margin-bottom: 10px;
                        font-weight: 600;
                    }
                    
                    .info-box ul {
                        list-style: none;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }
                    
                    .info-box li {
                        color: #128C7E;
                        font-size: 13px;
                        padding-left: 24px;
                        position: relative;
                    }
                    
                    .info-box li::before {
                        content: '✓';
                        position: absolute;
                        left: 0;
                        background: #25D366;
                        color: white;
                        width: 18px;
                        height: 18px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 11px;
                        font-weight: bold;
                    }
                    
                    .btn-refresh {
                        padding: 12px 18px;
                        background: #25D366;
                        color: white;
                        border: none;
                        border-radius: 10px;
                        font-size: 15px;
                        font-weight: 700;
                        cursor: pointer;
                        transition: transform .15s ease, box-shadow .15s ease;
                        display:inline-flex;align-items:center;gap:8px;
                    }

                    .btn-refresh:hover { transform: translateY(-3px); box-shadow: 0 12px 24px rgba(37,211,102,0.18);} 

                    .btn-otp {
                        padding: 12px 18px;
                        background: white;
                        color: #075E54;
                        border: 2px solid #25D366;
                        border-radius: 10px;
                        font-size: 15px;
                        font-weight: 700;
                        cursor: pointer;
                        transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
                        display:inline-flex;align-items:center;gap:8px;
                    }

                    .btn-otp:hover { background:#f1fff6; transform: translateY(-3px); box-shadow: 0 10px 20px rgba(5,90,84,0.06); }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1><span aria-hidden="true">${getIconSVG('qrcode','icon')}</span>Scan QR Code</h1>
                        <p class="subtitle">Administrator Setup - One-Time Connection</p>
                    </div>
                    
                    <div class="content">
                        <div class="qr-wrapper">
                            <img src="${qrImage}" alt="WhatsApp QR Code">
                        </div>
                        
                        <div class="instructions">
                            <h3><span aria-hidden="true">${getIconSVG('file','icon')}</span>How to Connect</h3>
                            <ul class="step-list">
                                <li>
                                    <span class="step-number">1</span>
                                    <span>Open <strong>WhatsApp</strong> on your phone</span>
                                </li>
                                <li>
                                    <span class="step-number">2</span>
                                    <span>Tap <strong>Settings</strong> or <strong>Menu (⋮)</strong></span>
                                </li>
                                <li>
                                    <span class="step-number">3</span>
                                    <span>Tap <strong>Linked Devices</strong></span>
                                </li>
                                <li>
                                    <span class="step-number">4</span>
                                    <span>Tap <strong>Link a Device</strong></span>
                                </li>
                                <li>
                                    <span class="step-number">5</span>
                                    <span>Point your camera at this QR code</span>
                                </li>
                            </ul>
                        </div>
                        
                        <div class="info-box">
                            <h4><span aria-hidden="true">${getIconSVG('shield','icon')}</span>Secure & Platform-Independent</h4>
                            <ul>
                                <li>Session auto-saved with backup</li>
                                <li>Works on any hosting platform</li>
                                <li>Auto-restores on restart</li>
                                <li>No cloud-specific dependencies</li>
                            </ul>
                        </div>
                        
                        <div style="display:flex;gap:12px;flex-direction:column;align-items:center;">
                            <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
                                <button onclick="location.reload()" class="btn-refresh" aria-label="Refresh QR Code">
                                    <span aria-hidden="true">${getIconSVG('refresh','icon')}</span>
                                    Refresh QR Code
                                </button>

                                <button onclick="location.href='/login'" class="btn-otp" aria-label="Login by Phone (OTP)">
                                    <span aria-hidden="true">${getIconSVG('qrcode','icon')}</span>
                                    Login by Phone (OTP)
                                </button>
                            </div>

                            <div style="margin-top:8px;font-size:13px;color:#666;">
                                <a href="/" style="color:#075E54;text-decoration:none">Return to API Home</a>
                            </div>
                        </div>
                    </div>
                </div>
                
                <script>
                    // Check connection status every 3 seconds
                    setInterval(() => {
                        fetch('/api/status')
                            .then(r => r.json())
                            .then(d => {
                                if (d.status === 'connected') {
                                    window.location.href = '/qr';
                                }
                            })
                            .catch(() => {});
                    }, 3000);
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        logger.error('QR endpoint error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Standard API endpoints
app.get('/api/status', (req, res) => {
    res.json({ 
        success: true, 
        status: connectionState, 
        phone: connectedPhone,
        timestamp: new Date().toISOString(),
        session_restored: sessionRestored,
        backup_available: !!sessionBackup,
        connection_attempts: connectionAttempts
    });
});

app.get('/api/session-info', (req, res) => {
    try {
        const sessionStats = getSessionStats();
        
        res.json({
            success: true,
            session: {
                ...sessionStats,
                restored: sessionRestored,
                backup: {
                    available: !!sessionBackup,
                    size_kb: sessionBackup ? Math.round(sessionBackup.length / 1024) : 0,
                    disk_file_exists: fs.existsSync(BACKUP_FILE)
                }
            },
            connection: {
                status: connectionState,
                phone: connectedPhone,
                attempts: connectionAttempts,
                max_attempts: MAX_RECONNECT_ATTEMPTS
            },
            auth: {
                authorized_phones: authorizedPhones.size,
                active_sessions: sessionTokens.size,
                pending_otps: otpStorage.size
            },
            server: {
                uptime_seconds: Math.floor(process.uptime()),
                memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                node_version: process.version
            },
            deployment: {
                platform: 'Platform-Independent',
                storage_type: 'Ephemeral with backup',
                backup_strategy: 'In-memory + disk fallback',
                portable: true
            }
        });
    } catch (error) {
        logger.error('Session info error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Protected WhatsApp API endpoints (require user auth)
app.get('/api/groups',  requireAuthOrAPIKey, async (req, res) => {
    try {
        if (!sock || connectionState !== 'connected') {
            return res.status(503).json({ 
                success: false, 
                error: 'WhatsApp not connected',
                status: connectionState,
                hint: connectionState === 'qr_ready' ? 'Admin needs to scan QR code' : 'Service is connecting...'
            });
        }
        
        const chats = await sock.groupFetchAllParticipating();
        const groups = Object.values(chats).map(g => ({
            id: g.id,
            name: g.subject,
            participants: g.participants?.length || 0
        }));
        
        logger.info(`📱 ${req.user.phone} fetched ${groups.length} groups`);
        
        res.json({ success: true, count: groups.length, groups });
    } catch (error) {
        logger.error('Groups endpoint error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/messages/:groupId', requireAuthOrAPIKey, async (req, res) => {
    try {
        if (!sock || connectionState !== 'connected') {
            return res.status(503).json({ 
                success: false, 
                error: 'WhatsApp not connected',
                status: connectionState
            });
        }
        
        const { groupId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        
        let msgs;
        try {
            msgs = await fetchMessagesFromWAWrapper(groupId, limit);
        } catch (e) {
            logger.error('WhatsApp service error:', e.message);
            return res.status(500).json({ success: false, error: `WhatsApp service error: ${JSON.stringify({ success: false, error: e.message })}` });
        }
        const formatted = msgs.map(m => {
            const ts = extractMessageTimestamp(m) || Math.floor(Date.now() / 1000);
            const content = extractMessageContent(m);
            return {
                id: m.key?.id,
                from_user: getPreferredIdFromKey(m.key),
                content,
                timestamp: ts,
                date: ts ? new Date(ts * 1000).toLocaleString() : new Date().toLocaleString()
            };
        }).filter(m => m.content);
        
        const groupInfo = await sock.groupMetadata(groupId);

        // Cache group metadata for faster subsequent queries (Redis preferred)
        try {
            if (groupCacheIsRedis && redisClient) {
                await redisClient.set(`group:${groupId}`, JSON.stringify(groupInfo), { EX: 3600 });
            } else {
                groupCache.set(groupId, groupInfo);
            }
        } catch (err) {
            logger.warn('Failed to cache group metadata:', err && err.message ? err.message : err);
        }

        logger.info(`📱 ${req.user.phone} fetched ${formatted.length} messages from ${groupInfo?.subject || groupId}`);
        
        res.json({ 
            success: true, 
            count: formatted.length, 
            group_name: groupInfo.subject,
            messages: formatted 
        });
    } catch (error) {
        logger.error('Messages endpoint error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Backwards-compatible alias for frontend routes that use /api/whatsapp/messages/:groupId
app.get('/api/whatsapp/messages/:groupId', requireAuthOrAPIKey, async (req, res) => {
    try {
        if (!sock || connectionState !== 'connected') {
            return res.status(503).json({ 
                success: false, 
                error: 'WhatsApp not connected',
                status: connectionState
            });
        }
        const { groupId } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        let msgs;
        try {
            msgs = await fetchMessagesFromWAWrapper(groupId, limit);
        } catch (e) {
            logger.error('WhatsApp service error (alias):', e.message);
            return res.status(500).json({ success: false, error: `WhatsApp service error: ${JSON.stringify({ success: false, error: e.message })}` });
        }
        const formatted = msgs.map(m => {
            const ts = extractMessageTimestamp(m) || Math.floor(Date.now() / 1000);
            const content = extractMessageContent(m);
            return {
                id: m.key?.id,
                from_user: getPreferredIdFromKey(m.key),
                content,
                timestamp: ts,
                date: ts ? new Date(ts * 1000).toLocaleString() : new Date().toLocaleString()
            };
        }).filter(m => m.content);

        const groupInfo = await sock.groupMetadata(groupId);

        // Cache group metadata for faster subsequent queries (Redis preferred)
        try {
            if (groupCacheIsRedis && redisClient) {
                await redisClient.set(`group:${groupId}`, JSON.stringify(groupInfo), { EX: 3600 });
            } else {
                groupCache.set(groupId, groupInfo);
            }
        } catch (err) {
            logger.warn('Failed to cache group metadata:', err && err.message ? err.message : err);
        }

        logger.info(`📱 ${req.user.phone} fetched ${formatted.length} messages from ${groupInfo?.subject || groupId}`);

        res.json({ 
            success: true, 
            count: formatted.length, 
            group_name: groupInfo.subject,
            messages: formatted 
        });
    } catch (error) {
        logger.error('Messages alias endpoint error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/send', requireAuth, async (req, res) => {
    try {
        if (!sock || connectionState !== 'connected') {
            return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
        }
        
        const { groupId, message } = req.body;
        if (!groupId || !message) {
            return res.status(400).json({ success: false, error: 'groupId and message required' });
        }
        
        await sock.sendMessage(groupId, { text: message });
        logger.info(`✉️  ${req.user.phone} sent message to ${groupId}`);
        res.json({ success: true, message: 'Sent successfully' });
    } catch (error) {
        logger.error('Send endpoint error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        whatsapp_status: connectionState,
        connected: connectionState === 'connected',
        session_saved: hasExistingSession(),
        backup_available: !!sessionBackup,
        active_user_sessions: sessionTokens.size,
        uptime_seconds: Math.floor(process.uptime())
    });
    });

// Load backup on startup
loadBackupFromDisk();

// Ensure public favicon exists (write a small binary favicon.ico from base64 and an SVG fallback)
function ensurePublicFavicon() {
    try {
        const publicDir = path.join(__dirname, 'public');
        if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

        const icoPath = path.join(publicDir, 'favicon.ico');
        const svgPath = path.join(publicDir, 'favicon.svg');

        // A very small PNG (1x1 transparent) base64 - we'll write it as favicon.ico for broad support.
        // Modern browsers accept PNG data for favicons; this guarantees a binary file is present.
        const faviconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=';

        if (!fs.existsSync(icoPath)) {
            fs.writeFileSync(icoPath, Buffer.from(faviconBase64, 'base64'));
            logger.info(`💠 Wrote favicon binary to ${icoPath}`);
        }

        // Also write an SVG favicon (nicely themed) as a fallback/display for browsers that support SVG favicons.
        const svgContent = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n  <circle cx="12" cy="12" r="12" fill="#25D366"/>\n  <path d=\"M7 12l3 3 8-8\" stroke=\"#fff\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n</svg>`;

        if (!fs.existsSync(svgPath)) {
            fs.writeFileSync(svgPath, svgContent, 'utf8');
            logger.info(`💠 Wrote SVG favicon to ${svgPath}`);
        }
    } catch (err) {
        logger.warn('Could not create public favicon files:', err.message);
    }
}

ensurePublicFavicon();

// Convenience login page (QR or Phone OTP) for administrators
app.get('/login', (req, res) => {
    try {
        // Centered, professional login page with clear CTAs and icons
        res.send(`
            <!doctype html>
            <html lang="en">
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width,initial-scale=1" />
                <link rel="icon" type="image/svg+xml" href="/favicon.svg">
                <link rel="shortcut icon" href="/favicon.ico">
                <title>Link WhatsApp — Academic Manager</title>
                <style>
                    :root{ --wa-green:#25D366; --wa-dark:#075E54; --muted:#6b7280; }
                    html,body{height:100%;}
                    body{font-family:Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; background:linear-gradient(180deg,#f3faf0,#eef7f3); display:flex;align-items:center;justify-content:center;padding:24px;margin:0}
                    .card{width:100%;max-width:720px;background:#fff;padding:32px;border-radius:14px;box-shadow:0 10px 40px rgba(7,94,84,0.08);text-align:center}
                    .brand{display:flex;align-items:center;gap:12px;justify-content:center;margin-bottom:6px}
                    .brand .logo{width:54px;height:54px;border-radius:12px;background:linear-gradient(135deg,var(--wa-green),#128C7E);display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700}
                    h1{font-size:22px;margin:6px 0 6px;color:var(--wa-dark)}
                    p.lead{color:var(--muted);margin:0 0 20px}

                    .options{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-top:18px}
                    .card-section{flex:1 1 300px;min-width:260px;max-width:360px;background:#fbfffb;border-radius:10px;padding:18px;border:1px solid #eef7ef}
                    .card-section h3{margin:0 0 8px;display:flex;align-items:center;gap:10px;justify-content:center;color:var(--wa-dark)}
                    .card-section p{color:var(--muted);font-size:14px;margin:0 0 12px}

                    .btn{display:inline-flex;align-items:center;gap:10px;padding:10px 16px;border-radius:10px;border:none;cursor:pointer;font-weight:700}
                    .btn-qr{background:transparent;border:2px solid var(--wa-green);color:var(--wa-dark);padding:10px 18px}
                    .btn-qr:hover{background:#f6fff6}
                    .btn-otp{background:var(--wa-green);color:#fff}

                    input[type=text]{width:100%;padding:12px;border-radius:8px;border:1px solid #e9f3ec;margin-bottom:10px;font-size:15px}
                    .muted{color:var(--muted);font-size:13px}
                    .alert{display:none;background:#fff4e5;border:1px solid #ffd097;color:#6b4b00;padding:12px;border-radius:8px;margin-top:12px}
                    .hint{font-size:13px;color:#9ca3af;margin-top:12px}

                    @media (max-width:720px){
                        .options{flex-direction:column}
                        .card-section{max-width:none}
                    }
                </style>
            </head>
            <body>
                <div class="card" role="main">
                    <div class="brand">
                        <div class="logo">${getIconSVG('qrcode','w-6 h-6')}</div>
                        <div style="text-align:left">
                            <div style="font-weight:700;color:var(--wa-dark);">Academic Manager</div>
                            <div style="font-size:13px;color:var(--muted)">Secure WhatsApp linking for administrators</div>
                        </div>
                    </div>

                    <h1>Link your WhatsApp account</h1>
                    <p class="lead">Two secure ways to connect: scan the QR code with WhatsApp or login using phone OTP.</p>

                    <div class="options" aria-live="polite">
                        <div class="card-section">
                            <h3>${getIconSVG('qrcode','w-6 h-6')} Scan QR Code</h3>
                            <p>Open the QR page on the device you'll use to link the account and scan with WhatsApp → Settings → Linked devices → Link a device.</p>
                            <div style="display:flex;gap:10px;justify-content:center;margin-top:12px">
                                <a class="btn btn-qr" href="/qr" role="button" aria-label="Open QR page">${getIconSVG('qrcode','w-5 h-5')} Open QR Page</a>
                            </div>
                        </div>

                        <div class="card-section">
                            <h3>${getIconSVG('phone','w-6 h-6')} Login by Phone (OTP)</h3>
                            <p>Enter an authorized phone number (international format) to receive a one-time code via WhatsApp.</p>
                            <div style="margin-top:6px">
                                <input id="phone" type="text" placeholder="+201155547529" aria-label="Phone number" />
                                <div style="display:flex;gap:8px;justify-content:center">
                                    <button id="send" class="btn btn-otp" aria-live="polite">${getIconSVG('phone','w-4 h-4')} Request OTP</button>
                                </div>
                                <div id="status" class="muted" style="margin-top:10px"></div>
                                <div id="alert" class="alert" role="alert"></div>
                                <div class="hint">Authorized phones must be added by the administrator. In dev, server logs may include a developer OTP.</div>
                            </div>
                        </div>
                    </div>

                    <script>
                        document.getElementById('send').addEventListener('click', async () => {
                            const phone = document.getElementById('phone').value.trim();
                            const status = document.getElementById('status');
                            const alertEl = document.getElementById('alert');
                            status.textContent = '';
                            alertEl.style.display = 'none';
                            alertEl.textContent = '';
                            if (!phone) { status.textContent = 'Please enter a phone number in international format (e.g. +2011...).'; return; }
                            try {
                                const resp = await fetch('/api/auth/request-otp', {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone })
                                });
                                const data = await resp.json();
                                if (!resp.ok) {
                                    status.textContent = data.error || 'Failed to request OTP';
                                    alertEl.textContent = data.error || '';
                                    if (alertEl.textContent) { alertEl.style.display = 'block'; }
                                    return;
                                }

                                status.textContent = data.message || 'OTP generated. Check WhatsApp.';
                                if (data.dev_otp) status.textContent += ' (dev OTP: ' + data.dev_otp + ')';

                                if (data.warning || (data.message && data.message.toLowerCase().includes('not connected'))) {
                                    alertEl.textContent = (data.warning || 'OTP not delivered via WhatsApp. Use the QR option or contact the administrator.');
                                    alertEl.style.display = 'block';
                                }
                            } catch (err) {
                                status.textContent = 'Network error. Check console for details.';
                                alertEl.textContent = 'Network error while requesting OTP. Try again or use QR.';
                                alertEl.style.display = 'block';
                                console.error(err);
                            }
                        });
                    </script>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        logger.error('Login page error:', err);
        res.status(500).json({ success: false, error: 'Failed to render login page' });
    }
});

// JSON QR endpoint useful for API consumers (returns data URL when available)
app.get('/api/qr', async (req, res) => {
        try {
                const qr = qrCodeData ? await QRCode.toDataURL(qrCodeData) : null;
                return res.json({
                        success: true,
                        connected: connectionState === 'connected',
                        connectionState,
                        phone: connectedPhone,
                        qr: qr
                });
        } catch (err) {
                logger.error('API QR error:', err);
                return res.status(500).json({ success: false, error: 'Failed to generate QR' });
        }
});

// 404 handler for unknown routes
app.use((req, res, next) => {
        res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Centralized error handler
app.use((err, req, res, next) => {
        try {
                logger.error('Unhandled error:', err && (err.stack || err.message || err));
        } catch (e) {
                // ignore logging errors
        }
        const status = err && err.status ? err.status : 500;
        res.status(status).json({ success: false, error: err && err.message ? err.message : 'Internal Server Error' });
});

const server = app.listen(PORT, () => {
    logger.info('='.repeat(70));
    logger.info('🚀 WhatsApp Academic Manager API v2.4.0');
    logger.info('   WhatsApp Themed + Complete Phone Authentication');
    logger.info('='.repeat(70));
    logger.info(`📡 Server running on port ${PORT}`);
    logger.info(`🌐 Health check: http://localhost:${PORT}/`);
    logger.info(`📱 QR Code: http://localhost:${PORT}/qr`);
    logger.info(`📊 Session Info: http://localhost:${PORT}/api/session-info`);
    logger.info(`🔐 API Key: ${process.env.API_KEY ? 'Configured ✅' : 'NOT SET ⚠️'}`);
    logger.info(`💾 Auth Directory: ${AUTH_DIR}`);
    logger.info(`📁 Session Exists: ${hasExistingSession() ? 'Yes ✅' : 'No ❌'}`);
    logger.info(`🔄 Backup Available: ${sessionBackup ? 'Yes ✅' : 'No ❌'}`);
    logger.info(`📱 Authorized Phones: ${authorizedPhones.size}`);
    logger.info(`💡 Storage: Platform-independent ephemeral + backup`);
    logger.info(`✅ Works on: Railway, AWS, DigitalOcean, Heroku, etc.`);
    logger.info(`👤 Author: MahdyHQ`);
    logger.info(`📅 Date: ${new Date().toISOString().split('T')[0]}`);
    logger.info('='.repeat(70));
    
    // Validate environment and log any warnings
    try {
        const cfgWarnings = validateEnv(logger);
        if (cfgWarnings && cfgWarnings.length) logger.warn('Environment validation warnings:', cfgWarnings);
    } catch (e) {
        logger.warn('Environment validation failed:', e?.message || e);
    }

    connectWhatsApp();
});

// Graceful shutdown to persist session and close resources
async function gracefulShutdown(signal) {
    try {
        logger.info(`Received ${signal} - starting graceful shutdown`);

        // Mark disconnecting
        connectionState = 'disconnecting';

        // Persist credentials if available
        if (typeof globalSaveCreds === 'function') {
            try {
                await globalSaveCreds();
                logger.info('Saved credentials successfully');
            } catch (e) {
                logger.warn('Failed to save credentials during shutdown:', e?.message || e);
            }
        }

        // Create session backup
        try { createSessionBackup(); } catch (e) { logger.warn('Session backup during shutdown failed', e?.message || e); }

        // Close WhatsApp socket if present
        if (sock) {
            try {
                if (typeof sock.logout === 'function') {
                    await sock.logout();
                } else if (typeof sock.end === 'function') {
                    sock.end();
                }
                logger.info('WhatsApp socket closed');
            } catch (e) {
                logger.warn('Error while closing WhatsApp socket:', e?.message || e);
            }
        }

        // Close HTTP server
        if (server && typeof server.close === 'function') {
            await new Promise(resolve => server.close(() => resolve()));
            logger.info('HTTP server closed');
        }

    } catch (err) {
        logger.error('Error during graceful shutdown:', err?.message || err);
    } finally {
        process.exit(0);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
    gracefulShutdown('uncaughtException');
});
