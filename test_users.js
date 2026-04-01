import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data, error } = await supabase.from('users').select('*').limit(5);
  console.log('Users data:', JSON.stringify(data, null, 2));
  if (error) console.error('Error:', error);
}
test();
