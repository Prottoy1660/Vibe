import { supabase } from '../../lib/supabase';

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
}

export interface ResellerPackage {
  id: string;
  label: string;
  value: string;
  cost: number;
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
    const { data, error } = await supabase.from('reseller_packages').select('*').order('cost', { ascending: true });
    if (error) throw error;
    return data as ResellerPackage[];
  },

  getUsers: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('reseller_user_access')
      .select('*')
      .eq('reseller_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(d => ({
      id: d.id,
      reseller_id: d.reseller_id,
      email: d.customer_email,
      durationMonths: d.duration_months,
      durationDays: d.duration_days,
      status: d.status,
      products: d.products || [],
      activatedAt: d.activated_at,
      expiresAt: d.expires_at
    })) as ResellerUser[];
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

    // Fetch the package cost
    const { data: pkg } = await supabase.from('reseller_packages').select('cost').eq('value', accessRecord.duration_months).single();
    const cost = pkg ? pkg.cost : (accessRecord.duration_months.endsWith('d') ? parseInt(accessRecord.duration_months) * 0.5 : parseInt(accessRecord.duration_months) * 5.0);

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

    // Call external API for each record
    const successfulIds: string[] = [];
    const failedEmails: string[] = [];

    for (const record of accessRecords) {
      try {
        const apiRes = await fetch('/api/reseller/adobe/deactivate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ email: record.customer_email })
        });
        
        const text = await apiRes.text();
        let apiData = {};
        try {
          if (text) apiData = JSON.parse(text);
        } catch (e) {}

        if (apiRes.ok && (apiData as any).success) {
          successfulIds.push(record.id);
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

    // Filter to only successful records
    const successfulRecords = accessRecords.filter(r => successfulIds.includes(r.id));

    // 2. Fetch packages to calculate costs
    const { data: packages } = await supabase.from('reseller_packages').select('*');
    const packageMap = new Map((packages || []).map(p => [p.value, p.cost]));

    let totalRefund = 0;
    const refundedIds: string[] = [];
    const expiredIds: string[] = [];

    const now = new Date();

    successfulRecords.forEach(record => {
      const activatedAt = new Date(record.activated_at);
      const hoursDiff = (now.getTime() - activatedAt.getTime()) / (1000 * 60 * 60);
      
      if (hoursDiff <= 24) {
        const cost = packageMap.get(record.duration_months) || 
          (record.duration_months.endsWith('d') ? parseInt(record.duration_months) * 0.5 : parseInt(record.duration_months) * 5.0);
        totalRefund += cost;
        refundedIds.push(record.id);
      } else {
        expiredIds.push(record.id);
      }
    });

    // 3. Update balance if there is a refund
    let currentBalance = 0;
    const { data: profile } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();
    currentBalance = profile?.wallet_balance || 0;

    if (totalRefund > 0) {
      currentBalance += totalRefund;
      await supabase.from('users').update({ wallet_balance: currentBalance }).eq('id', user.id);
    }

    // 4. Update statuses
    if (refundedIds.length > 0) {
      await supabase.from('reseller_user_access').update({ status: 'refunded' }).in('id', refundedIds);
    }
    if (expiredIds.length > 0) {
      await supabase.from('reseller_user_access').update({ status: 'expired' }).in('id', expiredIds);
    }

    // 5. Create transaction record
    await supabase.from('reseller_transactions').insert({
      reseller_id: user.id,
      amount: totalRefund,
      type: totalRefund > 0 ? 'refund' : 'system',
      status: 'completed',
      description: `Bulk remove: ${successfulRecords.length} users (${refundedIds.length} refunded, ${expiredIds.length} expired)`,
      balance_after: currentBalance
    });

    if (failedEmails.length > 0) {
      throw new Error(`Removed ${successfulRecords.length} users. Failed: ${failedEmails.length} (${failedEmails.join(', ')}). Only successful removals were processed.`);
    }

    return {
      processedCount: successfulRecords.length,
      refundedCount: refundedIds.length,
      expiredCount: expiredIds.length,
      totalRefund
    };
  },

  addFunds: async (amount: number, txId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: profile } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();
    
    await supabase.from('reseller_transactions').insert({
      reseller_id: user.id,
      amount,
      type: 'deposit',
      status: 'pending',
      tx_id: txId,
      description: 'Binance Deposit Pending',
      balance_after: profile?.wallet_balance || 0
    });

    return true;
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

    return (data || []).map(t => ({
      id: t.id,
      amount: t.amount,
      type: t.type,
      status: t.status,
      createdAt: t.created_at,
      description: t.description,
      txId: t.tx_id,
      balanceAfter: t.balance_after
    })) as Transaction[];
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

  adminGetDeposits: async () => {
    const { data, error } = await supabase
      .from('reseller_transactions')
      .select('*, users(email)')
      .eq('type', 'deposit')
      .order('created_at', { ascending: false });
    
    if (error) throw error;

    return (data || []).map((t: any) => ({
      id: t.id,
      reseller_id: t.reseller_id,
      amount: t.amount,
      type: t.type,
      status: t.status,
      createdAt: t.created_at,
      description: t.description + (t.users?.email ? ` (from ${t.users.email})` : ''),
      txId: t.tx_id,
      balanceAfter: t.balance_after
    })) as Transaction[];
  },

  adminUpdateDepositStatus: async (id: string, status: 'approved' | 'rejected') => {
    // 1. Get the transaction
    const { data: tx, error: fetchError } = await supabase
      .from('reseller_transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !tx) throw new Error('Transaction not found');
    if (tx.status !== 'pending') throw new Error('Already processed');

    // 2. If approved, add balance to the user
    if (status === 'approved') {
      const { data: profile } = await supabase.from('users').select('wallet_balance').eq('id', tx.reseller_id).single();
      const newBalance = (profile?.wallet_balance || 0) + tx.amount;

      await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', tx.reseller_id);
      
      await supabase.from('reseller_transactions').update({ 
        status, 
        description: 'Binance Deposit Approved',
        balance_after: newBalance
      }).eq('id', id);
    } else {
      await supabase.from('reseller_transactions').update({ 
        status, 
        description: 'Binance Deposit Rejected'
      }).eq('id', id);
    }

    return true;
  }
};
