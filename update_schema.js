require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function update() {
  // Let's check existing columns first
  const { data: pData, error: pErr } = await supabase.from('products').select('*').limit(1);
  const { data: eData, error: eErr } = await supabase.from('emails_pool').select('*').limit(1);
  console.log('Products:', pData ? Object.keys(pData[0]) : pErr);
  console.log('Emails:', eData ? Object.keys(eData[0]) : eErr);
}
update();
