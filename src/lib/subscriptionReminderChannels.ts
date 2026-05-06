export type SubscriptionReminderChannels = {
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  sms_enabled: boolean;
};

const DEFAULT: SubscriptionReminderChannels = {
  email_enabled: true,
  whatsapp_enabled: true,
  sms_enabled: false,
};

export function parseSubscriptionReminderChannels(raw: unknown): SubscriptionReminderChannels {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT };
  const o = raw as Record<string, unknown>;
  return {
    email_enabled: o.email_enabled !== false,
    whatsapp_enabled: o.whatsapp_enabled !== false,
    sms_enabled: o.sms_enabled === true,
  };
}
