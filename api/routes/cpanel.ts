import express from 'express';
import dotenv from 'dotenv';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';
import { grantAdobeCloudAccess } from '../lib/adobeApi.js';

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
    
    const token = authHeader.replace('Bearer ', '');
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
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    
    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userData?.role !== 'admin') return res.status(403).json({ error: 'Forbidden: Admin access required' });
    
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
    
    if (!CPANEL_HOST || !CPANEL_USERNAME || !CPANEL_API_TOKEN) {
      return res.status(500).json({ error: 'cPanel credentials not configured' });
    }

    const results = [];
    
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
          // If cPanel creation succeeded, and admin selected 'api' for cloud access
          if (cloudAccess === 'api') {
            const adobeResult = await grantAdobeCloudAccess(acc.email, durationMonths || 1);
            if (!adobeResult.success) {
              console.error(`Adobe API error for ${acc.email}:`, adobeResult.error);
              results.push({ email: acc.email, success: true, adobeError: adobeResult.error });
            } else {
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

    res.json({ success: true, results });

  } catch (error) {
    console.error('Error in create-emails:', error);
    res.status(500).json({ error: 'Internal server error' });
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
      
      // Generate a snippet
      const snippet = text.substring(0, 100).replace(/\s+/g, ' ') + '...';
      
      // Try to extract an Adobe verification code (usually a 6 digit number)
      let code = null;
      // Look for common code patterns (e.g., "code is 123456" or just big 6 digit numbers)
      const codeMatch = text.match(/\b\d{6}\b/);
      if (codeMatch) {
        // Simple heuristic: if it says Adobe or Verification near it, or just grab the first 6 digit number
        code = codeMatch[0];
      }

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
