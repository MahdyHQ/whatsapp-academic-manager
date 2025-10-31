const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { create, Client } = require('@whiskeysockets/baileys');
const Pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const logger = Pino({ level: 'info' });

app.use(cors());
app.use(bodyParser.json());

const authFile = './auth_state.json';
let client;

const initWhatsAppClient = async () => {
    const { state, saveState } = await create('auth', { logger });
    client = create({ auth: state });

    client.on('qr', (qr) => {
        QRCode.toFile(path.join(__dirname, 'qr.png'), qr, { errorCorrectionLevel: 'H' });
        logger.info('QR Code generated, please scan!');
    });

    client.on('ready', () => {
        logger.info('WhatsApp client is ready!');
    });

    client.on('disconnected', () => {
        logger.warn('Client disconnected, reconnecting...');
        initWhatsAppClient();
    });

    await saveState();
    await client.connect();
};

// Middleware for API key authentication
app.use((req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.API_KEY) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    next();
});

// API Endpoints
app.get('/qr', (req, res) => {
    res.sendFile(path.join(__dirname, 'qr.png'));
});

app.get('/status', (req, res) => {
    res.json({ status: client ? 'Connected' : 'Disconnected' });
});

app.get('/groups', async (req, res) => {
    const groups = await client.getAllGroups();
    res.json(groups);
});

app.get('/messages/:groupId', async (req, res) => {
    const { groupId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const messages = await client.fetchMessages(groupId, { limit });
    res.json(messages);
});

app.post('/send', async (req, res) => {
    const { groupId, message } = req.body;
    try {
        await client.sendMessage(groupId, { text: message });
        res.json({ message: 'Message sent!' });
    } catch (error) {
        logger.error(error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

app.post('/logout', async (req, res) => {
    await client.logout();
    res.json({ message: 'Logged out successfully!' });
});

// Initialize WhatsApp connection
initWhatsAppClient();

app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
});
