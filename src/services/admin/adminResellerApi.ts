import { getApiBaseUrl } from '../../lib/apiBase';
import { getAccessTokenForApi } from '../../lib/getAccessTokenForApi';

export type ResellerDateRange = 'all' | '30d' | 'month';

export interface AdminResellerSummary {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  createdAt: string;
  isBanned: boolean;
  walletBalance: number;
  signupAuthProvider?: string | null;
  totalCustomers: number;
  activeCustomers: number;
  expiredCustomers: number;
  refundedCustomers: number;
  expiringIn7Days: number;
  totalDeposits: number;
  totalSpent: number;
  pendingDeposits: number;
  lastActivityAt: string | null;
}

export interface AdminResellerLeader {
  id: string;
  name: string;
  email: string;
  value: number;
}

export interface AdminResellerMonthlyTrend {
  month: string;
  deposits: number;
  spent: number;
}

export interface AdminResellerOverview {
  range: ResellerDateRange;
  monthlyTrend: AdminResellerMonthlyTrend[];
  platform: {
    totalResellers: number;
    activeResellers: number;
    totalCustomers: number;
    activeCustomers: number;
    totalDepositsUsd: number;
    totalSpentUsd: number;
    totalWalletBalanceUsd: number;
    pendingDepositsUsd: number;
  };
  leaders: {
    topByCustomers: AdminResellerLeader[];
    topByDeposits: AdminResellerLeader[];
    topBySpent: AdminResellerLeader[];
  };
  resellers: AdminResellerSummary[];
}

export interface AdminResellerTransaction {
  id: string;
  amount: number;
  type: 'deposit' | 'deduct' | 'refund' | 'system';
  status: string;
  createdAt: string;
  description: string;
  txId?: string | null;
  balanceAfter?: number | null;
}

export interface AdminResellerCustomer {
  id: string;
  email: string;
  durationMonths: string;
  durationDays: number;
  status: 'active' | 'expired' | 'refunded';
  products: string[];
  activatedAt: string;
  expiresAt: string;
  organizationName?: string | null;
}

export interface AdminResellerProfile {
  range: ResellerDateRange;
  monthlyTrend: AdminResellerMonthlyTrend[];
  reseller: AdminResellerSummary & {
    lastSignInProvider?: string | null;
  };
  transactions: AdminResellerTransaction[];
  customers: AdminResellerCustomer[];
}

async function adminFetch<T>(path: string): Promise<T> {
  const token = await getAccessTokenForApi();
  const base = getApiBaseUrl();
  if (!token || !base) throw new Error('Not authenticated');

  const res = await fetch(`${base}/api/admin${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return json as T;
}

export const AdminResellerApi = {
  getOverview: async (range: ResellerDateRange = 'all') => {
    const q = range === 'all' ? '' : `?range=${encodeURIComponent(range)}`;
    const data = await adminFetch<AdminResellerOverview & { success: true }>(`/resellers/overview${q}`);
    return {
      range: data.range,
      monthlyTrend: data.monthlyTrend,
      platform: data.platform,
      leaders: data.leaders,
      resellers: data.resellers,
    };
  },

  getProfile: async (resellerId: string, range: ResellerDateRange = 'all') => {
    const q = range === 'all' ? '' : `?range=${encodeURIComponent(range)}`;
    const data = await adminFetch<AdminResellerProfile & { success: true }>(
      `/resellers/${encodeURIComponent(resellerId)}${q}`,
    );
    return {
      range: data.range,
      monthlyTrend: data.monthlyTrend,
      reseller: data.reseller,
      transactions: data.transactions,
      customers: data.customers,
    };
  },
};

export const RESELLER_DATE_RANGE_LABELS: Record<ResellerDateRange, string> = {
  all: 'All time',
  '30d': 'Last 30 days',
  month: 'This month',
};
