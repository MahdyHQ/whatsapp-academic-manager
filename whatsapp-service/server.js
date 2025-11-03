/**
 * WhatsApp Web API Service - Complete Edition
 * Enhanced UI/UX with WhatsApp Theme Colors + Phone Authentication
 * With Session Backup & Auto-Restore (Platform Independent)
 * 
 * @author MahdyHQ
 * @version 2.4.0
 * @date 2025-11-01
 */

import pkg from '@whiskeysockets/baileys';
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = pkg;
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

// ES Module dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Make crypto and Buffer globally available for Baileys
globalThis.crypto = crypto;
globalThis.Buffer = Buffer;

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Use /tmp for Railway - persists during deployment
const AUTH_DIR = '/tmp/auth_info';

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
const MAX_RECONNECT_ATTEMPTS = 10;

// Session backup
let sessionBackup = null;
const BACKUP_FILE = path.join(__dirname, '../session_backup.json');

// ==================== PHONE AUTHENTICATION STORAGE ====================
const otpStorage = new Map();
const sessionTokens = new Map();

// Authorized phone numbers - Load from env or use default
const authorizedPhones = new Set(
    process.env.AUTHORIZED_PHONES 
        ? process.env.AUTHORIZED_PHONES.split(',').map(p => p.trim())
        : ['+201155547529']
);

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
        const { version } = await fetchLatestBaileysVersion();

        logger.info(`📦 Using Baileys version: ${version.join('.')}`);

        sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: true,
            auth: state,
            browser: ['Academic Manager', 'Chrome', '1.0.0'],
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            getMessage: async (key) => {
                return { conversation: 'Message not available' };
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

    // If the socket exposes a direct helper, use it
    if (typeof sock.fetchMessagesFromWA === 'function') {
        return await sock.fetchMessagesFromWA(groupId, limit);
    }

    // Try other common helpers
    if (typeof sock.loadMessages === 'function') {
        return await sock.loadMessages(groupId, limit);
    }

    if (typeof sock.fetchMessages === 'function') {
        return await sock.fetchMessages(groupId, limit);
    }

    // Try reading from an in-memory store if present
    if (sock.store && sock.store.messages) {
        try {
            const chatMsgs = sock.store.messages[groupId] || {};
            const items = Object.values(chatMsgs).sort((a, b) => (b.messageTimestamp || 0) - (a.messageTimestamp || 0));
            return items.slice(0, limit);
        } catch (e) {
            logger.warn('fetchMessagesFromWAWrapper: reading from sock.store failed', e.message);
        }
    }

    // No method available — return empty array but include diagnostic info
    logger.error('fetchMessagesFromWAWrapper: no method available to fetch messages from WhatsApp socket');
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
        
        // Check if WhatsApp is connected
        if (!sock || connectionState !== 'connected') {
            return res.status(503).json({ 
                success: false, 
                error: 'WhatsApp service is not connected. Please try again later.',
                status: connectionState,
                hint: 'Administrator needs to scan QR code'
            });
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
        
        // Send OTP via WhatsApp
        const message = `🔐 *Academic Manager - Login Verification*\n\nYour verification code is:\n\n*${otp}*\n\nThis code expires in 5 minutes.\n\n_If you didn't request this code, please ignore this message._\n\n— Academic Manager by MahdyHQ`;
        
        try {
            await sock.sendMessage(phone + '@s.whatsapp.net', { text: message });
            
            logger.info(`📱 OTP sent to ${phone}: ${otp}`);
            
            res.json({ 
                success: true, 
                message: 'Verification code sent to your WhatsApp',
                expiresIn: 300,
                phone: phone,
                // For development only
                dev_otp: process.env.NODE_ENV === 'development' ? otp : undefined
            });
        } catch (sendError) {
            logger.error(`Failed to send OTP via WhatsApp to ${phone}:`, sendError);
            
            // Still return success but log OTP for admin
            logger.info(`📝 OTP for ${phone} (WhatsApp delivery failed): ${otp}`);
            
            res.json({ 
                success: true, 
                message: 'Verification code generated. Check server logs if not received.',
                expiresIn: 300,
                phone: phone,
                warning: 'WhatsApp delivery may have failed',
                dev_otp: otp // For development - REMOVE IN PRODUCTION
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
                        width: 100%;
                        padding: 14px;
                        background: #25D366;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        font-size: 15px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                    }
                    
                    .btn-refresh:hover {
                        background: #128C7E;
                        transform: translateY(-2px);
                        box-shadow: 0 10px 20px rgba(37, 211, 102, 0.3);
                    }
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
                        
                        <button onclick="location.reload()" class="btn-refresh">
                            <span aria-hidden="true">${getIconSVG('refresh','icon')}</span>Refresh QR Code
                        </button>
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
        const formatted = msgs.map(m => ({
            id: m.key.id,
            from_user: m.key.participant || m.key.remoteJid,
            content: m.message?.conversation || m.message?.extendedTextMessage?.text || '',
            timestamp: m.messageTimestamp,
            date: new Date(m.messageTimestamp * 1000).toLocaleString()
        })).filter(m => m.content);
        
        const groupInfo = await sock.groupMetadata(groupId);
        
        logger.info(`📱 ${req.user.phone} fetched ${formatted.length} messages from ${groupInfo.subject}`);
        
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
        const formatted = msgs.map(m => ({
            id: m.key.id,
            from_user: m.key.participant || m.key.remoteJid,
            content: m.message?.conversation || m.message?.extendedTextMessage?.text || '',
            timestamp: m.messageTimestamp,
            date: new Date(m.messageTimestamp * 1000).toLocaleString()
        })).filter(m => m.content);

        const groupInfo = await sock.groupMetadata(groupId);

        logger.info(`📱 ${req.user.phone} fetched ${formatted.length} messages from ${groupInfo.subject}`);

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

app.listen(PORT, () => {
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
    
    connectWhatsApp();
});
