// ═══════════════════════════════════════════════════════════════════════════
// DeltaAI WhatsApp Bot v3 — DeltaAI API Client
// ═══════════════════════════════════════════════════════════════════════════
// Sends messages to DeltaAI /api/chat/stream and parses SSE responses.
// Simplified for reliability and speed.
// ═══════════════════════════════════════════════════════════════════════════

import config from './config.js';

/**
 * Send a chat message to DeltaAI and get the AI response.
 */
export async function sendToDeltaAI({ message, model, language, conversationId, userId, attachments = [] }) {
  const baseUrl = config.DELTA_AI_URL;
  const url = `${baseUrl}/api/chat/stream`;

  // Build request body — only send what the API needs
  const body = {
    message,
    model: model || config.DEFAULT_MODEL,
  };

  // Only add optional fields if they have values
  if (language) body.language = language;
  if (conversationId) body.conversationId = conversationId;

  // Encode attachments into the message
  if (attachments.length > 0) {
    let extra = '';
    for (const att of attachments) {
      if (att.type === 'image') {
        extra += `\n[IMAGE:${att.name}|${att.mimeType}|${att.base64}]`;
      } else if (att.type === 'pdf') {
        extra += `\n[PDF:${att.name}|${att.size}|${att.base64}]`;
      }
    }
    body.message = message + extra;
  }

  const headers = { 'Content-Type': 'application/json' };

  if (config.DELTA_AI_API_KEY) {
    headers['Authorization'] = `Bearer ${config.DELTA_AI_API_KEY}`;
  }

  console.log(`[DeltaAI] Sending to ${url} | model: ${body.model} | msg: ${body.message.substring(0, 50)}...`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000), // 1 min timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[DeltaAI] Error ${response.status}: ${errorText}`);
      throw new Error(`DeltaAI API error ${response.status}: ${errorText}`);
    }

    const result = await parseSSEStream(response);
    console.log(`[DeltaAI] Got response: ${result.content.substring(0, 80)}...`);
    return result;
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new Error('انتهت مهلة الطلب — حاول مرة أخرى');
    }
    throw error;
  }
}

/**
 * Parse Server-Sent Events stream from DeltaAI.
 */
async function parseSSEStream(response) {
  let content = '';
  let pdfUrl = null;
  let quizData = null;
  let smartDocResult = null;
  let imageDataUrl = null;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const event = JSON.parse(dataStr);

          if (event.content) content += event.content;
          if (event.fileGenResult?.fileUrl) pdfUrl = event.fileGenResult.fileUrl;
          if (event.smartDocResult) smartDocResult = event.smartDocResult;
          if (event.quizData) quizData = event.quizData;
          if (event.imageDataUrl) imageDataUrl = event.imageDataUrl;
        } catch {
          // Skip unparseable lines (heartbeat, etc.)
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { content: content.trim(), pdfUrl, quizData, smartDocResult, imageDataUrl };
}

/**
 * Download a PDF file from DeltaAI.
 */
export async function downloadPDF(pdfUrl) {
  const baseUrl = config.DELTA_AI_URL;
  const fullUrl = pdfUrl.startsWith('http') ? pdfUrl : `${baseUrl}${pdfUrl}`;

  const headers = {};
  if (config.DELTA_AI_API_KEY) {
    headers['Authorization'] = `Bearer ${config.DELTA_AI_API_KEY}`;
  }

  const response = await fetch(fullUrl, { headers });

  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const disposition = response.headers.get('content-disposition');
  const fileName = disposition
    ? disposition.match(/filename="?(.+?)"?$/)?.[1] || 'document.pdf'
    : pdfUrl.split('/').pop() || 'document.pdf';

  return { buffer, fileName, mimeType: 'application/pdf' };
}

/**
 * Health check for DeltaAI backend.
 */
export async function healthCheck() {
  const start = Date.now();
  try {
    const response = await fetch(`${config.DELTA_AI_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return { ok: response.ok, latency: Date.now() - start };
  } catch {
    return { ok: false, latency: Date.now() - start };
  }
}
