import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Camera, Mail, Phone, User, Lock, Save, Loader2 } from 'lucide-react';
import { toast } from '../../lib/toast';

export const ResellerProfile = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    avatar_url: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('users')
          .select('name, email, phone, avatar_url')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        
        if (data) {
          setFormData({
            name: data.name || '',
            email: data.email || user.email || '',
            phone: data.phone || '',
            password: '',
            avatar_url: data.avatar_url || '',
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
      
      await supabase.from('users').update({ avatar_url: data.publicUrl }).eq('id', user?.id);
      
      toast.success('Profile picture updated successfully!');
      
      // Dispatch an event so the ResellerLayout can update the avatar immediately
      window.dispatchEvent(new Event('vibe:reseller-avatar-refresh'));
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      toast.error(error.message || 'Error uploading image.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!user) throw new Error('Not authenticated');

      // 1. Update Auth if email or password changed
      const authUpdates: any = {};
      const isEmailChanging = formData.email !== user.email;
      if (isEmailChanging) authUpdates.email = formData.email;
      if (formData.password) authUpdates.password = formData.password;
      
      authUpdates.data = {
        name: formData.name,
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
          email: formData.email,
        })
        .eq('id', user.id);

      if (publicError) throw publicError;

      if (isEmailChanging) {
        toast.success('Profile updated! Please check your new email to verify the change before logging in with it.');
      } else {
        toast.success('Profile updated successfully!');
      }
      
      setFormData({ ...formData, password: '' }); // clear password field
      
      // Dispatch an event so the header updates the name
      window.dispatchEvent(new Event('vibe:reseller-avatar-refresh'));
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 lg:py-12">
      <div className="mb-8 lg:mb-10">
        <h2 className="text-3xl lg:text-4xl font-bold text-white tracking-tight">Profile Settings</h2>
        <p className="text-gray-400 text-sm lg:text-base mt-2">Manage your account details and security.</p>
      </div>

      <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 sm:p-8 lg:p-10 shadow-2xl">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Avatar Section */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 pb-8 border-b border-white/5">
            <div className="relative group shrink-0">
              <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full overflow-hidden bg-white flex items-center justify-center border-4 border-[#0a0a0a] shadow-xl">
                {formData.avatar_url ? (
                  <img 
                    src={formData.avatar_url} 
                    alt="Profile" 
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-3xl sm:text-4xl font-bold text-black uppercase">
                    {formData.name ? formData.name.charAt(0) : 'R'}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full cursor-pointer"
              >
                <Camera className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarUpload}
                accept="image/*"
                className="hidden"
              />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-white mb-1">Profile Picture</h3>
              <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">Upload a new avatar. JPG, GIF or PNG. Max size of 2MB.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            <div className="space-y-2 lg:space-y-3">
              <label className="text-xs lg:text-sm font-semibold text-gray-300 ml-1">Full Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-4 w-4 lg:h-5 lg:w-5 text-gray-500" />
                </div>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full pl-11 lg:pl-12 pr-4 py-3 lg:py-4 bg-[#111111] border border-white/10 rounded-xl lg:rounded-2xl text-white focus:ring-2 focus:ring-white/20 focus:border-white/20 outline-none transition-all text-sm lg:text-base placeholder:text-gray-600"
                  placeholder="Your full name"
                />
              </div>
            </div>

            <div className="space-y-2 lg:space-y-3">
              <label className="text-xs lg:text-sm font-semibold text-gray-300 ml-1">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 lg:h-5 lg:w-5 text-gray-500" />
                </div>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full pl-11 lg:pl-12 pr-4 py-3 lg:py-4 bg-[#111111] border border-white/10 rounded-xl lg:rounded-2xl text-white focus:ring-2 focus:ring-white/20 focus:border-white/20 outline-none transition-all text-sm lg:text-base placeholder:text-gray-600"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            <div className="space-y-2 lg:space-y-3">
              <label className="text-xs lg:text-sm font-semibold text-gray-300 ml-1">Phone Number</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Phone className="h-4 w-4 lg:h-5 lg:w-5 text-gray-500" />
                </div>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full pl-11 lg:pl-12 pr-4 py-3 lg:py-4 bg-[#111111] border border-white/10 rounded-xl lg:rounded-2xl text-white focus:ring-2 focus:ring-white/20 focus:border-white/20 outline-none transition-all text-sm lg:text-base placeholder:text-gray-600"
                  placeholder="Your phone number"
                />
              </div>
            </div>

            <div className="space-y-2 lg:space-y-3">
              <label className="text-xs lg:text-sm font-semibold text-gray-300 ml-1">New Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 lg:h-5 lg:w-5 text-gray-500" />
                </div>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full pl-11 lg:pl-12 pr-4 py-3 lg:py-4 bg-[#111111] border border-white/10 rounded-xl lg:rounded-2xl text-white focus:ring-2 focus:ring-white/20 focus:border-white/20 outline-none transition-all text-sm lg:text-base placeholder:text-gray-600"
                  placeholder="Leave blank to keep current"
                />
              </div>
            </div>
          </div>

          <div className="pt-6 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center w-full sm:w-auto gap-2 px-8 py-3.5 lg:py-4 bg-white text-black rounded-xl lg:rounded-2xl font-bold hover:bg-gray-200 transition-all disabled:opacity-50 active:scale-[0.98] shadow-xl shadow-white/5 text-sm lg:text-base"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
