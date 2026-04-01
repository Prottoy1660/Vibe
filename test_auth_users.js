import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data: users, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error('Error fetching auth users:', error);
    return;
  }
  
  console.log('Auth Users Metadata:');
  users.users.slice(0, 3).forEach(u => {
    console.log(`Email: ${u.email}`);
    console.log(`Metadata:`, u.user_metadata);
    console.log('---');
  });

  const { data: publicUsers } = await supabase.from('users').select('email, phone').limit(3);
  console.log('\nPublic Users Table Data:');
  console.log(publicUsers);
}
test();
