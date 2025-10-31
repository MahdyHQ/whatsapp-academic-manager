/**
 * WhatsApp Web API Service - ES MODULE VERSION
 * Fixed Baileys ES Module compatibility
 */

import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import express from 'express';
import QRCode from 'qrcode';
import pino from 'pino';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
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
                logger.info('📱 QR Code ready at /qr');
                connectionState = 'qr_ready';
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                logger.warn('Connection closed');
                connectionState = 'disconnected';
                connectedPhone = null;
                if (shouldReconnect) setTimeout(() => connectWhatsApp(), 3000);
            } else if (connection === 'open') {
                logger.info('✅ WhatsApp Connected!');
                connectionState = 'connected';
                connectedPhone = sock.user?.id?.split(':')[0];
            }
        });

        sock.ev.on('creds.update', saveCreds);

    } catch (error) {
        logger.error('Error:', error);
        setTimeout(() => connectWhatsApp(), 5000);
    }
}

// Routes
app.get('/', (req, res) => {
    res.json({
        service: 'WhatsApp Academic Manager API',
        status: connectionState,
        phone: connectedPhone,
        version: '1.0.0'
    });
});

app.get('/qr', async (req, res) => {
    try {
        if (connectionState === 'connected') {
            return res.send('<h1>✅ Already Connected</h1><p>Phone: +' + connectedPhone + '</p>');
        }
        if (!qrCodeData) {
            return res.send('<h1>⏳ Generating QR...</h1><meta http-equiv="refresh" content="2">');
        }
        const qrImage = await QRCode.toDataURL(qrCodeData);
        res.send(`
            <html>
            <head><title>WhatsApp QR Code</title></head>
            <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#25D366;font-family:Arial">
                <div style="background:white;padding:30px;border-radius:20px;text-align:center">
                    <h1>📱 Scan with WhatsApp</h1>
                    <img src="${qrImage}" style="width:300px;border:3px solid #25D366;border-radius:10px;padding:10px"/>
                    <p>Open WhatsApp → Linked Devices → Link a Device</p>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/status', authenticateAPIKey, (req, res) => {
    res.json({ success: true, status: connectionState, phone: connectedPhone });
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
        res.json({ success: true, message: 'Sent' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    logger.info(`🚀 Server on port ${PORT}`);
    logger.info(`📱 QR: http://localhost:${PORT}/qr`);
    connectWhatsApp();
});
