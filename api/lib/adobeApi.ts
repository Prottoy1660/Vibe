import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.ADOBE_API_KEY || '';
const BASE_URL = 'https://reseller.adobe.yoga/api/credits-pool/external';

export async function grantAdobeCloudAccess(email: string, durationMonths: number): Promise<{ success: boolean; error?: string; data?: any }> {
  if (!API_KEY) {
    return { success: false, error: 'ADOBE_API_KEY is not configured in .env' };
  }

  try {
    const timestamp = Date.now().toString();
    const body = { email, durationMonths };
    const payload = timestamp + JSON.stringify(body);
    const signature = crypto.createHmac('sha256', API_KEY)
      .update(payload).digest('hex');

    const res = await fetch(`${BASE_URL}/add-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'x-timestamp': timestamp,
        'x-signature': signature
      },
      body: JSON.stringify(body)
    });
    
    const data = await res.json();
    
    if (!res.ok || data.error) {
      return { success: false, error: data.error || `HTTP ${res.status}` };
    }
    
    return { success: true, data };
  } catch (error: any) {
    console.error('Error granting Adobe Cloud Access:', error);
    return { success: false, error: error.message };
  }
}
