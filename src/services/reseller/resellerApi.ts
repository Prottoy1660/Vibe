import { supabase } from '../../lib/supabase';
import { getApiBaseUrl } from '../../lib/apiBase';
import { getAccessTokenForApi } from '../../lib/getAccessTokenForApi';

export interface ResellerUser {
  id: string;
  reseller_id?: string;
  email: string;
  durationMonths: string;
  durationDays: number;
  activatedAt: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'refunded';
  products: string[];
  organizationId?: number | null;
  organizationName?: string | null;
  organizationSyncedAt?: string | null;
}

export interface Transaction {
  id: string;
  reseller_id?: string;
  amount: number;
  type: 'deposit' | 'deduct' | 'refund' | 'system';
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  createdAt: string;
  description: string;
  txId?: string;
  balanceAfter?: number;
  binanceOrderId?: string;
  binanceTransactionId?: string;
  payerBinanceId?: string;
  payerName?: string;
  payerType?: string;
  paymentChannel?: 'pay' | 'crypto';
  paymentCurrency?: string;
  binanceTransactionTime?: string;
  resellerName?: string;
  resellerEmail?: string;
}

export type AdminDepositsQuery = {
  page?: number;
  pageSize?: number;
  status?: 'all' | Transaction['status'];
  search?: string;
};

export type AdminDepositsResult = {
  deposits: Transaction[];
  total: number;
  pendingCount: number;
};

function mapResellerTransactionRow(t: Record<string, unknown>): Transaction {
  return {
    id: String(t.id),
    reseller_id: t.reseller_id ? String(t.reseller_id) : undefined,
    amount: Number(t.amount) || 0,
    type: t.type as Transaction['type'],
    status: t.status as Transaction['status'],
    createdAt: String(t.created_at),
    description: String(t.description || ''),
    txId: t.tx_id ? String(t.tx_id) : undefined,
    balanceAfter: t.balance_after != null ? Number(t.balance_after) : undefined,
    binanceOrderId: t.binance_order_id ? String(t.binance_order_id) : undefined,
    binanceTransactionId: t.binance_transaction_id ? String(t.binance_transaction_id) : undefined,
    payerBinanceId: t.payer_binance_id ? String(t.payer_binance_id) : undefined,
    payerName: t.payer_name ? String(t.payer_name) : undefined,
    payerType: t.payer_type ? String(t.payer_type) : undefined,
    paymentChannel: t.payment_channel as Transaction['paymentChannel'],
    paymentCurrency: t.payment_currency ? String(t.payment_currency) : undefined,
    binanceTransactionTime: t.binance_transaction_time ? String(t.binance_transaction_time) : undefined,
  };
}

export interface ResellerPackage {
  id: string;
  label: string;
  value: string;
  cost: number;
  baseCost?: number;
  isCustomPrice?: boolean;
}

export interface ResellerUserStatus {
  id: string;
  email: string;
  overallStatus: 'active' | 'expired' | 'refunded';
  teamStatus: 'normal' | 'attention' | 'unknown';
  teamMessage: string;
  organizationName: string | null;
  organizationId: number | null;
  products: string[];
  planDuration: string;
  activatedAt: string | null;
  expiresAt: string | null;
  daysLeft: number;
  progressPercent: number;
  adobeLive: boolean;
  organizationSyncedAt: string | null;
  refundEligible: boolean;
  refundRemainingMs: number | null;
  adobeStatus: string | null;
}

export const ResellerApi = {
  getDashboardData: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get current balance from users table (wallet_balance)
    const { data: profile } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();
    const balance = profile?.wallet_balance || 0;

    // Get active and refunded counts from reseller_user_access
    const { data: usersData } = await supabase
      .from('reseller_user_access')
      .select('status, expires_at')
      .eq('reseller_id', user.id);

    const activeUsers = usersData?.filter(u => u.status === 'active').length || 0;
    const refunded = usersData?.filter(u => u.status === 'refunded').length || 0;
    const totalUsers = usersData?.length || 0;
    const expired = usersData?.filter(u => u.status === 'expired').length || 0;

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const expiringIn7Days = usersData?.filter(u => {
      if (u.status !== 'active') return false;
      const expDate = new Date(u.expires_at);
      return expDate > now && expDate <= sevenDaysFromNow;
    }).length || 0;

    // Calculate Total Spent
    const { data: txData } = await supabase
      .from('reseller_transactions')
      .select('amount, type')
      .eq('reseller_id', user.id)
      .eq('status', 'completed');

    let totalSpent = 0;
    if (txData) {
      txData.forEach(tx => {
        if (tx.type === 'deduct') {
          totalSpent += Math.abs(tx.amount);
        } else if (tx.type === 'refund') {
          totalSpent -= Math.abs(tx.amount); // Net spent after refunds
        }
      });
    }
    totalSpent = Math.max(0, totalSpent);
    
    return {
      balance,
      totalSpent,
      activeUsers,
      totalUsers,
      refunded,
      expired,
      expiringIn7Days
    };
  },

  getPackages: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const apiRes = await fetch(`${getApiBaseUrl()}/api/reseller/packages`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const data = await apiRes.json();
    if (!apiRes.ok || !data.success) {
      throw new Error(data.error || 'Failed to load packages');
    }
    return (data.packages || []) as ResellerPackage[];
  },

  syncAdobeOrganizations: async (force = false) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const apiRes = await fetch('/api/reseller/adobe/sync-organizations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ force }),
    });
    const data = await apiRes.json();
    if (!apiRes.ok || !data.success) {
      throw new Error(data.error || 'Failed to sync organizations from Adobe');
    }
    return data as { synced: number; message: string };
  },

  getUserStatus: async (userId: string, options?: { forceRefresh?: boolean }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const refresh = options?.forceRefresh ? '1' : '0';
    const apiRes = await fetch(`/api/reseller/users/${encodeURIComponent(userId)}/status?refresh=${refresh}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const data = await apiRes.json();
    if (!apiRes.ok || !data.success) {
      throw new Error(data.error || 'Failed to load subscription status');
    }
    return data.status as ResellerUserStatus;
  },

  getUsers: async (options?: { skipSync?: boolean; forceSync?: boolean }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const mapRows = (rows: any[]) =>
      (rows || []).map((d) => ({
        id: d.id,
        reseller_id: d.reseller_id,
        email: d.customer_email,
        durationMonths: d.duration_months,
        durationDays: d.duration_days,
        status: d.status,
        products: d.products || [],
        activatedAt: d.activated_at,
        expiresAt: d.expires_at,
        organizationId: d.adobe_organization_id ?? null,
        organizationName: d.adobe_organization_name ?? null,
        organizationSyncedAt: d.adobe_synced_at ?? null,
      })) as ResellerUser[];

    const refresh = options?.forceSync ? '1' : '0';

    try {
      const apiRes = await fetch(`/api/reseller/users?refresh=${refresh}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await apiRes.json();
      if (apiRes.ok && data.success) {
        return (data.users || []) as ResellerUser[];
      }
      console.warn('Reseller users API unavailable, falling back to Supabase:', data.error);
    } catch (e) {
      console.warn('Reseller users API request failed, falling back to Supabase:', e);
    }

    // Fallback: load directly from Supabase (exclude refunded — same as My Users policy)
    if (!options?.skipSync) {
      try {
        await ResellerApi.syncAdobeOrganizations(options?.forceSync);
      } catch (e) {
        console.warn('Adobe organization sync skipped:', e);
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('reseller_user_access')
      .select('*')
      .eq('reseller_id', user.id)
      .neq('status', 'refunded')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return mapRows(data);
  },

  activateUser: async (email: string, duration: string, cost: number) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Not authenticated');
    const user = session.user;

    // 1. Check balance
    const { data: profile } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();
    const balance = profile?.wallet_balance || 0;

    if (balance < cost) {
      throw new Error('Insufficient balance. Please add funds.');
    }

    // 2. Prepare payload and durationDays
    let durationDays = 30;
    const durationStr = duration.toString().toLowerCase();
    
    if (durationStr.endsWith('d')) {
      durationDays = parseInt(durationStr.replace('d', '')) || 7;
    } else {
      durationDays = (parseInt(durationStr) || 1) * 30;
    }
    
    // Call external API via our backend.
    // The backend now securely handles the balance deduction and database inserts!
    const apiRes = await fetch('/api/reseller/adobe/activate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ 
        email, 
        durationMonths: duration,
        cost,
        durationDays 
      })
    });

    const text = await apiRes.text();
    let apiData;
    try {
      apiData = text ? JSON.parse(text) : {};
    } catch (e) {
      console.error('Raw response from backend:', text);
      throw new Error(`Server error: invalid response format.`);
    }

    if (!apiRes.ok || apiData.success === false) {
       throw new Error(apiData.error || apiData.message || apiData.msg || 'Failed to activate user on Adobe API');
    }

    // Database updates are now handled securely by the backend API

    return {
      id: apiData.data?.id || 'pending',
      email,
      durationMonths: duration,
      durationDays,
      activatedAt: apiData.data?.activated_at || new Date().toISOString(),
      expiresAt: apiData.data?.expires_at || new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      products: apiData.data?.products || ['Creative Cloud Pro']
    } as ResellerUser;
  },

  bulkActivateUsers: async (emails: string[], duration: string, costPerUser: number) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Not authenticated');
    const user = session.user;

    const totalCost = costPerUser * emails.length;

    // 1. Check balance
    const { data: profile } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();
    const balance = profile?.wallet_balance || 0;

    if (balance < totalCost) {
      throw new Error(`Insufficient balance for bulk activation. Need $${totalCost.toFixed(2)}.`);
    }

    // 2. Call external API for each user via backend
    const successfulEmails: string[] = [];
    const failedEmails: string[] = [];
    
    let durationDays = 30;
    const durationStr = duration.toString().toLowerCase();
    if (durationStr.endsWith('d')) {
      durationDays = parseInt(durationStr.replace('d', '')) || 7;
    } else {
      durationDays = (parseInt(durationStr) || 1) * 30;
    }

    // Process in chunks or sequentially to avoid overwhelming the external API
    for (const email of emails) {
      try {
        const apiRes = await fetch('/api/reseller/adobe/activate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ 
            email, 
            durationMonths: duration,
            cost: costPerUser,
            durationDays
          })
        });
        
        const text = await apiRes.text();
        let apiData = {};
        try {
          if (text) apiData = JSON.parse(text);
        } catch (e) {
          // ignore parsing errors here, it will fail the check below
        }

        if (apiRes.ok && (apiData as any).success) {
          successfulEmails.push(email);
        } else {
          failedEmails.push(email);
        }
      } catch (e) {
        failedEmails.push(email);
      }
    }

    if (successfulEmails.length === 0) {
      throw new Error('Failed to activate any users via Adobe API.');
    }

    // Backend handles the balance deduction and database inserts per user!
    
    if (failedEmails.length > 0) {
      throw new Error(`Activated ${successfulEmails.length} users. Failed: ${failedEmails.length} (${failedEmails.join(', ')}). You were only charged for successful activations.`);
    }

    return true;
  },

  bulkExtendUsers: async (emails: string[], duration: string, costPerUser: number) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Not authenticated');
    const user = session.user;

    const totalCost = costPerUser * emails.length;

    // 1. Check balance
    const { data: profile } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();
    const balance = profile?.wallet_balance || 0;

    if (balance < totalCost) {
      throw new Error(`Insufficient balance for bulk extension. Need $${totalCost.toFixed(2)}.`);
    }

    // 2. Call external API for each user via backend
    const successfulEmails: string[] = [];
    const failedEmails: string[] = [];
    
    let durationDays = 30;
    const durationStr = duration.toString().toLowerCase();
    if (durationStr.endsWith('d')) {
      durationDays = parseInt(durationStr.replace('d', '')) || 7;
    } else {
      durationDays = (parseInt(durationStr) || 1) * 30;
    }

    // Process sequentially
    let lastError = '';
    for (const email of emails) {
      try {
        const apiRes = await fetch('/api/reseller/adobe/extend', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ 
            email, 
            durationMonths: duration,
            cost: costPerUser,
            durationDays
          })
        });
        
        const text = await apiRes.text();
        let apiData: { success?: boolean; error?: string; message?: string } = {};
        try {
          if (text) apiData = JSON.parse(text);
        } catch {
          // ignore
        }

        if (apiRes.ok && apiData.success) {
          successfulEmails.push(email);
        } else {
          lastError = apiData.error || apiData.message || `Extend failed (HTTP ${apiRes.status})`;
          failedEmails.push(email);
        }
      } catch (e: any) {
        lastError = e?.message || 'Network error while extending user';
        failedEmails.push(email);
      }
    }

    if (successfulEmails.length === 0) {
      throw new Error(lastError || 'Failed to extend any users.');
    }

    if (failedEmails.length > 0) {
      throw new Error(`Extended ${successfulEmails.length} users. Failed: ${failedEmails.length} (${failedEmails.join(', ')}). You were only charged for successful extensions.`);
    }

    return true;
  },

  extendUser: async (email: string, duration: string, cost: number) => {
    return ResellerApi.bulkExtendUsers([email], duration, cost);
  },

  deleteUser: async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Not authenticated');
    const user = session.user;

    // 1. Fetch the user access record
    const { data: accessRecord, error: fetchError } = await supabase
      .from('reseller_user_access')
      .select('*')
      .eq('id', id)
      .eq('reseller_id', user.id)
      .single();

    if (fetchError || !accessRecord) throw new Error('User not found');

    const activatedAt = new Date(accessRecord.activated_at);
    const now = new Date();
    const hoursDiff = (now.getTime() - activatedAt.getTime()) / (1000 * 60 * 60);

    // Fetch effective package cost (includes per-reseller custom pricing)
    const packages = await ResellerApi.getPackages();
    const pkg = packages.find((p) => p.value === accessRecord.duration_months);
    const cost = pkg
      ? pkg.cost
      : accessRecord.duration_months.endsWith('d')
        ? parseInt(accessRecord.duration_months) * 0.5
        : parseInt(accessRecord.duration_months) * 5.0;

    // Get current balance
    const { data: profile } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();
    let currentBalance = profile?.wallet_balance || 0;

    // 2. Call external API to remove
    const apiRes = await fetch('/api/reseller/adobe/deactivate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ 
        email: accessRecord.customer_email,
        recordId: id,
        cost,
        hoursDiff,
        currentBalance,
        status: accessRecord.status
      })
    });

    const text = await apiRes.text();
    let apiData;
    try {
      apiData = text ? JSON.parse(text) : {};
    } catch (e) {
      console.error('Raw response from backend:', text);
      throw new Error(`Server error: invalid response format.`);
    }

    if (!apiRes.ok || apiData.success === false) {
      throw new Error(apiData.error || apiData.message || apiData.msg || 'Failed to deactivate user on Adobe API');
    }

    // Database updates are now securely handled by the backend API
    return true;
  },

  bulkDeleteUsers: async (emails: string[]) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Not authenticated');
    const user = session.user;

    // 1. Fetch matching active records
    const { data: accessRecords, error: fetchError } = await supabase
      .from('reseller_user_access')
      .select('*')
      .eq('reseller_id', user.id)
      .eq('status', 'active')
      .in('customer_email', emails);

    if (fetchError) throw fetchError;
    if (!accessRecords || accessRecords.length === 0) {
      throw new Error('No active users found for the provided emails.');
    }

    // 2. Fetch packages to calculate costs
    const packages = await ResellerApi.getPackages();
    const packageMap = new Map(packages.map((p) => [p.value, p.cost]));

    // Get current balance
    const { data: profile } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();
    let currentBalance = profile?.wallet_balance || 0;

    const now = new Date();

    // Call external API for each record
    const successfulIds: string[] = [];
    const failedEmails: string[] = [];

    let totalRefund = 0;
    let refundedCount = 0;
    let expiredCount = 0;

    for (const record of accessRecords) {
      try {
        const activatedAt = new Date(record.activated_at);
        const hoursDiff = (now.getTime() - activatedAt.getTime()) / (1000 * 60 * 60);
        
        const cost = packageMap.get(record.duration_months) || 
          (record.duration_months.endsWith('d') ? parseInt(record.duration_months) * 0.5 : parseInt(record.duration_months) * 5.0);

        const apiRes = await fetch('/api/reseller/adobe/deactivate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ 
            email: record.customer_email,
            recordId: record.id,
            cost,
            hoursDiff,
            currentBalance,
            status: record.status
          })
        });
        
        const text = await apiRes.text();
        let apiData = {};
        try {
          if (text) apiData = JSON.parse(text);
        } catch (e) {}

        if (apiRes.ok && (apiData as any).success) {
          successfulIds.push(record.id);
          // If refunded, optimistic balance update for next iteration
          if (hoursDiff <= 24 && record.status === 'active') {
            currentBalance += cost;
            totalRefund += cost;
            refundedCount++;
          } else {
            expiredCount++;
          }
        } else {
          failedEmails.push(record.customer_email);
        }
      } catch (e) {
        failedEmails.push(record.customer_email);
      }
    }

    if (successfulIds.length === 0) {
      throw new Error('Failed to deactivate any users via Adobe API.');
    }

    // Backend handles the balance deduction and database inserts per user!
    
    if (failedEmails.length > 0) {
      throw new Error(`Removed ${successfulIds.length} users. Failed: ${failedEmails.length} (${failedEmails.join(', ')}). Only successful removals were processed.`);
    }

    return {
      processedCount: successfulIds.length,
      refundedCount,
      expiredCount,
      totalRefund
    };
  },

  addFunds: async (amount: number, txId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Not authenticated');

    const apiRes = await fetch('/api/reseller/binance/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ txId, expectedAmount: amount })
    });

    const data = await apiRes.json();
    if (!apiRes.ok || !data.success) {
      throw new Error(data.error || 'Failed to verify transaction');
    }

    return data; // contains status ('completed' or 'pending') and message
  },
  
  getTransactions: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('reseller_transactions')
      .select('*')
      .eq('reseller_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((t) => mapResellerTransactionRow(t)) as Transaction[];
  },

  getPaymentHistory: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('reseller_transactions')
      .select('*')
      .eq('reseller_id', user.id)
      .eq('type', 'deposit')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((t) => mapResellerTransactionRow(t)) as Transaction[];
  },

  syncPaymentDetailsFromBinance: async () => {
    const token = await getAccessTokenForApi();
    if (!token) throw new Error('Not authenticated');

    const apiRes = await fetch(`${getApiBaseUrl()}/api/reseller/binance/sync-deposits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await apiRes.json();
    if (!apiRes.ok || !data.success) {
      throw new Error(data.error || 'Failed to sync payment details from Binance');
    }
    return data as { synced: number; attempted: number };
  },

  // --- Admin Methods ---

  adminGetPackages: async () => {
    const { data, error } = await supabase.from('reseller_packages').select('*').order('cost', { ascending: true });
    if (error) throw error;
    return data as ResellerPackage[];
  },

  adminCreatePackage: async (pkg: Omit<ResellerPackage, 'id'>) => {
    const { data, error } = await supabase.from('reseller_packages').insert({
      label: pkg.label,
      value: pkg.value,
      cost: pkg.cost
    }).select().single();
    if (error) throw error;
    return data;
  },

  adminUpdatePackage: async (id: string, updates: Partial<ResellerPackage>) => {
    const { error } = await supabase.from('reseller_packages').update(updates).eq('id', id);
    if (error) throw error;
  },

  adminDeletePackage: async (id: string) => {
    const { error } = await supabase.from('reseller_packages').delete().eq('id', id);
    if (error) throw error;
  },

  adminGetDeposits: async (query: AdminDepositsQuery = {}): Promise<AdminDepositsResult> => {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const search = query.search?.trim() || '';

    const { count: pendingCount } = await supabase
      .from('reseller_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'deposit')
      .eq('status', 'pending');

    let dbQuery = supabase
      .from('reseller_transactions')
      .select('*, users!reseller_id(name, email)', { count: 'exact' })
      .eq('type', 'deposit')
      .order('created_at', { ascending: false });

    if (query.status && query.status !== 'all') {
      dbQuery = dbQuery.eq('status', query.status);
    }

    if (search) {
      const { data: matchedUsers } = await supabase
        .from('users')
        .select('id')
        .or(`email.ilike.%${search}%,name.ilike.%${search}%`);

      const resellerIds = (matchedUsers || []).map((u) => u.id);
      if (resellerIds.length > 0) {
        dbQuery = dbQuery.in('reseller_id', resellerIds);
      } else {
        dbQuery = dbQuery.or(
          [
            `tx_id.ilike.%${search}%`,
            `payer_binance_id.ilike.%${search}%`,
            `payer_name.ilike.%${search}%`,
            `binance_transaction_id.ilike.%${search}%`,
            `binance_order_id.ilike.%${search}%`,
          ].join(','),
        );
      }
    }

    const { data, error, count } = await dbQuery.range(from, to);

    if (error) throw error;

    const deposits = (data || []).map(
      (t: Record<string, unknown> & { users?: { name?: string; email?: string } | null }) => {
        const mapped = mapResellerTransactionRow(t);
        mapped.resellerName = t.users?.name ? String(t.users.name) : undefined;
        mapped.resellerEmail = t.users?.email ? String(t.users.email) : undefined;
        return mapped;
      },
    ) as Transaction[];

    return {
      deposits,
      total: count ?? 0,
      pendingCount: pendingCount ?? 0,
    };
  },

  adminSyncDepositsFromBinance: async (ids?: string[]) => {
    const token = await getAccessTokenForApi();
    if (!token) throw new Error('Not authenticated');

    const apiRes = await fetch(`${getApiBaseUrl()}/api/admin/reseller/deposits/sync-missing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(ids?.length ? { ids } : {}),
    });
    const data = await apiRes.json();
    if (!apiRes.ok || !data.success) {
      throw new Error(data.error || 'Failed to sync deposits from Binance');
    }
    return data as { synced: number; attempted: number };
  },

  adminUpdateDepositStatus: async (id: string, status: 'approved' | 'rejected') => {
    const token = await getAccessTokenForApi();
    if (!token) throw new Error('Not authenticated');

    const apiRes = await fetch(`${getApiBaseUrl()}/api/admin/reseller/deposits/${id}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });
    const data = await apiRes.json();
    if (!apiRes.ok || !data.success) {
      throw new Error(data.error || 'Failed to update deposit status');
    }
    return true;
  },
};
