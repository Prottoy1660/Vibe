import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Loader2, Camera, Mail, Phone, User, Lock, Save, AlertCircle, CheckCircle2 } from 'lucide-react';

export const Profile = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    avatar_url: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        
        if (data) {
          setFormData({
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            password: '', // We don't fetch password
            avatar_url: data.avatar_url || ''
          });
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setFetching(false);
      }
    };

    fetchProfile();
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setLoading(true);
      setMessage(null);
      
      if (!e.target.files || e.target.files.length === 0) {
        return;
      }
      
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;
      
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      
      setFormData({ ...formData, avatar_url: data.publicUrl });
      
      // Update public users table immediately for avatar
      await supabase.from('users').update({ avatar_url: data.publicUrl }).eq('id', user?.id);
      
      setMessage({ type: 'success', text: 'Profile picture updated successfully!' });
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      setMessage({ type: 'error', text: error.message || 'Error uploading image.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (!user) throw new Error('Not authenticated');

      // 1. Update Auth if email or password changed
      const authUpdates: any = {};
      if (formData.email !== user.email) authUpdates.email = formData.email;
      if (formData.password) authUpdates.password = formData.password;
      
      // Update user_metadata for name and phone
      authUpdates.data = {
        full_name: formData.name,
        phone: formData.phone
      };

      if (Object.keys(authUpdates).length > 0) {
        const { error: authError } = await supabase.auth.updateUser(authUpdates);
        if (authError) throw authError;
      }

      // 2. Update Public Users Table
      const { error: publicError } = await supabase
        .from('users')
        .update({
          name: formData.name,
          phone: formData.phone,
          email: formData.email // Sync email to public table as well
        })
        .eq('id', user.id);

      if (publicError) throw publicError;

      // 3. Log the activity
      const changes: string[] = [];
      if (formData.name) changes.push('Name');
      if (formData.email !== user.email) changes.push('Email');
      if (formData.phone) changes.push('Phone Number');
      if (formData.password) changes.push('Password');

      if (changes.length > 0) {
        await supabase.from('user_activity_logs').insert({
          user_id: user.id,
          action_type: 'profile_update',
          changed_by: user.id,
          details: { message: `Updated ${changes.join(', ')}` }
        });
      }

      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      if (formData.email !== user.email) {
        setMessage({ type: 'success', text: 'Profile updated! Check your email for a confirmation link to verify your new email address.' });
      }
      
      setFormData(prev => ({ ...prev, password: '' })); // Clear password field
      
    } catch (error: any) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to update profile.' });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <div className="bg-white dark:bg-[#151518] rounded-2xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden">
        <div className="bg-gradient-primary h-32 relative">
          <div className="absolute -bottom-12 left-8">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full border-4 border-white bg-white dark:bg-[#151518] overflow-hidden shadow-md flex items-center justify-center">
                {formData.avatar_url ? (
                  <img src={formData.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-600 text-3xl font-bold">
                    {formData.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
              </div>
              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }}
                className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
              >
                <Camera className="w-6 h-6 text-white" />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                onChange={handleAvatarUpload}
              />
            </div>
          </div>
        </div>

        <div className="pt-16 p-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Personal Information</h2>
          <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 text-sm mb-8">Update your photo and personal details here.</p>

          {message && (
            <div className={`p-4 rounded-xl mb-6 flex items-start ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
              {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 mr-2 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 mr-2 shrink-0 mt-0.5" />}
              <span className="text-sm font-medium">{message.text}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Full Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </div>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="pl-10 w-full rounded-xl border-gray-200 dark:border-[#26262d] border px-4 py-2.5 text-sm focus:ring-primary focus:border-primary outline-none transition-colors dark:bg-[#111113] dark:text-gray-100"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Phone Number</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </div>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="pl-10 w-full rounded-xl border-gray-200 dark:border-[#26262d] border px-4 py-2.5 text-sm focus:ring-primary focus:border-primary outline-none transition-colors dark:bg-[#111113] dark:text-gray-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </div>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="pl-10 w-full rounded-xl border-gray-200 dark:border-[#26262d] border px-4 py-2.5 text-sm focus:ring-primary focus:border-primary outline-none transition-colors dark:bg-[#111113] dark:text-gray-100"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1.5">Changing email requires verification.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">New Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </div>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Leave blank to keep current"
                    className="pl-10 w-full rounded-xl border-gray-200 dark:border-[#26262d] border px-4 py-2.5 text-sm focus:ring-primary focus:border-primary outline-none transition-colors dark:bg-[#111113] dark:text-gray-100"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-[#26262d]">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center px-6 py-2.5 bg-gradient-primary text-white rounded-xl font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-70"
              >
                {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};