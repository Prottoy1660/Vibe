import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data, error } = await supabase.from('users').select('id, is_banned').limit(1);
  console.log('Test result:', error ? error.message : 'Success! is_banned exists.');
}
test();
