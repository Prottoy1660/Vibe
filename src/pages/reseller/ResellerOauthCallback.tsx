import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Loader2 } from 'lucide-react';
import { toast } from '../../lib/toast';
import { syncResellerProfileViaApi } from '../../lib/ensureResellerRole';

export const ResellerOauthCallback = () => {
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleOauthCallback = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        if (!session?.user || !session.access_token) throw new Error('No user session found after Google login');

        const synced = await syncResellerProfileViaApi(session.access_token);
        if (!synced.ok) {
          throw new Error(synced.error || 'Failed to set your account as a Reseller. Please contact support.');
        }

        toast.success('Successfully logged in as Reseller!');
        navigate('/reseller/dashboard', { replace: true });
      } catch (err: any) {
        console.error('Reseller OAuth error:', err);
        setErrorMsg(err.message || 'Authentication failed. Please try again.');
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
