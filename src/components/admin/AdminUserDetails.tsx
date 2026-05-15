import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Loader2, ArrowLeft, User, Mail, Phone, Calendar, 
  ShoppingBag, CreditCard, ShieldCheck, CheckCircle2, 
  XCircle, Activity, Edit2, Save, Camera, Lock, AlertCircle, History, Sparkles
} from 'lucide-react';
import { format, addMonths, isPast, parseISO, differenceInDays, formatDistanceToNow } from 'date-fns';
import { formatAuthProviderLabel } from '../../lib/authProviderLabels';
import { getApiBaseUrl } from '../../lib/apiBase';
import { getDefaultAvatarUrl, parseAvatarDefaultGender } from '../../lib/defaultAvatar';

interface AdminUserDetailsProps {
  userId: string;
  onBack: () => void;
}

type RecoveredPayment = {
  id: string;
  created_at: string;
  amount: number;
  gateway: string;
  event_type: string;
  message: string;
  trx_id: string | null;
  payment_id: string | null;
};

function extractRecoveredPayments(rows: any[]): RecoveredPayment[] {
  return (rows || [])
    .filter((row) => {
      const eventType = String(row?.event_type || '').toLowerCase();
      const gateway = String(row?.gateway || '').toLowerCase();
      if (eventType === 'bkash_payment_executed') return true;
      if (eventType === 'wallet_only_paid') return true;
      if (eventType === 'payment_simulated_dev') return true;
      if (eventType === 'payment_completed' && gateway !== 'bkash_tokenized') return true;
      return false;
    })
    .map((row) => ({
      id: String(row.id),
      created_at: String(row.created_at),
      amount: Number(row.amount) || 0,
      gateway: String(row.gateway || 'payment'),
      event_type: String(row.event_type || ''),
      message: String(row.message || 'Payment confirmed'),
      trx_id:
        typeof row.meta?.trx_id === 'string' && row.meta.trx_id.trim()
          ? row.meta.trx_id.trim()
          : null,
      payment_id:
        typeof row.meta?.payment_id === 'string' && row.meta.payment_id.trim()
          ? row.meta.payment_id.trim()
          : null,
    }));
}

export const AdminUserDetails: React.FC<AdminUserDetailsProps> = ({ userId, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [recoveredPayments, setRecoveredPayments] = useState<RecoveredPayment[]>([]);
  
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    avatar_url: ''
  });

  const [stats, setStats] = useState({
    totalSpent: 0,
    totalOrders: 0,
    activeSubscriptions: 0,
    totalEmailsGenerated: 0
  });

  /** One section at a time — easier to scan than a 3-column grid */
  const [detailTab, setDetailTab] = useState<'orders' | 'payments' | 'emails' | 'activity'>('orders');

  const fetchUserDetails = async () => {
    setLoading(true);
    try {
      // 1. Fetch User Profile
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (profileError) throw profileError;
      setUserProfile(profile);
      setEditForm({
        name: profile.name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        password: '',
        avatar_url: profile.avatar_url || ''
      });

      // 2. Fetch Orders
      const { data: userOrders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          products (title, duration)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;
      setOrders(userOrders || []);

      const { data: paymentRows, error: paymentsError } = await supabase
        .from('payment_events')
        .select('id, created_at, amount, gateway, event_type, message, meta, order_id')
        .eq('user_id', userId)
        .is('order_id', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (paymentsError) throw paymentsError;
      const recovered = extractRecoveredPayments(paymentRows || []);
      setRecoveredPayments(recovered);

      // Calculate basic stats
      const totalSpentFromOrders =
        userOrders?.filter((o) => o.payment_status === 'paid' || o.status === 'completed' || o.status === 'paid')
          .reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
      const totalRecoveredSpent = recovered.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const totalSpent = totalSpentFromOrders + totalRecoveredSpent;
      const totalOrders = userOrders?.length || 0;

      // 3. Fetch Emails
      const { data: userEmails, error: emailsError } = await supabase
        .from('user_emails')
        .select(`
          id,
          email_id,
          order_id,
          assigned_at,
          is_active,
          emails_pool:email_id (email, password),
          orders:order_id (
            created_at,
            status,
            products:product_id (duration)
          )
        `)
        .eq('user_id', userId)
        .order('assigned_at', { ascending: false });

      if (emailsError) throw emailsError;

      let activeSubs = 0;
      const processedEmails: any[] = [];

      if (userEmails) {
        // Group by order_id
        const groupedByOrder = userEmails.reduce((acc: any, curr: any) => {
          const oId = curr.order_id || 'unassigned';
          if (!acc[oId]) acc[oId] = [];
          acc[oId].push(curr);
          return acc;
        }, {});

        Object.values(groupedByOrder).forEach((orderGroup: any) => {
          orderGroup.forEach((item: any, index: number) => {
            const isReplaced = index > 0;
            const isRevoked = item.orders?.status === 'refunded' || item.orders?.status === 'cancelled';
            
            let expiresAt = null;
            let daysLeft = 0;
            let computedStatus = 'Active';

            if (item.orders && item.orders.products) {
              const durationStr = item.orders.products.duration.toLowerCase();
              let monthsToAdd = 1;
              
              if (durationStr.includes('year') || durationStr.includes('yr')) {
                const match = durationStr.match(/\d+/);
                monthsToAdd = match ? parseInt(match[0]) * 12 : 12;
              } else {
                const match = durationStr.match(/\d+/);
                monthsToAdd = match ? parseInt(match[0]) : 1;
              }

              const orderDate = parseISO(item.orders.created_at);
              expiresAt = addMonths(orderDate, monthsToAdd);
              const isExp = isPast(expiresAt);
              daysLeft = isExp ? 0 : differenceInDays(expiresAt, new Date());

              if (isRevoked) {
                computedStatus = 'Revoked';
              } else if (isReplaced) {
                computedStatus = 'Replaced';
              } else if (isExp) {
                computedStatus = 'Expired';
              } else if (daysLeft <= 7) {
                computedStatus = 'Expiring Soon';
                if (!isReplaced) activeSubs++;
              } else {
                computedStatus = 'Active';
                if (!isReplaced) activeSubs++;
              }
            } else {
               computedStatus = isRevoked ? 'Revoked' : (isReplaced ? 'Replaced' : 'Active');
               if (computedStatus === 'Active') activeSubs++;
            }

            const poolDataRaw = item.emails_pool || (item.email_id && typeof item.email_id === 'object' ? item.email_id : null);
            const poolData = Array.isArray(poolDataRaw) ? poolDataRaw[0] : poolDataRaw;

            processedEmails.push({
              ...item,
              emails_pool: {
                email: poolData?.email || 'Unknown',
                password: poolData?.password || 'Unknown'
              },
              computed_status: computedStatus,
              days_left: daysLeft,
              expires_at: expiresAt
            });
          });
        });
        
        processedEmails.sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime());
        setEmails(processedEmails);
      }

      // 4. Fetch Activity Logs
        const { data: logs, error: logsError } = await supabase
          .from('user_activity_logs')
          .select(`
            id,
            action_type,
            details,
            created_at,
            changed_by,
            changer:users!user_activity_logs_changed_by_fkey (name, role)
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(200);

        if (!logsError) {
          setActivityLogs(logs || []);
        }

        setStats({
        totalSpent,
        totalOrders,
        activeSubscriptions: activeSubs,
        totalEmailsGenerated: userEmails?.length || 0
      });

    } catch (err) {
      console.error('Error fetching user details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserDetails();
  }, [userId]);

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setSaving(true);
      setMessage(null);
      
      if (!e.target.files || e.target.files.length === 0) return;
      
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;
      
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      
      setEditForm({ ...editForm, avatar_url: data.publicUrl });
      
      // Auto-save just the avatar if not fully editing
      if (!isEditing) {
         await handleSaveProfile({ ...editForm, avatar_url: data.publicUrl });
      } else {
         setMessage({ type: 'success', text: 'Avatar uploaded. Click Save to apply changes.' });
      }
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      setMessage({ type: 'error', text: error.message || 'Error uploading image.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async (formDataToSave = editForm) => {
    setSaving(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const API_URL = getApiBaseUrl();
      const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(formDataToSave)
      });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Failed to update user');

      setMessage({ type: 'success', text: 'User profile updated successfully!' });
      setIsEditing(false);
      setEditForm(prev => ({ ...prev, password: '' })); // Clear password field
      
      // Refresh user details
      await fetchUserDetails();
    } catch (error: any) {
      console.error('Error updating user:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to update user.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
  }

  if (!userProfile) {
    return (
      <div className="text-center py-20">
        <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">User Not Found</h2>
        <button onClick={onBack} className="mt-4 text-primary hover:underline">Go Back</button>
      </div>
    );
  }

  const detailTabs = [
    { id: 'orders' as const, label: 'Orders', short: 'Purchases', icon: ShoppingBag, count: orders.length },
    { id: 'payments' as const, label: 'Recovered payments', short: 'Payments', icon: CreditCard, count: recoveredPayments.length },
    { id: 'emails' as const, label: 'Adobe accounts', short: 'Accounts', icon: Mail, count: emails.length },
    { id: 'activity' as const, label: 'Activity', short: 'Log', icon: History, count: activityLogs.length },
  ];
  const avatarFallbackUrl = getDefaultAvatarUrl(
    userProfile.email || userProfile.id,
    userProfile.name,
    parseAvatarDefaultGender(userProfile.avatar_default_gender),
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-300 max-w-6xl mx-auto">
      {/* Profile — single focused card */}
      <div className="rounded-2xl border border-gray-200/80 dark:border-[#2a2a32] bg-white dark:bg-[#121214] shadow-sm dark:shadow-none overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-white/5 bg-gradient-to-r from-indigo-50/40 via-transparent to-violet-50/30 dark:from-indigo-950/20 dark:to-transparent">
          <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Customer profile
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            Orders, subscriptions, and assigned Adobe accounts for this user.
          </p>
        </div>

        <div className="p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
            <button
              type="button"
              onClick={onBack}
              className="p-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 transition-colors shrink-0"
              aria-label="Back to user list"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="relative group shrink-0">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shadow-md overflow-hidden ring-2 ring-white dark:ring-[#1a1a1d] bg-gray-100 dark:bg-[#1a1a1f]">
                {userProfile.avatar_url ? (
                  <img src={userProfile.avatar_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : (
                  <img
                    src={avatarFallbackUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-2xl flex items-center justify-center bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Change photo"
              >
                <Camera className="w-5 h-5 text-white" />
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 gap-y-1">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {userProfile.name}
                </h2>
                <span className="text-xs text-gray-500 dark:text-gray-500 tabular-nums shrink-0 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/10">
                  Joined {format(new Date(userProfile.created_at), 'MMM d, yyyy')}
                </span>
                {userProfile.role === 'admin' && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200 font-medium">Admin</span>
                )}
                {userProfile.is_banned && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 font-medium">Banned</span>
                )}
              </div>
              <div className="mt-2 flex flex-col sm:flex-row sm:flex-wrap gap-x-4 gap-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Mail className="w-4 h-4 shrink-0 text-gray-400" />
                  <span className="truncate">{userProfile.email}</span>
                </span>
                {userProfile.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-4 h-4 shrink-0 text-gray-400" />
                    {userProfile.phone}
                  </span>
                )}
                <span className="flex items-center gap-1.5 min-w-0">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-gray-400" />
                  <span className="truncate">
                    Signup: <span className="font-medium text-gray-800 dark:text-gray-200">{formatAuthProviderLabel(userProfile.signup_auth_provider)}</span>
                  </span>
                </span>
                <span className="flex items-center gap-1.5 min-w-0">
                  <Activity className="w-4 h-4 shrink-0 text-gray-400" />
                  <span className="truncate">
                    Last sign-in: <span className="font-medium text-gray-800 dark:text-gray-200">{formatAuthProviderLabel(userProfile.last_sign_in_provider)}</span>
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex w-full lg:w-auto lg:shrink-0">
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className="w-full lg:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 shadow-sm transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              {isEditing ? 'Cancel editing' : 'Edit profile'}
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-start ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 mr-2 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 mr-2 shrink-0 mt-0.5" />}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {isEditing && (
        <div className="bg-white dark:bg-[#151518] rounded-2xl p-5 sm:p-6 shadow-sm dark:shadow-none border border-indigo-200/60 dark:border-indigo-500/20">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-indigo-500" />
            Edit profile
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Update name, contact, or password. Leave password blank to keep the current one.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input type="text" name="name" value={editForm.name} onChange={handleEditChange} className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-primary focus:border-primary outline-none dark:bg-[#111113] dark:text-gray-100" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input type="email" name="email" value={editForm.email} onChange={handleEditChange} className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-primary focus:border-primary outline-none dark:bg-[#111113] dark:text-gray-100" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input type="tel" name="phone" value={editForm.phone} onChange={handleEditChange} className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-primary focus:border-primary outline-none dark:bg-[#111113] dark:text-gray-100" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">New Password (optional)</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input type="password" name="password" value={editForm.password} onChange={handleEditChange} placeholder="Leave blank to keep current" className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-primary focus:border-primary outline-none dark:bg-[#111113] dark:text-gray-100" />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button 
              onClick={() => handleSaveProfile()} 
              disabled={saving}
              className="flex items-center px-6 py-2 bg-gradient-primary text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-70"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* At-a-glance metrics — compact strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total spent', sub: 'Paid orders plus recovered payments', value: `৳${stats.totalSpent.toFixed(2)}`, icon: CreditCard, tone: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
          { label: 'Orders', sub: 'All time', value: String(stats.totalOrders), icon: ShoppingBag, tone: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/30' },
          { label: 'Active subscriptions', sub: 'Non-replaced seats', value: String(stats.activeSubscriptions), icon: Activity, tone: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/30' },
          { label: 'Adobe accounts', sub: 'Issued to user', value: String(stats.totalEmailsGenerated), icon: Mail, tone: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30' },
        ].map((row) => (
          <div
            key={row.label}
            className="rounded-xl border border-gray-100 dark:border-[#2a2a32] bg-white dark:bg-[#121214] p-4 flex gap-3 items-start shadow-sm dark:shadow-none"
          >
            <div className={`w-10 h-10 rounded-lg ${row.bg} ${row.tone} flex items-center justify-center shrink-0`}>
              <row.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-500 leading-tight">{row.label}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 tabular-nums truncate">{row.value}</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">{row.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* One primary panel — tabbed to reduce clutter */}
      <div className="rounded-2xl border border-gray-200/80 dark:border-[#2a2a32] bg-white dark:bg-[#121214] shadow-sm dark:shadow-none overflow-hidden">
        <div className="p-2 sm:p-3 border-b border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-white/[0.02]">
          <p className="px-2 pb-2 text-xs font-medium text-gray-500 dark:text-gray-400">Details — pick a section</p>
          <div className="flex flex-wrap gap-2">
            {detailTabs.map((t) => {
              const Icon = t.icon;
              const active = detailTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDetailTab(t.id)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white shadow-sm dark:bg-indigo-500'
                      : 'bg-white dark:bg-[#1a1a1e] text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10 hover:border-indigo-300 dark:hover:border-indigo-500/40'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 opacity-90" />
                  <span className="hidden sm:inline">{t.label}</span>
                  <span className="sm:hidden">{t.short}</span>
                  <span
                    className={`text-xs tabular-nums px-1.5 py-0.5 rounded-md ${
                      active ? 'bg-white/20' : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {detailTab === 'orders' && (
            <div>
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-sky-500" />
                  Purchase history
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Every order for this customer, newest first.</p>
              </div>
              {orders.length > 0 ? (
                <div className="divide-y divide-gray-100 dark:divide-white/5 rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden max-h-[min(520px,70vh)] overflow-y-auto">
                  {orders.map((order) => (
                    <div key={order.id} className="p-4 hover:bg-gray-50/80 dark:hover:bg-white/[0.03] transition-colors">
                      <div className="flex justify-between items-start gap-3 mb-2">
                        <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">{order.products?.title || 'Unknown product'}</div>
                        <div className="font-semibold text-primary text-sm whitespace-nowrap">৳{order.total_amount}</div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-col gap-1 text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 shrink-0" /> {format(new Date(order.created_at), 'MMM d, yyyy · HH:mm')}
                          </span>
                          <span className="flex items-center gap-1 capitalize">
                            <CreditCard className="w-3.5 h-3.5 shrink-0" /> {order.payment_method}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`px-2 py-0.5 rounded-full font-medium capitalize ${
                              order.status === 'completed'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                                : order.status === 'paid'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
                                  : order.status === 'refunded'
                                    ? 'bg-gray-200 text-gray-800 dark:bg-zinc-700 dark:text-zinc-200'
                                    : order.status === 'cancelled'
                                      ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                                      : 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'
                            }`}
                          >
                            {order.status}
                          </span>
                          <span className="text-gray-400 dark:text-gray-500 font-mono text-[10px]">#{order.id.slice(0, 8)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/15 bg-gray-50/50 dark:bg-white/[0.02] px-6 py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-sky-100 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto mb-3">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">No orders yet</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                    When this customer completes a purchase, it will appear in this list.
                  </p>
                </div>
              )}
            </div>
          )}

          {detailTab === 'payments' && (
            <div>
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-amber-500" />
                  Recovered payment records
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Successful payment logs that still exist even though the linked order row is missing.
                </p>
              </div>
              {recoveredPayments.length > 0 ? (
                <div className="divide-y divide-gray-100 dark:divide-white/5 rounded-xl border border-gray-100 dark:border-white/5 overflow-hidden max-h-[min(520px,70vh)] overflow-y-auto">
                  {recoveredPayments.map((payment) => (
                    <div key={payment.id} className="p-4 hover:bg-gray-50/80 dark:hover:bg-white/[0.03] transition-colors">
                      <div className="flex justify-between items-start gap-3 mb-2">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                            {payment.gateway === 'bkash_tokenized' ? 'bKash payment confirmed' : 'Gateway payment confirmed'}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{payment.message}</p>
                        </div>
                        <div className="font-semibold text-amber-700 dark:text-amber-300 text-sm whitespace-nowrap">
                          ৳{payment.amount.toFixed(2)}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-col gap-1 text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 shrink-0" /> {format(new Date(payment.created_at), 'MMM d, yyyy · HH:mm')}
                          </span>
                          <span className="flex items-center gap-1 capitalize">
                            <CreditCard className="w-3.5 h-3.5 shrink-0" /> {(payment.gateway || 'payment').replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
                            Recovered
                          </span>
                          {payment.trx_id ? (
                            <span className="text-gray-400 dark:text-gray-500 font-mono text-[10px]">Trx {payment.trx_id}</span>
                          ) : payment.payment_id ? (
                            <span className="text-gray-400 dark:text-gray-500 font-mono text-[10px]">PayID {payment.payment_id.slice(0, 16)}</span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500 font-mono text-[10px]">Event {payment.event_type}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/15 bg-gray-50/50 dark:bg-white/[0.02] px-6 py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-3">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">No recovered payments</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
                    If a payment succeeds but its order row is missing, the gateway log will appear here.
                  </p>
                </div>
              )}
            </div>
          )}

          {detailTab === 'emails' && (
            <div>
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-500" />
                  Adobe accounts & expiry
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Credentials issued from the pool, with subscription window and current status.
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-white/5">
                {emails.length > 0 ? (
                  <table className="w-full text-left border-collapse min-w-[640px]">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-[#2a2a32] bg-gray-50/90 dark:bg-white/5">
                        <th className="py-3 px-3 sm:px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Account</th>
                        <th className="py-3 px-3 sm:px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Assigned</th>
                        <th className="py-3 px-3 sm:px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Expiry</th>
                        <th className="py-3 px-3 sm:px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                      {emails.map((email) => {
                        const isFaded = email.computed_status === 'Replaced' || email.computed_status === 'Revoked';
                        return (
                          <tr
                            key={email.id}
                            className={`hover:bg-gray-50/80 dark:hover:bg-white/[0.03] transition-colors ${isFaded ? 'opacity-60 bg-gray-50/40 dark:bg-white/[0.02]' : ''}`}
                          >
                            <td className="py-3 px-3 sm:px-4 align-top">
                              <div className={`text-sm font-medium ${isFaded ? 'text-gray-500 line-through dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                                {email.emails_pool.email}
                              </div>
                              <div className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-1 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded inline-block">
                                {email.emails_pool.password}
                              </div>
                              <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 font-mono">Order {email.order_id?.slice(0, 8)}</div>
                            </td>
                            <td className="py-3 px-3 sm:px-4 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                              {format(new Date(email.assigned_at), 'MMM d, yyyy')}
                            </td>
                            <td className="py-3 px-3 sm:px-4">
                              {email.expires_at ? (
                                <div className="flex flex-col gap-1">
                                  <span
                                    className={`text-sm font-semibold ${
                                      isFaded ? 'text-gray-400 dark:text-gray-500' : email.computed_status === 'Expired' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                                    }`}
                                  >
                                    {email.days_left} days left
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                    <Calendar className="w-3 h-3 shrink-0" />
                                    {format(email.expires_at, 'MMM d, yyyy')}
                                  </span>
                                  {!isFaded && (
                                    <div className="w-full bg-gray-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden max-w-[120px]">
                                      <div
                                        className={`h-full rounded-full ${email.computed_status === 'Expired' ? 'bg-red-500' : 'bg-emerald-500'}`}
                                        style={{ width: `${Math.min(100, Math.max(0, (email.days_left / 30) * 100))}%` }}
                                      />
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-gray-400 dark:text-gray-500 italic">Unknown</span>
                              )}
                            </td>
                            <td className="py-3 px-3 sm:px-4 text-right align-top">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                  email.computed_status === 'Active'
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                                    : email.computed_status === 'Expiring Soon'
                                      ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'
                                      : email.computed_status === 'Expired'
                                        ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                                        : email.computed_status === 'Replaced'
                                          ? 'bg-gray-200 text-gray-700 dark:bg-zinc-700 dark:text-zinc-200'
                                          : 'bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-100'
                                }`}
                              >
                                {email.computed_status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-6 py-14 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
                      <Mail className="w-6 h-6" />
                    </div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">No Adobe accounts yet</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
                      After an order assigns an email from the pool, you will see it here with expiry and status.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {detailTab === 'activity' && (
            <div>
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <History className="w-4 h-4 text-violet-500" />
                  Recent activity
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Profile and admin changes recorded for this user.</p>
              </div>
              {activityLogs.length > 0 ? (
                <div className="divide-y divide-gray-100 dark:divide-white/5 rounded-xl border border-gray-100 dark:border-white/5 max-h-[min(480px,65vh)] overflow-y-auto">
                  {activityLogs.map((log) => (
                    <div key={log.id} className="p-4 hover:bg-gray-50/80 dark:hover:bg-white/[0.03] transition-colors">
                      <div className="flex justify-between items-start gap-3 mb-1">
                        <div className="font-medium text-gray-900 dark:text-gray-100 text-sm flex items-start gap-2">
                          <span
                            className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                              log.action_type === 'admin_update' ? 'bg-violet-500' : log.action_type === 'profile_update' ? 'bg-sky-500' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                          />
                          <span>{log.details?.message || log.action_type.replace('_', ' ')}</span>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 pl-4 flex items-center gap-1">
                        <User className="w-3 h-3 shrink-0" />
                        {log.changer?.name || 'System'}
                        {log.changer?.role === 'admin' ? ' · Admin' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/15 bg-gray-50/50 dark:bg-white/[0.02] px-6 py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 flex items-center justify-center mx-auto mb-3">
                    <History className="w-6 h-6" />
                  </div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">No activity logged</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">When admins or the user make changes, entries show up here.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
