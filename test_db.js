import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.rpc('run_sql', { sql: "SELECT conname FROM pg_constraint WHERE conrelid = 'user_emails'::regclass;" });
  console.log("data:", data, "error:", error);
}
test();
