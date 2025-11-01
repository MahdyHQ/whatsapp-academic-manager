/**
 * WhatsApp Web API Service - Railway Optimized Edition
 * Enhanced UI/UX with Professional Icons + Phone Authentication
 * With Session Backup & Auto-Restore (No Volumes Required)
 * 
 * @author MahdyHQ
 * @version 2.3.0
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

// Enhanced CORS for your frontend
app.use(cors({
    origin: '*', // Allow all origins (change to specific domain in production)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true
}));

app.use(bodyParser.json());

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
const otpStorage = new Map(); // Stores {phone: {code, expiresAt, attempts}}
const sessionTokens = new Map(); // Stores {token: {phone, createdAt, expiresAt}}

// Authorized phone numbers - Load from env or use default
const authorizedPhones = new Set(
    process.env.AUTHORIZED_PHONES 
        ? process.env.AUTHORIZED_PHONES.split(',').map(p => p.trim())
        : ['+201155547529'] // Your default phone
);

logger.info(`📱 Authorized phones: ${Array.from(authorizedPhones).join(', ')}`);

// ==================== ICON HELPER ====================
function getIconSVG(iconName, className = 'w-6 h-6') {
    const icons = {
        check: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
        wifi: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>`,
        phone: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`,
        database: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`,
        shield: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
        refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`,
        loader: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>`,
        qrcode: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><rect x="3" y="3" width="5" height="5"></rect><rect x="16" y="3" width="5" height="5"></rect><rect x="3" y="16" width="5" height="5"></rect><path d="M21 16h-3a2 2 0 0 0-2 2v3"></path><path d="M21 21v.01"></path><path d="M12 7v3a2 2 0 0 1-2 2H7"></path><path d="M3 12h.01"></path><path d="M12 3h.01"></path><path d="M12 16v.01"></path><path d="M16 12h1"></path><path d="M21 12v.01"></path><path d="M12 21v-1"></path></svg>`,
        file: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`,
        clock: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
        info: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
        alert: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
        home: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
        lock: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`,
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
const authenticateAPIKey = (req, res, next) => {
    if (!process.env.API_KEY) return next();
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
};

// Auth middleware for user sessions
function requireAuth(req, res, next) {
    try {
        const token = req.headers['authorization']?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: 'Authentication required' 
            });
        }
        
        const session = sessionTokens.get(token);
        
        if (!session || Date.now() > session.expiresAt) {
            if (session) sessionTokens.delete(token);
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid or expired session' 
            });
        }
        
        // Update last activity
        session.lastActivity = Date.now();
        
        // Attach user to request
        req.user = {
            phone: session.phone,
            role: 'admin'
        };
        
        next();
    } catch (error) {
        logger.error('Auth middleware error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Authentication failed' 
        });
    }
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
                hint: 'Administrator needs to scan QR code on Railway service'
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
                // For development only - remove in production
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
app.get('/api/auth/me', requireAuth, (req, res) => {
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
        version: '2.3.0 - Railway Optimized + Phone Auth',
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

// [Continue with existing QR route and other routes...]
// I'll provide the rest in the next message due to length
// ==================== CONTINUED FROM PART 1 ====================

// Existing /qr route with BOTH QR and Phone Login options
app.get('/qr', async (req, res) => {
    try {
        if (connectionState === 'connected') {
            const sessionStats = getSessionStats();
            
            return res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>WhatsApp Connected | Academic Manager</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            padding: 20px;
                        }
                        
                        .container {
                            background: white;
                            border-radius: 24px;
                            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                            max-width: 600px;
                            width: 100%;
                            overflow: hidden;
                        }
                        
                        .header {
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            padding: 32px;
                            text-align: center;
                        }
                        
                        .status-badge {
                            display: inline-flex;
                            align-items: center;
                            gap: 8px;
                            background: rgba(255, 255, 255, 0.2);
                            backdrop-filter: blur(10px);
                            padding: 12px 24px;
                            border-radius: 50px;
                            margin-bottom: 16px;
                            font-size: 14px;
                            font-weight: 600;
                        }
                        
                        .pulse {
                            width: 12px;
                            height: 12px;
                            background: #4ade80;
                            border-radius: 50%;
                            animation: pulse 2s infinite;
                        }
                        
                        @keyframes pulse {
                            0%, 100% { opacity: 1; transform: scale(1); }
                            50% { opacity: 0.5; transform: scale(1.1); }
                        }
                        
                        h1 {
                            font-size: 32px;
                            font-weight: 700;
                            margin-bottom: 8px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 12px;
                        }
                        
                        .phone-display {
                            font-size: 24px;
                            font-weight: 600;
                            opacity: 0.9;
                        }
                        
                        .content { padding: 32px; }
                        
                        .info-grid {
                            display: grid;
                            grid-template-columns: repeat(2, 1fr);
                            gap: 16px;
                            margin-bottom: 24px;
                        }
                        
                        .info-card {
                            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
                            padding: 20px;
                            border-radius: 16px;
                            display: flex;
                            flex-direction: column;
                            gap: 8px;
                        }
                        
                        .info-card-header {
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            color: #64748b;
                            font-size: 13px;
                            font-weight: 600;
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                        }
                        
                        .info-card-value {
                            font-size: 20px;
                            font-weight: 700;
                            color: #1e293b;
                        }
                        
                        .feature-box {
                            background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
                            border-left: 4px solid #0ea5e9;
                            padding: 20px;
                            border-radius: 12px;
                            margin-bottom: 24px;
                        }
                        
                        .feature-box h3 {
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            font-size: 16px;
                            font-weight: 700;
                            color: #0c4a6e;
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
                            color: #075985;
                            font-size: 14px;
                        }
                        
                        .actions {
                            display: flex;
                            gap: 12px;
                        }
                        
                        .btn {
                            flex: 1;
                            padding: 14px 24px;
                            border-radius: 12px;
                            border: none;
                            font-size: 15px;
                            font-weight: 600;
                            cursor: pointer;
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            text-decoration: none;
                            transition: all 0.3s ease;
                        }
                        
                        .btn-primary {
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                        }
                        
                        .btn-primary:hover {
                            transform: translateY(-2px);
                            box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
                        }
                        
                        .btn-secondary {
                            background: white;
                            color: #667eea;
                            border: 2px solid #667eea;
                        }
                        
                        .btn-secondary:hover {
                            background: #667eea;
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
                                <span>Connected & Active</span>
                            </div>
                            <h1>
                                ${getIconSVG('check', 'w-8 h-8')}
                                <span>WhatsApp Connected</span>
                            </h1>
                            <div class="phone-display">+${connectedPhone}</div>
                        </div>
                        
                        <div class="content">
                            <div class="info-grid">
                                <div class="info-card">
                                    <div class="info-card-header">
                                        ${getIconSVG('database', 'w-4 h-4')}
                                        <span>Session Status</span>
                                    </div>
                                    <div class="info-card-value">${sessionStats.exists ? 'Saved' : 'Not Saved'}</div>
                                </div>
                                
                                <div class="info-card">
                                    <div class="info-card-header">
                                        ${getIconSVG('shield', 'w-4 h-4')}
                                        <span>Backup Status</span>
                                    </div>
                                    <div class="info-card-value">${sessionBackup ? 'Available' : 'Creating...'}</div>
                                </div>
                                
                                ${sessionStats.file_count ? `
                                <div class="info-card">
                                    <div class="info-card-header">
                                        ${getIconSVG('file', 'w-4 h-4')}
                                        <span>Session Files</span>
                                    </div>
                                    <div class="info-card-value">${sessionStats.file_count} files</div>
                                </div>
                                ` : ''}
                                
                                ${sessionStats.created_hours_ago ? `
                                <div class="info-card">
                                    <div class="info-card-header">
                                        ${getIconSVG('clock', 'w-4 h-4')}
                                        <span>Session Age</span>
                                    </div>
                                    <div class="info-card-value">${Math.floor(sessionStats.created_hours_ago / 24)}d ${sessionStats.created_hours_ago % 24}h</div>
                                </div>
                                ` : ''}
                            </div>
                            
                            <div class="feature-box">
                                <h3>
                                    ${getIconSVG('info', 'w-5 h-5')}
                                    <span>Session Persistence</span>
                                </h3>
                                <ul class="feature-list">
                                    <li>
                                        ${getIconSVG('check', 'w-5 h-5')}
                                        <span>Saved to Railway /tmp storage</span>
                                    </li>
                                    <li>
                                        ${getIconSVG('check', 'w-5 h-5')}
                                        <span>Automatic backup created</span>
                                    </li>
                                    <li>
                                        ${getIconSVG('check', 'w-5 h-5')}
                                        <span>Auto-restores on restart</span>
                                    </li>
                                    <li>
                                        ${getIconSVG('check', 'w-5 h-5')}
                                        <span>Platform-independent deployment</span>
                                    </li>
                                </ul>
                            </div>
                            
                            <div class="actions">
                                <a href="/api/session-info" class="btn btn-primary">
                                    ${getIconSVG('database', 'w-5 h-5')}
                                    <span>View Details</span>
                                </a>
                                <a href="/" class="btn btn-secondary">
                                    ${getIconSVG('home', 'w-5 h-5')}
                                    <span>API Status</span>
                                </a>
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
                    <meta http-equiv="refresh" content="2">
                    <title>Initializing | Academic Manager</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            padding: 20px;
                        }
                        
                        .loader-container {
                            background: white;
                            padding: 60px;
                            border-radius: 24px;
                            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                            text-align: center;
                            max-width: 400px;
                        }
                        
                        .spinner {
                            width: 80px;
                            height: 80px;
                            margin: 0 auto 32px;
                            border: 6px solid #e5e7eb;
                            border-top-color: #667eea;
                            border-radius: 50%;
                            animation: spin 1s linear infinite;
                        }
                        
                        @keyframes spin {
                            to { transform: rotate(360deg); }
                        }
                        
                        h2 {
                            font-size: 24px;
                            color: #1e293b;
                            margin-bottom: 12px;
                        }
                        
                        p {
                            color: #64748b;
                            font-size: 15px;
                            line-height: 1.6;
                        }
                        
                        .dots {
                            display: inline-flex;
                            gap: 4px;
                        }
                        
                        .dot {
                            width: 8px;
                            height: 8px;
                            background: #667eea;
                            border-radius: 50%;
                            animation: bounce 1.4s infinite ease-in-out both;
                        }
                        
                        .dot:nth-child(1) { animation-delay: -0.32s; }
                        .dot:nth-child(2) { animation-delay: -0.16s; }
                        
                        @keyframes bounce {
                            0%, 80%, 100% { transform: scale(0); }
                            40% { transform: scale(1); }
                        }
                    </style>
                </head>
                <body>
                    <div class="loader-container">
                        <div class="spinner"></div>
                        <h2>Initializing WhatsApp</h2>
                        <p>Checking for saved session<span class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span></p>
                        <p style="margin-top: 16px; font-size: 13px;">This page will auto-refresh</p>
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
                <title>Connect WhatsApp | Academic Manager</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                    }
                    
                    .container {
                        background: white;
                        border-radius: 24px;
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                        max-width: 550px;
                        width: 100%;
                        overflow: hidden;
                    }
                    
                    .header {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 32px;
                        text-align: center;
                    }
                    
                    h1 {
                        font-size: 28px;
                        font-weight: 700;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 12px;
                    }
                    
                    .content { padding: 32px; }
                    
                    .qr-wrapper {
                        background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
                        padding: 24px;
                        border-radius: 20px;
                        text-align: center;
                        margin-bottom: 24px;
                        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
                    }
                    
                    .qr-wrapper img {
                        max-width: 100%;
                        height: auto;
                        border-radius: 16px;
                        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
                    }
                    
                    .instructions {
                        background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
                        border-left: 4px solid #f59e0b;
                        padding: 24px;
                        border-radius: 12px;
                        margin-bottom: 24px;
                    }
                    
                    .instructions h3 {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 16px;
                        color: #92400e;
                        margin-bottom: 16px;
                    }
                    
                    .step-list {
                        list-style: none;
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }
                    
                    .step-list li {
                        display: flex;
                        align-items: start;
                        gap: 12px;
                        color: #78350f;
                        font-size: 14px;
                        line-height: 1.6;
                    }
                    
                    .step-number {
                        background: #fbbf24;
                        color: white;
                        width: 24px;
                        height: 24px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: 700;
                        font-size: 12px;
                        flex-shrink: 0;
                    }
                    
                    .info-box {
                        background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
                        border-left: 4px solid #3b82f6;
                        padding: 20px;
                        border-radius: 12px;
                        margin-bottom: 24px;
                    }
                    
                    .info-box h4 {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        color: #1e40af;
                        font-size: 15px;
                        margin-bottom: 12px;
                    }
                    
                    .info-box ul {
                        list-style: none;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }
                    
                    .info-box li {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        color: #1e3a8a;
                        font-size: 13px;
                    }
                    
                    .btn-refresh {
                        width: 100%;
                        padding: 16px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        border: none;
                        border-radius: 12px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        transition: all 0.3s ease;
                    }
                    
                    .btn-refresh:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>
                            ${getIconSVG('qrcode', 'w-8 h-8')}
                            <span>Scan QR Code</span>
                        </h1>
                        <p style="margin-top: 12px; font-size: 14px; opacity: 0.9;">
                            Administrator Setup - One-Time Connection
                        </p>
                    </div>
                    
                    <div class="content">
                        <div class="qr-wrapper">
                            <img src="${qrImage}" alt="WhatsApp QR Code">
                        </div>
                        
                        <div class="instructions">
                            <h3>
                                ${getIconSVG('info', 'w-5 h-5')}
                                <span>How to Connect</span>
                            </h3>
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
                            <h4>
                                ${getIconSVG('shield', 'w-5 h-5')}
                                <span>Platform-Independent Storage</span>
                            </h4>
                            <ul>
                                <li>
                                    ${getIconSVG('check', 'w-4 h-4')}
                                    <span>Session auto-saved with backup system</span>
                                </li>
                                <li>
                                    ${getIconSVG('check', 'w-4 h-4')}
                                    <span>Works on Railway, AWS, DigitalOcean, etc.</span>
                                </li>
                                <li>
                                    ${getIconSVG('check', 'w-4 h-4')}
                                    <span>Auto-restores on service restart</span>
                                </li>
                                <li>
                                    ${getIconSVG('check', 'w-4 h-4')}
                                    <span>No cloud-specific dependencies</span>
                                </li>
                            </ul>
                        </div>
                        
                        <button onclick="location.reload()" class="btn-refresh">
                            ${getIconSVG('refresh', 'w-5 h-5')}
                            <span>Refresh QR Code</span>
                        </button>
                    </div>
                </div>
                
                <script>
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
app.get('/api/status', authenticateAPIKey, (req, res) => {
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

app.get('/api/session-info', authenticateAPIKey, (req, res) => {
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
app.get('/api/groups', requireAuth, async (req, res) => {
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

app.get('/api/messages/:groupId', requireAuth, async (req, res) => {
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
        
        const msgs = await sock.fetchMessagesFromWA(groupId, limit);
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

app.listen(PORT, () => {
    logger.info('='.repeat(70));
    logger.info('🚀 WhatsApp Academic Manager API v2.3.0');
    logger.info('   Platform-Independent + Phone Authentication');
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
