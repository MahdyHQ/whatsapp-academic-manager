/**
 * WhatsApp Web API Service - ES MODULE VERSION
 * With Persistent Session Storage & Enhanced Monitoring
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
const AUTH_DIR = path.join(__dirname, '../auth_info');

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

// Auth middleware (doesn't block /qr)
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
        logger.info('📁 Created auth_info directory');
    }
}

// Check if session exists
function hasExistingSession() {
    return fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0;
}

// Get session stats
function getSessionStats() {
    if (!hasExistingSession()) {
        return { exists: false };
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
        file_count: files.length,
        total_size_bytes: totalSize,
        created_hours_ago: oldestFile ? Math.floor((Date.now() - oldestFile) / 1000 / 60 / 60) : null
    };
}

async function connectWhatsApp() {
    try {
        ensureAuthDir();
        
        connectionAttempts++;
        logger.info(`🔄 Connecting to WhatsApp (Attempt ${connectionAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
        
        // Check for existing session
        const sessionExists = hasExistingSession();
        if (sessionExists) {
            logger.info('💾 Found existing session - attempting to restore...');
            sessionRestored = true;
        } else {
            logger.info('📱 No existing session - will generate QR code');
            sessionRestored = false;
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
                
                // Handle logout - clear session
                if (statusCode === DisconnectReason.loggedOut) {
                    logger.error('🚫 Logged out from device - clearing session');
                    qrCodeData = null;
                    sessionRestored = false;
                    
                    // Clear auth directory
                    if (fs.existsSync(AUTH_DIR)) {
                        logger.info('🗑️  Clearing old session data...');
                        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                        ensureAuthDir();
                    }
                    
                    connectionAttempts = 0; // Reset attempts for new session
                }
                
                if (shouldReconnect && connectionAttempts < MAX_RECONNECT_ATTEMPTS) {
                    const delay = Math.min(3000 * connectionAttempts, 30000); // Exponential backoff, max 30s
                    logger.info(`🔄 Reconnecting in ${delay/1000} seconds...`);
                    setTimeout(() => connectWhatsApp(), delay);
                } else if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    logger.error('❌ Max reconnection attempts reached. Manual intervention required.');
                    logger.error('   Please check Railway logs or restart the service.');
                } else {
                    logger.error('🚫 Not reconnecting - scan QR code at /qr');
                }
            } else if (connection === 'open') {
                logger.info('✅ WhatsApp Connected Successfully!');
                connectionState = 'connected';
                connectedPhone = sock.user?.id?.split(':')[0];
                qrCodeData = null; // Clear QR code once connected
                connectionAttempts = 0; // Reset connection attempts on success
                
                if (sessionRestored) {
                    logger.info('💾 Session restored successfully from saved data');
                } else {
                    logger.info('🆕 New session created and saved');
                }
                
                logger.info(`📱 Connected as: +${connectedPhone}`);
            } else if (connection === 'connecting') {
                logger.info('🔗 Establishing connection...');
            }
        });

        sock.ev.on('creds.update', async () => {
            await saveCreds();
            logger.info('💾 Session credentials updated and saved');
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
            logger.error('❌ Max reconnection attempts reached after fatal error.');
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
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        session: {
            ...sessionStats,
            restored: sessionRestored,
            auth_path: AUTH_DIR
        },
        connection: {
            attempts: connectionAttempts,
            max_attempts: MAX_RECONNECT_ATTEMPTS
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
                            max-width: 500px;
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
                        .success { color: #2e7d32; }
                        a {
                            display: inline-block;
                            margin-top: 20px;
                            padding: 12px 30px;
                            background: #075E54;
                            color: white;
                            text-decoration: none;
                            border-radius: 25px;
                            transition: background 0.3s;
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
                                <span class="label">Session Type:</span>
                                <span class="value">${sessionRestored ? '🔄 Restored' : '🆕 New'}</span>
                            </div>
                            <div class="status-item">
                                <span class="label">Files Stored:</span>
                                <span class="value">${sessionStats.file_count || 0}</span>
                            </div>
                            ${sessionStats.created_hours_ago ? `
                            <div class="status-item">
                                <span class="label">Session Age:</span>
                                <span class="value">${Math.floor(sessionStats.created_hours_ago / 24)}d ${sessionStats.created_hours_ago % 24}h</span>
                            </div>
                            ` : ''}
                        </div>
                        
                        <p style="color: #666; font-size: 14px;">
                            ${sessionStats.exists ? 
                                '🎉 Your session is permanent! No need to scan QR again on restarts.' : 
                                '⏳ Session will be saved on next credential update.'}
                        </p>
                        
                        <a href="/api/session-info">📊 View Detailed Stats</a>
                        <a href="/" style="margin-left: 10px;">🏠 API Status</a>
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
                        <h1>⏳ Generating QR Code...</h1>
                        <div class="spinner"></div>
                        <p style="color:#666">Checking for saved session...</p>
                        <p style="color:#666; font-size: 12px;">This page will auto-refresh</p>
                    </div>
                </body>
                </html>
            `);
        }
        
        const qrImage = await QRCode.toDataURL(qrCodeData);
        res.send(`
            <html>
            <head>
                <title>WhatsApp QR Code - Scan to Connect</title>
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
                        <p><strong>📋 Steps to Connect:</strong></p>
                        <p>1️⃣ Open WhatsApp on your phone</p>
                        <p>2️⃣ Tap <strong>Menu (⋮)</strong> or <strong>Settings ⚙️</strong></p>
                        <p>3️⃣ Tap <strong>Linked Devices</strong></p>
                        <p>4️⃣ Tap <strong>Link a Device</strong></p>
                        <p>5️⃣ Point your camera at this QR code</p>
                    </div>
                    
                    <div class="note">
                        <strong>✨ One-Time Setup</strong><br>
                        After scanning, your session will be saved permanently to Railway's volume storage.<br>
                        <strong>You won't need to scan again on restarts!</strong>
                    </div>
                    
                    <button onclick="location.reload()">🔄 Refresh QR Code</button>
                </div>
                
                <script>
                    // Auto-check connection status every 3 seconds
                    setInterval(() => {
                        fetch('/api/status')
                            .then(r => r.json())
                            .then(d => {
                                if (d.status === 'connected') {
                                    window.location.reload();
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
                auth_path: AUTH_DIR
            },
            connection: {
                status: connectionState,
                phone: connectedPhone,
                attempts: connectionAttempts,
                max_attempts: MAX_RECONNECT_ATTEMPTS
            },
            server: {
                uptime_seconds: process.uptime(),
                memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                node_version: process.version
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
        
        // Get group info
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
        uptime_seconds: process.uptime()
    });
});

app.listen(PORT, () => {
    logger.info('='.repeat(60));
    logger.info('🚀 WhatsApp Academic Manager API v2.0');
    logger.info('='.repeat(60));
    logger.info(`📡 Server running on port ${PORT}`);
    logger.info(`🌐 Health check: http://localhost:${PORT}/`);
    logger.info(`📱 QR Code: http://localhost:${PORT}/qr`);
    logger.info(`📊 Session Info: http://localhost:${PORT}/api/session-info`);
    logger.info(`🔐 API Key: ${process.env.API_KEY ? 'Configured ✅' : 'NOT SET ⚠️'}`);
    logger.info(`💾 Auth Directory: ${AUTH_DIR}`);
    logger.info(`📁 Session Exists: ${hasExistingSession() ? 'Yes ✅' : 'No (will generate QR)'}`);
    logger.info('='.repeat(60));
    
    connectWhatsApp();
});
