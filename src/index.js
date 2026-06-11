// ═══════════════════════════════════════════════════════════════════════════
// DeltaAI WhatsApp Bot v4.0 — Anti-Ban Edition
// ═══════════════════════════════════════════════════════════════════════════
// KEY CHANGES FROM v3:
// - Human-like response delays (3-12s random)
// - Realistic typing indicators with variable duration
// - Hourly message cap to prevent spam detection
// - Better browser fingerprint (Android Chrome)
// - No auto-read messages (bots read instantly, humans don't)
// - Presence updates that mimic real usage patterns
// - Longer reconnect delays to look natural
// ═══════════════════════════════════════════════════════════════════════════

import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import { existsSync, mkdirSync, rmSync } from 'fs';

import config from './lib/config.js';
import { handleMessage } from './handlers/message-handler.js';
import { startWebServer, setQRCode, setPairingCode, updateBotState } from './lib/web-server.js';
import conversationManager from './lib/conversation-manager.js';

// ─── Logger Setup ────────────────────────────────────────────────────────
const logger = pino({ level: config.LOG_LEVEL });

// ─── Global State ────────────────────────────────────────────────────────
let sock = null;
let isStarting = false;
let webServerStarted = false;
let reconnectCount = 0;
let lastConnectionTime = null;
let messageCountThisHour = 0;
let messageCountResetTime = Date.now();

// ─── Anti-Ban: Hourly message cap ──────────────────────────────────────
const MAX_MESSAGES_PER_HOUR = 30; // WhatsApp flags accounts sending 100+ msgs/hour

export function canSendMessage() {
  const now = Date.now();
  // Reset counter every hour
  if (now - messageCountResetTime > 60 * 60 * 1000) {
    messageCountThisHour = 0;
    messageCountResetTime = now;
  }
  return messageCountThisHour < MAX_MESSAGES_PER_HOUR;
}

export function incrementMessageCount() {
  messageCountThisHour++;
}

// ─── Clean Auth Data ─────────────────────────────────────────────────────
function cleanAuth() {
  try {
    if (existsSync(config.AUTH_DIR)) {
      rmSync(config.AUTH_DIR, { recursive: true, force: true });
      console.log('[Auth] Cleaned old session data');
    }
  } catch (e) {
    console.error('[Auth] Failed to clean auth:', e.message);
  }
}

// ─── Human-like random delay ────────────────────────────────────────────
export function humanDelay(minMs = 2000, maxMs = 8000) {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return Math.round(delay);
}

// ─── Main Function ───────────────────────────────────────────────────────

async function startBot() {
  if (isStarting) return;
  isStarting = true;

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  DeltaAI WhatsApp Bot v4.0 — Anti-Ban Edition');
  console.log('  Human-like behavior • Rate limited • Stealth mode');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── Step 1: Start Web Server (only once!) ─────────────────────────
  if (!webServerStarted) {
    console.log('[1/3] Starting web server...');
    try {
      await startWebServer();
      webServerStarted = true;
      console.log('[1/3] Web server started on port ' + config.WEB_PORT);
    } catch (err) {
      if (err.code === 'EADDRINUSE') {
        console.log('[1/3] Web server already running on port ' + config.WEB_PORT);
        webServerStarted = true;
      } else {
        console.error('[1/3] Failed to start web server:', err.message);
      }
    }
  } else {
    console.log('[1/3] Web server already started');
  }

  // ── Step 2: Initialize WhatsApp Connection ──────────────────────────
  console.log('[2/3] Connecting to WhatsApp...');

  try {
    if (!existsSync(config.AUTH_DIR)) {
      mkdirSync(config.AUTH_DIR, { recursive: true });
    }

    const { version } = await fetchLatestBaileysVersion();
    console.log(`[2/3] WhatsApp Web version: ${version.join('.')}`);

    const { state, saveCreds } = await useMultiFileAuthState(config.AUTH_DIR);
    const isNewAuth = !state.creds?.registered;

    // ── CRITICAL: Browser fingerprint that matches real usage ──
    // Android Chrome is the most common WhatsApp Web client
    // This is what a real Samsung/Android user looks like
    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      logger: logger.child({ stream: 'wa-socket' }),
      // Real Android Chrome fingerprint — most people link from Android
      browser: ['Android', 'Chrome', '131.0.6778.200'],
      // DON'T mark online on connect — bots do this, humans don't
      markOnlineOnConnect: false,
      retryRequestDelayMs: 3000,
      maxMsgRetryCount: 2,
      connectTimeoutMs: 60_000,
      // Keep alive but not too aggressive
      keepAliveIntervalMs: 25_000,
      defaultQueryTimeoutMs: 60_000,
      // Don't fire events for own messages
      emitOwnEvents: false,
      // Ignore broadcasts and newsletters
      shouldIgnoreJid: (jid) => {
        return jid?.includes('@broadcast') || jid?.includes('@newsletter');
      },
      // Sync only recent history, not everything
      syncFullHistory: false,
      // Message query limit — don't download too much
      messageCacheSize: 100,
    });

    // ── Step 3: Set up event handlers ───────────────────────────────────
    console.log('[3/3] Setting up event handlers...');

    // Request pairing code right away for new auth
    if (isNewAuth && config.PHONE_NUMBER) {
      console.log('[Pairing] Requesting pairing code for: ' + config.PHONE_NUMBER);
      // Wait a moment for socket to be ready
      await new Promise(r => setTimeout(r, 3000));
      try {
        const code = await sock.requestPairingCode(config.PHONE_NUMBER);
        const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  كود الربط: ' + formattedCode);
        console.log('║');
        console.log('║  واتساب > إعدادات > أجهزة مرتبطة > ربط جهاز');
        console.log('║  > ربط برقم الهاتف > اكتب الكود');
        console.log('╚════════════════════════════════════════════════════════════╝\n');
        setPairingCode(formattedCode);
      } catch (err) {
        console.error('[Pairing] Failed:', err.message);
        console.log('[Pairing] Will use QR code method instead');
      }
    } else if (isNewAuth) {
      console.log('\nلا يوجد رقم هاتف — هنستخدم طريقة مسح QR');
      console.log('افتح المتصفح على: http://192.168.1.7:' + config.WEB_PORT + '\n');
    }

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Handle QR code
      if (qr) {
        try {
          await setQRCode(qr);
        } catch (e) {
          console.error('[Web] Failed to update QR:', e.message);
        }
      }

      if (connection === 'open') {
        isStarting = false;
        reconnectCount = 0;
        lastConnectionTime = Date.now();
        const botNumber = sock.user?.id?.split('@')[0] || 'unknown';

        updateBotState({
          isConnected: true,
          botNumber,
          qrCodeDataUrl: null,
          pairingCode: null,
        });

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  البوت متصل! رقم الواتساب: ' + botNumber);
        console.log('  جاهز لاستقبال الرسائل!');
        console.log('  الحد الأقصى: ' + MAX_MESSAGES_PER_HOUR + ' رسالة/ساعة');
        console.log('═══════════════════════════════════════════════════════════════\n');

        // ── Anti-ban: DON'T update profile at all ──
        // No profile status, no name change, nothing
      }

      if (connection === 'close') {
        isStarting = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;

        updateBotState({
          isConnected: false,
          botNumber: null,
          pairingCode: null,
        });

        console.log('\nDisconnected — reason: ' + statusCode);

        // If 401 (logged out), clean auth and re-pair
        if (statusCode === DisconnectReason.loggedOut) {
          console.log('[Auth] Session logged out — cleaning auth data and re-pairing...');
          cleanAuth();
          reconnectCount = 0;
        }

        // ── Anti-ban: Progressive reconnect with MINIMUM 10s delay ──
        // Quick reconnections look bot-like
        reconnectCount++;
        const minDelay = 10000; // At LEAST 10 seconds
        const progressiveDelay = reconnectCount * 5000; // 5s more each attempt
        const delay = Math.max(minDelay, Math.min(progressiveDelay, 120000)); // Cap at 2 min
        console.log('Reconnecting in ' + (delay/1000) + ' seconds... (attempt ' + reconnectCount + ')');
        setTimeout(() => startBot(), delay);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        // Only process messages from others, not from bot itself
        if (msg.key && !msg.key.fromMe) {
          // Don't process messages that are too old (5+ minutes)
          const msgTimestamp = msg.messageTimestamp;
          if (msgTimestamp && (Date.now() / 1000 - msgTimestamp) > 300) {
            continue; // Skip old messages
          }
          try {
            await handleMessage(sock, msg);
          } catch (error) {
            console.error('[WhatsApp] Error handling message:', error);
          }
        }
      }
    });

    console.log('[3/3] Event handlers ready');

    const stats = conversationManager.getStats();
    updateBotState({ userCount: stats.totalUsers, messageCount: stats.totalMessages });

  } catch (error) {
    isStarting = false;
    console.error('[2/3] Failed to connect:', error.message);
    
    // If it's a connection failure, clean auth
    if (error.message?.includes('Connection Failure') || error.message?.includes('401')) {
      console.log('[Auth] Connection failure — cleaning auth data...');
      cleanAuth();
    }

    reconnectCount++;
    const delay = Math.max(10000, Math.min(reconnectCount * 5000, 120000));
    console.log('Retrying in ' + (delay/1000) + ' seconds...');
    setTimeout(() => startBot(), delay);
  }
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────

function gracefulShutdown(signal) {
  console.log('\n[' + signal + '] Shutting down...');
  if (sock) {
    try { sock.end(new Error('Shutdown')); } catch(e) {}
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught:', error.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[WARN] Rejection:', reason);
});

// ─── Start! ──────────────────────────────────────────────────────────────

startBot().catch((error) => {
  console.error('[FATAL] Failed to start:', error.message);
});
