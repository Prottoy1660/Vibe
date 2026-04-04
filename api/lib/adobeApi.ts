import crypto from 'node:crypto';

/**
 * Reseller Adobe credits pool — must match official request shape:
 * POST /add-user, body { email, durationMonths }, HMAC-SHA256(timestamp + JSON.stringify(body), api_key)
 * @see https://reseller.adobe.yoga (external API docs)
 */
const API_KEY = (process.env.ADOBE_API_KEY || '').trim();
const BASE_URL = 'https://reseller.adobe.yoga/api/credits-pool/external';

export async function grantAdobeCloudAccess(email: string, durationMonths: number): Promise<{ success: boolean; error?: string; data?: any }> {
  if (!API_KEY) {
    return { success: false, error: 'ADOBE_API_KEY is not configured in .env' };
  }

  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { success: false, error: 'Invalid email for Adobe provisioning' };
  }

  const months = Math.max(1, Math.min(120, Math.floor(Number(durationMonths)) || 1));

  try {
    const timestamp = Date.now().toString();
    // Key order must stay email then durationMonths — same as docs' JS/Python examples (signing uses this exact JSON).
    const body = { email: normalizedEmail, durationMonths: months };
    const bodyJson = JSON.stringify(body);
    const payload = timestamp + bodyJson;
    const signature = crypto.createHmac('sha256', API_KEY)
      .update(payload, 'utf8')
      .digest('hex');

    const res = await fetch(`${BASE_URL}/add-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'x-timestamp': timestamp,
        'x-signature': signature
      },
      body: bodyJson,
      signal: AbortSignal.timeout(25000) // 25 second timeout
    });
    
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('Adobe API non-JSON response:', text);
      return { success: false, error: `Invalid response from Adobe API: ${res.status}` };
    }

    const errMsg =
      data.error ||
      (data.success === false ? data.message || 'Adobe API returned success: false' : null);
    if (!res.ok || errMsg) {
      const msg = errMsg || `HTTP ${res.status}`;
      console.error('[Adobe API add-user]', normalizedEmail, res.status, msg, typeof data === 'object' ? JSON.stringify(data).slice(0, 500) : '');
      return { success: false, error: msg };
    }
    
    return { success: true, data };
  } catch (error: any) {
    console.error('Error granting Adobe Cloud Access:', error);
    return { success: false, error: error.message };
  }
}
