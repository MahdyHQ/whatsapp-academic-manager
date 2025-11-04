import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import express, { Request, Response, NextFunction } from 'express';
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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure Buffer available globally for environments that need it
if (typeof (globalThis as any).Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

const app = express();
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','x-api-key'], credentials: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const logger: any = pino({ level: 'info' });

// WhatsApp connection state and runtime variables
let sock: any = null;
let qrCodeData: string | null = null;
let connectionState: string = 'disconnected';
let connectedPhone: string | null = null;
let sessionRestored = false;
let connectionAttempts = 0;
let sessionBackup: string | null = null;
const BACKUP_FILE = path.join(__dirname, '../session_backup.json');
let globalSaveCreds: (() => Promise<void>) | null = null;

// Phone auth storage
const otpStorage: Map<string, any> = new Map();
const sessionTokens: Map<string, any> = new Map();
const otpRequestLog: Map<string, number[]> = new Map();
const ipRequestLog: Map<string, number[]> = new Map();

function _pruneAndCount(map: Map<any, any>, key: any, windowMs: number) {
  const now = Date.now();
  const arr: number[] = map.get(key) || [];
  const pruned = arr.filter((ts: number) => ts > now - windowMs);
  map.set(key, pruned);
  return pruned.length;
}
function _recordTimestamp(map: Map<any, any>, key: any) {
  const arr: number[] = map.get(key) || [];
  arr.push(Date.now());
  map.set(key, arr);
}

const authorizedPhones: Set<string> = AUTHORIZED_PHONES as Set<string>;
logger.info(`📱 Authorized phones: ${Array.from(authorizedPhones).join(', ')}`);

function getIconSVG(iconName: string, className = 'w-6 h-6') { /* lightweight placeholder copied from JS UI generation */
  // In TS port we keep icons inline as in server.js when rendering HTML
  return '';
}

function generateOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }
function generateSessionToken() { return crypto.randomBytes(32).toString('hex'); }
function isValidPhoneNumber(phone: string) { return /^\+\d{10,15}$/.test(phone); }

// Baileys helpers
function getPreferredIdFromKey(key: any) { if (!key) return null; return key.participantAlt || key.participant || key.remoteJidAlt || key.remoteJid || null; }
function extractMessageContent(m: any) { if (!m || !m.message) return ''; const msg = m.message; return msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption || ''; }
function extractMessageTimestamp(m: any) { return m?.messageTimestamp || m?.message?.messageTimestamp || m?.messageTimestampSeconds || null; }

// Auth middleware
const authenticateAPIKey = (req: Request, res: Response, next: NextFunction) => {
  if (!process.env.API_KEY) { logger.warn('⚠️  No API_KEY configured - skipping authentication'); return next(); }
  const apiKey = (req.headers['x-api-key'] as string) || (req.headers['authorization'] as string)?.replace('Bearer ', '');
  if (!apiKey || apiKey !== process.env.API_KEY) { logger.warn('❌ API key validation failed'); return res.status(401).json({ success:false, error:'Unauthorized' }); }
  next();
};

function requireAuth(req: Request & { user?: any }, res: Response, next: NextFunction) {
  try {
    const token = (req.headers['authorization'] as string)?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success:false, error:'Authentication required' });
    const session = sessionTokens.get(token);
    if (!session) return res.status(401).json({ success:false, error:'Invalid session token' });
    if (Date.now() > session.expiresAt) { sessionTokens.delete(token); return res.status(401).json({ success:false, error:'Session expired' }); }
    session.lastActivity = Date.now();
    req.user = { phone: session.phone, role: 'admin' };
    next();
  } catch (err) {
    logger.error('Auth middleware error', err);
    res.status(500).json({ success:false, error:'Authentication failed' });
  }
}

function requireAuthOrAPIKey(req: Request & { user?: any }, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey && process.env.API_KEY && apiKey === process.env.API_KEY) { req.user = { phone: 'API_KEY_ADMIN', role: 'admin', authMethod: 'api_key' }; return next(); }
  const token = (req.headers['authorization'] as string)?.replace('Bearer ', '');
  if (token) {
    const session = sessionTokens.get(token);
    if (session && Date.now() <= session.expiresAt) { session.lastActivity = Date.now(); req.user = { phone: session.phone, role: 'admin', authMethod: 'bearer_token' }; return next(); }
  }
  return res.status(401).json({ success:false, error:'Authentication required. Provide either x-api-key or Bearer token.' });
}

function ensureAuthDir(){ if (!fs.existsSync(AUTH_DIR)) { fs.mkdirSync(AUTH_DIR, { recursive: true }); logger.info(`📁 Created auth directory: ${AUTH_DIR}`); } }
function hasExistingSession(){ return fs.existsSync(AUTH_DIR) && fs.readdirSync(AUTH_DIR).length > 0; }
function getSessionStats(){ if (!hasExistingSession()) return { exists:false, location: AUTH_DIR }; const files = fs.readdirSync(AUTH_DIR); let totalSize = 0; let oldestFile:any = null; files.forEach((file:any)=>{ const fp = path.join(AUTH_DIR, file); const stats = fs.statSync(fp); totalSize += stats.size; if (!oldestFile || stats.mtime < oldestFile) oldestFile = stats.mtime; }); return { exists:true, location: AUTH_DIR, file_count: files.length, total_size_bytes: totalSize, total_size_kb: Math.round(totalSize/1024), created_hours_ago: oldestFile ? Math.floor((Date.now()-oldestFile)/1000/60/60) : null }; }

function createSessionBackup(){ try { if (!hasExistingSession()) { logger.warn('⚠️  No session to backup'); return null; } const files = fs.readdirSync(AUTH_DIR); const backup:any = {}; files.forEach((file:any)=>{ const filePath = path.join(AUTH_DIR,file); backup[file] = fs.readFileSync(filePath,'utf8'); }); const backupStr = Buffer.from(JSON.stringify(backup)).toString('base64'); try { fs.writeFileSync(BACKUP_FILE, JSON.stringify({ backup: backupStr, created: new Date().toISOString(), phone: connectedPhone })); logger.info('💾 Session backup created'); } catch (err) { logger.warn('Could not save backup to disk', err && err.message ? err.message : err); } sessionBackup = backupStr; return backupStr; } catch (err) { logger.error('Failed to create backup', err); return null; } }

function restoreSessionFromBackup(backupStr: string){ try { if (!backupStr) return false; const backup = JSON.parse(Buffer.from(backupStr,'base64').toString('utf8')); ensureAuthDir(); let restoredFiles = 0; Object.entries(backup).forEach(([filename, content]: any)=>{ const filePath = path.join(AUTH_DIR, filename); fs.writeFileSync(filePath, content, 'utf8'); restoredFiles++; }); logger.info(`✅ Session restored successfully (${restoredFiles} files)`); return true; } catch (err) { logger.error('Failed to restore backup', err); return false; } }

function loadBackupFromDisk(){ try { if (fs.existsSync(BACKUP_FILE)) { const data = JSON.parse(fs.readFileSync(BACKUP_FILE,'utf8')); sessionBackup = data.backup; logger.info(`💾 Loaded session backup from disk (created: ${data.created})`); return data.backup; } } catch (err) { logger.warn('Could not load backup from disk', err && err.message ? err.message : err); } return null; }
function clearSessionBackup(){ sessionBackup = null; if (fs.existsSync(BACKUP_FILE)) { fs.unlinkSync(BACKUP_FILE); logger.info('🗑️  Session backup cleared'); } }

// Main connection function
async function connectWhatsApp(){
  try {
    ensureAuthDir();
    connectionAttempts++;
    logger.info(`🔄 Connecting to WhatsApp (Attempt ${connectionAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    logger.info(`📁 Using auth directory: ${AUTH_DIR}`);
    if (!hasExistingSession()) { const diskBackup = loadBackupFromDisk(); const backupToUse = sessionBackup || diskBackup; if (backupToUse) { const restored = restoreSessionFromBackup(backupToUse); if (restored) sessionRestored = true; } else sessionRestored = false; } else sessionRestored = true;

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    try { globalSaveCreds = saveCreds; } catch (e){ logger.warn('Could not set globalSaveCreds', (e as any).message); }
    const { version } = await fetchLatestBaileysVersion();
    logger.info(`📦 Using Baileys version: ${version.join('.')}`);

    const BAILEYS_LOG_LEVEL = process.env.BAILEYS_LOG_LEVEL || 'info';
  const BAILEYS_LOGGER: any = pino({ level: BAILEYS_LOG_LEVEL });
    const SYNC_FULL_HISTORY = process.env.SYNC_FULL_HISTORY === 'true';
    const MARK_ONLINE_ON_CONNECT = process.env.MARK_ONLINE_ON_CONNECT === 'true';

    // Group metadata cache: prefer Redis
    let redisClient: any = null;
    let groupCacheIsRedis = false;
    const groupCache = new Map<string, any>();

    async function initGroupCache(){ try { const { createClient } = await import('redis'); const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`; const opts:any = { url: redisUrl }; if (process.env.REDIS_PASSWORD) opts.password = process.env.REDIS_PASSWORD; redisClient = createClient(opts); redisClient.on('error', (e:any)=>{ logger.warn('Redis client error:', e && e.message ? e.message : e); }); await redisClient.connect(); groupCacheIsRedis = true; logger.info('✅ Connected to Redis for cachedGroupMetadata'); } catch (err) { logger.warn('⚠️  Redis not available for cachedGroupMetadata - falling back to in-memory cache'); logger.debug(err && err.message ? err.message : err); redisClient = null; groupCacheIsRedis = false; } }
    await initGroupCache();

    sock = makeWASocket({
      version,
      logger: BAILEYS_LOGGER,
      printQRInTerminal: true,
      auth: state,
      browser: ['Academic Manager', 'Chrome', '1.0.0'],
      connectTimeoutMs:60000,
      defaultQueryTimeoutMs:60000,
      keepAliveIntervalMs:30000,
  getMessage: async (key: any)=>{ try { if (sock?.store && sock.store.messages && key?.remoteJid) { const chat: any = sock.store.messages[key.remoteJid] || {}; const list: any[] = Object.values(chat); const found: any = list.find((m:any)=>m && m.key && m.key.id === key.id); if (found && found.message) return found.message; } return { conversation: 'Message not available' }; } catch (err: any) { BAILEYS_LOGGER.warn('getMessage fallback triggered', (err && (err as any).message) ? (err as any).message : err); return { conversation: 'Message not available' }; } },
      syncFullHistory: SYNC_FULL_HISTORY,
      markOnlineOnConnect: MARK_ONLINE_ON_CONNECT,
  cachedGroupMetadata: async (jid: string) => { try { if (groupCacheIsRedis && redisClient) { const raw = await redisClient.get(`group:${jid}`); if (raw) return JSON.parse(raw); return null; } return groupCache.get(jid) || null; } catch (err: any) { BAILEYS_LOGGER.warn('cachedGroupMetadata error', (err && (err as any).message) ? (err as any).message : err); return null; } }
    });

    // Migration check for LID/device-index
    try { const authFiles = fs.readdirSync(AUTH_DIR); const hasLid = authFiles.some((f:any)=>/lid/i.test(f) || /lid-mapping/i.test(f)); const hasDeviceIndex = authFiles.some((f:any)=>/device-index/i.test(f) || /deviceindex/i.test(f)); if (!hasLid || !hasDeviceIndex) { logger.warn('⚠️  Auth directory appears missing LID/device-index files required by Baileys v7+'); logger.warn('    See migration guide: https://whiskey.so/migrate-latest'); } } catch (e:any) { logger.warn('Could not inspect auth directory for LID/device-index files:', e.message); }

    // Ensure fetchMessagesFromWA shim
    if (typeof sock.fetchMessagesFromWA !== 'function') {
      sock.fetchMessagesFromWA = async (groupId: string, limit = 50) => {
        try {
          if (typeof sock.loadMessages === 'function') { logger.info('Using sock.loadMessages to fetch messages'); return await sock.loadMessages(groupId, limit); }
          if (typeof sock.fetchMessages === 'function') { logger.info('Using sock.fetchMessages to fetch messages'); return await sock.fetchMessages(groupId, limit); }
          if (sock.store && sock.store.messages) { try { logger.info('Attempting to read messages from sock.store'); const chatMsgs = sock.store.messages[groupId] || {}; const items = Object.values(chatMsgs).sort((a:any,b:any)=> (b.messageTimestamp||0)-(a.messageTimestamp||0)); return items.slice(0, limit); } catch (e:any) { logger.warn('Reading from sock.store failed:', e.message); } }
          logger.warn('sock.fetchMessagesFromWA: no native fetch method found, returning empty array'); return [];
        } catch (err) { logger.error('sock.fetchMessagesFromWA error:', err); throw err; }
      };
    }

    sock.ev.on('connection.update', async (update:any)=>{ const { connection, lastDisconnect, qr } = update; if (qr) { qrCodeData = qr; logger.info('📱 QR Code generated - Available at /qr endpoint'); connectionState = 'qr_ready'; } if (connection === 'close') { const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut; const statusCode = lastDisconnect?.error?.output?.statusCode; const errorMessage = lastDisconnect?.error?.message; logger.warn('⚠️  Connection closed'); logger.warn(`   Status Code: ${statusCode}`); logger.warn(`   Error: ${errorMessage || 'Unknown'}`); logger.warn(`   Should reconnect: ${shouldReconnect}`); connectionState = 'disconnected'; connectedPhone = null; if (statusCode === DisconnectReason.loggedOut) { logger.error('🚫 Logged out from device - clearing all session data'); qrCodeData = null; sessionRestored = false; if (fs.existsSync(AUTH_DIR)) { logger.info('🗑️  Clearing auth directory...'); fs.rmSync(AUTH_DIR, { recursive: true, force: true }); ensureAuthDir(); } clearSessionBackup(); connectionAttempts = 0; } if (shouldReconnect && connectionAttempts < MAX_RECONNECT_ATTEMPTS) { const delay = Math.min(3000 * connectionAttempts, 30000); logger.info(`🔄 Reconnecting in ${delay/1000} seconds...`); setTimeout(()=>connectWhatsApp(), delay); } else if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) { logger.error('❌ Max reconnection attempts reached'); logger.error('   💡 Visit /qr to scan QR code again'); } else { logger.error('🚫 Not reconnecting - scan QR code at /qr'); } } else if (connection === 'open') { logger.info('✅ WhatsApp Connected Successfully!'); connectionState = 'connected'; connectedPhone = sock.user?.id?.split(':')[0]; qrCodeData = null; connectionAttempts = 0; setTimeout(()=>createSessionBackup(), 2000); if (sessionRestored) { logger.info('💾 Session restored from backup'); } else { logger.info('🆕 New session created'); } logger.info(`📱 Connected as: +${connectedPhone}`); } else if (connection === 'connecting') { logger.info('🔗 Establishing connection...'); } });

    sock.ev.on('creds.update', async ()=>{ await saveCreds(); logger.info('💾 Session credentials updated'); setTimeout(()=>createSessionBackup(), 1000); });

    // LID mapping handlers
    try {
      const lidStore = sock.signalRepository?.lidMapping;
      if (lidStore) { logger.info('🔁 LID mapping store available on socket'); sock.getLIDForPN = async (pn:any) => { if (typeof lidStore.getLIDForPN === 'function') return lidStore.getLIDForPN(pn); return null; }; sock.getPNForLID = async (lid:any) => { if (typeof lidStore.getPNForLID === 'function') return lidStore.getPNForLID(lid); return null; }; } else { logger.info('ℹ️  No lid-mapping store available on this socket'); }

      sock.ev.on('lid-mapping.update', async (update:any)=>{ try { logger.info('🔄 lid-mapping.update event received'); logger.debug({ update }); const store = sock.signalRepository?.lidMapping; if (store) { if (Array.isArray(update) && typeof store.storeLIDPNMappings === 'function') { store.storeLIDPNMappings(update); } else if (update && typeof store.storeLIDPNMapping === 'function') { store.storeLIDPNMapping(update); } } } catch (err) { logger.warn('Failed handling lid-mapping.update:', err && err.message ? err.message : err); } });
    } catch (err) { logger.debug('Could not attach lid-mapping helpers:', err && err.message ? err.message : err); }

    // Ensure redis closes on process exit
    process.on('exit', async ()=>{ try { if (redisClient) await redisClient.quit(); } catch (e) { logger.warn('Error closing Redis client on exit', e && e.message ? e.message : e); } });

  } catch (error) {
    logger.error('❌ Fatal Connection Error:', error && (error as any).stack ? (error as any).stack : error);
    connectionState = 'error';
    if (connectionAttempts < MAX_RECONNECT_ATTEMPTS) { const delay = Math.min(5000 * connectionAttempts, 30000); setTimeout(()=>connectWhatsApp(), delay); }
  }
}

// fetchMessagesFromWAWrapper (copied & typed)
async function fetchMessagesFromWAWrapper(groupId: string, limit = 50) {
  if (!sock) throw new Error('WhatsApp socket not initialized');
  logger.info(`fetchMessagesFromWAWrapper: fetching messages for group=${groupId} limit=${limit}`);
  async function tryCall(name: string, fn: () => Promise<any>) { logger.info(`fetchMessagesFromWAWrapper: attempting ${name}()`); try { const res = await fn(); const len = Array.isArray(res) ? res.length : (res && typeof res === 'object' && 'messages' in res ? (Array.isArray(res.messages) ? res.messages.length : 'non-array') : 'non-array-or-undefined'); logger.info(`fetchMessagesFromWAWrapper: ${name}() succeeded — result length: ${len}`); return res; } catch (err) { logger.error(`fetchMessagesFromWAWrapper: ${name}() threw: ${(err && (err as any).stack) ? (err as any).stack : err}`); return null; } }

  if (typeof sock.fetchMessagesFromWA === 'function') { const r = await tryCall('sock.fetchMessagesFromWA', () => sock.fetchMessagesFromWA(groupId, limit)); if (r) return Array.isArray(r) ? r : (r.messages || []); } else { logger.info('fetchMessagesFromWAWrapper: sock.fetchMessagesFromWA not available'); }
  if (typeof sock.loadMessages === 'function') { const r = await tryCall('sock.loadMessages', () => sock.loadMessages(groupId, limit)); if (r) return Array.isArray(r) ? r : (r.messages || []); } else { logger.info('fetchMessagesFromWAWrapper: sock.loadMessages not available'); }
  if (typeof sock.fetchMessages === 'function') { const r = await tryCall('sock.fetchMessages', () => sock.fetchMessages(groupId, limit)); if (r) return Array.isArray(r) ? r : (r.messages || []); } else { logger.info('fetchMessagesFromWAWrapper: sock.fetchMessages not available'); }

  if (sock.store && sock.store.messages) {
    logger.info('fetchMessagesFromWAWrapper: attempting in-memory store lookup');
    try {
      if (typeof sock.store.messages.get === 'function') {
        const chatMap = sock.store.messages.get(groupId);
        if (chatMap && (typeof chatMap.values === 'function')) {
          const msgs = Array.from(chatMap.values()); logger.info(`fetchMessagesFromWAWrapper: store.get returned ${msgs.length} messages`); return msgs;
        }
      }
      if (sock.store.messages[groupId]) { const raw = sock.store.messages[groupId]; const msgs = Array.isArray(raw) ? raw : Object.values(raw || {}); logger.info(`fetchMessagesFromWAWrapper: store[index] returned ${msgs.length} messages`); return msgs; }
      const collected: any[] = [];
      if (typeof Object.entries === 'function') { for (const [chatId, container] of Object.entries(sock.store.messages)) { if (!chatId) continue; if (chatId === groupId || chatId.endsWith(groupId)) { const vals = Array.isArray(container) ? container : Object.values(container || {}); for (const v of vals) collected.push(v); } } }
      if (collected.length) { logger.info(`fetchMessagesFromWAWrapper: collected ${collected.length} messages by scanning store entries`); return collected; }
      logger.info('fetchMessagesFromWAWrapper: store present but no messages found for this group');
    } catch (err) { logger.error('fetchMessagesFromWAWrapper: error reading store:', err && (err as any).stack ? (err as any).stack : err); }
  } else { logger.info('fetchMessagesFromWAWrapper: no sock.store.messages available'); }

  if (typeof sock.query === 'function') {
    logger.info('fetchMessagesFromWAWrapper: attempting sock.query() as an active history fetch');
    try {
      const payload = { json: ['query', 'history', { jid: groupId, count: limit }] };
      const result = await tryCall('sock.query(history)', () => sock.query(payload));
      if (result) { if (Array.isArray(result)) return result; if (result.messages && Array.isArray(result.messages)) return result.messages; if (result[2] && Array.isArray(result[2])) return result[2]; }
    } catch (err) { logger.error('fetchMessagesFromWAWrapper: sock.query fallback threw:', err && (err as any).stack ? (err as any).stack : err); }
  } else { logger.info('fetchMessagesFromWAWrapper: sock.query not available'); }

  if (typeof sock.sendNode === 'function') {
    logger.info('fetchMessagesFromWAWrapper: attempting sock.sendNode() with IQ history request');
    try {
      const node = { tag: 'iq', attrs: { type: 'get', to: groupId }, content: [ { tag: 'history', attrs: { count: String(limit) } } ] };
      const r = await tryCall('sock.sendNode(iq history)', () => sock.sendNode(node));
      if (r && r.content) {
        const msgs: any[] = [];
        try { for (const c of r.content) { if (c.tag && (c.tag === 'message' || c.tag === 'm')) msgs.push(c); } } catch (e) {}
        if (msgs.length) return msgs;
      }
    } catch (err) { logger.error('fetchMessagesFromWAWrapper: sock.sendNode fallback threw:', err && (err as any).stack ? (err as any).stack : err); }
  } else { logger.info('fetchMessagesFromWAWrapper: sock.sendNode not available'); }

  logger.error('fetchMessagesFromWAWrapper: no method available to fetch messages from WhatsApp socket — returning empty array');
  return [];
}

// PHONE AUTH ENDPOINTS
app.post('/api/auth/request-otp', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body as { phone?: string };
    if (!phone) return res.status(400).json({ success:false, error:'Phone number is required' });
    if (!isValidPhoneNumber(phone)) return res.status(400).json({ success:false, error:'Invalid phone number format. Use international format: +1234567890' });
    if (!authorizedPhones.has(phone)) { logger.warn(`❌ Unauthorized login attempt: ${phone}`); return res.status(403).json({ success:false, error:'This phone number is not authorized. Please contact administrator.' }); }
    const ip = ((req.headers['x-forwarded-for'] as string) || '').split(',')[0]?.trim() || req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
    const phoneCount = _pruneAndCount(otpRequestLog, phone, PHONE_WINDOW_MS as number);
    if (phoneCount >= (PHONE_LIMIT as number)) { logger.warn(`Rate limit hit for phone ${phone}`); return res.status(429).json({ success:false, error:`Too many OTP requests for this phone. Try again later.` }); }
    const ipCount = _pruneAndCount(ipRequestLog, ip, IP_WINDOW_MS as number);
    if (ipCount >= (IP_LIMIT as number)) { logger.warn(`Rate limit hit for IP ${ip}`); return res.status(429).json({ success:false, error:`Too many requests from this IP. Try again later.` }); }
    const otp = generateOTP(); const expiresAt = Date.now() + (5 * 60 * 1000);
    otpStorage.set(phone, { code: otp, expiresAt, attempts:0, maxAttempts:3 }); _recordTimestamp(otpRequestLog, phone); _recordTimestamp(ipRequestLog, ip);
    const message = `🔐 *Academic Manager - Login Verification*\n\nYour verification code is:\n\n*${otp}*\n\nThis code expires in 5 minutes.`;
    if (sock && connectionState === 'connected') { try { await sock.sendMessage(phone + '@s.whatsapp.net', { text: message }); logger.info(`📱 OTP sent to ${phone}: ${otp}`); return res.json({ success:true, message:'Verification code sent to your WhatsApp', expiresIn:300, phone, dev_otp: process.env.NODE_ENV === 'development' ? otp : undefined }); } catch (sendError) { logger.error(`Failed to send OTP via WhatsApp to ${phone}:`, sendError); logger.info(`📝 OTP for ${phone} (WhatsApp delivery failed): ${otp}`); return res.json({ success:true, message:'Verification code generated. Check server logs if not received.', expiresIn:300, phone, warning:'WhatsApp delivery may have failed', dev_otp: process.env.NODE_ENV === 'development' ? otp : undefined }); } } else { logger.warn(`⚠️ OTP generated for ${phone} but WhatsApp is not connected`); logger.info(`📝 OTP for ${phone} (not delivered): ${otp}`); return res.json({ success:true, message:'Verification code generated but WhatsApp service is not connected. Delivery via WhatsApp was not performed.', expiresIn:300, phone, warning:'WhatsApp not connected - OTP not delivered', dev_otp: process.env.NODE_ENV === 'development' ? otp : undefined }); }
  } catch (error) { logger.error('Request OTP error:', error); res.status(500).json({ success:false, error:'Failed to send verification code. Please try again.' }); }
});

app.post('/api/auth/verify-otp', async (req: Request, res: Response) => {
  try {
    const { phone, code } = req.body as { phone?: string, code?: string };
    if (!phone || !code) return res.status(400).json({ success:false, error:'Phone number and verification code are required' });
    const storedOTP = otpStorage.get(phone);
    if (!storedOTP) return res.status(404).json({ success:false, error:'No verification code found. Please request a new one.' });
    if (Date.now() > storedOTP.expiresAt) { otpStorage.delete(phone); return res.status(410).json({ success:false, error:'Verification code has expired. Please request a new one.' }); }
    if (storedOTP.attempts >= storedOTP.maxAttempts) { otpStorage.delete(phone); return res.status(429).json({ success:false, error:'Too many failed attempts. Please request a new code.' }); }
    if (storedOTP.code !== code) { storedOTP.attempts++; const remainingAttempts = storedOTP.maxAttempts - storedOTP.attempts; logger.warn(`❌ Failed OTP attempt for ${phone}. Remaining: ${remainingAttempts}`); return res.status(401).json({ success:false, error:'Invalid verification code', attemptsRemaining: remainingAttempts }); }
    const token = generateSessionToken(); const sessionExpiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);
    sessionTokens.set(token, { phone, createdAt: Date.now(), expiresAt: sessionExpiresAt, lastActivity: Date.now() }); otpStorage.delete(phone); logger.info(`✅ User logged in: ${phone}`);
    res.json({ success:true, message:'Login successful', token, user:{ phone, role:'admin' }, expiresIn: 30 * 24 * 60 * 60 });
  } catch (error) { logger.error('Verify OTP error:', error); res.status(500).json({ success:false, error:'Verification failed. Please try again.' }); }
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  try { const token = (req.headers['authorization'] as string)?.replace('Bearer ', ''); if (token && sessionTokens.has(token)) { const session = sessionTokens.get(token); sessionTokens.delete(token); logger.info(`👋 User logged out: ${session.phone}`); } res.json({ success:true, message:'Logged out successfully' }); } catch (error) { logger.error('Logout error:', error); res.status(500).json({ success:false, error:'Logout failed' }); }
});

app.get('/api/auth/me', requireAuthOrAPIKey, (req: Request & { user?: any }, res: Response) => { try { res.json({ success:true, user: req.user }); } catch (error) { logger.error('Get user error:', error); res.status(500).json({ success:false, error:'Failed to get user info' }); } });

app.post('/api/auth/add-phone', authenticateAPIKey, async (req: Request, res: Response) => { try { const { phone } = req.body as { phone?: string }; if (!phone || !isValidPhoneNumber(phone)) return res.status(400).json({ success:false, error:'Valid phone number is required' }); authorizedPhones.add(phone); logger.info(`📱 Added authorized phone: ${phone}`); res.json({ success:true, message:'Phone number authorized successfully', phone, total_authorized: authorizedPhones.size }); } catch (error) { logger.error('Add phone error:', error); res.status(500).json({ success:false, error:'Failed to add phone number' }); } });

app.get('/api/auth/authorized-phones', authenticateAPIKey, (req: Request, res: Response) => { try { res.json({ success:true, phones: Array.from(authorizedPhones), count: authorizedPhones.size }); } catch (error) { logger.error('List phones error:', error); res.status(500).json({ success:false, error:'Failed to list authorized phones' }); } });

app.get('/api/auth/otp/:phone', authenticateAPIKey, (req: Request, res: Response) => { try { const phone = req.params.phone; if (!phone) return res.status(400).json({ success:false, error:'Phone number required' }); const stored = otpStorage.get(phone); if (!stored) return res.status(404).json({ success:false, error:'No OTP found for this phone' }); const expiresIn = Math.max(0, Math.floor((stored.expiresAt - Date.now()) / 1000)); return res.json({ success:true, phone, code: stored.code, expiresAt: stored.expiresAt, expiresInSeconds: expiresIn }); } catch (error) { logger.error('Admin OTP fetch error:', error); return res.status(500).json({ success:false, error:'Failed to fetch OTP' }); } });

// Cleanup interval
setInterval(() => { const now = Date.now(); let cleanedOTPs = 0; let cleanedSessions = 0; for (const [phone, data] of otpStorage.entries()) { if (now > data.expiresAt) { otpStorage.delete(phone); cleanedOTPs++; } } for (const [token, session] of sessionTokens.entries()) { if (now > session.expiresAt) { sessionTokens.delete(token); cleanedSessions++; } } if (cleanedOTPs > 0 || cleanedSessions > 0) { logger.info(`🗑️  Cleaned ${cleanedOTPs} expired OTPs and ${cleanedSessions} expired sessions`); } }, 5 * 60 * 1000);

// Standard routes + QR + status + session-info + groups/messages/send
app.get('/', (req: Request, res: Response) => { const sessionStats = getSessionStats(); res.json({ service: 'WhatsApp Academic Manager API', status: connectionState, phone: connectedPhone, version: '2.4.0 - WhatsApp Themed + Complete Auth', author: 'MahdyHQ', timestamp: new Date().toISOString(), session: { ...sessionStats, restored: sessionRestored, backup_available: !!sessionBackup, backup_size_kb: sessionBackup ? Math.round(sessionBackup.length / 1024) : 0 }, connection: { attempts: connectionAttempts, max_attempts: MAX_RECONNECT_ATTEMPTS }, auth: { authorized_phones_count: authorizedPhones.size, active_sessions: sessionTokens.size, pending_otps: otpStorage.size }, railway: { storage: '/tmp/auth_info (ephemeral)', backup: 'In-memory + disk fallback', volumes_required: false, free_tier_compatible: true } }); });

app.get('/qr', async (req: Request, res: Response) => { try { /* Render same HTML UI as server.js - omitted inlined markup for brevity */ if (connectionState === 'connected') { const sessionStats = getSessionStats(); return res.send(`<html><body><h1>Connected: ${connectedPhone}</h1></body></html>`); } if (!qrCodeData) { return res.send(`<html><body><h1>Initializing WhatsApp</h1></body></html>`); } const qrImage = await QRCode.toDataURL(qrCodeData); res.send(`<html><body><img src="${qrImage}"/></body></html>`); } catch (error) { logger.error('QR endpoint error:', error); res.status(500).json({ error: (error as Error).message }); } });

app.get('/api/status', (req: Request, res: Response) => { res.json({ success:true, status: connectionState, phone: connectedPhone, timestamp: new Date().toISOString(), session_restored: sessionRestored, backup_available: !!sessionBackup, connection_attempts: connectionAttempts }); });

app.get('/api/session-info', (req: Request, res: Response) => { try { const sessionStats = getSessionStats(); res.json({ success:true, session: { ...sessionStats, restored: sessionRestored, backup: { available: !!sessionBackup, size_kb: sessionBackup ? Math.round(sessionBackup.length / 1024) : 0, disk_file_exists: fs.existsSync(BACKUP_FILE) } }, connection: { status: connectionState, phone: connectedPhone, attempts: connectionAttempts, max_attempts: MAX_RECONNECT_ATTEMPTS }, auth: { authorized_phones: authorizedPhones.size, active_sessions: sessionTokens.size, pending_otps: otpStorage.size }, server: { uptime_seconds: Math.floor(process.uptime()), memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), node_version: process.version }, deployment: { platform: 'Platform-Independent', storage_type: 'Ephemeral with backup', backup_strategy: 'In-memory + disk fallback', portable: true } }); } catch (error) { logger.error('Session info error:', error); res.status(500).json({ success:false, error: (error as Error).message }); } });

app.get('/api/groups', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => { try { if (!sock || connectionState !== 'connected') return res.status(503).json({ success:false, error:'WhatsApp not connected', status: connectionState, hint: connectionState === 'qr_ready' ? 'Admin needs to scan QR code' : 'Service is connecting...' }); const chats = await sock.groupFetchAllParticipating(); const groups = Object.values(chats).map((g: any) => ({ id: g.id, name: g.subject, participants: g.participants?.length || 0 })); logger.info(`📱 ${req.user?.phone} fetched ${groups.length} groups`); res.json({ success:true, count: groups.length, groups }); } catch (error) { logger.error('Groups endpoint error:', error); res.status(500).json({ success:false, error: (error as Error).message }); } });

app.get('/api/messages/:groupId', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => { try { if (!sock || connectionState !== 'connected') return res.status(503).json({ success:false, error:'WhatsApp not connected', status: connectionState }); const { groupId } = req.params; const limit = parseInt(req.query.limit as string) || 50; let msgs; try { msgs = await fetchMessagesFromWAWrapper(groupId, limit); } catch (e:any) { logger.error('WhatsApp service error:', e.message); return res.status(500).json({ success:false, error: `WhatsApp service error: ${JSON.stringify({ success:false, error: e.message })}` }); } const formatted = msgs.map((m:any)=>{ const ts = extractMessageTimestamp(m) || Math.floor(Date.now()/1000); const content = extractMessageContent(m); return { id: m.key?.id, from_user: getPreferredIdFromKey(m.key), content, timestamp: ts, date: ts ? new Date(ts*1000).toLocaleString() : new Date().toLocaleString() }; }).filter((m:any)=>m.content); const groupInfo = await sock.groupMetadata(groupId); try { /* cache */ } catch (err) { logger.warn('Failed to cache group metadata:', err && (err as any).message ? (err as any).message : err); } logger.info(`📱 ${req.user?.phone} fetched ${formatted.length} messages from ${groupInfo?.subject || groupId}`); res.json({ success:true, count: formatted.length, group_name: groupInfo.subject, messages: formatted }); } catch (error) { logger.error('Messages endpoint error:', error); res.status(500).json({ success:false, error: (error as Error).message }); } });

app.get('/api/whatsapp/messages/:groupId', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => { // alias -> reuse same logic
  return app._router.handle(req, res, () => {});
});

app.post('/api/send', requireAuth, async (req: Request & { user?: any }, res: Response) => { try { if (!sock || connectionState !== 'connected') return res.status(503).json({ success:false, error:'WhatsApp not connected' }); const { groupId, message } = req.body as { groupId?: string, message?: string }; if (!groupId || !message) return res.status(400).json({ success:false, error:'groupId and message required' }); await sock.sendMessage(groupId, { text: message }); logger.info(`✉️  ${req.user?.phone} sent message to ${groupId}`); res.json({ success:true, message:'Sent successfully' }); } catch (error) { logger.error('Send endpoint error:', error); res.status(500).json({ success:false, error: (error as Error).message }); } });

app.get('/health', (req: Request, res: Response) => { res.json({ status:'healthy', whatsapp_status: connectionState, connected: connectionState === 'connected', session_saved: hasExistingSession(), backup_available: !!sessionBackup, active_user_sessions: sessionTokens.size, uptime_seconds: Math.floor(process.uptime()) }); });

// Load backup on startup
loadBackupFromDisk();

function ensurePublicFavicon(){ try { const publicDir = path.join(__dirname, 'public'); if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true }); const icoPath = path.join(publicDir,'favicon.ico'); const svgPath = path.join(publicDir,'favicon.svg'); const faviconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII='; if (!fs.existsSync(icoPath)) fs.writeFileSync(icoPath, Buffer.from(faviconBase64, 'base64')); const svgContent = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n  <circle cx="12" cy="12" r="12" fill="#25D366"/>\n  <path d=\"M7 12l3 3 8-8\" stroke=\"#fff\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n</svg>`; if (!fs.existsSync(svgPath)) fs.writeFileSync(svgPath, svgContent, 'utf8'); } catch (err) { logger.warn('Could not create public favicon files:', (err as any).message); } }
ensurePublicFavicon();

app.get('/login', (req: Request, res: Response) => { try { res.send(`<html><body><h1>Login page (TS stub)</h1></body></html>`); } catch (err) { logger.error('Login page error:', err); res.status(500).json({ success:false, error:'Failed to render login page' }); } });

app.get('/api/qr', async (req: Request, res: Response) => { try { const qr = qrCodeData ? await QRCode.toDataURL(qrCodeData) : null; return res.json({ success:true, connected: connectionState === 'connected', connectionState, phone: connectedPhone, qr }); } catch (err) { logger.error('API QR error:', err); return res.status(500).json({ success:false, error:'Failed to generate QR' }); } });

app.use((req: Request, res: Response) => { res.status(404).json({ success:false, error: 'Endpoint not found' }); });

app.use(((err: any, req: Request, res: Response, next: NextFunction) => { try { logger.error('Unhandled error:', err && (err.stack || err.message || err)); } catch (e) {} const status = err && err.status ? err.status : 500; res.status(status).json({ success:false, error: err && err.message ? err.message : 'Internal Server Error' }); }) as any);

const server = app.listen(PORT, () => {
  logger.info('='.repeat(70));
  logger.info('🚀 WhatsApp Academic Manager API v2.4.0');
  logger.info('='.repeat(70));
  logger.info(`📡 Server running on port ${PORT}`);
  try { const cfgWarnings = validateEnv(logger as any); if (cfgWarnings && cfgWarnings.length) logger.warn('Environment validation warnings:', cfgWarnings); } catch (e) { logger.warn('Environment validation failed:', (e as any).message || e); }
  if (process.env.SKIP_WHATSAPP_CONNECT === 'true') {
    logger.info('SKIP_WHATSAPP_CONNECT is set - not initiating WhatsApp connection (useful for build/test environments)');
  } else {
    connectWhatsApp();
  }
});

async function gracefulShutdown(signal?: string) {
  try {
    logger.info(`Received ${signal} - starting graceful shutdown`);
    connectionState = 'disconnecting';
    if (typeof globalSaveCreds === 'function') {
      try { await globalSaveCreds(); logger.info('Saved credentials successfully'); } catch (e) { logger.warn('Failed to save credentials during shutdown:', (e as any).message || e); }
    }
    try { createSessionBackup(); } catch (e) { logger.warn('Session backup during shutdown failed', (e as any).message || e); }
    if (sock) {
      try { if (typeof sock.logout === 'function') { await sock.logout(); } else if (typeof sock.end === 'function') { sock.end(); } logger.info('WhatsApp socket closed'); } catch (e) { logger.warn('Error while closing WhatsApp socket:', (e as any).message || e); }
    }
    if (server && typeof (server as any).close === 'function') {
      await new Promise(resolve => (server as any).close(() => resolve(undefined)));
      logger.info('HTTP server closed');
    }
  } catch (err) { logger.error('Error during graceful shutdown:', (err as any).message || err); } finally { process.exit(0); }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (err) => { logger.error('Uncaught exception:', err); gracefulShutdown('uncaughtException'); });

export {};
