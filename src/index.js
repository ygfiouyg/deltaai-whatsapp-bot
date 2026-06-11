// ═══════════════════════════════════════════════════════════════════════════
// DeltaAI WhatsApp Bot v2 — Main Entry Point
// ═══════════════════════════════════════════════════════════════════════════
// 1. Starts a web server on port 7860 (HuggingFace Spaces requirement)
// 2. Connects to WhatsApp via Baileys (free forever!)
// 3. Shows QR code on web page (accessible from phone!)
// 4. Routes incoming messages to DeltaAI AI pipeline
// ═══════════════════════════════════════════════════════════════════════════

import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { existsSync, mkdirSync } from 'fs';

import config from './lib/config.js';
import { handleMessage } from './handlers/message-handler.js';
import { startWebServer, setQRCode, updateBotState } from './lib/web-server.js';
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
  console.log('  🤖 DeltaAI WhatsApp Bot v2');
  console.log('  🌐 مع سيرفر ويب لعرض كود QR من الموبايل');
  console.log('  🆓 100% Free — Uses WhatsApp Web Protocol (Baileys)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── Step 1: Start Web Server (only once!) ─────────────────────────
  if (!webServerStarted) {
    console.log('[1/3] Starting web server...');
    try {
      await startWebServer();
      webServerStarted = true;
      console.log('[1/3] ✅ Web server started on port ' + config.WEB_PORT);
    } catch (err) {
      if (err.code === 'EADDRINUSE') {
        console.log('[1/3] ✅ Web server already running on port ' + config.WEB_PORT);
        webServerStarted = true;
      } else {
        console.error('[1/3] ❌ Failed to start web server:', err.message);
      }
    }
  } else {
    console.log('[1/3] ✅ Web server already started');
  }

  // ── Step 2: Initialize WhatsApp Connection ──────────────────────────
  console.log('[2/3] Connecting to WhatsApp...');

  try {
    if (!existsSync(config.AUTH_DIR)) {
      mkdirSync(config.AUTH_DIR, { recursive: true });
    }

    const { version } = await fetchLatestBaileysVersion();
    console.log(`[2/3] 📱 WhatsApp Web version: ${version.join('.')}`);

    const { state, saveCreds } = await useMultiFileAuthState(config.AUTH_DIR);

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: logger.child({ stream: 'wa-socket' }),
      browser: ['DeltaAI Bot', 'Chrome', '1.0.0'],
      markOnlineOnConnect: true,
      retryRequestDelayMs: 500,
      maxMsgRetryCount: 2,
      connectTimeoutMs: 30_000,     // 30s connection timeout
      keepAliveIntervalMs: 30_000,  // Ping every 30s to keep connection alive
      defaultQueryTimeoutMs: 60_000, // 60s for queries
      shouldIgnoreJid: (jid) => {
        return jid?.includes('@broadcast') || jid?.includes('@newsletter');
      },
    });

    // ── Step 3: Set up event handlers ───────────────────────────────────
    console.log('[3/3] Setting up event handlers...');

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n╔══════════════════════════════════════════════════╗');
        console.log('║  كود QR جديد! افتح صفحة الويب من موبايلك     ║');
        console.log('╚══════════════════════════════════════════════════╝\n');
        try { qrcode.generate(qr, { small: true }); } catch(e) {}
        console.log('\n🌐 افتح الصفحة من موبايلك عشان تمسح الكود\n');

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
        });

        console.log('\n✅ ═══════════════════════════════════════════════════════');
        console.log(`✅  البوت متصل! رقم الواتساب: ${botNumber}`);
        console.log(`✅  DeltaAI Server: ${config.DELTA_AI_URL}`);
        console.log('✅  جاهز لاستقبال الرسائل!');
        console.log('✅ ═══════════════════════════════════════════════════════\n');

        try {
          await sock.updateProfileStatus('🤖 DeltaAI Bot — اكتب أي حاجة وأنا هرد!');
        } catch (e) {}
      }

      if (connection === 'close') {
        isStarting = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;

        updateBotState({
          isConnected: false,
          botNumber: null,
        });

        console.log(`\n❌ Disconnected — reason: ${statusCode}`);

        // Always try to reconnect (even on loggedOut — user might want to re-scan)
        const delay = statusCode === DisconnectReason.loggedOut ? 5000 : 5000;
        console.log(`🔄 Reconnecting in ${delay/1000} seconds...`);
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

    console.log('[3/3] ✅ Event handlers ready');
    console.log('\n🎯 لو أول مرة: افتح صفحة الويب وامسح كود QR');
    console.log('🎯 لو متصل قبل كده: البوت شغال تلقائي!\n');

    const stats = conversationManager.getStats();
    updateBotState({ userCount: stats.totalUsers, messageCount: stats.totalMessages });

  } catch (error) {
    isStarting = false;
    console.error('[2/3] ❌ Failed to connect to WhatsApp:', error.message);
    console.log('🔄 Retrying in 15 seconds...');
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
