/**
 * WhatsApp Web API Service - Railway Optimized Edition
 * With Session Backup & Auto-Restore (No Volumes Required)
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

// Use /tmp for Railway - persists during deployment, cleared on redeploy
const AUTH_DIR = '/tmp/auth_info';

app.use(cors());
app.use(bodyParser.json());

const logger = pino({ level: 'info' });

let sock = null;
let qrCodeData = null;
let connectionState = 'disconnected';
let connectedPhone = null;
let sessionRestored = false;
let connectionAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// Session backup stored in memory (can be persisted to Railway env vars)
let sessionBackup = null;
const BACKUP_FILE = path.join(__dirname, '../session_backup.json');

// Auth middleware
const authenticateAPIKey = (req, res, next) => {
    if (!process.env.API_KEY) return next();
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
};

// Ensure auth directory exists
function ensureAuthDir() {
    if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        logger.info(`📁 Created auth directory: ${AUTH_DIR}`);
    }
}

// Check if session exists
function hasExistingSession() {
    return fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0;
}

// Get session stats
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

// Create session backup (Base64 encoded)
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
        
        // Save to file as well (persists on Railway during deployment)
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

// Restore session from backup
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

// Load backup from disk on startup
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

// Clear session backup
function clearSessionBackup() {
    sessionBackup = null;
    if (fs.existsSync(BACKUP_FILE)) {
        fs.unlinkSync(BACKUP_FILE);
        logger.info('🗑️  Session backup cleared');
    }
}

async function connectWhatsApp() {
    try {
        ensureAuthDir();
        
        connectionAttempts++;
        logger.info(`🔄 Connecting to WhatsApp (Attempt ${connectionAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
        logger.info(`📁 Using auth directory: ${AUTH_DIR}`);
        
        // Try to restore from backup if no session exists
        if (!hasExistingSession()) {
            // First try loading backup from disk
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
                
                // Handle logout - clear session and backup
                if (statusCode === DisconnectReason.loggedOut) {
                    logger.error('🚫 Logged out from device - clearing all session data');
                    qrCodeData = null;
                    sessionRestored = false;
                    
                    // Clear auth directory
                    if (fs.existsSync(AUTH_DIR)) {
                        logger.info('🗑️  Clearing auth directory...');
                        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                        ensureAuthDir();
                    }
                    
                    // Clear backup
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
                
                // Create backup immediately after connection
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
            
            // Update backup after creds change
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

// Routes

app.get('/', (req, res) => {
    const sessionStats = getSessionStats();
    
    res.json({
        service: 'WhatsApp Academic Manager API',
        status: connectionState,
        phone: connectedPhone,
        version: '2.1.0 - Railway Optimized (No Volumes)',
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
        railway: {
            storage: '/tmp/auth_info (ephemeral)',
            backup: 'In-memory + disk fallback',
            volumes_required: false,
            free_tier_compatible: true
        }
    });
});

app.get('/qr', async (req, res) => {
    try {
        if (connectionState === 'connected') {
            const sessionStats = getSessionStats();
            
            return res.send(`
                <html>
                <head>
                    <title>WhatsApp Connected</title>
                    <style>
                        body {
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                            background: linear-gradient(135deg, #25D366, #128C7E);
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                            margin: 0;
                        }
                        .container {
                            background: white;
                            padding: 40px;
                            border-radius: 20px;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                            text-align: center;
                            max-width: 550px;
                        }
                        h1 { color: #25D366; margin-bottom: 20px; }
                        .phone { font-size: 24px; color: #075E54; margin: 20px 0; font-weight: bold; }
                        .status-box {
                            background: #e8f5e9;
                            padding: 20px;
                            border-radius: 12px;
                            margin: 20px 0;
                            border-left: 4px solid #25D366;
                        }
                        .status-item {
                            display: flex;
                            justify-content: space-between;
                            margin: 10px 0;
                            font-size: 14px;
                        }
                        .label { color: #666; }
                        .value { color: #2e7d32; font-weight: bold; }
                        .info-box {
                            background: #e3f2fd;
                            padding: 15px;
                            border-radius: 10px;
                            margin-top: 20px;
                            border-left: 4px solid #2196f3;
                            text-align: left;
                        }
                        .info-box h3 { margin: 0 0 10px 0; color: #1976d2; font-size: 16px; }
                        .info-box ul { margin: 5px 0; padding-left: 20px; color: #555; font-size: 13px; }
                        a {
                            display: inline-block;
                            margin: 10px 5px;
                            padding: 12px 30px;
                            background: #075E54;
                            color: white;
                            text-decoration: none;
                            border-radius: 25px;
                            transition: background 0.3s;
                            font-size: 14px;
                        }
                        a:hover { background: #128C7E; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>✅ WhatsApp Connected!</h1>
                        <div class="phone">+${connectedPhone}</div>
                        
                        <div class="status-box">
                            <div style="font-weight: bold; margin-bottom: 15px; color: #2e7d32;">
                                🔒 Session Status
                            </div>
                            <div class="status-item">
                                <span class="label">Session Saved:</span>
                                <span class="value">${sessionStats.exists ? '✅ Yes' : '⚠️ No'}</span>
                            </div>
                            <div class="status-item">
                                <span class="label">Backup Available:</span>
                                <span class="value">${sessionBackup ? '✅ Yes' : '⚠️ No'}</span>
                            </div>
                            <div class="status-item">
                                <span class="label">Storage:</span>
                                <span class="value">📁 /tmp (Railway ephemeral)</span>
                            </div>
                            ${sessionStats.file_count ? `
                            <div class="status-item">
                                <span class="label">Files:</span>
                                <span class="value">${sessionStats.file_count} files (${sessionStats.total_size_kb} KB)</span>
                            </div>
                            ` : ''}
                            ${sessionStats.created_hours_ago ? `
                            <div class="status-item">
                                <span class="label">Session Age:</span>
                                <span class="value">${Math.floor(sessionStats.created_hours_ago / 24)}d ${sessionStats.created_hours_ago % 24}h</span>
                            </div>
                            ` : ''}
                        </div>
                        
                        <div class="info-box">
                            <h3>💡 How Session Persistence Works:</h3>
                            <ul>
                                <li>✅ Saved to <code>/tmp</code> during deployment</li>
                                <li>✅ Backup created automatically</li>
                                <li>✅ Auto-restores on service restart</li>
                                <li>⚠️ Cleared on code redeploy (rare)</li>
                                <li>💡 No Railway volumes needed!</li>
                            </ul>
                        </div>
                        
                        <p style="color: #666; font-size: 13px; margin-top: 20px;">
                            Your session persists across restarts. Only scan QR again after redeployments.
                        </p>
                        
                        <a href="/api/session-info">📊 Session Details</a>
                        <a href="/">🏠 API Status</a>
                    </div>
                </body>
                </html>
            `);
        }
        
        if (!qrCodeData) {
            return res.send(`
                <html>
                <head>
                    <title>Generating QR Code</title>
                    <meta http-equiv="refresh" content="2">
                    <style>
                        body {
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                            background: linear-gradient(135deg, #25D366, #128C7E);
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                            margin: 0;
                        }
                        .container {
                            background: white;
                            padding: 40px;
                            border-radius: 20px;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                            text-align: center;
                        }
                        .spinner {
                            width: 50px;
                            height: 50px;
                            border: 5px solid #e0e0e0;
                            border-top-color: #25D366;
                            border-radius: 50%;
                            animation: spin 1s linear infinite;
                            margin: 20px auto;
                        }
                        @keyframes spin { to { transform: rotate(360deg); } }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>⏳ Initializing...</h1>
                        <div class="spinner"></div>
                        <p style="color:#666">Checking for saved session...</p>
                        <p style="color:#999; font-size: 12px;">Page will auto-refresh</p>
                    </div>
                </body>
                </html>
            `);
        }
        
        const qrImage = await QRCode.toDataURL(qrCodeData);
        res.send(`
            <html>
            <head>
                <title>Scan QR Code - WhatsApp</title>
                <style>
                    body {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        background: linear-gradient(135deg, #25D366, #128C7E);
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        margin: 0;
                    }
                    .container {
                        background: white;
                        padding: 40px;
                        border-radius: 20px;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        text-align: center;
                        max-width: 500px;
                    }
                    h1 { color: #25D366; margin-bottom: 20px; }
                    img {
                        max-width: 300px;
                        border: 5px solid #25D366;
                        border-radius: 15px;
                        padding: 15px;
                        background: white;
                        margin: 20px 0;
                    }
                    .instructions {
                        text-align: left;
                        margin-top: 20px;
                        padding: 20px;
                        background: #f8f9fa;
                        border-radius: 12px;
                    }
                    .instructions p { margin: 8px 0; color: #555; }
                    .note {
                        background: #fff3cd;
                        padding: 15px;
                        border-radius: 10px;
                        margin-top: 20px;
                        border-left: 4px solid #ffc107;
                        font-size: 13px;
                    }
                    button {
                        margin-top: 20px;
                        padding: 12px 30px;
                        background: #25D366;
                        color: white;
                        border: none;
                        border-radius: 25px;
                        cursor: pointer;
                        font-size: 16px;
                        transition: background 0.3s;
                    }
                    button:hover { background: #128C7E; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>📱 Scan with WhatsApp</h1>
                    <img src="${qrImage}" alt="QR Code" />
                    
                    <div class="instructions">
                        <p><strong>📋 Steps:</strong></p>
                        <p>1️⃣ Open WhatsApp on your phone</p>
                        <p>2️⃣ Tap <strong>Settings ⚙️</strong></p>
                        <p>3️⃣ Tap <strong>Linked Devices</strong></p>
                        <p>4️⃣ Tap <strong>Link a Device</strong></p>
                        <p>5️⃣ Scan this QR code</p>
                    </div>
                    
                    <div class="note">
                        <strong>💾 Smart Session Storage:</strong><br>
                        • Session saved to Railway's /tmp storage<br>
                        • Automatic backup created<br>
                        • Persists across service restarts<br>
                        • Works on Railway FREE tier!<br>
                        <strong>No volumes configuration needed!</strong>
                    </div>
                    
                    <button onclick="location.reload()">🔄 Refresh</button>
                </div>
                
                <script>
                    setInterval(() => {
                        fetch('/api/status')
                            .then(r => r.json())
                            .then(d => {
                                if (d.status === 'connected') {
                                    location.href = '/qr';
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
            server: {
                uptime_seconds: Math.floor(process.uptime()),
                memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                node_version: process.version
            },
            railway: {
                storage_type: 'ephemeral (/tmp)',
                backup_strategy: 'in-memory + disk',
                volumes_required: false,
                free_tier_compatible: true
            }
        });
    } catch (error) {
        logger.error('Session info error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/groups', authenticateAPIKey, async (req, res) => {
    try {
        if (!sock || connectionState !== 'connected') {
            return res.status(503).json({ 
                success: false, 
                error: 'WhatsApp not connected',
                status: connectionState,
                hint: connectionState === 'qr_ready' ? 'Please scan QR code at /qr' : 'Service is connecting...'
            });
        }
        
        const chats = await sock.groupFetchAllParticipating();
        const groups = Object.values(chats).map(g => ({
            id: g.id,
            name: g.subject,
            participants: g.participants?.length || 0
        }));
        
        res.json({ success: true, count: groups.length, groups });
    } catch (error) {
        logger.error('Groups endpoint error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/messages/:groupId', authenticateAPIKey, async (req, res) => {
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

app.post('/api/send', authenticateAPIKey, async (req, res) => {
    try {
        if (!sock || connectionState !== 'connected') {
            return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
        }
        
        const { groupId, message } = req.body;
        if (!groupId || !message) {
            return res.status(400).json({ success: false, error: 'groupId and message required' });
        }
        
        await sock.sendMessage(groupId, { text: message });
        logger.info(`✉️  Message sent to ${groupId}`);
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
        uptime_seconds: Math.floor(process.uptime())
    });
});

// Load backup on startup
loadBackupFromDisk();

app.listen(PORT, () => {
    logger.info('='.repeat(70));
    logger.info('🚀 WhatsApp Academic Manager API v2.1 - Railway Optimized');
    logger.info('='.repeat(70));
    logger.info(`📡 Server running on port ${PORT}`);
    logger.info(`🌐 Health check: http://localhost:${PORT}/`);
    logger.info(`📱 QR Code: http://localhost:${PORT}/qr`);
    logger.info(`📊 Session Info: http://localhost:${PORT}/api/session-info`);
    logger.info(`🔐 API Key: ${process.env.API_KEY ? 'Configured ✅' : 'NOT SET ⚠️'}`);
    logger.info(`💾 Auth Directory: ${AUTH_DIR}`);
    logger.info(`📁 Session Exists: ${hasExistingSession() ? 'Yes ✅' : 'No ❌'}`);
    logger.info(`🔄 Backup Available: ${sessionBackup ? 'Yes ✅' : 'No ❌'}`);
    logger.info(`💡 Storage Strategy: Railway ephemeral (/tmp) + in-memory backup`);
    logger.info(`✅ Free Tier Compatible: Yes (no volumes needed!)`);
    logger.info('='.repeat(70));
    
    connectWhatsApp();
});
