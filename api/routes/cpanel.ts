import express from 'express';
import dotenv from 'dotenv';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';
import { grantAdobeCloudAccess } from '../lib/adobeApi.js';
import { attachAdminActivityLogging } from '../lib/adminActivityLog.js';
import { buildInboxSnippetFromBody, extractAdobeVerificationCode } from '../../src/lib/inboxSnippet.ts';

dotenv.config();

const router = express.Router();

const CPANEL_HOST = process.env.CPANEL_HOST;
const CPANEL_USERNAME = process.env.CPANEL_USERNAME;
const CPANEL_API_TOKEN = process.env.CPANEL_API_TOKEN;
const IMAP_HOST = process.env.IMAP_HOST;
const IMAP_PORT = parseInt(process.env.IMAP_PORT || '993', 10);

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const verifyUser = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No authorization header' });
    
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token || token === 'undefined') {
      return res.status(401).json({ error: 'Missing Authorization token' });
    }
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    
    (req as any).user = user;
    next();
  } catch (err) {
    console.error('Verify user error:', err);
    res.status(500).json({ error: 'Server error during authorization' });
  }
};

const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No authorization header' });
    
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token || token === 'undefined') {
      return res.status(401).json({ error: 'Missing Authorization token' });
    }
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    
    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userData?.role !== 'admin' && userData?.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden: Admin access required' });

    attachAdminActivityLogging(req, res, user.id);
    next();
  } catch (err) {
    console.error('Verify admin error:', err);
    res.status(500).json({ error: 'Server error during authorization' });
  }
};

// Endpoint to create email accounts via cPanel API
router.post('/create-emails', verifyAdmin, async (req, res) => {
  try {
    const { accounts, cloudAccess, durationMonths } = req.body; // Array of { email, password }
    const wantAdobeAccess = String(cloudAccess || '').toLowerCase() === 'api';
    const durationMonthsResolved = Math.max(1, Math.min(120, Math.floor(Number(durationMonths) || 1)));
    const { data: adobeCfgRow } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'adobe_api_config')
      .maybeSingle();
    const adobeCfg = (adobeCfgRow?.value || {}) as {
      organizationId?: number;
      products?: string[];
    };

    if (!CPANEL_HOST || !CPANEL_USERNAME || !CPANEL_API_TOKEN) {
      return res.status(500).json({ error: 'cPanel credentials not configured' });
    }

    const results: Array<{
      email: string;
      success: boolean;
      error?: string;
      adobeError?: string;
      adobeSuccess?: boolean;
    }> = []; // one entry per requested account, same order as `accounts`

    // Create accounts one by one
    for (const acc of accounts) {
      const [emailUser, domain] = acc.email.split('@');
      
      const apiUrl = `${CPANEL_HOST}/execute/Email/add_pop`;
      
      // We use URLSearchParams to format the payload for the cPanel UAPI
      const params = new URLSearchParams();
      params.append('email', emailUser);
      params.append('password', acc.password);
      params.append('domain', domain);
      params.append('quota', '500'); // 500MB quota
      
      try {
        const response = await fetch(`${apiUrl}?${params.toString()}`, {
          method: 'GET', // UAPI execute allows GET with params
          headers: {
            'Authorization': `cpanel ${CPANEL_USERNAME}:${CPANEL_API_TOKEN}`
          },
          signal: AbortSignal.timeout(25000) // 25 second timeout
        });
        
        const responseText = await response.text();
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          console.error(`cPanel non-JSON response for ${acc.email}:`, responseText);
          results.push({ email: acc.email, success: false, error: 'Invalid response from cPanel' });
          continue;
        }
        
        if (data.status === 1) {
          if (wantAdobeAccess) {
            const adobeResult = await grantAdobeCloudAccess(acc.email, durationMonthsResolved, {
              organizationId: adobeCfg.organizationId,
              products: adobeCfg.products,
            });
            if (!adobeResult.success) {
              console.error(`Adobe API error for ${acc.email}:`, adobeResult.error);
              results.push({
                email: acc.email,
                success: true,
                adobeError: adobeResult.error || 'Adobe provisioning failed',
              });
            } else {
              const orgFromResponse = Number((adobeResult.data as any)?.user?.organizationId || 0);
              if (Number.isFinite(orgFromResponse) && orgFromResponse > 0 && orgFromResponse !== Number(adobeCfg.organizationId || 0)) {
                await supabase
                  .from('system_settings')
                  .upsert({
                    key: 'adobe_api_config',
                    value: {
                      organizationId: orgFromResponse,
                      products: Array.isArray(adobeCfg.products) ? adobeCfg.products : undefined,
                    },
                  }, { onConflict: 'key' });
              }
              console.log(`Adobe API OK for ${acc.email}`, adobeResult.data ?? '');
              results.push({ email: acc.email, success: true, adobeSuccess: true });
            }
          } else {
            results.push({ email: acc.email, success: true });
          }
        } else {
          console.error(`cPanel error for ${acc.email}:`, data.errors);
          results.push({ email: acc.email, success: false, error: data.errors?.[0] || 'Unknown error' });
        }
      } catch (err: any) {
        console.error(`Network error for ${acc.email}:`, err);
        results.push({ email: acc.email, success: false, error: err.message });
      }
    }

    const failed = results.filter(r => !r.success);
    if (failed.length > 0 && failed.length === accounts.length) {
       return res.status(500).json({ error: 'Failed to create any email accounts', details: failed });
    }

    const adobeAttempted = wantAdobeAccess ? results.filter(r => r.success).length : 0;
    const adobeOk = results.filter(r => r.success && r.adobeSuccess).length;
    const adobeFailed = results.filter(r => r.success && r.adobeError).length;

    res.json({
      success: true,
      results,
      adobeProvisioning: wantAdobeAccess
        ? {
            attempted: adobeAttempted,
            succeeded: adobeOk,
            failed: adobeFailed,
            durationMonths: durationMonthsResolved,
          }
        : { attempted: 0, succeeded: 0, failed: 0, durationMonths: durationMonthsResolved },
    });

  } catch (error) {
    console.error('Error in create-emails:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to delete an email mailbox in cPanel and remove from emails_pool
router.post('/delete-email', verifyAdmin, async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    if (!CPANEL_HOST || !CPANEL_USERNAME || !CPANEL_API_TOKEN) {
      return res.status(500).json({ success: false, error: 'cPanel credentials not configured' });
    }

    const [emailUser, domain] = email.split('@');
    if (!emailUser || !domain) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    const apiUrl = `${CPANEL_HOST}/execute/Email/delete_pop`;
    const params = new URLSearchParams();
    params.append('email', emailUser);
    params.append('domain', domain);

    try {
      const response = await fetch(`${apiUrl}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `cpanel ${CPANEL_USERNAME}:${CPANEL_API_TOKEN}`
        },
        signal: AbortSignal.timeout(20000)
      });

      const responseText = await response.text();
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error(`cPanel delete non-JSON response for ${email}:`, responseText);
        return res.status(502).json({ success: false, error: 'Invalid response from cPanel while deleting mailbox' });
      }

      if (data.status !== 1) {
        console.error(`cPanel delete error for ${email}:`, data.errors);
        return res.status(502).json({
          success: false,
          error: data.errors?.[0] || 'Failed to delete mailbox from cPanel',
        });
      }
    } catch (err: any) {
      console.error(`Network error deleting mailbox ${email}:`, err);
      return res.status(502).json({ success: false, error: err.message || 'Network error deleting mailbox' });
    }

    // Best-effort cleanup in Supabase pool
    try {
      await supabase.from('emails_pool').delete().eq('email', email);
    } catch (dbErr) {
      console.error(`Failed to delete emails_pool row for ${email}:`, dbErr);
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error in delete-email:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Endpoint to read inbox for a specific email
router.post('/inbox', verifyUser, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!IMAP_HOST) {
       return res.status(500).json({ error: 'IMAP host not configured' });
    }

    const config = {
      imap: {
        user: email,
        password: password,
        host: IMAP_HOST,
        port: IMAP_PORT,
        tls: true,
        tlsOptions: { 
          rejectUnauthorized: false,
          servername: IMAP_HOST // Important for some cPanel SNI setups
        }, 
        authTimeout: 15000
      }
    };

    const connection = await imaps.connect(config);
    const box = await connection.openBox('INBOX');

    // Fast search to get only message sequence numbers from the server
    const seqs = await new Promise<number[]>((resolve, reject) => {
      connection.imap.search(['ALL'], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    // If empty mailbox
    if (seqs.length === 0) {
      connection.end();
      return res.json({ success: true, messages: [] });
    }

    // Get the sequence numbers for the newest 10 messages
    seqs.sort((a, b) => b - a);
    const top10Seqs = seqs.slice(0, 10).map(String);
    
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT', ''],
      markSeen: false,
      struct: true
    };

    // Only fetch headers and bodies for the 10 messages
    const messages = await connection.search([top10Seqs], fetchOptions);
    
    // Sort to get newest first
    messages.sort((a, b) => b.attributes.uid - a.attributes.uid);
    const recentMessages = messages;

    const parsedMessages = [];

    for (const item of recentMessages) {
      const all = item.parts.find(part => part.which === '');
      if (!all) continue;

      const id = item.attributes.uid;
      const parsed = await simpleParser(all.body);
      
      const subject = parsed.subject || 'No Subject';
      const text = parsed.text || '';

      const code = extractAdobeVerificationCode(text);
      const snippet = buildInboxSnippetFromBody(text, 220, code);

      parsedMessages.push({
        id,
        subject,
        snippet,
        date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
        code
      });
    }

    connection.end();

    res.json({ success: true, messages: parsedMessages });

  } catch (error: any) {
    console.error('IMAP error:', error);
    res.status(500).json({ error: 'Failed to fetch inbox', details: error.message });
  }
});

export default router;
