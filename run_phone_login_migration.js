import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sql = `
-- Function to get email by phone securely without requiring auth
CREATE OR REPLACE FUNCTION public.get_email_by_phone(p_phone TEXT)
RETURNS TABLE (email TEXT) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT u.email 
  FROM public.users u
  WHERE u.phone = p_phone
  LIMIT 1;
END;
$$;

-- Grant execute permissions to anonymous users
GRANT EXECUTE ON FUNCTION public.get_email_by_phone(TEXT) TO anon;
`;

console.log("Please run this SQL in your Supabase dashboard to enable Phone Login:\n\n" + sql);
