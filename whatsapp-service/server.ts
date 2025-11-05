import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
  type CacheStore
} from '@whiskeysockets/baileys';
import NodeCache from '@cacheable/node-cache';
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
import { fileURLToPath } from 'url'; // ESM __dirname support

// Compute __filename/__dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load centralized config values (fall back to ENV if needed)
// In ESM, import local files with extension. The ts-ignore keeps TS happy if not using NodeNext.
// @ts-ignore - Node ESM requires .js extension at runtime
import { PORT as CFG_PORT, AUTH_DIR as CFG_AUTH_DIR, PHONE_WINDOW_MS, IP_WINDOW_MS, PHONE_LIMIT, IP_LIMIT, MAX_RECONNECT_ATTEMPTS as CFG_MAX_RECONNECT_ATTEMPTS, AUTHORIZED_PHONES as CFG_AUTHORIZED_PHONES, validateEnv } from './config.mjs';

// Load environment early
dotenv.config();

// Basic Express + logging setup
const app = express();
const PORT = CFG_PORT || parseInt(process.env.PORT || '3000', 10);
const logger: any = pino({ level: process.env.LOG_LEVEL || 'info' });
const BAILEYS_LOG_LEVEL = process.env.BAILEYS_LOG_LEVEL || 'info';
const BAILEYS_LOGGER: any = pino({ level: BAILEYS_LOG_LEVEL });

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Global runtime state (kept broad/`any` where external types are complex)
let sock: any = null;
let qrCodeData: string | null = null;
let connectionState: string = 'disconnected';
let connectedPhone: string | null = null;
let sessionBackup: string | null = null;
let sessionRestored = false;
let globalSaveCreds: any = null;
let connectionAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = Number(process.env.MAX_RECONNECT_ATTEMPTS || CFG_MAX_RECONNECT_ATTEMPTS || 5);
const AUTH_DIR = process.env.AUTH_DIR || CFG_AUTH_DIR || path.join(__dirname, '..', 'auth_info');
const BACKUP_FILE = path.join(__dirname, '..', 'session-backup.json');

// Baileys recommended caches & store
// 1) Retry counter cache (improves retry behaviour when sending)
const msgRetryCounterCache = new NodeCache() as unknown as CacheStore;

// 2) Lightweight message store to support getMessage (poll decrypt/retries)
type MsgMap = Map<string, any>;
const messageStore = new Map<string, MsgMap>(); // remoteJid -> (id -> message)
function rememberMessage(m: any) {
  try {
    const jid = m?.key?.remoteJid;
    const id = m?.key?.id;
    if (!jid || !id) return;
    if (!messageStore.has(jid)) messageStore.set(jid, new Map());
    messageStore.get(jid)!.set(id, m);
  } catch {}
}

// In-memory auth/session stores
const sessionTokens = new Map<string, any>();
const otpStorage = new Map<string, any>();
const authorizedPhones = CFG_AUTHORIZED_PHONES && (CFG_AUTHORIZED_PHONES instanceof Set) ? CFG_AUTHORIZED_PHONES : new Set<string>();

// Simple OTP/IP request logs for rate-limiting
const otpRequestLog = new Map<string, number[]>();
const ipRequestLog = new Map<string, number[]>();

// Minimal helpers used by endpoints
function isValidPhoneNumber(p: string) { return typeof p === 'string' && /^\+\d{6,15}$/.test(p); }
function _pruneAndCount(map: Map<string, number[]>, key: string, windowMs: number) {
  const now = Date.now();
  const arr = map.get(key) || [];
  const pruned = arr.filter(ts => now - ts <= windowMs);
  pruned.push(now);
  map.set(key, pruned);
  return pruned.length;
}
function _recordTimestamp(map: Map<string, number[]>, key: string) {
  const arr = map.get(key) || [];
  arr.push(Date.now());
  map.set(key, arr);
}
function generateOTP() { return String(Math.floor(100000 + Math.random() * 900000)); }
function generateSessionToken() { return crypto.randomBytes(24).toString('hex'); }
function getIconSVG(name: string, cls: string = 'w-6 h-6') {
  const icons: Record<string, string> = {
    check: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    phone: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`,
    database: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`,
    shield: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
    refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`,
    qrcode: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}"><rect x="3" y="3" width="5" height="5"></rect><rect x="16" y="3" width="5" height="5"></rect><rect x="3" y="16" width="5" height="5"></rect><path d="M21 16h-3a2 2 0 0 0-2 2v3"></path><path d="M21 21v.01"></path><path d="M12 7v3a2 2 0 0 1-2 2H7"></path><path d="M3 12h.01"></path><path d="M12 3h.01"></path><path d="M12 16v.01"></path><path d="M16 12h1"></path><path d="M21 12v.01"></path><path d="M12 21v-1"></path></svg>`,
    file: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`,
    clock: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
    info: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
    home: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
    trash: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>`,
    bell: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`,
    user: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}"><path d="M20 21v-2a4 4 0 0 0-3-3.87"></path><path d="M4 21v-2a4 4 0 0 1 3-3.87"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
  };
  return icons[name] || '';
}
// Serve the Baileys README (markdown) and a simple rendered HTML page
const BAILEYS_README_PATH = path.join(__dirname, '..', 'README-Baileys.md');

app.get('/raw-readme', (req: Request, res: Response) => {
  try {
    const md = fs.readFileSync(BAILEYS_README_PATH, 'utf8');
    res.type('text/markdown').send(md);
  } catch (err) {
    logger.warn('Could not read README-Baileys.md:', (err as any).message || err);
    res.status(500).json({ success: false, error: 'Could not load README' });
  }
});

app.get('/baileys', (req: Request, res: Response) => {
  // Lightweight client-side markdown rendering using marked (loaded from CDN)
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Baileys README — WhatsApp Academic Manager</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <style>
    body{font-family:Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; background:#f7fafc;color:#111;margin:0;padding:24px}
    .wrap{max-width:980px;margin:0 auto;background:#fff;padding:28px;border-radius:12px;box-shadow:0 10px 40px rgba(2,6,23,0.08)}
    .header{display:flex;align-items:center;gap:16px;margin-bottom:18px}
    .logo{height:56px}
    .meta{color:#334155}
    .content{margin-top:18px}
    .warning{background:#fff7ed;border-left:4px solid #ffb020;padding:12px;border-radius:8px;margin-bottom:12px}
    pre{white-space:pre-wrap;background:#0f172a;color:#e6eef8;padding:12px;border-radius:8px;overflow:auto}
    a{color:#0369a1}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <img class="logo" src="https://raw.githubusercontent.com/WhiskeySockets/Baileys/refs/heads/master/Media/logo.png" alt="Baileys logo"/>
      <div>
        <div style="font-weight:700;font-size:18px">Baileys (embedded README)</div>
        <div class="meta">WebSockets-based TypeScript library for interacting with the WhatsApp Web API</div>
      </div>
    </div>

    <div class="warning">
      <strong>NOTICE OF BREAKING CHANGE</strong>
      <div>As of 7.0.0, multiple breaking changes were introduced into the library. Please check <a href="https://whiskey.so/migrate-latest" target="_blank">https://whiskey.so/migrate-latest</a> for more information.</div>
    </div>

    <div id="content" class="content">Loading README…</div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script>
    (async function(){
      try{
        const r = await fetch('/raw-readme');
        if(!r.ok) throw new Error('Failed to fetch README');
        const md = await r.text();
        const html = marked.parse(md || '');
        const container = document.getElementById('content');
        container.innerHTML = html;
        // make links open in new tab
        Array.from(container.getElementsByTagName('a')).forEach(a => a.target = '_blank');
      }catch(e){
        const c = document.getElementById('content');
        c.textContent = 'Failed to load README: ' + (e && e.message ? e.message : e);
      }
    })();
  </script>
</body>
</html>
`);
});

// ... rest of your file remains unchanged (all routes, middleware, WhatsApp connect, graceful shutdown, etc.)

// Load backup on startup
loadBackupFromDisk();


// (The remainder of server.ts you provided continues unchanged)
// Baileys helpers
function getPreferredIdFromKey(key: any) { 
  if (!key) return null; 
  return key.participant || key.remoteJid || key.participantAlt || key.remoteJidAlt || null; 
}

// Enhanced message content extractor with detailed type information
function extractMessageDetails(m: any) {
  if (!m || !m.message) return null;
  
  const msg = m.message;
  const key = m.key || {};
  
  let messageType = 'unknown';
  let content = '';
  let mediaUrl = '';
  let caption = '';
  let quotedMessage = null;
  let mentionedJids: string[] = [];
  let isForwarded = false;
  let isDeleted = false;
  let reactions: any[] = [];
  let mediaInfo: any = {};

  // Handle different message types
  if (msg.conversation) {
    messageType = 'text';
    content = msg.conversation;
  } else if (msg.extendedTextMessage) {
    messageType = 'text';
    content = msg.extendedTextMessage.text || '';
    mentionedJids = msg.extendedTextMessage.contextInfo?.mentionedJid || [];
    isForwarded = !!msg.extendedTextMessage.contextInfo?.isForwarded;
    
    // Check for quoted message
    if (msg.extendedTextMessage.contextInfo?.quotedMessage) {
      quotedMessage = {
        participant: msg.extendedTextMessage.contextInfo.participant,
        content: msg.extendedTextMessage.contextInfo.quotedMessage.conversation || 
                 msg.extendedTextMessage.contextInfo.quotedMessage.extendedTextMessage?.text || ''
      };
    }
  } else if (msg.imageMessage) {
    messageType = 'image';
    caption = msg.imageMessage.caption || '';
    content = caption || '[Image]';
    mediaInfo = {
      mimetype: msg.imageMessage.mimetype,
      fileSize: msg.imageMessage.fileLength,
      width: msg.imageMessage.width,
      height: msg.imageMessage.height,
      url: msg.imageMessage.url
    };
  } else if (msg.videoMessage) {
    messageType = 'video';
    caption = msg.videoMessage.caption || '';
    content = caption || '[Video]';
    mediaInfo = {
      mimetype: msg.videoMessage.mimetype,
      fileSize: msg.videoMessage.fileLength,
      duration: msg.videoMessage.seconds,
      width: msg.videoMessage.width,
      height: msg.videoMessage.height,
      url: msg.videoMessage.url
    };
  } else if (msg.audioMessage) {
    messageType = msg.audioMessage.ptt ? 'voice' : 'audio';
    content = `[${messageType === 'voice' ? 'Voice Note' : 'Audio'}]`;
    mediaInfo = {
      mimetype: msg.audioMessage.mimetype,
      fileSize: msg.audioMessage.fileLength,
      duration: msg.audioMessage.seconds,
      url: msg.audioMessage.url
    };
  } else if (msg.documentMessage) {
    messageType = 'document';
    content = `[Document: ${msg.documentMessage.fileName || 'file'}]`;
    mediaInfo = {
      mimetype: msg.documentMessage.mimetype,
      fileSize: msg.documentMessage.fileLength,
      fileName: msg.documentMessage.fileName,
      url: msg.documentMessage.url
    };
  } else if (msg.stickerMessage) {
    messageType = 'sticker';
    content = '[Sticker]';
    mediaInfo = {
      width: msg.stickerMessage.width,
      height: msg.stickerMessage.height,
      url: msg.stickerMessage.url
    };
  } else if (msg.locationMessage) {
    messageType = 'location';
    content = `[Location: ${msg.locationMessage.degreesLatitude}, ${msg.locationMessage.degreesLongitude}]`;
    mediaInfo = {
      latitude: msg.locationMessage.degreesLatitude,
      longitude: msg.locationMessage.degreesLongitude,
      name: msg.locationMessage.name || '',
      address: msg.locationMessage.address || ''
    };
  } else if (msg.contactMessage) {
    messageType = 'contact';
    content = `[Contact: ${msg.contactMessage.displayName || 'Unknown'}]`;
    mediaInfo = {
      displayName: msg.contactMessage.displayName,
      vcard: msg.contactMessage.vcard
    };
  } else if (msg.pollCreationMessage) {
    messageType = 'poll';
    content = `[Poll: ${msg.pollCreationMessage.name}]`;
    mediaInfo = {
      name: msg.pollCreationMessage.name,
      options: msg.pollCreationMessage.options?.map((o: any) => o.optionName) || [],
      selectableCount: msg.pollCreationMessage.selectableOptionsCount || 1
    };
  } else if (msg.reactionMessage) {
    messageType = 'reaction';
    content = `[Reaction: ${msg.reactionMessage.text}]`;
    mediaInfo = {
      emoji: msg.reactionMessage.text,
      messageKey: msg.reactionMessage.key
    };
  } else if (msg.protocolMessage) {
    if (msg.protocolMessage.type === 0) { // REVOKE
      messageType = 'deleted';
      content = '[Message deleted]';
      isDeleted = true;
    }
  }

  return {
    id: key.id,
    fromMe: key.fromMe || false,
    participant: key.participant,
    remoteJid: key.remoteJid,
    messageType,
    content,
    caption,
    quotedMessage,
    mentionedJids,
    isForwarded,
    isDeleted,
    mediaInfo: Object.keys(mediaInfo).length > 0 ? mediaInfo : null,
    rawMessage: msg // Include raw message for advanced processing
  };
}

function extractMessageContent(m: any) { 
  const details = extractMessageDetails(m);
  return details?.content || '';
}

function extractMessageTimestamp(m: any) { 
  return m?.messageTimestamp || m?.message?.messageTimestamp || m?.messageTimestampSeconds || null; 
}

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

    const SYNC_FULL_HISTORY = process.env.SYNC_FULL_HISTORY === 'true';
    const MARK_ONLINE_ON_CONNECT = process.env.MARK_ONLINE_ON_CONNECT === 'true';

    // Group metadata cache: prefer Redis when explicitly configured; otherwise use in-memory to avoid blocking startup
    let redisClient: any = null;
    let groupCacheIsRedis = false;
    const groupCache = new Map<string, { data: any, expires: number }>();
    const GROUP_METADATA_TTL_MS = Number(process.env.GROUP_METADATA_TTL_MS || 5 * 60 * 1000);
    const pendingGroupMeta = new Map<string, Promise<any>>();

    async function initGroupCache(){
      const hasExplicitRedis = !!(process.env.REDIS_URL || process.env.REDIS_HOST || process.env.ENABLE_REDIS === 'true');
      if (!hasExplicitRedis) {
        logger.info('ℹ️  Redis cache disabled (no REDIS_URL/REDIS_HOST/ENABLE_REDIS). Using in-memory cache.');
        groupCacheIsRedis = false;
        return;
      }
      try {
        const { createClient } = await import('redis');
        const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`;
        const opts:any = { url: redisUrl };
        if (process.env.REDIS_PASSWORD) opts.password = process.env.REDIS_PASSWORD;
        redisClient = createClient(opts);
        redisClient.on('error', (e:any)=>{ logger.warn('Redis client error:', e && e.message ? e.message : e); });

        // Guard against hanging connect by timing out quickly and falling back
        const timeoutMs = Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 2000);
        await Promise.race([
          redisClient.connect(),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Redis connect timeout after ${timeoutMs}ms`)), timeoutMs))
        ]);
        groupCacheIsRedis = true;
        logger.info('✅ Connected to Redis for cachedGroupMetadata');
      } catch (err:any) {
        logger.warn('⚠️  Redis not available for cachedGroupMetadata - falling back to in-memory cache');
        if (err && err.message) logger.warn(err.message);
        try { if (redisClient) await redisClient.quit(); } catch {}
        redisClient = null;
        groupCacheIsRedis = false;
      }
    }
    await initGroupCache();

    sock = makeWASocket({
      version,
      logger: BAILEYS_LOGGER,
      printQRInTerminal: true,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, BAILEYS_LOGGER)
      },
      // Use a well-known browser signature to improve pairing reliability
      browser: Browsers.macOS('Chrome'),
      connectTimeoutMs:60000,
      defaultQueryTimeoutMs:60000,
      keepAliveIntervalMs:30000,
      // cache for retry counters (helps delivery reliability)
      msgRetryCounterCache,
      // message retriever for retries & poll vote decryption
      getMessage: async (key: any) => {
        try {
          const jid = key?.remoteJid;
          const id = key?.id;
          if (jid && id) {
            const chat = messageStore.get(jid);
            const m = chat?.get(id);
            if (m?.message) return m.message;
          }
        } catch (err: any) {
          BAILEYS_LOGGER.warn('getMessage() error', err?.message || err);
        }
        return { conversation: 'Message not available' };
      },
      syncFullHistory: SYNC_FULL_HISTORY,
      markOnlineOnConnect: MARK_ONLINE_ON_CONNECT,
      // robust cached group metadata with TTL and Redis fallback
      cachedGroupMetadata: async (jid: string) => {
        try {
          const now = Date.now();
          const redisKey = `group:${jid}`;
          if (groupCacheIsRedis && redisClient) {
            const raw = await redisClient.get(redisKey);
            if (raw) return JSON.parse(raw);
          } else {
            const hit = groupCache.get(jid);
            if (hit && hit.expires > now) return hit.data;
          }

          if (pendingGroupMeta.has(jid)) return await pendingGroupMeta.get(jid)!;

          const p = (async () => {
            const fresh = await (sock?.groupMetadata ? sock.groupMetadata(jid) : null);
            if (fresh) {
              if (groupCacheIsRedis && redisClient) {
                await redisClient.set(redisKey, JSON.stringify(fresh), { EX: Math.max(1, Math.floor(GROUP_METADATA_TTL_MS / 1000)) });
              } else {
                groupCache.set(jid, { data: fresh, expires: now + GROUP_METADATA_TTL_MS });
              }
            }
            return fresh;
          })();

          pendingGroupMeta.set(jid, p);
          try { return await p; } finally { pendingGroupMeta.delete(jid); }
        } catch (err: any) {
          BAILEYS_LOGGER.warn('cachedGroupMetadata error', err?.message || err);
          return null;
        }
      }
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

    // remember messages for getMessage support
    sock.ev.on('messages.upsert', (ev: any) => {
      try { for (const m of ev?.messages || []) rememberMessage(m); } catch {}
    });

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

// Enhanced message fetcher with on-demand sync capability
async function fetchMessagesFromWAWrapper(groupId: string, limit = 50) {
  if (!sock) throw new Error('WhatsApp socket not initialized');
  logger.info(`fetchMessagesFromWAWrapper: fetching messages for group=${groupId} limit=${limit}`);
  
  let messages: any[] = [];

  // STRATEGY 1: Check in-memory message store first (fastest)
  if (messageStore.has(groupId)) {
    const msgMap = messageStore.get(groupId);
    if (msgMap && msgMap.size > 0) {
      messages = Array.from(msgMap.values()).slice(-limit);
      logger.info(`fetchMessagesFromWAWrapper: found ${messages.length} messages in messageStore cache`);
      if (messages.length >= limit) return messages; // Sufficient messages in cache
    }
  }

  // STRATEGY 2: Try to load messages from WhatsApp using on-demand history sync
  // This works by requesting message history for a chat
  if (typeof sock.fetchMessageHistory === 'function' && messages.length < limit) {
    try {
      logger.info('fetchMessagesFromWAWrapper: attempting on-demand history sync via fetchMessageHistory()');
      
      // First, get a recent message from the group to use as anchor
      let anchorKey: any = null;
      
      // Try to find an existing message as anchor
      if (messageStore.has(groupId)) {
        const msgMap = messageStore.get(groupId);
        if (msgMap && msgMap.size > 0) {
          const msgs = Array.from(msgMap.values());
          if (msgs.length > 0) {
            const lastMsg = msgs[msgs.length - 1];
            anchorKey = lastMsg.key;
            logger.info('fetchMessagesFromWAWrapper: using cached message as anchor');
          }
        }
      }

      // If no anchor, try to get chat metadata which may have last message info
      if (!anchorKey && sock.store?.chats) {
        try {
          const chat = await sock.store.chats[groupId];
          if (chat && chat.messages && chat.messages.length > 0) {
            anchorKey = chat.messages[0].key;
            logger.info('fetchMessagesFromWAWrapper: using chat store message as anchor');
          }
        } catch {}
      }

      // Fetch message history (works even without anchor in Baileys 7.x)
      const historyMessages = await sock.fetchMessageHistory(
        limit * 2, // Request more than needed to account for filtered messages
        anchorKey || { remoteJid: groupId, fromMe: false, id: '' },
        anchorKey ? (anchorKey.messageTimestamp || undefined) : undefined
      );

      if (historyMessages && historyMessages.length > 0) {
        logger.info(`fetchMessagesFromWAWrapper: fetchMessageHistory returned ${historyMessages.length} messages`);
        // Store all fetched messages for future access
        historyMessages.forEach((m: any) => rememberMessage(m));
        messages = historyMessages.slice(-limit);
      }
    } catch (err: any) {
      logger.warn('fetchMessagesFromWAWrapper: fetchMessageHistory error:', err?.message || err);
    }
  }

  // STRATEGY 3: Check sock.store if available
  if (messages.length < limit && sock.store?.messages) {
    logger.info('fetchMessagesFromWAWrapper: checking sock.store.messages');
    try {
      let storeMessages: any[] = [];
      
      // Try different store access patterns
      if (typeof sock.store.messages.get === 'function') {
        const chatMap = sock.store.messages.get(groupId);
        if (chatMap) {
          if (typeof chatMap.values === 'function') {
            storeMessages = Array.from(chatMap.values());
          } else if (Array.isArray(chatMap)) {
            storeMessages = chatMap;
          } else if (typeof chatMap === 'object') {
            storeMessages = Object.values(chatMap);
          }
        }
      } else if (sock.store.messages[groupId]) {
        const raw = sock.store.messages[groupId];
        storeMessages = Array.isArray(raw) ? raw : Object.values(raw || {});
      }

      if (storeMessages.length > 0) {
        logger.info(`fetchMessagesFromWAWrapper: found ${storeMessages.length} messages in sock.store`);
        // Merge with existing messages (avoid duplicates by message ID)
        const existingIds = new Set(messages.map((m: any) => m.key?.id).filter(Boolean));
        const newMessages = storeMessages.filter((m: any) => !existingIds.has(m.key?.id));
        messages = [...messages, ...newMessages].slice(-limit);
      }
    } catch (err: any) {
      logger.warn('fetchMessagesFromWAWrapper: error reading sock.store:', err?.message || err);
    }
  }

  // Sort messages by timestamp
  if (messages.length > 0) {
    messages.sort((a: any, b: any) => {
      const tsA = extractMessageTimestamp(a) || 0;
      const tsB = extractMessageTimestamp(b) || 0;
      return tsA - tsB;
    });
    logger.info(`fetchMessagesFromWAWrapper: returning ${messages.length} messages`);
  } else {
    logger.warn(`fetchMessagesFromWAWrapper: no messages found for group ${groupId}`);
  }

  return messages;
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

// Handle both /qr and /QR without redirect to avoid potential redirect loops from upstream caches/CDNs
app.get(['/qr', '/QR'], async (req: Request, res: Response) => {
  try {
  // prevent caching of QR/initializing pages in browsers or proxies
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
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
            <p style="margin-top: 16px; font-size: 12px; opacity: 0.7;">Waiting for QR code to be generated…</p>
          </div>
          <script>
            // Poll the backend for QR availability or connection every 3 seconds without using HTTP redirects
            const check = async () => {
              try {
                const r = await fetch('/api/qr', { cache: 'no-store' });
                if (r.ok) {
                  const data = await r.json();
                  if (data.connected || data.qr) {
                    // Reload this page to show connected or QR UI
                    window.location.reload();
                  }
                }
              } catch (e) {}
            };
            setInterval(check, 3000);
          </script>
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
  res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/status', (req: Request, res: Response) => { res.json({ success:true, status: connectionState, phone: connectedPhone, timestamp: new Date().toISOString(), session_restored: sessionRestored, backup_available: !!sessionBackup, connection_attempts: connectionAttempts }); });

app.get('/api/session-info', (req: Request, res: Response) => { try { const sessionStats = getSessionStats(); res.json({ success:true, session: { ...sessionStats, restored: sessionRestored, backup: { available: !!sessionBackup, size_kb: sessionBackup ? Math.round(sessionBackup.length / 1024) : 0, disk_file_exists: fs.existsSync(BACKUP_FILE) } }, connection: { status: connectionState, phone: connectedPhone, attempts: connectionAttempts, max_attempts: MAX_RECONNECT_ATTEMPTS }, auth: { authorized_phones: authorizedPhones.size, active_sessions: sessionTokens.size, pending_otps: otpStorage.size }, server: { uptime_seconds: Math.floor(process.uptime()), memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), node_version: process.version }, deployment: { platform: 'Platform-Independent', storage_type: 'Ephemeral with backup', backup_strategy: 'In-memory + disk fallback', portable: true } }); } catch (error) { logger.error('Session info error:', error); res.status(500).json({ success:false, error: (error as Error).message }); } });

async function handleGetGroups(req: Request & { user?: any }, res: Response) {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success:false, error:'WhatsApp not connected', status: connectionState, hint: connectionState === 'qr_ready' ? 'Admin needs to scan QR code' : 'Service is connecting...' });
    }
    const chats = await sock.groupFetchAllParticipating();
    const groups = Object.values(chats).map((g: any) => ({ id: g.id, name: g.subject, participants: g.participants?.length || 0 }));
    logger.info(`📱 ${req.user?.phone} fetched ${groups.length} groups`);
    res.json({ success:true, count: groups.length, groups });
  } catch (error) {
    logger.error('Groups endpoint error:', error);
    res.status(500).json({ success:false, error: (error as Error).message });
  }
}

app.get('/api/groups', requireAuthOrAPIKey, handleGetGroups as any);
// Clean alias for clients expecting /api/whatsapp/groups
app.get('/api/whatsapp/groups', requireAuthOrAPIKey, handleGetGroups as any);

async function handleGetMessages(req: Request & { user?: any }, res: Response) {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success:false, error:'WhatsApp not connected', status: connectionState });
    }
    const { groupId } = req.params as { groupId: string };
    const limit = parseInt(req.query.limit as string) || 50;
    let msgs;
    try {
      msgs = await fetchMessagesFromWAWrapper(groupId, limit);
    } catch (e:any) {
      logger.error('WhatsApp service error:', e.message);
      return res.status(500).json({ success:false, error: `WhatsApp service error: ${JSON.stringify({ success:false, error: e.message })}` });
    }
    
    // Format messages with detailed information
    const formatted = msgs
      .map((m:any)=> {
        const ts = extractMessageTimestamp(m) || Math.floor(Date.now()/1000);
        const details = extractMessageDetails(m);
        
        if (!details) return null;
        
        return {
          id: details.id,
          from_user: getPreferredIdFromKey(m.key),
          fromMe: details.fromMe,
          messageType: details.messageType,
          content: details.content,
          caption: details.caption,
          timestamp: ts,
          date: ts ? new Date(ts*1000).toLocaleString() : new Date().toLocaleString(),
          quotedMessage: details.quotedMessage,
          mentionedJids: details.mentionedJids,
          isForwarded: details.isForwarded,
          isDeleted: details.isDeleted,
          mediaInfo: details.mediaInfo
        };
      })
      .filter((m:any)=>m !== null);
      
    const groupInfo = await sock.groupMetadata(groupId);
    // best-effort cache populate (mirrors cachedGroupMetadata logic)
    try {
      const ttl = Number(process.env.GROUP_METADATA_TTL_MS || 5*60*1000);
      const now = Date.now();
      try {
        if ((sock as any)?.redisClient && (sock as any)?.groupCacheIsRedis) {
          await (sock as any).redisClient.set(`group:${groupId}`, JSON.stringify(groupInfo), { EX: Math.max(1, Math.floor(ttl/1000)) });
        }
      } catch {}
      try {
        const sym = Symbol.for('wam.groupCache');
        const local = (global as any)[sym] || new Map<string, { data:any, expires:number }>();
        local.set(groupId, { data: groupInfo, expires: now + ttl });
        (global as any)[sym] = local;
      } catch {}
    } catch (err) { logger.warn('Failed to cache group metadata:', err && (err as any).message ? (err as any).message : err); }
    logger.info(`📱 ${req.user?.phone || 'API'} fetched ${formatted.length} messages from ${groupInfo?.subject || groupId}`);
    res.json({ 
      success:true, 
      count: formatted.length, 
      group_name: groupInfo.subject,
      group_id: groupId,
      messages: formatted 
    });
  } catch (error) {
    logger.error('Messages endpoint error:', error);
    res.status(500).json({ success:false, error: (error as Error).message });
  }
}

app.get('/api/messages/:groupId', requireAuthOrAPIKey, handleGetMessages as any);
// Clean alias for clients expecting /api/whatsapp/messages/:groupId
app.get('/api/whatsapp/messages/:groupId', requireAuthOrAPIKey, handleGetMessages as any);

// Expose status under /api/whatsapp/status as an alias to /api/status
app.get('/api/whatsapp/status', (req: Request, res: Response) => {
  res.json({ success:true, status: connectionState, phone: connectedPhone, timestamp: new Date().toISOString(), session_restored: sessionRestored, backup_available: !!sessionBackup, connection_attempts: connectionAttempts });
});

app.post('/api/send', requireAuth, async (req: Request & { user?: any }, res: Response) => { try { if (!sock || connectionState !== 'connected') return res.status(503).json({ success:false, error:'WhatsApp not connected' }); const { groupId, message } = req.body as { groupId?: string, message?: string }; if (!groupId || !message) return res.status(400).json({ success:false, error:'groupId and message required' }); await sock.sendMessage(groupId, { text: message }); logger.info(`✉️  ${req.user?.phone} sent message to ${groupId}`); res.json({ success:true, message:'Sent successfully' }); } catch (error) { logger.error('Send endpoint error:', error); res.status(500).json({ success:false, error: (error as Error).message }); } });

// ==================== ADVANCED MESSAGE ENDPOINTS ====================

// Send media message (image, video, audio, document)
app.post('/api/send-media', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, mediaUrl, mediaType, caption, fileName, mimetype } = req.body;
    
    if (!groupId || !mediaUrl || !mediaType) {
      return res.status(400).json({ success: false, error: 'groupId, mediaUrl, and mediaType required' });
    }

    let messageContent: any;
    const mediaBuffer = await fetch(mediaUrl).then(r => r.arrayBuffer()).then(b => Buffer.from(b));

    switch (mediaType) {
      case 'image':
        messageContent = { image: mediaBuffer, caption: caption || '' };
        break;
      case 'video':
        messageContent = { video: mediaBuffer, caption: caption || '' };
        break;
      case 'audio':
        messageContent = { audio: mediaBuffer, mimetype: mimetype || 'audio/mp4' };
        break;
      case 'document':
        messageContent = { document: mediaBuffer, fileName: fileName || 'file', mimetype: mimetype || 'application/pdf' };
        break;
      default:
        return res.status(400).json({ success: false, error: 'Invalid mediaType. Use: image, video, audio, document' });
    }

    const result = await sock.sendMessage(groupId, messageContent);
    logger.info(`📎 ${req.user?.phone || 'API'} sent ${mediaType} to ${groupId}`);
    res.json({ success: true, message: 'Media sent successfully', messageId: result.key.id });
  } catch (error: any) {
    logger.error('Send media error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send location
app.post('/api/send-location', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, latitude, longitude, name, address } = req.body;
    
    if (!groupId || !latitude || !longitude) {
      return res.status(400).json({ success: false, error: 'groupId, latitude, and longitude required' });
    }

    const result = await sock.sendMessage(groupId, {
      location: {
        degreesLatitude: parseFloat(latitude),
        degreesLongitude: parseFloat(longitude),
        name: name || '',
        address: address || ''
      }
    });

    logger.info(`📍 ${req.user?.phone || 'API'} sent location to ${groupId}`);
    res.json({ success: true, message: 'Location sent successfully', messageId: result.key.id });
  } catch (error: any) {
    logger.error('Send location error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send contact
app.post('/api/send-contact', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, displayName, vcard } = req.body;
    
    if (!groupId || !displayName || !vcard) {
      return res.status(400).json({ success: false, error: 'groupId, displayName, and vcard required' });
    }

    const result = await sock.sendMessage(groupId, {
      contacts: {
        displayName,
        contacts: [{ vcard }]
      }
    });

    logger.info(`👤 ${req.user?.phone || 'API'} sent contact to ${groupId}`);
    res.json({ success: true, message: 'Contact sent successfully', messageId: result.key.id });
  } catch (error: any) {
    logger.error('Send contact error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send poll
app.post('/api/send-poll', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, question, options, selectableCount } = req.body;
    
    if (!groupId || !question || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ success: false, error: 'groupId, question, and at least 2 options required' });
    }

    const result = await sock.sendMessage(groupId, {
      poll: {
        name: question,
        values: options,
        selectableCount: selectableCount || 1
      }
    });

    logger.info(`📊 ${req.user?.phone || 'API'} sent poll to ${groupId}`);
    res.json({ success: true, message: 'Poll sent successfully', messageId: result.key.id });
  } catch (error: any) {
    logger.error('Send poll error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reply to a message
app.post('/api/reply', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, messageId, replyText } = req.body;
    
    if (!groupId || !messageId || !replyText) {
      return res.status(400).json({ success: false, error: 'groupId, messageId, and replyText required' });
    }

    const result = await sock.sendMessage(groupId, {
      text: replyText
    }, {
      quoted: { key: { remoteJid: groupId, id: messageId } }
    });

    logger.info(`↩️  ${req.user?.phone || 'API'} replied to message in ${groupId}`);
    res.json({ success: true, message: 'Reply sent successfully', messageId: result.key.id });
  } catch (error: any) {
    logger.error('Reply error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// React to a message
app.post('/api/react', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, messageId, emoji } = req.body;
    
    if (!groupId || !messageId || !emoji) {
      return res.status(400).json({ success: false, error: 'groupId, messageId, and emoji required' });
    }

    const result = await sock.sendMessage(groupId, {
      react: {
        text: emoji,
        key: { remoteJid: groupId, id: messageId }
      }
    });

    logger.info(`👍 ${req.user?.phone || 'API'} reacted to message in ${groupId}`);
    res.json({ success: true, message: 'Reaction sent successfully' });
  } catch (error: any) {
    logger.error('React error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Edit a message
app.post('/api/edit-message', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, messageId, newText } = req.body;
    
    if (!groupId || !messageId || !newText) {
      return res.status(400).json({ success: false, error: 'groupId, messageId, and newText required' });
    }

    const result = await sock.sendMessage(groupId, {
      text: newText,
      edit: { remoteJid: groupId, id: messageId }
    });

    logger.info(`✏️  ${req.user?.phone || 'API'} edited message in ${groupId}`);
    res.json({ success: true, message: 'Message edited successfully' });
  } catch (error: any) {
    logger.error('Edit message error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a message for everyone
app.post('/api/delete-message', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, messageId } = req.body;
    
    if (!groupId || !messageId) {
      return res.status(400).json({ success: false, error: 'groupId and messageId required' });
    }

    await sock.sendMessage(groupId, { delete: { remoteJid: groupId, id: messageId } });

    logger.info(`🗑️  ${req.user?.phone || 'API'} deleted message in ${groupId}`);
    res.json({ success: true, message: 'Message deleted successfully' });
  } catch (error: any) {
    logger.error('Delete message error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== GROUP MANAGEMENT ENDPOINTS ====================

// Create a group
app.post('/api/group/create', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { name, participants } = req.body;
    
    if (!name || !Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ success: false, error: 'name and participants array required' });
    }

    const result = await sock.groupCreate(name, participants);
    logger.info(`👥 ${req.user?.phone || 'API'} created group: ${name}`);
    res.json({ success: true, message: 'Group created successfully', groupId: result.id, participants: result.participants });
  } catch (error: any) {
    logger.error('Create group error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update group subject/name
app.post('/api/group/update-subject', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, subject } = req.body;
    
    if (!groupId || !subject) {
      return res.status(400).json({ success: false, error: 'groupId and subject required' });
    }

    await sock.groupUpdateSubject(groupId, subject);
    logger.info(`✏️  ${req.user?.phone || 'API'} updated group subject: ${groupId}`);
    res.json({ success: true, message: 'Group subject updated successfully' });
  } catch (error: any) {
    logger.error('Update group subject error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update group description
app.post('/api/group/update-description', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, description } = req.body;
    
    if (!groupId || description === undefined) {
      return res.status(400).json({ success: false, error: 'groupId and description required' });
    }

    await sock.groupUpdateDescription(groupId, description);
    logger.info(`📝 ${req.user?.phone || 'API'} updated group description: ${groupId}`);
    res.json({ success: true, message: 'Group description updated successfully' });
  } catch (error: any) {
    logger.error('Update group description error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add participants to group
app.post('/api/group/add-participants', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, participants } = req.body;
    
    if (!groupId || !Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ success: false, error: 'groupId and participants array required' });
    }

    const result = await sock.groupParticipantsUpdate(groupId, participants, 'add');
    logger.info(`➕ ${req.user?.phone || 'API'} added participants to ${groupId}`);
    res.json({ success: true, message: 'Participants added successfully', result });
  } catch (error: any) {
    logger.error('Add participants error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove participants from group
app.post('/api/group/remove-participants', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, participants } = req.body;
    
    if (!groupId || !Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ success: false, error: 'groupId and participants array required' });
    }

    const result = await sock.groupParticipantsUpdate(groupId, participants, 'remove');
    logger.info(`➖ ${req.user?.phone || 'API'} removed participants from ${groupId}`);
    res.json({ success: true, message: 'Participants removed successfully', result });
  } catch (error: any) {
    logger.error('Remove participants error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Promote participants to admin
app.post('/api/group/promote', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, participants } = req.body;
    
    if (!groupId || !Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ success: false, error: 'groupId and participants array required' });
    }

    const result = await sock.groupParticipantsUpdate(groupId, participants, 'promote');
    logger.info(`⬆️  ${req.user?.phone || 'API'} promoted participants in ${groupId}`);
    res.json({ success: true, message: 'Participants promoted successfully', result });
  } catch (error: any) {
    logger.error('Promote participants error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Demote participants from admin
app.post('/api/group/demote', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, participants } = req.body;
    
    if (!groupId || !Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ success: false, error: 'groupId and participants array required' });
    }

    const result = await sock.groupParticipantsUpdate(groupId, participants, 'demote');
    logger.info(`⬇️  ${req.user?.phone || 'API'} demoted participants in ${groupId}`);
    res.json({ success: true, message: 'Participants demoted successfully', result });
  } catch (error: any) {
    logger.error('Demote participants error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update group settings (announce, locked)
app.post('/api/group/update-settings', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, announce, locked } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ success: false, error: 'groupId required' });
    }

    if (announce !== undefined) {
      await sock.groupSettingUpdate(groupId, announce ? 'announcement' : 'not_announcement');
    }
    if (locked !== undefined) {
      await sock.groupSettingUpdate(groupId, locked ? 'locked' : 'unlocked');
    }

    logger.info(`⚙️  ${req.user?.phone || 'API'} updated settings for ${groupId}`);
    res.json({ success: true, message: 'Group settings updated successfully' });
  } catch (error: any) {
    logger.error('Update group settings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Leave group
app.post('/api/group/leave', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ success: false, error: 'groupId required' });
    }

    await sock.groupLeave(groupId);
    logger.info(`🚪 ${req.user?.phone || 'API'} left group ${groupId}`);
    res.json({ success: true, message: 'Left group successfully' });
  } catch (error: any) {
    logger.error('Leave group error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get group invite code
app.get('/api/group/:groupId/invite-code', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId } = req.params;
    
    const code = await sock.groupInviteCode(groupId);
    logger.info(`🔗 ${req.user?.phone || 'API'} retrieved invite code for ${groupId}`);
    res.json({ success: true, inviteCode: code, inviteLink: `https://chat.whatsapp.com/${code}` });
  } catch (error: any) {
    logger.error('Get invite code error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Revoke group invite code
app.post('/api/group/revoke-invite', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ success: false, error: 'groupId required' });
    }

    const newCode = await sock.groupRevokeInvite(groupId);
    logger.info(`🔄 ${req.user?.phone || 'API'} revoked invite code for ${groupId}`);
    res.json({ success: true, message: 'Invite code revoked', newInviteCode: newCode });
  } catch (error: any) {
    logger.error('Revoke invite error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Accept group invite
app.post('/api/group/accept-invite', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { inviteCode } = req.body;
    
    if (!inviteCode) {
      return res.status(400).json({ success: false, error: 'inviteCode required' });
    }

    const result = await sock.groupAcceptInvite(inviteCode);
    logger.info(`✅ ${req.user?.phone || 'API'} accepted group invite`);
    res.json({ success: true, message: 'Group invite accepted', groupId: result });
  } catch (error: any) {
    logger.error('Accept invite error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CHAT MANAGEMENT ENDPOINTS ====================

// Mark messages as read
app.post('/api/chat/read', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, messageIds } = req.body;
    
    if (!groupId || !Array.isArray(messageIds)) {
      return res.status(400).json({ success: false, error: 'groupId and messageIds array required' });
    }

    const keys = messageIds.map(id => ({ remoteJid: groupId, id, fromMe: false }));
    await sock.readMessages(keys);
    
    logger.info(`✓ ${req.user?.phone || 'API'} marked ${messageIds.length} messages as read in ${groupId}`);
    res.json({ success: true, message: 'Messages marked as read' });
  } catch (error: any) {
    logger.error('Read messages error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Archive/unarchive chat
app.post('/api/chat/archive', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, archive } = req.body;
    
    if (!groupId || archive === undefined) {
      return res.status(400).json({ success: false, error: 'groupId and archive (boolean) required' });
    }

    await sock.chatModify({ archive }, groupId);
    logger.info(`📦 ${req.user?.phone || 'API'} ${archive ? 'archived' : 'unarchived'} chat ${groupId}`);
    res.json({ success: true, message: `Chat ${archive ? 'archived' : 'unarchived'} successfully` });
  } catch (error: any) {
    logger.error('Archive chat error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Pin/unpin chat
app.post('/api/chat/pin', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, pin } = req.body;
    
    if (!groupId || pin === undefined) {
      return res.status(400).json({ success: false, error: 'groupId and pin (boolean) required' });
    }

    await sock.chatModify({ pin }, groupId);
    logger.info(`📌 ${req.user?.phone || 'API'} ${pin ? 'pinned' : 'unpinned'} chat ${groupId}`);
    res.json({ success: true, message: `Chat ${pin ? 'pinned' : 'unpinned'} successfully` });
  } catch (error: any) {
    logger.error('Pin chat error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mute/unmute chat
app.post('/api/chat/mute', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, mute, duration } = req.body;
    
    if (!groupId || mute === undefined) {
      return res.status(400).json({ success: false, error: 'groupId and mute (boolean) required' });
    }

    const muteEndTime = mute ? (duration || 8 * 60 * 60) : null; // Default 8 hours or null for unmute
    await sock.chatModify({ mute: muteEndTime }, groupId);
    
    logger.info(`🔇 ${req.user?.phone || 'API'} ${mute ? 'muted' : 'unmuted'} chat ${groupId}`);
    res.json({ success: true, message: `Chat ${mute ? 'muted' : 'unmuted'} successfully` });
  } catch (error: any) {
    logger.error('Mute chat error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete chat
app.post('/api/chat/delete', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ success: false, error: 'groupId required' });
    }

    await sock.chatModify({ clear: { messages: [{ id: '', fromMe: true, timestamp: Date.now() }] } }, groupId);
    logger.info(`🗑️  ${req.user?.phone || 'API'} deleted chat ${groupId}`);
    res.json({ success: true, message: 'Chat deleted successfully' });
  } catch (error: any) {
    logger.error('Delete chat error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== USER/PROFILE ENDPOINTS ====================

// Get profile picture
app.get('/api/profile-picture/:jid', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { jid } = req.params;
    
    const url = await sock.profilePictureUrl(jid, 'image');
    logger.info(`🖼️  ${req.user?.phone || 'API'} fetched profile picture for ${jid}`);
    res.json({ success: true, profilePictureUrl: url });
  } catch (error: any) {
    logger.error('Get profile picture error:', error);
    res.status(404).json({ success: false, error: 'Profile picture not available' });
  }
});

// Update profile name
app.post('/api/profile/update-name', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'name required' });
    }

    await sock.updateProfileName(name);
    logger.info(`✏️  ${req.user?.phone || 'API'} updated profile name`);
    res.json({ success: true, message: 'Profile name updated successfully' });
  } catch (error: any) {
    logger.error('Update profile name error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update profile status
app.post('/api/profile/update-status', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ success: false, error: 'status required' });
    }

    await sock.updateProfileStatus(status);
    logger.info(`💬 ${req.user?.phone || 'API'} updated profile status`);
    res.json({ success: true, message: 'Profile status updated successfully' });
  } catch (error: any) {
    logger.error('Update profile status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user status
app.get('/api/user/:jid/status', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { jid } = req.params;
    
    const status = await sock.fetchStatus(jid);
    logger.info(`📋 ${req.user?.phone || 'API'} fetched status for ${jid}`);
    res.json({ success: true, status: status?.status, setAt: status?.setAt });
  } catch (error: any) {
    logger.error('Get user status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check if JID exists on WhatsApp
app.get('/api/user/:jid/exists', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { jid } = req.params;
    
    const [result] = await sock.onWhatsApp(jid);
    logger.info(`🔍 ${req.user?.phone || 'API'} checked if ${jid} exists`);
    res.json({ success: true, exists: !!result?.exists, jid: result?.jid });
  } catch (error: any) {
    logger.error('Check user exists error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== PRESENCE ENDPOINTS ====================

// Update presence
app.post('/api/presence/update', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId, type } = req.body;
    
    if (!groupId || !type) {
      return res.status(400).json({ success: false, error: 'groupId and type required (available, unavailable, composing, recording, paused)' });
    }

    await sock.sendPresenceUpdate(type, groupId);
    logger.info(`👁️  ${req.user?.phone || 'API'} updated presence to ${type} in ${groupId}`);
    res.json({ success: true, message: 'Presence updated successfully' });
  } catch (error: any) {
    logger.error('Update presence error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Subscribe to presence updates
app.post('/api/presence/subscribe', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { groupId } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ success: false, error: 'groupId required' });
    }

    await sock.presenceSubscribe(groupId);
    logger.info(`🔔 ${req.user?.phone || 'API'} subscribed to presence for ${groupId}`);
    res.json({ success: true, message: 'Subscribed to presence updates' });
  } catch (error: any) {
    logger.error('Subscribe presence error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== UTILITY ENDPOINTS ====================

// Download media from message
app.post('/api/download-media', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { messageKey } = req.body;
    
    if (!messageKey) {
      return res.status(400).json({ success: false, error: 'messageKey required' });
    }

    // This would require the actual message object - simplified for API
    logger.info(`⬇️  ${req.user?.phone || 'API'} requested media download`);
    res.json({ success: true, message: 'Media download initiated', note: 'Implement media buffer handling as needed' });
  } catch (error: any) {
    logger.error('Download media error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get business profile
app.get('/api/business/:jid/profile', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { jid } = req.params;
    
    const profile = await sock.getBusinessProfile(jid);
    logger.info(`🏢 ${req.user?.phone || 'API'} fetched business profile for ${jid}`);
    res.json({ success: true, businessProfile: profile });
  } catch (error: any) {
    logger.error('Get business profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Block/unblock user
app.post('/api/user/block', requireAuthOrAPIKey, async (req: Request & { user?: any }, res: Response) => {
  try {
    if (!sock || connectionState !== 'connected') {
      return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    }
    const { jid, block } = req.body;
    
    if (!jid || block === undefined) {
      return res.status(400).json({ success: false, error: 'jid and block (boolean) required' });
    }

    await sock.updateBlockStatus(jid, block ? 'block' : 'unblock');
    logger.info(`🚫 ${req.user?.phone || 'API'} ${block ? 'blocked' : 'unblocked'} ${jid}`);
    res.json({ success: true, message: `User ${block ? 'blocked' : 'unblocked'} successfully` });
  } catch (error: any) {
    logger.error('Block user error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/health', (req: Request, res: Response) => { res.json({ status:'healthy', whatsapp_status: connectionState, connected: connectionState === 'connected', session_saved: hasExistingSession(), backup_available: !!sessionBackup, active_user_sessions: sessionTokens.size, uptime_seconds: Math.floor(process.uptime()) }); });

// Load backup on startup
loadBackupFromDisk();

function ensurePublicFavicon(){ try { const publicDir = path.join(__dirname, 'public'); if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true }); const icoPath = path.join(publicDir,'favicon.ico'); const svgPath = path.join(publicDir,'favicon.svg'); const faviconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII='; if (!fs.existsSync(icoPath)) fs.writeFileSync(icoPath, Buffer.from(faviconBase64, 'base64')); const svgContent = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n  <circle cx="12" cy="12" r="12" fill="#25D366"/>\n  <path d=\"M7 12l3 3 8-8\" stroke=\"#fff\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n</svg>`; if (!fs.existsSync(svgPath)) fs.writeFileSync(svgPath, svgContent, 'utf8'); } catch (err) { logger.warn('Could not create public favicon files:', (err as any).message); } }
ensurePublicFavicon();

app.get('/login', (req: Request, res: Response) => {
  try {
  // Full login page (copied from root/server.js) — QR or Phone OTP
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
  res.status(500).json({ success:false, error: 'Failed to render login page' });
  }
});

app.get('/api/qr', async (req: Request, res: Response) => { try { const qr = qrCodeData ? await QRCode.toDataURL(qrCodeData) : null; return res.json({ success:true, connected: connectionState === 'connected', connectionState, phone: connectedPhone, qr }); } catch (err) { logger.error('API QR error:', err); return res.status(500).json({ success:false, error:'Failed to generate QR' }); } });

// Request a pairing code as a fallback when QR linking fails
// Protect with API key when configured; otherwise accessible for admin setup
app.get('/api/pairing-code', authenticateAPIKey, async (req: Request, res: Response) => {
  try {
    if (!sock) return res.status(503).json({ success:false, error:'WhatsApp socket not initialized' });
    // Accept phone via query (?phone=+123...) or env var as a convenience for admins
    const phone = (req.query.phone as string) || process.env.ADMIN_PHONE;
    if (!phone || !/^\+\d{6,15}$/.test(phone)) {
      return res.status(400).json({ success:false, error:'Provide phone in international format e.g. +201155547529 via ?phone= or set ADMIN_PHONE env' });
    }
    // Baileys supports requesting a pairing code when creds are not registered yet
    const isRegistered = !!(sock?.authState?.creds?.registered);
    if (isRegistered) return res.status(400).json({ success:false, error:'Instance already registered. Reset session to re-pair.' });
    const code = await sock.requestPairingCode(phone);
    logger.info(`🔐 Pairing code generated for ${phone}: ${code}`);
    return res.json({ success:true, phone, code });
  } catch (err:any) {
    logger.error('Pairing code error:', err?.message || err);
    return res.status(500).json({ success:false, error: err?.message || 'Failed to generate pairing code' });
  }
});

// Admin-safe reset to clear session and trigger a fresh connect & QR
app.post('/api/session/reset', authenticateAPIKey, async (req: Request, res: Response) => {
  try {
    logger.warn('🔄 Admin requested session reset');
    try {
      if (sock) {
        try { if (typeof sock.logout === 'function') await sock.logout(); } catch {}
        try { if (typeof sock.end === 'function') sock.end(); } catch {}
      }
    } catch {}
    // Clear auth files and backup
    try { if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive:true, force:true }); } catch {}
    clearSessionBackup();
    qrCodeData = null;
    connectedPhone = null;
    connectionState = 'disconnected';
    connectionAttempts = 0;
    ensureAuthDir();
    // Reconnect in the background
    setTimeout(() => connectWhatsApp(), 250);
    return res.json({ success:true, message:'Session reset. Reconnecting and generating a fresh QR...', status: 'reconnecting' });
  } catch (err:any) {
    logger.error('Session reset error:', err?.message || err);
    return res.status(500).json({ success:false, error: err?.message || 'Failed to reset session' });
  }
});

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
