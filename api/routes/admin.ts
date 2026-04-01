import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Middleware to verify admin
const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check if user is admin in public.users
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    next();
  } catch (err) {
    console.error('Verify admin error:', err);
    res.status(500).json({ error: 'Server error during authorization' });
  }
};

router.delete('/users/:id', verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    // Delete from auth.users (This cascades to public.users if FK is setup, otherwise we delete manually)
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    
    if (authError) {
      console.error('Error deleting from auth:', authError);
      return res.status(500).json({ error: authError.message });
    }

    // Also explicitly delete from public.users just in case cascade is not set
    await supabase.from('users').delete().eq('id', userId);

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/users/:id', verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, phone, password, avatar_url } = req.body;

    // 1. Prepare Auth Updates (Email, Password, Phone metadata)
    const authUpdateData: any = {};
    if (email) authUpdateData.email = email;
    if (password) authUpdateData.password = password;
    if (phone) authUpdateData.phone = phone;

    const userMetadata: any = {};
    if (name) userMetadata.full_name = name;
    if (phone) userMetadata.phone = phone;
    
    if (Object.keys(userMetadata).length > 0) {
      authUpdateData.user_metadata = userMetadata;
    }

    if (Object.keys(authUpdateData).length > 0) {
      const { error: authError } = await supabase.auth.admin.updateUserById(userId, authUpdateData);
      if (authError) {
        console.error('Error updating auth user:', authError);
        return res.status(400).json({ error: authError.message });
      }
    }

    // 2. Prepare Public Profile Updates (Name, Phone, Avatar)
    const publicUpdateData: any = {};
    if (name) publicUpdateData.name = name;
    if (email) publicUpdateData.email = email; // Also sync email to public table
    if (phone) publicUpdateData.phone = phone;
    if (avatar_url !== undefined) publicUpdateData.avatar_url = avatar_url;

    if (Object.keys(publicUpdateData).length > 0) {
      const { error: publicError } = await supabase
        .from('users')
        .update(publicUpdateData)
        .eq('id', userId);

      if (publicError) {
        console.error('Error updating public user:', publicError);
        return res.status(400).json({ error: publicError.message });
      }
    }

    // 3. Log the activity
    const changes: string[] = [];
    if (name) changes.push('Name');
    if (email) changes.push('Email');
    if (phone) changes.push('Phone Number');
    if (password) changes.push('Password');
    if (avatar_url !== undefined) changes.push('Avatar');

    if (changes.length > 0) {
      // Get the admin's user ID from the token we verified earlier
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace('Bearer ', '') || '';
      const { data: { user: adminUser } } = await supabase.auth.getUser(token);

      await supabase.from('user_activity_logs').insert({
        user_id: userId,
        action_type: 'admin_update',
        changed_by: adminUser?.id || null,
        details: { message: `Admin updated ${changes.join(', ')}` }
      });
    }

    res.json({ success: true, message: 'User updated successfully' });
  } catch (error: any) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;