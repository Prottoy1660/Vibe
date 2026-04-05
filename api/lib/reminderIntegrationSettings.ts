import type { SupabaseClient } from '@supabase/supabase-js';
import { maskKeyHint } from './supportChatSettings.js';

export const SUBSCRIPTION_REMINDER_INTEGRATIONS_KEY = 'subscription_reminder_integrations';

export type ReminderIntegrationsStored = {
  reminder_from_email?: string;
  resend_api_key?: string;
  whatsapp_cloud_token?: string;
  whatsapp_phone_number_id?: string;
  whatsapp_api_version?: string;
  whatsapp_expiry_template_name?: string;
  whatsapp_expiry_template_lang?: string;
};

export type ResolvedReminderOutbound = {
  resend: { apiKey: string | null; from: string | null };
  whatsapp: {
    token: string | null;
    phoneNumberId: string | null;
    version: string;
    templateName: string | null;
    templateLang: string;
  };
};

export async function loadReminderIntegrationsStored(supabase: SupabaseClient): Promise<ReminderIntegrationsStored> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', SUBSCRIPTION_REMINDER_INTEGRATIONS_KEY)
    .maybeSingle();
  if (error || !data?.value || typeof data.value !== 'object') {
    return {};
  }
  return data.value as ReminderIntegrationsStored;
}

/** Server .env wins when set; otherwise values saved in admin (system_settings). */
export function resolveReminderOutbound(stored: ReminderIntegrationsStored): ResolvedReminderOutbound {
  return {
    resend: {
      apiKey:
        process.env.RESEND_API_KEY?.trim() ||
        (typeof stored.resend_api_key === 'string' && stored.resend_api_key.trim()
          ? stored.resend_api_key.trim()
          : null) ||
        null,
      from:
        process.env.REMINDER_FROM_EMAIL?.trim() ||
        (typeof stored.reminder_from_email === 'string' && stored.reminder_from_email.trim()
          ? stored.reminder_from_email.trim()
          : null) ||
        null,
    },
    whatsapp: {
      token:
        process.env.WHATSAPP_CLOUD_TOKEN?.trim() ||
        (typeof stored.whatsapp_cloud_token === 'string' && stored.whatsapp_cloud_token.trim()
          ? stored.whatsapp_cloud_token.trim()
          : null) ||
        null,
      phoneNumberId:
        process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim() ||
        (typeof stored.whatsapp_phone_number_id === 'string' && stored.whatsapp_phone_number_id.trim()
          ? stored.whatsapp_phone_number_id.trim()
          : null) ||
        null,
      version:
        process.env.WHATSAPP_CLOUD_API_VERSION?.trim() ||
        (typeof stored.whatsapp_api_version === 'string' && stored.whatsapp_api_version.trim()
          ? stored.whatsapp_api_version.trim()
          : null) ||
        'v21.0',
      templateName:
        process.env.WHATSAPP_EXPIRY_TEMPLATE_NAME?.trim() ||
        (typeof stored.whatsapp_expiry_template_name === 'string' && stored.whatsapp_expiry_template_name.trim()
          ? stored.whatsapp_expiry_template_name.trim()
          : null) ||
        null,
      templateLang:
        process.env.WHATSAPP_EXPIRY_TEMPLATE_LANG?.trim() ||
        (typeof stored.whatsapp_expiry_template_lang === 'string' && stored.whatsapp_expiry_template_lang.trim()
          ? stored.whatsapp_expiry_template_lang.trim()
          : null) ||
        'en',
    },
  };
}

export function toReminderIntegrationsAdminPayload(
  stored: ReminderIntegrationsStored,
  resolved: ResolvedReminderOutbound,
) {
  return {
    reminder_from_email: typeof stored.reminder_from_email === 'string' ? stored.reminder_from_email : '',
    whatsapp_phone_number_id: typeof stored.whatsapp_phone_number_id === 'string' ? stored.whatsapp_phone_number_id : '',
    whatsapp_api_version: typeof stored.whatsapp_api_version === 'string' ? stored.whatsapp_api_version : '',
    whatsapp_expiry_template_name:
      typeof stored.whatsapp_expiry_template_name === 'string' ? stored.whatsapp_expiry_template_name : '',
    whatsapp_expiry_template_lang:
      typeof stored.whatsapp_expiry_template_lang === 'string' ? stored.whatsapp_expiry_template_lang : '',
    has_resend_key: Boolean(stored.resend_api_key && String(stored.resend_api_key).trim()),
    has_whatsapp_token: Boolean(stored.whatsapp_cloud_token && String(stored.whatsapp_cloud_token).trim()),
    resend_key_hint: maskKeyHint(stored.resend_api_key),
    whatsapp_token_hint: maskKeyHint(stored.whatsapp_cloud_token),
    env_resend_key: Boolean(process.env.RESEND_API_KEY?.trim()),
    env_reminder_from: Boolean(process.env.REMINDER_FROM_EMAIL?.trim()),
    env_whatsapp_token: Boolean(process.env.WHATSAPP_CLOUD_TOKEN?.trim()),
    env_whatsapp_phone_id: Boolean(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim()),
    effective: {
      resend_ready: Boolean(resolved.resend.apiKey && resolved.resend.from),
      whatsapp_ready: Boolean(resolved.whatsapp.token && resolved.whatsapp.phoneNumberId),
    },
  };
}

const PATCH_STRING_FIELDS = [
  'reminder_from_email',
  'whatsapp_phone_number_id',
  'whatsapp_api_version',
  'whatsapp_expiry_template_name',
  'whatsapp_expiry_template_lang',
] as const;

export function mergeReminderIntegrationsPatch(
  existing: ReminderIntegrationsStored,
  patch: Record<string, unknown>,
): ReminderIntegrationsStored {
  const next: ReminderIntegrationsStored = { ...existing };

  for (const k of PATCH_STRING_FIELDS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v === null || v === undefined) {
      (next as Record<string, string | undefined>)[k] = '';
      continue;
    }
    const s = String(v).trim();
    (next as Record<string, string | undefined>)[k] = s.slice(0, 500);
  }

  for (const field of ['resend_api_key', 'whatsapp_cloud_token'] as const) {
    if (!(field in patch)) continue;
    const v = patch[field];
    if (v === null || v === '') {
      delete (next as Record<string, unknown>)[field];
      continue;
    }
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (!t) {
      delete (next as Record<string, unknown>)[field];
      continue;
    }
    if (t === '********' || t === '••••••••') continue;
    (next as Record<string, unknown>)[field] = t.slice(0, 500);
  }

  return next;
}
