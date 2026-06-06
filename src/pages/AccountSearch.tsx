import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import { getApiBaseUrl } from '../lib/apiBase';
import { isMainCustomerSite, RESELLER_SITE_URL } from '../lib/resellerAuth';
import {
  searchPublicAccountStatus,
  type PublicAccountSearchResult,
} from '../lib/publicAccountStatus';
import { PublicSubscriptionStatusCard } from '../components/public/PublicSubscriptionStatusCard';

export const AccountSearch: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PublicAccountSearchResult | null>(null);

  useEffect(() => {
    if (isMainCustomerSite()) {
      window.location.replace(`${RESELLER_SITE_URL}/reseller/search${window.location.search}`);
    }
  }, []);

  const runSearch = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Please enter an email address.');
      setResult(null);
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const base = getApiBaseUrl();
      if (!base) {
        throw new Error('API is not configured. Try again from superreseller.shop.');
      }
      const data = await searchPublicAccountStatus(trimmed, base);
      setResult(data);
      setSearchParams(trimmed ? { email: trimmed } : {}, { replace: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = searchParams.get('email')?.trim();
    if (initial) {
      setEmail(initial);
      void runSearch(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(email);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-gray-200 flex flex-col">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[150px] mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/5 blur-[150px] mix-blend-screen" />
      </div>

      <header className="relative z-10 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <Link
            to="/reseller/login"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Super Reseller login
          </Link>
          <div className="flex items-center gap-2">
            <img src="/super.png" alt="" className="w-6 h-6 object-contain" />
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">Status search</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-3xl mx-auto w-full px-4 py-10 md:py-14">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-indigo-300">
            <Search className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Customer status search</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Live status from the activation panel — any active email can be checked here.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-[#0a0a0a]/80 backdrop-blur p-5 shadow-2xl mb-8"
        >
          <label htmlFor="search-email" className="block text-sm font-medium text-gray-300 mb-2">
            Customer email
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="search-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
              autoComplete="email"
              className="flex-1 rounded-xl border border-white/10 bg-[#111111] px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 placeholder:text-gray-600"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-gray-200 text-black font-bold px-5 py-3 text-sm disabled:opacity-60 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </div>
        </form>

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-sm text-red-300 mb-6">
            {error}
          </div>
        )}

        {loading && !result && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          </div>
        )}

        {result && result.resellerSubscriptions.length > 0 && (
          <section className="space-y-4">
            {result.resellerSubscriptions.map((status) => (
              <PublicSubscriptionStatusCard key={status.id} status={status} />
            ))}
          </section>
        )}

        <p className="text-xs text-gray-500 mt-10 text-center">
          Reseller agent?{' '}
          <Link to="/reseller/login" className="text-indigo-300 hover:text-white font-medium">
            Sign in to Super Reseller
          </Link>
        </p>
      </main>
    </div>
  );
};
