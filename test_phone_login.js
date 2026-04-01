import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  console.log('1. Checking public.users table for phone numbers...');
  const { data: users, error } = await supabase.from('users').select('email, phone').not('phone', 'is', null);
  
  if (error) {
    console.error('Error fetching users:', error);
  } else {
    console.log('Users with phone numbers:', users);
    
    if (users && users.length > 0) {
      console.log('\n2. Testing get_email_by_phone RPC function...');
      const testPhone = users[0].phone;
      console.log(`Testing with phone: ${testPhone}`);
      
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_email_by_phone', { 
        p_phone: testPhone 
      });
      
      if (rpcError) {
        console.error('RPC Error:', rpcError);
        console.log('NOTE: If you see an error here, the SQL script for get_email_by_phone was likely not run.');
      } else {
        console.log('RPC Result:', rpcData);
      }
    } else {
      console.log('No users with phone numbers found in the public.users table.');
      console.log('This means the user has not registered with a phone number yet, or the data migration was not run.');
    }
  }
}
test();