import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import type { ChatTurn } from '../lib/supportChatAi.js';
import { completeSupportChat } from '../lib/supportChatAi.js';
import { buildSupportViewerContextSection } from '../lib/supportKnowledgeBase.js';
import { getSupportChatRuntimeCached } from '../lib/supportChatSettings.js';
import {
  isAiQuotaOrBillingErrorMessage,
  SUPPORT_AI_GENERIC_USER_MESSAGE,
  SUPPORT_AI_QUOTA_USER_MESSAGE,
} from '../lib/supportChatPublicErrors.js';

dotenv.config();

const router = express.Router();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function sanitizeSessionId(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const s = String((body as any).session_id || '').trim().slice(0, 80);
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return '';
  return s;
}

router.get('/meta', async (_req, res) => {
  try {
    const runtime = await getSupportChatRuntimeCached(supabase);
    res.json({
      help_chat_enabled: runtime.help_chat_enabled,
      whatsapp_e164: runtime.whatsapp_e164,
      ai_enabled: runtime.help_chat_enabled && runtime.ai_configured,
    });
  } catch (e: any) {
    console.error('support-chat/meta:', e);
    res.json({
      help_chat_enabled: true,
      whatsapp_e164: null,
      ai_enabled: Boolean(process.env.OPENAI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY),
    });
  }
});

function sanitizeTurns(body: unknown): ChatTurn[] {
  if (!body || typeof body !== 'object') return [];
  const raw = (body as any).messages;
  if (!Array.isArray(raw)) return [];
  const out: ChatTurn[] = [];
  for (const m of raw.slice(-16)) {
    if (!m || typeof m !== 'object') continue;
    const role = (m as any).role;
    const content = String((m as any).content || '').trim().slice(0, 3500);
    if (!content) continue;
    if (role !== 'user' && role !== 'assistant') continue;
    out.push({ role, content });
  }
  return out;
}

async function optionalUserId(req: express.Request): Promise<string | null> {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  if (!token) return null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

type UserTrainingFields = {
  user_display_name: string | null;
  user_email: string | null;
  user_phone: string | null;
};

async function loadUserTrainingFields(userId: string | null): Promise<UserTrainingFields> {
  if (!userId) {
    return { user_display_name: null, user_email: null, user_phone: null };
  }
  const { data } = await supabase.from('users').select('name, email, phone').eq('id', userId).maybeSingle();
  return {
    user_display_name: typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : null,
    user_email: typeof data?.email === 'string' && data.email.trim() ? data.email.trim() : null,
    user_phone: typeof data?.phone === 'string' && data.phone.trim() ? data.phone.trim() : null,
  };
}

async function appendTrainingLogs(opts: {
  runtime: Awaited<ReturnType<typeof getSupportChatRuntimeCached>>;
  req: express.Request;
  turns: ChatTurn[];
  result: Awaited<ReturnType<typeof completeSupportChat>>;
  who: UserTrainingFields;
  userId: string | null;
}) {
  const { runtime, req, turns, result, who, userId } = opts;
  if (!runtime.training_capture_enabled) return;

  const sessionId = sanitizeSessionId(req.body) || 'no_session';
  const lastUser = turns.length && turns[turns.length - 1]?.role === 'user' ? turns[turns.length - 1] : null;
  const identityMeta = {
    user_display_name: who.user_display_name,
    user_email: who.user_email,
    user_phone: who.user_phone,
  };
  const assistantMeta = {
    suggest_ticket: result.suggest_ticket,
    ticket_category: result.ticket_category,
    ...identityMeta,
  };

  try {
    const rows: any[] = [];
    if (lastUser) {
      rows.push({
        user_id: userId,
        session_id: sessionId,
        role: 'user',
        content: lastUser.content.slice(0, 8000),
        meta: identityMeta,
      });
    }
    rows.push({
      user_id: userId,
      session_id: sessionId,
      role: 'assistant',
      content: result.message.slice(0, 8000),
      meta: assistantMeta,
    });
    const { error } = await supabase.from('support_chat_training_logs').insert(rows);
    if (error) console.error('support_chat_training_logs:', error);
  } catch (e) {
    console.error('support_chat_training_logs insert:', e);
  }
}

router.post('/reply', async (req, res) => {
  try {
    const runtime = await getSupportChatRuntimeCached(supabase);

    if (!runtime.help_chat_enabled) {
      return res.status(200).json({
        success: false,
        error: 'help_chat_disabled',
        message:
          'হেল্প চ্যাট এই মুহূর্তে বন্ধ আছে। Support পেজ থেকে টিকিট খুলুন বা WhatsApp এ যোগাযোগ করুন।',
        whatsapp_e164: runtime.whatsapp_e164,
      });
    }

    if (!runtime.ai_configured) {
      return res.status(200).json({
        success: false,
        error: 'ai_disabled',
        message:
          'এই মুহূর্তে চ্যাট অ্যাসিস্ট্যান্ট চালু নেই। Support পেজ থেকে টিকিট খুলুন, অথবা WhatsApp এ যোগাযোগ করুন।',
        whatsapp_e164: runtime.whatsapp_e164,
      });
    }

    const turns = sanitizeTurns(req.body);
    if (turns.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid messages' });
    }
    if (turns[turns.length - 1].role !== 'user') {
      return res.status(400).json({ success: false, message: 'Last message must be from user' });
    }

    const userId = await optionalUserId(req);
    const who = await loadUserTrainingFields(userId);
    const viewerSection = buildSupportViewerContextSection(userId, who.user_display_name);

    const result = await completeSupportChat(turns, runtime, viewerSection);
    await appendTrainingLogs({ runtime, req, turns, result, who, userId });
    return res.json({ success: true, ...result });
  } catch (e: any) {
    console.error('support-chat/reply:', e);
    let wa: string | null = null;
    try {
      const rt = await getSupportChatRuntimeCached(supabase);
      wa = rt.whatsapp_e164;
    } catch {
      /* ignore */
    }
    const raw = String(e?.message || e || '');
    if (isAiQuotaOrBillingErrorMessage(raw)) {
      return res.status(200).json({
        success: false,
        error: 'ai_quota',
        message: SUPPORT_AI_QUOTA_USER_MESSAGE,
        whatsapp_e164: wa,
      });
    }
    return res.status(500).json({
      success: false,
      message: SUPPORT_AI_GENERIC_USER_MESSAGE,
      whatsapp_e164: wa,
    });
  }
});

async function requireUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
    if (!token) return res.status(401).json({ success: false, message: 'Sign in to create a ticket' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ success: false, message: 'Invalid session' });

    (req as any).user = data.user;
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
}

router.post('/ticket', requireUser, async (req, res) => {
  try {
    const user = (req as any).user;
    const subject = String(req.body?.subject || '').trim().slice(0, 300);
    const body = String(req.body?.body || '').trim().slice(0, 8000);
    const category = String(req.body?.category || 'general');
    const allowed = new Set(['general', 'billing', 'adobe_access', 'account', 'other']);
    const cat = allowed.has(category) ? category : 'general';

    if (subject.length < 3) {
      return res.status(400).json({ success: false, message: 'Subject too short' });
    }
    if (body.length < 10) {
      return res.status(400).json({ success: false, message: 'Description too short' });
    }

    const { data: row, error } = await supabase
      .from('support_tickets')
      .insert({
        user_id: user.id,
        subject,
        body: `[AI chat escalation]\n\n${body}`,
        category: cat,
        status: 'open',
      })
      .select('id')
      .single();

    if (error) throw error;

    return res.json({ success: true, ticket_id: row?.id });
  } catch (e: any) {
    console.error('support-chat/ticket:', e);
    return res.status(500).json({ success: false, message: e?.message || 'Ticket failed' });
  }
});

export default router;
