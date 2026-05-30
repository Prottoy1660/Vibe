import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isMainCustomerSite, isResellerRole, redirectToResellerPortal } from '../lib/resellerAuth';

/**
 * On Vibe Access (main domain), reseller accounts must use superreseller.shop only.
 * Same Supabase login works on both sites — this enforces separation after role loads.
 */
export function CustomerSiteRoleEnforcer() {
  const { user, role, loading } = useAuth();

  useEffect(() => {
    if (loading || !user || role === null) return;
    if (!isMainCustomerSite()) return;
    if (!isResellerRole(role)) return;
    redirectToResellerPortal('/reseller/dashboard');
  }, [user, role, loading]);

  return null;
}
