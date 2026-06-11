// ═══════════════════════════════════════════════════════════════════════════
// DeltaAI WhatsApp Bot v3.1 — Main Entry Point
// ═══════════════════════════════════════════════════════════════════════════
// Supports TWO connection methods:
// 1. PAIRING CODE (preferred): Set PHONE_NUMBER in .env → no QR scan needed!
// 2. QR CODE (fallback): Scan QR from another device's browser
// ═══════════════════════════════════════════════════════════════════════════

import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import { existsSync, mkdirSync } from 'fs';

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

// ─── Main Function ───────────────────────────────────────────────────────

async function startBot() {
  if (isStarting) return;
  isStarting = true;

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  DeltaAI WhatsApp Bot v3.1');
  console.log('  100% Free — Uses WhatsApp Web Protocol (Baileys)');
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

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,   // Show QR in terminal too
      logger: logger.child({ stream: 'wa-socket' }),
      browser: ['DeltaAI Bot', 'Chrome', '1.0.0'],
      markOnlineOnConnect: true,
      retryRequestDelayMs: 500,
      maxMsgRetryCount: 2,
      connectTimeoutMs: 30_000,
      keepAliveIntervalMs: 30_000,
      defaultQueryTimeoutMs: 60_000,
      shouldIgnoreJid: (jid) => {
        return jid?.includes('@broadcast') || jid?.includes('@newsletter');
      },
    });

    // ── Step 3: Set up event handlers ───────────────────────────────────
    console.log('[3/3] Setting up event handlers...');

    // Request pairing code IMMEDIATELY after socket creation for new auth
    if (isNewAuth && config.PHONE_NUMBER) {
      console.log('\n[Pairing] Requesting pairing code for: ' + config.PHONE_NUMBER);
      try {
        const code = await sock.requestPairingCode(config.PHONE_NUMBER);
        const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  كود الربط: ' + formattedCode);
        console.log('║');
        console.log('║  افتح واتساب:');
        console.log('║  الإعدادات > الأجهزة المرتبطة > ربط جهاز');
        console.log('║  > ربط برقم الهاتف > اكتب الكود');
        console.log('╚════════════════════════════════════════════════════════════╝\n');
        setPairingCode(formattedCode);
      } catch (err) {
        console.error('[Pairing] Failed to request pairing code:', err.message);
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
        const botNumber = sock.user?.id?.split('@')[0] || 'unknown';

        updateBotState({
          isConnected: true,
          botNumber,
          qrCodeDataUrl: null,
          pairingCode: null,
        });

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  البوت متصل! رقم الواتساب: ' + botNumber);
        console.log('  DeltaAI Server: ' + config.DELTA_AI_URL);
        console.log('  جاهز لاستقبال الرسائل!');
        console.log('═══════════════════════════════════════════════════════════════\n');

        try {
          await sock.updateProfileStatus('DeltaAI Bot — اكتب أي حاجة وأنا هرد!');
        } catch (e) {}
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

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('Session logged out. Will try to re-pair.');
        }

        console.log('Reconnecting in 5 seconds...');
        setTimeout(() => startBot(), 5000);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (msg.key && !msg.key.fromMe) {
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
    console.error('[2/3] Failed to connect to WhatsApp:', error.message);
    console.log('Retrying in 15 seconds...');
    setTimeout(() => startBot(), 15000);
  }
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────

function gracefulShutdown(signal) {
  console.log('\n[' + signal + '] Shutting down gracefully...');
  if (sock) {
    try { sock.end(new Error('Shutdown requested')); } catch(e) {}
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ─── Error Handling ──────────────────────────────────────────────────────

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught exception:', error.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[WARN] Unhandled rejection:', reason);
});

// ─── Start! ──────────────────────────────────────────────────────────────

startBot().catch((error) => {
  console.error('[FATAL] Failed to start bot:', error.message);
});
