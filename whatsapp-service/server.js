/**
 * WhatsApp Web API Service - ES MODULE VERSION
 * Fixed Baileys ES Module compatibility + Enhanced Error Logging
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

// Make crypto and Buffer globally available for Baileys
globalThis.crypto = crypto;
globalThis.Buffer = Buffer;

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const logger = pino({ level: 'info' });

let sock = null;
let qrCodeData = null;
let connectionState = 'disconnected';
let connectedPhone = null;

// Auth middleware (doesn't block /qr)
const authenticateAPIKey = (req, res, next) => {
    if (!process.env.API_KEY) return next();
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
};

async function connectWhatsApp() {
    try {
        logger.info('🔄 Connecting to WhatsApp...');
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        const { version } = await fetchLatestBaileysVersion();

        logger.info(`📦 Using Baileys version: ${version.join('.')}`);

        sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: true,
            auth: state,
            browser: ['Academic Manager', 'Chrome', '1.0.0']
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
                
                logger.warn(`⚠️  Connection closed`);
                logger.warn(`   Status Code: ${statusCode}`);
                logger.warn(`   Error: ${errorMessage || 'Unknown'}`);
                logger.warn(`   Should reconnect: ${shouldReconnect}`);
                
                connectionState = 'disconnected';
                connectedPhone = null;
                qrCodeData = null;
                
                if (shouldReconnect) {
                    logger.info('🔄 Reconnecting in 3 seconds...');
                    setTimeout(() => connectWhatsApp(), 3000);
                } else {
                    logger.error('🚫 Logged out - Scan QR code again at /qr');
                }
            } else if (connection === 'open') {
                logger.info('✅ WhatsApp Connected Successfully!');
                connectionState = 'connected';
                connectedPhone = sock.user?.id?.split(':')[0];
                logger.info(`📱 Connected as: +${connectedPhone}`);
            } else if (connection === 'connecting') {
                logger.info('🔗 Establishing connection...');
            }
        });

        sock.ev.on('creds.update', saveCreds);

    } catch (error) {
        logger.error('❌ Fatal Connection Error:');
        logger.error(`   Message: ${error.message}`);
        logger.error(`   Name: ${error.name}`);
        logger.error(`   Code: ${error.code || 'N/A'}`);
        console.error('Full stack trace:', error);
        
        connectionState = 'error';
        logger.info('🔄 Retrying connection in 5 seconds...');
        setTimeout(() => connectWhatsApp(), 5000);
    }
}

// Routes
app.get('/', (req, res) => {
    res.json({
        service: 'WhatsApp Academic Manager API',
        status: connectionState,
        phone: connectedPhone,
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

app.get('/qr', async (req, res) => {
    try {
        if (connectionState === 'connected') {
            return res.send(`
                <html>
                <head><title>WhatsApp Connected</title></head>
                <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#25D366;font-family:Arial">
                    <div style="background:white;padding:30px;border-radius:20px;text-align:center">
                        <h1>✅ Already Connected</h1>
                        <p style="font-size:20px;margin:20px 0">Phone: +${connectedPhone}</p>
                        <p style="color:#666">Service is active and ready to use</p>
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
                </head>
                <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#25D366;font-family:Arial">
                    <div style="background:white;padding:30px;border-radius:20px;text-align:center">
                        <h1>⏳ Generating QR Code...</h1>
                        <div style="margin:20px;width:50px;height:50px;border:5px solid #25D366;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto"></div>
                        <p style="color:#666">Please wait, this page will auto-refresh</p>
                        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
                    </div>
                </body>
                </html>
            `);
        }
        const qrImage = await QRCode.toDataURL(qrCodeData);
        res.send(`
            <html>
            <head><title>WhatsApp QR Code - Scan to Connect</title></head>
            <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#25D366;font-family:Arial">
                <div style="background:white;padding:30px;border-radius:20px;text-align:center;max-width:500px">
                    <h1 style="color:#25D366">📱 Scan with WhatsApp</h1>
                    <img src="${qrImage}" style="width:300px;border:3px solid #25D366;border-radius:10px;padding:10px;margin:20px 0"/>
                    <div style="text-align:left;margin-top:20px;padding:15px;background:#f8f9fa;border-radius:8px">
                        <p style="margin:5px 0"><strong>Steps:</strong></p>
                        <p style="margin:5px 0">1. Open WhatsApp on your phone</p>
                        <p style="margin:5px 0">2. Tap Menu (⋮) or Settings</p>
                        <p style="margin:5px 0">3. Tap Linked Devices</p>
                        <p style="margin:5px 0">4. Tap Link a Device</p>
                        <p style="margin:5px 0">5. Scan this QR code</p>
                    </div>
                    <button onclick="location.reload()" style="margin-top:20px;padding:12px 30px;background:#25D366;color:white;border:none;border-radius:25px;cursor:pointer;font-size:16px">🔄 Refresh QR Code</button>
                </div>
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
        timestamp: new Date().toISOString()
    });
});

app.get('/api/groups', authenticateAPIKey, async (req, res) => {
    try {
        if (!sock || connectionState !== 'connected') {
            return res.status(503).json({ success: false, error: 'Not connected' });
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
            return res.status(503).json({ success: false, error: 'Not connected' });
        }
        const { groupId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const msgs = await sock.fetchMessagesFromWA(groupId, limit);
        const formatted = msgs.map(m => ({
            id: m.key.id,
            from: m.key.participant || m.key.remoteJid,
            content: m.message?.conversation || m.message?.extendedTextMessage?.text || '',
            timestamp: m.messageTimestamp
        })).filter(m => m.content);
        res.json({ success: true, count: formatted.length, messages: formatted });
    } catch (error) {
        logger.error('Messages endpoint error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/send', authenticateAPIKey, async (req, res) => {
    try {
        if (!sock || connectionState !== 'connected') {
            return res.status(503).json({ success: false, error: 'Not connected' });
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

app.listen(PORT, () => {
    logger.info('='.repeat(60));
    logger.info('🚀 WhatsApp Academic Manager API');
    logger.info('='.repeat(60));
    logger.info(`📡 Server running on port ${PORT}`);
    logger.info(`🌐 Health check: http://localhost:${PORT}/`);
    logger.info(`📱 QR Code: http://localhost:${PORT}/qr`);
    logger.info(`🔐 API Key: ${process.env.API_KEY ? 'Configured ✅' : 'NOT SET ⚠️'}`);
    logger.info('='.repeat(60));
    connectWhatsApp();
});
