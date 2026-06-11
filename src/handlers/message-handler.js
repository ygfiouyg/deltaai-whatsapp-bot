// ═══════════════════════════════════════════════════════════════════════════
// DeltaAI WhatsApp Bot v4.0 — Message Handler (Anti-Ban Edition)
// ═══════════════════════════════════════════════════════════════════════════
// KEY ANTI-BAN CHANGES:
// - Random 3-12 second delay before responding (human-like)
// - Typing indicator shows for realistic duration before message
// - Hourly message cap (won't send more than 30 msgs/hour)
// - No auto-read (bots read instantly — humans don't)
// - Longer, more natural response patterns
// - No emoji overload in responses
// ═══════════════════════════════════════════════════════════════════════════

import config from '../lib/config.js';
import rateLimiter from '../lib/rate-limiter.js';
import conversationManager from '../lib/conversation-manager.js';
import { sendToDeltaAI, downloadPDF } from '../lib/delta-ai-client.js';
import { updateBotState } from '../lib/web-server.js';
import { canSendMessage, incrementMessageCount, humanDelay } from '../index.js';

/**
 * Main message handler — called for every incoming WhatsApp message.
 */
export async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  const phone = jid?.replace('@s.whatsapp.net', '') || '';
  const isGroup = jid?.endsWith('@g.us');
  const isMe = msg.key.fromMe;

  if (isMe) return;

  // In groups, only respond when mentioned
  if (isGroup) {
    const mentionedIds = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentionedIds.includes(sock.user.id)) return;
  }

  const text = extractText(msg);
  if (!text && !hasMedia(msg)) return;

  // ── ANTI-BAN: Check hourly message cap ──
  if (!canSendMessage()) {
    console.log('[Anti-Ban] Hourly message cap reached — not responding');
    // Don't even send a message saying we're capped — that's a message too!
    return;
  }

  // Rate limiting per user
  const rateCheck = rateLimiter.check(phone);
  if (!rateCheck.allowed) {
    // Send rate limit message only once, not repeatedly
    await sock.sendMessage(jid, {
      text: 'استنى شوية وجرب تاني بعد كده'
    });
    return;
  }

  const session = conversationManager.getOrCreate(phone);

  // Update web dashboard stats
  const stats = conversationManager.getStats();
  updateBotState({ userCount: stats.totalUsers, messageCount: stats.totalMessages });

  // Bot commands — respond faster to commands
  if (text && text.startsWith('!')) {
    await handleCommand(sock, jid, phone, text, session);
    return;
  }

  // Extract media attachments
  const attachments = [];
  if (hasMedia(msg)) {
    const media = await extractMedia(sock, msg);
    if (media) attachments.push(media);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ANTI-BAN: Human-like response timing
  // ═══════════════════════════════════════════════════════════════════════
  
  // Step 1: Random delay before showing "typing" (simulates reading)
  const readingDelay = humanDelay(1500, 4000); // 1.5-4s to "read"
  await new Promise(r => setTimeout(r, readingDelay));

  // Step 2: Show typing indicator
  await sock.sendPresenceUpdate('composing', jid);

  // Step 3: Calculate realistic typing time based on response length
  // Humans type at ~40 chars/second on average
  // We'll estimate response length and calculate typing time
  const estimatedResponseLength = Math.max(50, text.length * 3); // Rough estimate
  const typingTimePerChar = 25; // ms per character — slower than real typing
  const baseTypingTime = Math.min(estimatedResponseLength * typingTimePerChar, 10000); // Cap at 10s
  const typingTime = Math.max(2000, baseTypingTime + Math.random() * 2000); // 2s minimum + random

  try {
    // Start AI request and typing timer in parallel
    const aiPromise = sendToDeltaAI({
      message: text || 'حلل الملف المرفق',
      model: session.model || config.DEFAULT_MODEL,
      language: session.language || config.BOT_LANGUAGE,
      conversationId: session.conversationId,
      userId: phone,
      attachments,
    });

    // Wait for both AI response AND minimum typing time
    const [result] = await Promise.all([
      aiPromise,
      new Promise(r => setTimeout(r, typingTime)),
    ]);

    // Small random pause after AI responds (simulates reviewing response)
    await new Promise(r => setTimeout(r, humanDelay(500, 1500)));

    conversationManager.incrementMessageCount(phone);
    incrementMessageCount();

    // Update stats after processing
    const newStats = conversationManager.getStats();
    updateBotState({ messageCount: newStats.totalMessages });

    // Send text response
    if (result.content) {
      const chunks = splitMessage(result.content, config.MAX_MESSAGE_LENGTH);
      for (let i = 0; i < chunks.length; i++) {
        await sock.sendMessage(jid, { text: chunks[i] });
        incrementMessageCount();
        
        // If multiple chunks, add delay between them (human-like)
        if (i < chunks.length - 1) {
          await new Promise(r => setTimeout(r, humanDelay(1000, 3000)));
          await sock.sendPresenceUpdate('composing', jid);
          await new Promise(r => setTimeout(r, humanDelay(500, 1500)));
        }
      }
    }

    // Send generated PDF
    if (result.pdfUrl) {
      try {
        const pdf = await downloadPDF(result.pdfUrl);
        await new Promise(r => setTimeout(r, humanDelay(1000, 2000)));
        await sock.sendMessage(jid, {
          document: pdf.buffer,
          fileName: pdf.fileName,
          mimetype: 'application/pdf',
          caption: pdf.fileName,
        });
        incrementMessageCount();
      } catch (pdfError) {
        console.error('[WhatsApp] Failed to send PDF:', pdfError.message);
        await sock.sendMessage(jid, {
          text: 'تم إنشاء المستند! افتحه من هنا:\n' + config.DELTA_AI_URL + result.pdfUrl
        });
      }
    }

    // Send Smart Doc result
    if (result.smartDocResult?.success && result.smartDocResult.fileUrl) {
      try {
        const pdf = await downloadPDF(result.smartDocResult.fileUrl);
        await new Promise(r => setTimeout(r, humanDelay(1000, 2000)));
        await sock.sendMessage(jid, {
          document: pdf.buffer,
          fileName: pdf.fileName,
          mimetype: 'application/pdf',
          caption: pdf.fileName,
        });
        incrementMessageCount();
      } catch (pdfError) {
        console.error('[WhatsApp] Failed to send Smart Doc PDF:', pdfError.message);
      }
    }

    // Send generated image
    if (result.imageDataUrl) {
      const base64 = result.imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      await new Promise(r => setTimeout(r, humanDelay(500, 1500)));
      await sock.sendMessage(jid, { image: buffer });
      incrementMessageCount();
    }

    // ── ANTI-BAN: Stop typing after response ──
    await sock.sendPresenceUpdate('paused', jid);

  } catch (error) {
    console.error('[WhatsApp] Error processing message:', error);
    
    // Stop typing indicator
    await sock.sendPresenceUpdate('paused', jid);
    
    // Don't send error messages too often — that's spammy
    // Only send error message if we haven't sent one recently
    const now = Date.now();
    const lastErrorTime = errorCooldowns.get(phone) || 0;
    if (now - lastErrorTime > 60000) { // Max 1 error per user per minute
      await sock.sendMessage(jid, {
        text: 'حصل خطأ، جرب تاني',
      });
      incrementMessageCount();
      errorCooldowns.set(phone, now);
    }
  }

  // ── ANTI-BAN: DON'T auto-read messages ──
  // Bots read messages instantly. Humans take time.
  // We'll mark as read after a random delay (30s - 2min)
  const readDelay = humanDelay(30000, 120000);
  setTimeout(async () => {
    try {
      await sock.readMessages([msg.key]);
    } catch (e) {
      // Silently fail — not critical
    }
  }, readDelay);
}

// ── Error cooldown map ──
const errorCooldowns = new Map();

// ═══════════════════════════════════════════════════════════════════════════
// Bot Commands
// ═══════════════════════════════════════════════════════════════════════════

const COMMANDS = {
  '!مسح': { desc: 'مسح المحادثة والبدء من جديد', handler: cmdReset },
  '!نموذج': { desc: 'تغيير النموذج (مثال: !نموذج deepseek-v3)', handler: cmdModel },
  '!لغة': { desc: 'تغيير اللغة (ar أو en)', handler: cmdLanguage },
  '!مساعدة': { desc: 'عرض الأوامر المتاحة', handler: cmdHelp },
  '!حالة': { desc: 'حالة البوت والاتصال', handler: cmdStatus },
  '!احصائيات': { desc: 'عدد المستخدمين والرسائل', handler: cmdStats, adminOnly: true },
};

async function handleCommand(sock, jid, phone, text, session) {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  const commandDef = COMMANDS[cmd];
  if (!commandDef) {
    await sock.sendMessage(jid, {
      text: 'أمر مش معروف: ' + cmd + '\n\nاكتب !مساعدة عشان تشوف الأوامر'
    });
    return;
  }

  if (commandDef.adminOnly && !config.ADMIN_NUMBERS.includes(phone)) {
    await sock.sendMessage(jid, { text: 'هذا الأمر للمشرفين فقط' });
    return;
  }

  await commandDef.handler(sock, jid, phone, args, session);
}

async function cmdReset(sock, jid) {
  conversationManager.resetConversation(jid.replace('@s.whatsapp.net', ''));
  await sock.sendMessage(jid, { text: 'تم مسح المحادثة! ابدأ محادثة جديدة.' });
}

async function cmdModel(sock, jid, phone, args, session) {
  const modelId = args[0];
  if (!modelId) {
    await sock.sendMessage(jid, {
      text: 'النموذج الحالي: ' + (session.model || config.DEFAULT_MODEL) + '\n\nالنماذج المتاحة:\n- deepseek-v3 (افتراضي - سريع)\n- qwen-2-5 (سريع)\n- delta-pro (خبير ذكي)\n- delta-ultra (الأقوى)\n\nاستخدم: !نموذج <اسم_النموذج>'
    });
    return;
  }
  conversationManager.updatePreferences(phone, { model: modelId });
  await sock.sendMessage(jid, { text: 'تم تغيير النموذج إلى: ' + modelId });
}

async function cmdLanguage(sock, jid, phone, args, session) {
  const lang = args[0];
  if (!lang || !['ar', 'en'].includes(lang)) {
    await sock.sendMessage(jid, {
      text: 'اللغة الحالية: ' + session.language + '\n\nاستخدم: !لغة ar أو !لغة en'
    });
    return;
  }
  conversationManager.updatePreferences(phone, { language: lang });
  await sock.sendMessage(jid, {
    text: lang === 'ar' ? 'تم تغيير اللغة إلى العربية' : 'Language changed to English'
  });
}

async function cmdHelp(sock, jid) {
  const commands = Object.entries(COMMANDS)
    .map(([cmd, def]) => cmd + ' — ' + def.desc + (def.adminOnly ? ' 🔒' : ''))
    .join('\n');

  await sock.sendMessage(jid, {
    text: 'DeltaAI WhatsApp Bot\n\n' + commands + '\n\nممكن تكتب عادي وهرد عليك!'
  });
}

async function cmdStatus(sock, jid, phone, args, session) {
  const { healthCheck } = await import('../lib/delta-ai-client.js');
  const health = await healthCheck();

  await sock.sendMessage(jid, {
    text: 'حالة البوت\n\nواتساب: متصل\nDeltaAI: ' + (health.ok ? 'متصل (' + health.latency + 'ms)' : 'غير متصل') + '\nاللغة: ' + session.language + '\nالنموذج: ' + (session.model || config.DEFAULT_MODEL) + '\nالرسائل: ' + session.messageCount
  });
}

async function cmdStats(sock, jid) {
  const stats = conversationManager.getStats();
  await sock.sendMessage(jid, {
    text: 'إحصائيات البوت\n\nالمستخدمين: ' + stats.totalUsers + '\nنشطين (24س): ' + stats.activeUsers24h + '\nإجمالي الرسائل: ' + stats.totalMessages
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════

function extractText(msg) {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.documentMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  ).trim();
}

function hasMedia(msg) {
  const m = msg.message;
  if (!m) return false;
  return !!(m.imageMessage || m.documentMessage || m.videoMessage || m.audioMessage);
}

async function extractMedia(sock, msg) {
  const m = msg.message;
  let mediaMessage = null;
  let type = null;

  if (m.imageMessage) { mediaMessage = m.imageMessage; type = 'image'; }
  else if (m.documentMessage) {
    mediaMessage = m.documentMessage;
    const mimeType = mediaMessage.mimetype || '';
    type = mimeType === 'application/pdf' ? 'pdf' : mimeType.startsWith('text/') ? 'text' : 'document';
  }
  else if (m.videoMessage) { mediaMessage = m.videoMessage; type = 'video'; }
  else if (m.audioMessage) { mediaMessage = m.audioMessage; type = 'audio'; }

  if (!mediaMessage || !type) return null;

  try {
    const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
    const stream = await downloadContentFromMessage(mediaMessage, type === 'pdf' ? 'document' : type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const base64 = buffer.toString('base64');
    const mimeType = mediaMessage.mimetype || 'application/octet-stream';
    const fileName = mediaMessage.fileName || type + '_' + Date.now();

    return {
      type,
      name: fileName,
      mimeType,
      size: formatFileSize(buffer.length),
      base64: 'data:' + mimeType + ';base64,' + base64,
    };
  } catch (error) {
    console.error('[WhatsApp] Failed to extract media:', error.message);
    return null;
  }
}

function splitMessage(text, maxLength = 4096) {
  if (text.length <= maxLength) return [text];
  const chunks = [];
  const lines = text.split('\n');
  let current = '';
  for (const line of lines) {
    if (current.length + line.length + 1 > maxLength) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
