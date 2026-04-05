import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AdminEmailTeamDetailPanel } from '../components/admin/AdminEmailTeamDetailPanel';

/**
 * Full-page view for one email team: pool mailboxes, user seats, CSV export.
 * Linked from Admin → Email inventory → Teams.
 */
const AdminEmailTeamDetail: React.FC = () => {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, isAdmin, role } = useAuth();
  const [teamName, setTeamName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || role === null) return;
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    if (!isAdmin) {
      navigate('/', { replace: true });
    }
  }, [user, isAdmin, role, authLoading, navigate]);

  useEffect(() => {
    if (!teamId || !isAdmin) return;
    let cancelled = false;
    (async () => {
      setLoadError(null);
      const { data, error } = await supabase.from('email_teams').select('name').eq('id', teamId).maybeSingle();
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        setTeamName(null);
        return;
      }
      if (!data?.name) {
        setLoadError('Team not found');
        setTeamName(null);
        return;
      }
      setTeamName(data.name);
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, isAdmin]);

  const backHref = '/admin?tab=emails&emailTab=teams';

  if (authLoading || (user && isAdmin && teamId && teamName === null && !loadError)) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!teamId) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center text-gray-600 dark:text-gray-400">
        Invalid team link.
        <button
          type="button"
          onClick={() => navigate(backHref)}
          className="mt-4 block mx-auto text-indigo-600 dark:text-indigo-400 font-semibold"
        >
          Back to teams
        </button>
      </div>
    );
  }

  if (loadError || !teamName) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-red-600 dark:text-red-400">{loadError || 'Team not found'}</p>
        <button
          type="button"
          onClick={() => navigate(backHref)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to teams
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 md:py-10 space-y-6">
      <button
        type="button"
        onClick={() => navigate(backHref)}
        className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Teams &amp; organizations
      </button>

      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
          <Building2 className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">{teamName}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl leading-relaxed">
            All pool mailboxes labeled with this team and every user seat assigned to those mailboxes. Export CSV for
            your records.
          </p>
        </div>
      </div>

      <AdminEmailTeamDetailPanel teamId={teamId} teamName={teamName} />
    </div>
  );
};

export default AdminEmailTeamDetail;
