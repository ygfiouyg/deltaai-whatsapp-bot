// ═══════════════════════════════════════════════════════════════════════════
// DeltaAI WhatsApp Bot v3 — Configuration
// ═══════════════════════════════════════════════════════════════════════════
// All settings are controlled via environment variables.
// On Termux/localhost, set these in the .env file.
// On hosting platforms, set them as environment variables.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'fs';

// Load .env file if it exists (for local development)
if (existsSync('.env')) {
  const envContent = readFileSync('.env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

const config = {
  // ─── DeltaAI Backend ──────────────────────────────────────────────────
  // URL of your DeltaAI Next.js server (HuggingFace Space or local)
  DELTA_AI_URL: process.env.DELTA_AI_URL || 'http://localhost:3000',

  // API key for DeltaAI (if you set one up)
  DELTA_AI_API_KEY: process.env.DELTA_AI_API_KEY || '',

  // ─── WhatsApp Bot Settings ────────────────────────────────────────────
  BOT_NAME: process.env.BOT_NAME || 'DeltaAI',
  BOT_LANGUAGE: process.env.BOT_LANGUAGE || 'ar',
  DEFAULT_MODEL: process.env.DEFAULT_MODEL || 'delta-general',

  // ─── Pairing Code (no QR scan needed!) ───────────────────────────────
  // Your WhatsApp number with country code (e.g. 201234567890 for Egypt)
  // When set, bot will use pairing code method instead of QR scan
  PHONE_NUMBER: process.env.PHONE_NUMBER || '',

  // ─── Web Server (for QR code display from phone) ──────────────────────
  // Render provides PORT env var automatically — use it if available
  WEB_PORT: parseInt(process.env.PORT || process.env.WEB_PORT || '10000'),
  WEB_HOST: process.env.WEB_HOST || '0.0.0.0',

  // ─── Session & Auth ───────────────────────────────────────────────────
  AUTH_DIR: process.env.AUTH_DIR || './auth_info',

  // ─── Rate Limiting ────────────────────────────────────────────────────
  RATE_LIMIT_PER_MINUTE: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '10'),

  // ─── Admin Numbers ────────────────────────────────────────────────────
  ADMIN_NUMBERS: (process.env.ADMIN_NUMBERS || '').split(',').filter(Boolean),

  // ─── Features ─────────────────────────────────────────────────────────
  ENABLE_DOCUMENT_PIPELINE: process.env.ENABLE_DOCUMENT_PIPELINE !== 'false',
  ENABLE_QUIZ: process.env.ENABLE_QUIZ !== 'false',
  ENABLE_IMAGE_GENERATION: process.env.ENABLE_IMAGE_GENERATION !== 'false',
  ENABLE_WEB_SEARCH: process.env.ENABLE_WEB_SEARCH !== 'false',

  // ─── Logging ──────────────────────────────────────────────────────────
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // ─── PDF Settings ─────────────────────────────────────────────────────
  MAX_PDF_SIZE: parseInt(process.env.MAX_PDF_SIZE || '10485760'),

  // ─── Message Settings ─────────────────────────────────────────────────
  MAX_MESSAGE_LENGTH: parseInt(process.env.MAX_MESSAGE_LENGTH || '4096'),
  TYPING_DURATION: parseInt(process.env.TYPING_DURATION || '1500'),
};

export default config;
