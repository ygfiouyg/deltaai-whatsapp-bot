// ═══════════════════════════════════════════════════════════════════════════
// DeltaAI WhatsApp Bot v3 — Main Entry Point
// ═══════════════════════════════════════════════════════════════════════════
// 1. Starts a web server for status display
// 2. Connects to WhatsApp via Baileys using PAIRING CODE (no QR scan needed!)
// 3. Shows pairing code on terminal + web page
// 4. Routes incoming messages to DeltaAI AI pipeline
//
// PAIRING CODE METHOD:
// - User enters a code like "ABCD-EFGH" in WhatsApp (Settings > Linked Devices)
// - No need to scan QR code! Perfect for phone-only users!
// - Set PHONE_NUMBER env var with your WhatsApp number (with country code)
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
let pairingCodeRequested = false;

// ─── Main Function ───────────────────────────────────────────────────────

async function startBot() {
  if (isStarting) return;
  isStarting = true;

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  DeltaAI WhatsApp Bot v3');
  console.log('  مع كود ربط — مش محتاج تمسح QR!');
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
      printQRInTerminal: false,
      logger: logger.child({ stream: 'wa-socket' }),
      browser: ['DeltaAI Bot', 'Chrome', '1.0.0'],
      markOnlineOnConnect: true,
      retryRequestDelayMs: 500,
      maxMsgRetryCount: 2,
      connectTimeoutMs: 30_000,
      keepAliveIntervalMs: 30_000,
      defaultQueryTimeoutMs: 60_000,
      mobile: false, // Important: use pairing code method, not mobile
      shouldIgnoreJid: (jid) => {
        return jid?.includes('@broadcast') || jid?.includes('@newsletter');
      },
    });

    // ── Step 3: Set up event handlers ───────────────────────────────────
    console.log('[3/3] Setting up event handlers...');

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Handle QR code (fallback — used if no pairing code)
      if (qr) {
        console.log('\nQR code generated (fallback method)');
        try {
          await setQRCode(qr);
        } catch (e) {
          console.error('[Web] Failed to update QR:', e.message);
        }

        // If we have a phone number and haven't requested pairing code yet,
        // request it instead of using QR
        if (config.PHONE_NUMBER && !pairingCodeRequested) {
          pairingCodeRequested = true;
          try {
            const code = await sock.requestPairingCode(config.PHONE_NUMBER);
            const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
            console.log('\n═══════════════════════════════════════════════════════════════');
            console.log(`  كود الربط: ${formattedCode}`);
            console.log('  افتح واتساب > الإعدادات > الأجهزة المرتبطة > ربط برقم الهاتف');
            console.log('  واكتب الكود ده!');
            console.log('═══════════════════════════════════════════════════════════════\n');
            setPairingCode(formattedCode);
          } catch (err) {
            console.error('[Pairing] Failed to request pairing code:', err.message);
            console.log('[Pairing] Falling back to QR code method');
          }
        }
      }

      if (connection === 'open') {
        isStarting = false;
        pairingCodeRequested = false;
        const botNumber = sock.user?.id?.split('@')[0] || 'unknown';

        updateBotState({
          isConnected: true,
          botNumber,
          qrCodeDataUrl: null,
          pairingCode: null,
        });

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log(`  البوت متصل! رقم الواتساب: ${botNumber}`);
        console.log(`  DeltaAI Server: ${config.DELTA_AI_URL}`);
        console.log('  جاهز لاستقبال الرسائل!');
        console.log('═══════════════════════════════════════════════════════════════\n');

        try {
          await sock.updateProfileStatus('DeltaAI Bot — اكتب أي حاجة وأنا هرد!');
        } catch (e) {}
      }

      if (connection === 'close') {
        isStarting = false;
        pairingCodeRequested = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;

        updateBotState({
          isConnected: false,
          botNumber: null,
          pairingCode: null,
        });

        console.log(`\nDisconnected — reason: ${statusCode}`);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('Session logged out. Need to re-pair.');
        }

        const delay = 5000;
        console.log(`Reconnecting in ${delay/1000} seconds...`);
        setTimeout(() => startBot(), delay);
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

    if (isNewAuth && config.PHONE_NUMBER) {
      console.log('\nاول مرة — هنستخدم كود الربط (مش محتاج تمسح QR)');
    } else if (isNewAuth) {
      console.log('\nاول مرة — لو عايز تستخدم كود ربط بدل QR:');
      console.log('اضف PHONE_NUMBER في ملف .env (مثال: PHONE_NUMBER=201234567890)');
    } else {
      console.log('\nالجلسة محفوظة — البوت هيكمل تلقائي!');
    }

    const stats = conversationManager.getStats();
    updateBotState({ userCount: stats.totalUsers, messageCount: stats.totalMessages });

  } catch (error) {
    isStarting = false;
    pairingCodeRequested = false;
    console.error('[2/3] Failed to connect to WhatsApp:', error.message);
    console.log('Retrying in 15 seconds...');
    setTimeout(() => startBot(), 15000);
  }
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────

function gracefulShutdown(signal) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
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
