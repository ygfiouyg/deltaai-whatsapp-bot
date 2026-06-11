// ═══════════════════════════════════════════════════════════════════════════
// DeltaAI WhatsApp Bot v2 — Conversation Manager
// ═══════════════════════════════════════════════════════════════════════════
// Tracks conversations per WhatsApp user. Stores conversation IDs for AI
// context and user preferences (language, model choice, etc.)
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = './bot_data';
const CONVERSATIONS_FILE = join(DATA_DIR, 'conversations.json');

class ConversationManager {
  constructor() {
    /** @type {Map<string, UserSession>} phone → session */
    this.sessions = new Map();
    this._load();
  }

  getOrCreate(phone) {
    if (!this.sessions.has(phone)) {
      this.sessions.set(phone, {
        phone,
        conversationId: null,
        language: 'ar',
        model: null,
        lastActivity: Date.now(),
        messageCount: 0,
        isSubscribed: true,
        createdAt: Date.now(),
      });
    }
    const session = this.sessions.get(phone);
    session.lastActivity = Date.now();
    return session;
  }

  setConversationId(phone, conversationId) {
    const session = this.getOrCreate(phone);
    session.conversationId = conversationId;
    this._save();
  }

  updatePreferences(phone, updates) {
    const session = this.getOrCreate(phone);
    Object.assign(session, updates);
    this._save();
  }

  incrementMessageCount(phone) {
    const session = this.getOrCreate(phone);
    session.messageCount++;
    this._save();
  }

  resetConversation(phone) {
    const session = this.getOrCreate(phone);
    session.conversationId = null;
    this._save();
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  getStats() {
    const sessions = this.getAllSessions();
    const active = sessions.filter(s => Date.now() - s.lastActivity < 24 * 60 * 60_000);
    return {
      totalUsers: sessions.length,
      activeUsers24h: active.length,
      totalMessages: sessions.reduce((sum, s) => sum + s.messageCount, 0),
    };
  }

  cleanup() {
    const thirtyDays = 30 * 24 * 60 * 60_000;
    for (const [phone, session] of this.sessions) {
      if (Date.now() - session.lastActivity > thirtyDays) {
        this.sessions.delete(phone);
      }
    }
    this._save();
  }

  _load() {
    try {
      if (existsSync(CONVERSATIONS_FILE)) {
        const data = JSON.parse(readFileSync(CONVERSATIONS_FILE, 'utf-8'));
        for (const [phone, session] of Object.entries(data)) {
          this.sessions.set(phone, session);
        }
        console.log(`[Conversations] Loaded ${this.sessions.size} sessions`);
      }
    } catch (error) {
      console.warn('[Conversations] Failed to load sessions:', error.message);
    }
  }

  _save() {
    try {
      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = Object.fromEntries(this.sessions);
      writeFileSync(CONVERSATIONS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('[Conversations] Failed to save sessions:', error.message);
    }
  }
}

/**
 * @typedef {object} UserSession
 * @property {string} phone
 * @property {string|null} conversationId
 * @property {string} language
 * @property {string|null} model
 * @property {number} lastActivity
 * @property {number} messageCount
 * @property {boolean} isSubscribed
 * @property {number} createdAt
 */

// Singleton
const conversationManager = new ConversationManager();
export default conversationManager;
