import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Loader2 } from 'lucide-react';
import { toast } from '../../lib/toast';

export const ResellerOauthCallback = () => {
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleOauthCallback = async () => {
      try {
        // First get the current session that was just established by OAuth
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) throw sessionError;
        if (!session?.user) throw new Error('No user session found after Google login');

        const userId = session.user.id;

        // Check the user's current role
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('role')
          .eq('id', userId)
          .single();

        // If the profile fetch failed but the user exists in auth, they might be brand new
        // and the trigger is creating their profile. We'll give it a moment and try to update.
        if (profileError && profileError.code !== 'PGRST116') {
           throw profileError;
        }

        // If the user's role is not reseller, we need to update it.
        // We only allow updating to 'reseller' if they are a standard 'user' or 'customer'.
        // If they are an 'admin', we shouldn't demote them.
        if (profile?.role !== 'reseller' && profile?.role !== 'admin' && profile?.role !== 'super_admin') {
           await supabase.auth.updateUser({
             data: { role: 'reseller', full_name: session.user.user_metadata?.full_name },
           });

           const { error: updateError } = await supabase
             .from('users')
             .update({ role: 'reseller' })
             .eq('id', userId);
             
           if (updateError) {
              console.error('Failed to set reseller role:', updateError);
              throw new Error('Failed to set your account as a Reseller. Please contact support.');
           }
        }

        toast.success('Successfully logged in as Reseller!');
        navigate('/reseller/dashboard', { replace: true });
        
      } catch (err: any) {
        console.error('Reseller OAuth error:', err);
        setErrorMsg(err.message || 'Authentication failed. Please try again.');
        // Sign out if there was a critical failure to prevent them from being stuck in limbo
        await supabase.auth.signOut();
      }
    };

    void handleOauthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-4">
      {errorMsg ? (
        <div className="bg-[#111] border border-red-500/20 rounded-2xl p-8 max-w-md text-center shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Authentication Error</h2>
          <p className="text-gray-400 mb-6">{errorMsg}</p>
          <button 
            onClick={() => navigate('/reseller/login')}
            className="w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors font-medium"
          >
            Back to Login
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-500 mb-4" />
          <h2 className="text-xl font-medium text-white">Configuring Reseller Access...</h2>
          <p className="text-gray-400 mt-2">Please wait while we set up your portal.</p>
        </div>
      )}
    </div>
  );
};
