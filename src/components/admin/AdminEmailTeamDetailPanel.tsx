import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Loader2,
  Eye,
  EyeOff,
  Download,
  AlertCircle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  flattenTeamAssignments,
  type TeamDetailPoolRow,
  type TeamDetailUserEmail,
  type FlatTeamAssignmentRow,
} from '../../lib/adminEmailTeamUtils';

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const statusStyles: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  assigned: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  shared: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  used: 'bg-gray-200 text-gray-800 dark:bg-white/10 dark:text-gray-300',
};

function normalizePoolRows(raw: Record<string, unknown>[]): TeamDetailPoolRow[] {
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    const products = r.products;
    const prod =
      Array.isArray(products) && products[0] && typeof products[0] === 'object'
        ? (products[0] as { title?: string })
        : products && typeof products === 'object'
          ? (products as { title?: string })
          : null;
    const uesRaw = r.user_emails;
    const ues = Array.isArray(uesRaw) ? uesRaw : [];
    const user_emails: TeamDetailUserEmail[] = ues.map((ue: Record<string, unknown>) => {
      const u = ue.users;
      const users =
        Array.isArray(u) && u[0] && typeof u[0] === 'object'
          ? (u[0] as { id: string; name: string; email: string })
          : u && typeof u === 'object'
            ? (u as { id: string; name: string; email: string })
            : null;
      const o = ue.orders;
      const orders =
        Array.isArray(o) && o[0] && typeof o[0] === 'object'
          ? (o[0] as { status: string })
          : o && typeof o === 'object'
            ? (o as { status: string })
            : null;
      return {
        id: String(ue.id),
        assigned_at: String(ue.assigned_at || ''),
        is_active: Boolean(ue.is_active),
        order_id: (ue.order_id as string | null) ?? null,
        users,
        orders,
      };
    });
    return {
      id: String(r.id),
      email: String(r.email),
      password: String(r.password),
      status: String(r.status),
      assigned_at: (r.assigned_at as string | null) ?? null,
      created_at: String(r.created_at),
      slot_intent: (r.slot_intent as string | null) ?? null,
      current_users: (r.current_users as number | null) ?? null,
      is_burned: (r.is_burned as boolean | null) ?? null,
      products: prod && prod.title != null ? { title: String(prod.title) } : null,
      user_emails: user_emails.length ? user_emails : null,
    };
  });
}

type Props = {
  teamId: string;
  teamName: string;
};

export const AdminEmailTeamDetailPanel: React.FC<Props> = ({ teamId, teamName }) => {
  const [teamDetailRaw, setTeamDetailRaw] = useState<TeamDetailPoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: qErr } = await supabase
          .from('emails_pool')
          .select(
            `
            id,
            email,
            password,
            status,
            assigned_at,
            created_at,
            slot_intent,
            current_users,
            is_burned,
            products:product_id (title),
            user_emails (
              id,
              assigned_at,
              is_active,
              order_id,
              users:user_id (id, name, email),
              orders:order_id (status)
            )
          `,
          )
          .eq('team_id', teamId)
          .order('created_at', { ascending: false });
        if (qErr) throw qErr;
        if (!cancelled) {
          const raw = (data || []) as Record<string, unknown>[];
          setTeamDetailRaw(normalizePoolRows(raw));
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load team emails';
        if (!cancelled) {
          setError(msg);
          setTeamDetailRaw([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const teamDetailFlat = useMemo(() => flattenTeamAssignments(teamDetailRaw), [teamDetailRaw]);

  const handleExportTeamDetailCsv = useCallback(() => {
    if (!teamDetailFlat.length) return;
    const header =
      'Team,Pool email,Password,Pool status,Product,Slot intent,Pool created,Pool assigned,User name,User email,Assignment at,Assignment active,Order status';
    const rows = teamDetailFlat.map((r: FlatTeamAssignmentRow) =>
      [
        teamName,
        r.poolEmail,
        r.password,
        r.poolStatus,
        r.productTitle,
        r.slotIntent,
        r.poolCreatedAt ? format(parseISO(r.poolCreatedAt), 'yyyy-MM-dd HH:mm') : '',
        r.poolAssignedAt ? format(parseISO(r.poolAssignedAt), 'yyyy-MM-dd HH:mm') : '',
        r.userName,
        r.userEmail,
        r.assignmentAt ? format(parseISO(r.assignmentAt), 'yyyy-MM-dd HH:mm') : '',
        r.assignmentActive ? 'yes' : 'no',
        r.orderStatus,
      ]
        .map((c) => escapeCsvField(String(c)))
        .join(','),
    );
    const csv = [header, ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safe = teamName.replace(/[^\w\-]+/g, '_').slice(0, 80);
    a.download = `team_${safe}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [teamDetailFlat, teamName]);

  const togglePasswordVisibility = (id: string) =>
    setShowPasswords((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="rounded-xl border border-indigo-200/60 dark:border-indigo-500/25 bg-indigo-50/30 dark:bg-indigo-950/20 p-4 md:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">
            Pool mailboxes &amp; assignments
          </h4>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            Adobe pool emails tagged with this team, and user seats (one row per assignment when shared).
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleExportTeamDetailCsv()}
          disabled={loading || teamDetailFlat.length === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download CSV
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 mb-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
          Loading team emails…
        </div>
      )}

      {!loading && !error && teamDetailFlat.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
          No pool emails are tagged with this team yet.
        </p>
      )}

      {!loading && !error && teamDetailFlat.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200/80 dark:border-[#303038] bg-white dark:bg-[#151518]">
          <table className="w-full min-w-[64rem] text-left text-xs table-fixed">
            <thead>
              <tr className="border-b border-gray-100 dark:border-[#26262d] bg-gray-50/80 dark:bg-white/5">
                <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider w-[18%]">Pool email</th>
                <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider w-[10%]">Password</th>
                <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider w-[8%]">Status</th>
                <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider w-[14%]">Product</th>
                <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider w-[8%]">Slot</th>
                <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider w-[12%]">User</th>
                <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider w-[14%]">User email</th>
                <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider w-[8%]">Assigned</th>
                <th className="py-2.5 px-3 font-bold text-gray-500 uppercase tracking-wider w-[8%]">Active</th>
              </tr>
            </thead>
            <tbody>
              {teamDetailFlat.map((row) => (
                <tr
                  key={`${row.poolId}-${row.userEmailRowId}`}
                  className="border-b border-gray-50 dark:border-white/[0.03] hover:bg-gray-50/40 dark:hover:bg-white/[0.02] align-top"
                >
                  <td className="py-2.5 px-3 font-mono text-[11px] font-semibold text-gray-900 dark:text-gray-100 break-all">
                    {row.poolEmail}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded max-w-[6rem] truncate">
                        {showPasswords[row.poolId] ? row.password : '••••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility(row.poolId)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5 shrink-0"
                        title={showPasswords[row.poolId] ? 'Hide password' : 'Show password'}
                      >
                        {showPasswords[row.poolId] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${statusStyles[row.poolStatus] || statusStyles.used}`}
                    >
                      {row.poolStatus}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300 break-words" title={row.productTitle}>
                    {row.productTitle || '—'}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {row.slotIntent === 'shared' ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300">
                        Shared
                      </span>
                    ) : row.slotIntent === 'exclusive' ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                        Exclusive
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-gray-800 dark:text-gray-200 break-words" title={row.userName}>
                    {row.userName || '—'}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[10px] text-gray-600 dark:text-gray-400 break-all">
                    {row.userEmail || '—'}
                  </td>
                  <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400 whitespace-nowrap tabular-nums">
                    {row.assignmentAt ? format(parseISO(row.assignmentAt), 'MMM d, HH:mm') : '—'}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {row.userEmailRowId.startsWith('unassigned') ? (
                      <span className="text-gray-400">—</span>
                    ) : row.assignmentActive ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Yes</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">No</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
