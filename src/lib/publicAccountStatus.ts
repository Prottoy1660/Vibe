import type { ResellerUserStatus } from '../services/reseller/resellerApi';

export type PublicSharedEmail = {
  id: string;
  email: string;
  password: string;
  assignedAt: string;
  isActive: boolean;
  isReplaced: boolean;
  subscription: {
    duration: string;
    expiresAt: string;
    daysLeft: number;
    isExpired: boolean;
    totalDays: number;
  } | null;
};

export type PublicSharedPlan = {
  orderId: string;
  planIndex: number;
  isActive: boolean;
  autoRenew: boolean;
  slotLimit: number;
  emailsGenerated: number;
  emails: PublicSharedEmail[];
};

export type PublicPersonalPlan = {
  orderId: string;
  personalEmail: string;
  productTitle: string;
  status: string;
  paymentStatus: string;
  daysLeft: number;
  totalDays: number;
  expiresAt: string | null;
  isExpired: boolean;
  autoRenew: boolean;
  deliveredAt: string | null;
  createdAt: string;
};

export type PublicAccountSearchResult = {
  searchedEmail: string;
  account: { id: string; email: string; name: string | null } | null;
  vibe: {
    sharedPlans: PublicSharedPlan[];
    personalPlans: PublicPersonalPlan[];
  } | null;
  resellerSubscriptions: ResellerUserStatus[];
};

export async function searchPublicAccountStatus(email: string, apiBase: string): Promise<PublicAccountSearchResult> {
  const base = apiBase.replace(/\/$/, '');
  const res = await fetch(`${base}/api/platform/search-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Search failed');
  }
  return json.data as PublicAccountSearchResult;
}
