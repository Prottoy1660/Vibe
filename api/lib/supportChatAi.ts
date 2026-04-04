import { SUPPORT_KNOWLEDGE_BASE, SUPPORT_JSON_INSTRUCTION } from './supportKnowledgeBase.js';
import type { SupportChatRuntime } from './supportChatSettings.js';

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type SupportAiResult = {
  message: string;
  suggest_ticket: boolean;
  ticket_subject: string | null;
  ticket_body: string | null;
  ticket_category: 'general' | 'billing' | 'adobe_access' | 'account' | 'other' | null;
};

function parseSupportJson(raw: string): SupportAiResult {
  const fallback: SupportAiResult = {
    message: raw.slice(0, 4000),
    suggest_ticket: false,
    ticket_subject: null,
    ticket_body: null,
    ticket_category: null,
  };
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const o = JSON.parse(cleaned) as Record<string, unknown>;
    const message = typeof o.message === 'string' ? o.message : fallback.message;
    const suggest_ticket = o.suggest_ticket === true;
    const cats = new Set(['general', 'billing', 'adobe_access', 'account', 'other']);
    const tc = typeof o.ticket_category === 'string' && cats.has(o.ticket_category) ? o.ticket_category : null;
    return {
      message: message.slice(0, 8000),
      suggest_ticket,
      ticket_subject: typeof o.ticket_subject === 'string' ? o.ticket_subject.slice(0, 300) : null,
      ticket_body: typeof o.ticket_body === 'string' ? o.ticket_body.slice(0, 8000) : null,
      ticket_category: tc as SupportAiResult['ticket_category'],
    };
  } catch {
    return fallback;
  }
}

function buildSystemPrompt(runtime: SupportChatRuntime) {
  const extra = runtime.custom_prompt_append
    ? `\n\n## Extra context from your team (admin)\n${runtime.custom_prompt_append}`
    : '';
  return `${SUPPORT_KNOWLEDGE_BASE}${extra}\n\n${SUPPORT_JSON_INSTRUCTION}`;
}

function buildOpenAiMessages(turns: ChatTurn[], runtime: SupportChatRuntime) {
  const system = buildSystemPrompt(runtime);
  return [
    { role: 'system' as const, content: system },
    ...turns.map((t) => ({ role: t.role, content: t.content.slice(0, 4000) })),
  ];
}

export async function completeSupportChatOpenAI(turns: ChatTurn[], runtime: SupportChatRuntime): Promise<SupportAiResult> {
  const key = runtime.openaiKey;
  if (!key) throw new Error('OpenAI API key not configured');

  const model = runtime.openaiModel;
  const body = {
    model,
    messages: buildOpenAiMessages(turns, runtime),
    temperature: 0.5,
    max_tokens: 1200,
    response_format: { type: 'json_object' as const },
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as any;
  if (!res.ok) {
    const err = data?.error;
    const code = err?.code ?? res.status;
    const msg = err?.message || `HTTP ${res.status}`;
    throw new Error(`[OpenAI ${code}] ${msg}`);
  }

  const text = data?.choices?.[0]?.message?.content || '{}';
  return parseSupportJson(text);
}

export async function completeSupportChatGemini(turns: ChatTurn[], runtime: SupportChatRuntime): Promise<SupportAiResult> {
  const key = runtime.geminiKey;
  if (!key) throw new Error('Gemini API key not configured');

  const model = runtime.geminiModel;
  const systemText = buildSystemPrompt(runtime);

  const contents = turns.map((t) => ({
    role: t.role === 'user' ? ('user' as const) : ('model' as const),
    parts: [{ text: t.content.slice(0, 4000) }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents,
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1200,
        responseMimeType: 'application/json',
      },
    }),
  });

  const data = (await res.json()) as any;
  if (!res.ok) {
    const err = data?.error;
    const code = err?.code ?? res.status;
    const status = err?.status ? String(err.status) : '';
    const msg = err?.message || `HTTP ${res.status}`;
    throw new Error(`[Gemini ${code}${status ? ` ${status}` : ''}] ${msg}`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return parseSupportJson(text);
}

export async function completeSupportChat(turns: ChatTurn[], runtime: SupportChatRuntime): Promise<SupportAiResult> {
  const { provider, openaiKey, geminiKey } = runtime;

  if (provider === 'openai') {
    return completeSupportChatOpenAI(turns, runtime);
  }
  if (provider === 'gemini') {
    return completeSupportChatGemini(turns, runtime);
  }

  if (openaiKey) {
    return completeSupportChatOpenAI(turns, runtime);
  }
  if (geminiKey) {
    return completeSupportChatGemini(turns, runtime);
  }
  throw new Error('No AI provider configured');
}
