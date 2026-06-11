// ═══════════════════════════════════════════════════════════════════════════
// DeltaAI WhatsApp Bot v2 — Web Server for QR Code Display
// ═══════════════════════════════════════════════════════════════════════════
// This module runs a small HTTP server that serves a beautiful web page
// where the user can see the WhatsApp QR code from their phone browser.
//
// HOW IT WORKS:
// 1. Bot starts → Web server starts (on PORT from env or 10000)
// 2. User opens the URL on their phone
// 3. Page shows QR code + Arabic instructions
// 4. User scans QR from WhatsApp → Bot connects
// 5. Page updates to show "Connected!" status
//
// SELF-PING: Keeps the free tier awake by pinging external URL every 5 min
// Supports: Glitch (PROJECT_DOMAIN), Render (RENDER_EXTERNAL_URL), etc.
// ═══════════════════════════════════════════════════════════════════════════

import { createServer } from 'http';
import QRCode from 'qrcode';
import config from './config.js';

// ─── Shared State (set by index.js) ────────────────────────────────────
let botState = {
  qrCodeDataUrl: null,
  isConnected: false,
  botNumber: null,
  lastQRTime: null,
  uptime: Date.now(),
  messageCount: 0,
  userCount: 0,
};

export function updateBotState(updates) {
  Object.assign(botState, updates);
}

export function getBotState() {
  return { ...botState };
}

export async function setQRCode(qrString) {
  try {
    const dataUrl = await QRCode.toDataURL(qrString, {
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
    botState.qrCodeDataUrl = dataUrl;
    botState.lastQRTime = Date.now();
    console.log('[Web] QR code updated on web page');
  } catch (err) {
    console.error('[Web] Failed to generate QR data URL:', err.message);
  }
}

function generateHTML() {
  const state = botState;
  const connected = state.isConnected;
  const hasQR = !!state.qrCodeDataUrl;
  const qrAge = state.lastQRTime ? Math.round((Date.now() - state.lastQRTime) / 1000) : null;
  const uptimeSeconds = Math.round((Date.now() - state.uptime) / 1000);
  const uptimeStr = uptimeSeconds < 60 ? `${uptimeSeconds}s`
    : uptimeSeconds < 3600 ? `${Math.floor(uptimeSeconds / 60)}m ${uptimeSeconds % 60}s`
    : `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`;

  let statusHTML;
  if (connected) {
    statusHTML = `
      <div class="status connected">
        <div class="status-dot green"></div>
        <div>
          <div class="status-title">متصل!</div>
          <div class="status-sub">رقم الواتساب: ${state.botNumber || '---'}</div>
        </div>
      </div>`;
  } else if (hasQR) {
    statusHTML = `
      <div class="status waiting">
        <div class="status-dot yellow pulse"></div>
        <div>
          <div class="status-title">في انتظار المسح</div>
          <div class="status-sub">الكود اتولد من ${qrAge !== null ? qrAge : 0} ثانية</div>
        </div>
      </div>`;
  } else {
    statusHTML = `
      <div class="status loading">
        <div class="status-dot blue pulse"></div>
        <div>
          <div class="status-title">جاري التحميل...</div>
          <div class="status-sub">استنى لحد ما الكود يظهر</div>
        </div>
      </div>`;
  }

  let qrHTML;
  if (connected) {
    qrHTML = `
      <div class="qr-container connected-state">
        <div class="checkmark">
          <svg viewBox="0 0 100 100" width="120" height="120">
            <circle cx="50" cy="50" r="45" fill="#25D366" opacity="0.15"/>
            <path d="M30 50 L45 65 L70 35" stroke="#25D366" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="connected-text">البوت شغال وجاهز!</div>
      </div>`;
  } else if (hasQR) {
    qrHTML = `
      <div class="qr-container">
        <img src="${state.qrCodeDataUrl}" alt="WhatsApp QR Code" class="qr-image" />
      </div>`;
  } else {
    qrHTML = `
      <div class="qr-container loading-state">
        <div class="spinner"></div>
        <div class="loading-text">جاري توليد كود الـ QR...</div>
      </div>`;
  }

  let instructionsHTML;
  if (connected) {
    instructionsHTML = `
      <div class="instructions success-box">
        <h3>البوت شغال!</h3>
        <p>الناس تقدر تبعت رسائل للرقم ده والبوت هيرد عليهم باستخدام DeltaAI.</p>
        <p>الصفحة دي بتتحدث تلقائيًا — لو البوت فصل هتلاقي كود QR جديد هنا.</p>
      </div>`;
  } else {
    instructionsHTML = `
      <div class="instructions">
        <h3>ازاي توصل الواتساب بالبوت؟</h3>
        <ol>
          <li><strong>افتح واتساب</strong> على الموبايل اللي عليه الرقم المصري</li>
          <li>روح <strong>الإعدادات</strong></li>
          <li>اضغط على <strong>الأجهزة المرتبطة</strong></li>
          <li>اضغط <strong>ربط جهاز</strong></li>
          <li><strong>امسح الكود</strong> اللي ظاهر فوق ده</li>
        </ol>
        <p class="note">الكود بيتجدد كل شوية — لو قديم استنى يتولد واحد جديد</p>
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>DeltaAI WhatsApp Bot</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Arabic', sans-serif;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%);
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px 16px;
      overflow-x: hidden;
    }
    .header { text-align: center; margin-bottom: 24px; width: 100%; max-width: 400px; }
    .logo { font-size: 28px; font-weight: 700; color: #25D366; margin-bottom: 4px; letter-spacing: -0.5px; }
    .logo span { color: #58a6ff; }
    .subtitle { font-size: 14px; color: #8b949e; }
    .badge { display: inline-block; background: rgba(37,211,102,0.15); color: #25D366; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-top: 8px; border: 1px solid rgba(37,211,102,0.3); }
    .status { display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.05); border-radius: 12px; padding: 14px 18px; margin-bottom: 24px; width: 100%; max-width: 400px; border: 1px solid rgba(255,255,255,0.08); }
    .status-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
    .green { background: #25D366; }
    .yellow { background: #f0b429; }
    .blue { background: #58a6ff; }
    .pulse { animation: pulse 1.5s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.2); } }
    .status-title { font-size: 16px; font-weight: 600; }
    .status-sub { font-size: 13px; color: #8b949e; margin-top: 2px; }
    .qr-container { background: white; border-radius: 20px; padding: 24px; margin-bottom: 24px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; min-height: 300px; min-width: 280px; position: relative; overflow: hidden; }
    .qr-container::before { content: ''; position: absolute; top: -2px; left: -2px; right: -2px; bottom: -2px; background: linear-gradient(45deg, #25D366, #58a6ff, #25D366); border-radius: 22px; z-index: -1; opacity: 0.6; }
    .qr-image { width: 260px; height: 260px; image-rendering: pixelated; }
    .connected-state { flex-direction: column; gap: 12px; }
    .connected-text { color: #25D366; font-size: 18px; font-weight: 700; }
    .loading-state { flex-direction: column; gap: 16px; }
    .spinner { width: 50px; height: 50px; border: 4px solid #e0e0e0; border-top-color: #25D366; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-text { color: #666; font-size: 14px; }
    .instructions { width: 100%; max-width: 400px; background: rgba(255,255,255,0.05); border-radius: 16px; padding: 20px; border: 1px solid rgba(255,255,255,0.08); }
    .instructions h3 { color: #58a6ff; font-size: 16px; margin-bottom: 12px; }
    .instructions ol { padding-right: 20px; line-height: 2; font-size: 14px; }
    .instructions li strong { color: #25D366; }
    .note { margin-top: 12px; font-size: 13px; color: #f0b429; background: rgba(240,180,41,0.1); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(240,180,41,0.2); }
    .success-box { border-color: rgba(37,211,102,0.3); background: rgba(37,211,102,0.08); }
    .success-box h3 { color: #25D366; }
    .success-box p { font-size: 14px; line-height: 1.6; margin-top: 8px; color: #c0c0c0; }
    .footer { margin-top: 24px; text-align: center; font-size: 12px; color: #4a4a5a; }
    .footer .stats { display: flex; gap: 16px; justify-content: center; margin-top: 8px; }
    .footer .stat { display: flex; align-items: center; gap: 4px; }
    .uptime { margin-top: 12px; font-size: 11px; color: #3a3a4a; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">Delta<span>AI</span> Bot</div>
    <div class="subtitle">واتساب بوت ذكي — مجاني للأبد</div>
    <div class="badge">100% Free Forever</div>
  </div>
  ${statusHTML}
  ${qrHTML}
  ${instructionsHTML}
  <div class="footer">
    <div class="stats">
      <div class="stat">${state.messageCount} رسالة</div>
      <div class="stat">${state.userCount} مستخدم</div>
    </div>
    <div class="uptime">${uptimeStr}</div>
  </div>
  <script>
    setTimeout(() => location.reload(), 5000);
  </script>
</body>
</html>`;
}

export function startWebServer() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = req.url;

      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(generateHTML());
        return;
      }

      if (url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', connected: botState.isConnected }));
        return;
      }

      if (url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          connected: botState.isConnected,
          botNumber: botState.botNumber,
          hasQR: !!botState.qrCodeDataUrl,
          lastQRTime: botState.lastQRTime,
          messageCount: botState.messageCount,
          userCount: botState.userCount,
          uptime: Math.round((Date.now() - botState.uptime) / 1000),
        }, null, 2));
        return;
      }

      if (url === '/api/qr' && botState.qrCodeDataUrl) {
        const base64 = botState.qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');
        const buffer = Buffer.from(base64, 'base64');
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': buffer.length,
          'Cache-Control': 'no-cache, no-store',
        });
        res.end(buffer);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    });

    server.listen(config.WEB_PORT, config.WEB_HOST, () => {
      console.log(`[Web] QR code page: http://localhost:${config.WEB_PORT}`);
      resolve(server);
    });

    server.on('error', (err) => {
      console.error('[Web] Server error:', err.message);
      reject(err);
    });
  });

  // Self-ping to keep free tier awake (Glitch, Render, etc.)
  // Glitch sleeps after 5 min of no external traffic, so we ping the external URL
  setTimeout(() => {
    const getExternalUrl = () => {
      // Glitch provides PROJECT_DOMAIN env var
      if (process.env.PROJECT_DOMAIN) {
        return `https://${process.env.PROJECT_DOMAIN}.glitch.me/health`;
      }
      // Render provides RENDER_EXTERNAL_URL
      if (process.env.RENDER_EXTERNAL_URL) {
        return `${process.env.RENDER_EXTERNAL_URL}/health`;
      }
      // Fallback to localhost
      return `http://localhost:${config.WEB_PORT}/health`;
    };

    const pingUrl = getExternalUrl();
    console.log(`[Self-Ping] Will ping ${pingUrl} every 5 min to keep app awake`);

    setInterval(async () => {
      try {
        await fetch(pingUrl);
        console.log('[Self-Ping] Keep-alive OK');
      } catch (e) {
        // Silently retry next interval
      }
    }, 5 * 60 * 1000); // every 5 minutes
  }, 30000);
}
