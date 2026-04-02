import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function inspectOrder() {
  const { data: order } = await supabase.from('orders')
    .select('*, products(id, max_users_per_email)')
    .eq('id', 'b2903775-c138-489a-a51f-d16e786bbb3d')
    .single();
  
  console.log("Order product details:", order);
}
inspectOrder();
