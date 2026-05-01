import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  AlertCircle, 
  KeyRound, 
  ShoppingBag, 
  BookOpen, 
  Mail, 
  RefreshCw,
  Plus,
  Search,
  XCircle,
  Copy,
  CheckCircle2,
  Loader2,
  Calendar,
  CreditCard,
  Inbox,
  X,
  Sparkles,
  ExternalLink,
  Info,
  Eye,
  EyeOff
} from 'lucide-react';
import { format, addMonths, addDays, isPast, differenceInDays, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { getApiBaseUrl } from '../lib/apiBase';
import { getAccessTokenForApi } from '../lib/getAccessTokenForApi';
import { parseDurationToMonths, parseDurationToDays } from '../lib/durationUtils';
import { toast } from '../lib/toast';
import { buildInboxSnippetFromBody } from '../lib/inboxSnippet';

function getNextAdobeSlotUnlockAt(
  orderCreatedAt: string | undefined,
  intervalDays: number,
  emailsGenerated: number,
  slotLimit: number,
): Date | null {
  if (!orderCreatedAt || intervalDays <= 0) return null;
  const nextIndex = emailsGenerated + 1;
  if (nextIndex < 2 || nextIndex > slotLimit) return null;
  return addDays(parseISO(orderCreatedAt), intervalDays * (nextIndex - 1));
}

function isAdobeSlotTimingAllowed(
  orderCreatedAt: string | undefined,
  intervalDays: number,
  emailsGenerated: number,
  slotLimit: number,
  emergency: boolean,
): boolean {
  if (emergency) return true;
  const unlockAt = getNextAdobeSlotUnlockAt(orderCreatedAt, intervalDays, emailsGenerated, slotLimit);
  if (!unlockAt) return true;
  return new Date() >= unlockAt;
}

function verificationCodePlain(code: string): string {
  return code.replace(/\D/g, '');
}

function verificationCodeDisplay(code: string): string {
  const plain = verificationCodePlain(code);
  if (plain.length === 6) return plain.split('').join(' ');
  return code.trim();
}

const BANGLADESH_TZ = 'Asia/Dhaka';

function formatInboxTimeBangladesh(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return formatInTimeZone(d, BANGLADESH_TZ, 'MMM d, HH:mm');
}

/** Client-side guard (API may be older); server also filters to Adobe verification-only. */
function isVerificationInboxRow(m: { subject: string; code: string | null }): boolean {
  if (!m.code) return false;
  const s = (m.subject || '').toLowerCase();
  if (/get started|welcome to/i.test(s)) return false;
  return true;
}

interface UserEmail {
  id: string;
  email_id: string;
  assigned_at: string;
  is_active: boolean;
  order_id: string;
  email_slots: number;
  /** Days after order date before 2nd, 3rd… slot; 0 = no enforced spacing */
  email_slot_interval_days: number;
  /** Order purchase timestamp (for slot unlock schedule) */
  order_created_at?: string;
  is_personal: boolean;
  single_device_warning: boolean;
  order_auto_renew?: boolean;
  email_details: {
    email: string;
    password: string;
  };
  subscription_details?: {
    duration: string;
    expires_at: Date;
    is_expired: boolean;
    days_left: number;
    total_days?: number;
  };
}

const PasswordDisplay = ({ password }: { password: string }) => {
  const [isVisible, setIsVisible] = useState(false);
  return (
    <div className="mt-1 flex items-center justify-between rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-950 px-3 py-2.5 font-mono text-sm text-zinc-900 dark:text-zinc-100 transition-all">
      <span>{isVisible ? password : '••••••••••••'}</span>
      <button 
        type="button" 
        onClick={() => setIsVisible(!isVisible)} 
        className="ml-2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        title={isVisible ? "Hide password" : "Show password"}
      >
        {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

export const AdobeEmail = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [emails, setEmails] = useState<UserEmail[]>([]);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [hasSharedSubscription, setHasSharedSubscription] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [generationCount, setGenerationCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /** When true, server ignores spacing between Adobe slot generations (admin emergency mode). */
  const [slotEmergencyUnlock, setSlotEmergencyUnlock] = useState(false);

  // Check for successful payment redirect
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const paymentStatus = searchParams.get('payment');
    const orderId = searchParams.get('order_id');

    if (paymentStatus === 'success' && orderId) {
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // We assume the webhook handles email assignment, but in development 
      // without webhooks, we could trigger a check or show a success toast here.
      toast.success('Payment successful! Your order is being processed.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from('system_settings').select('value').eq('key', 'adobe_email_slots').maybeSingle();
      if (cancelled) return;
      const v = (data?.value || {}) as { emergency_unlock?: boolean };
      setSlotEmergencyUnlock(v.emergency_unlock === true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxMessages, setInboxMessages] = useState<{id: number, subject: string, snippet: string, date: string, code: string | null}[]>([]);
  const [inboxCredentials, setInboxCredentials] = useState<{ email: string; password?: string } | null>(null);

  const verificationInboxMessages = useMemo(
    () => inboxMessages.filter(isVerificationInboxRow),
    [inboxMessages],
  );

  // Personal Subscriptions state
  const [activeTab, setActiveTab] = useState<'emails' | 'personal'>('emails');
  /** Admin can disable new personal sales; default true if setting row missing */
  const [personalSubscriptionsEnabled, setPersonalSubscriptionsEnabled] = useState(true);
  const [personalOrders, setPersonalOrders] = useState<any[]>([]);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [personalProducts, setPersonalProducts] = useState<any[]>([]);
  const [requestForm, setRequestForm] = useState({ email: '', productId: '', autoRenew: false });
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [togglingAutoRenewOrderId, setTogglingAutoRenewOrderId] = useState<string | null>(null);

  const fetchEmailData = async (retryCount = 0) => {
    if (!user) return;
    setLoading(true);

    try {
      const [settingsRes, ordersResult] = await Promise.all([
        supabase.from('system_settings').select('value').eq('key', 'personal_subscriptions').maybeSingle(),
        supabase
          .from('orders')
          .select('*, products(*)')
          .eq('user_id', user.id)
          .in('status', ['paid', 'completed', 'pending']),
      ]);

      const personalEnabled = ((settingsRes.data?.value || {}) as { enabled?: boolean }).enabled !== false;
      setPersonalSubscriptionsEnabled(personalEnabled);

      const pProductsResult = personalEnabled
        ? await supabase
            .from('products')
            .select('*')
            .eq('is_personal', true)
            .eq('is_active', true)
            .order('price', { ascending: true })
        : { data: [] as any[] | null };

      const orders = ordersResult.data;
      const pProducts = pProductsResult.data;
        
      if (orders) {
        const pOrders = orders
          .filter(o => o.products?.is_personal && o.personal_email)
          .filter(o => !(o.status === 'pending' && Number(o.total_amount) === 0))
          .map(order => {
          // Calculate days left for personal subscriptions
          let daysLeft = 0;
          let expiresAt = null;
          let isExpired = false;
          let totalDays = 30; // For progress bar

          if (order.status === 'completed' || order.status === 'paid') {
            const durationStr = order.products?.duration || '';
            const monthsToAdd = parseDurationToMonths(durationStr);
            totalDays = parseDurationToDays(durationStr);

            const orderDate = parseISO(order.created_at);
            expiresAt = addMonths(orderDate, monthsToAdd);
            isExpired = isPast(expiresAt);
            daysLeft = isExpired ? 0 : differenceInDays(expiresAt, new Date());
          }

          return {
            ...order,
            daysLeft,
            totalDays,
            expiresAt,
            isExpired
          };
        });
        setPersonalOrders(pOrders);
      }

      if (pProducts) {
        setPersonalProducts(pProducts);
      }
        
      // Fetch assigned emails with order and product details via server-side API
      // (bypasses RLS on emails_pool so email/password are visible to the user)
      let userEmails: any[] | null = null;
      let emailsError: any = null;

      try {
        const token = await getAccessTokenForApi();
        if (token) {
          const API_URL = getApiBaseUrl();
          const res = await fetch(`${API_URL}/api/auth/my-emails`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
          });
          const json = await res.json();
          if (res.ok && json.success) {
            userEmails = json.data;
          } else {
            emailsError = json.error || 'API error';
          }
        }
      } catch (apiErr) {
        console.warn('Server-side my-emails failed, falling back to client query', apiErr);
      }

      // Fallback: direct Supabase query (will show 'Unknown' if RLS blocks emails_pool)
      if (!userEmails) {
        const { data, error } = await supabase
          .from('user_emails')
          .select(`
            id,
            email_id,
            order_id,
            assigned_at,
            is_active,
            emails_pool:email_id (email, password),
            orders:order_id (
              id,
              created_at,
              status,
              payment_method,
              auto_renew,
              products:product_id (id, duration, price, email_slots, email_slot_interval_days, max_users_per_email, single_device_warning, is_personal)
            )
          `)
          .eq('user_id', user.id)
          .order('assigned_at', { ascending: false });
        userEmails = data;
        emailsError = error;
      }

      if (emailsError) throw emailsError;

      let validFormattedEmails: any[] = [];

      if (userEmails) {
        // Map the joined data and calculate expiration
        validFormattedEmails = userEmails
          .filter((item: any) => {
            const s = item.orders?.status;
            const pm = item.orders?.payment_method;
            if (s === 'refunded' || s === 'cancelled') return false;
            if (s === 'paid' || s === 'completed') return true;
            // Redeem: mailbox may be assigned while order is still pending payment
            if (s === 'pending' && pm === 'redeem_code') return true;
            return false;
          })
          .map((item: any) => {
          let subscription_details = undefined;
          
          if (item.orders && item.orders.products) {
            const durationStr = item.orders.products.duration;
            const monthsToAdd = parseDurationToMonths(durationStr);
            const totalDays = parseDurationToDays(durationStr);

            const orderDate = parseISO(item.orders.created_at);
            const expiresAt = addMonths(orderDate, monthsToAdd);
            const isExpired = isPast(expiresAt);
            const daysLeft = isExpired ? 0 : differenceInDays(expiresAt, new Date());
            
            subscription_details = {
              duration: item.orders.products.duration,
              expires_at: expiresAt,
              is_expired: isExpired,
              days_left: daysLeft,
              total_days: totalDays
            };
          }

          // Handle potentially different join shapes depending on Supabase version
          const poolDataRaw = item.emails_pool || (item.email_id && typeof item.email_id === 'object' ? item.email_id : null);
          const poolData = Array.isArray(poolDataRaw) ? poolDataRaw[0] : poolDataRaw;

          return {
            id: item.id,
            email_id: typeof item.email_id === 'object' ? item.email_id.id : item.email_id,
            order_id: item.order_id,
            assigned_at: item.assigned_at,
            is_active: item.is_active,
            email_slots: item.orders?.products?.email_slots ?? 3,
            email_slot_interval_days: Number(
              (item.orders?.products as { email_slot_interval_days?: number })?.email_slot_interval_days ?? 0,
            ),
            order_created_at: item.orders?.created_at as string | undefined,
            is_personal: item.orders?.products?.is_personal ?? false,
            single_device_warning: item.orders?.products?.single_device_warning ?? false,
            order_auto_renew: item.orders?.auto_renew ?? false,
            email_details: {
              email: poolData?.email || 'Unknown',
              password: poolData?.password || 'Unknown'
            },
            subscription_details
          };
        });
        
        // ---- LAZY AUTO-RENEWAL EVALUATION ---- //
        let needsRefetch = false;
        
        for (const emailObj of validFormattedEmails) {
          const rawItem = userEmails.find((ue: any) => ue.id === emailObj.id);
          const orderData: any = rawItem?.orders;
          const subData = emailObj.subscription_details;
          
          if (subData?.is_expired && orderData?.auto_renew === true) {
            console.log(`Evaluating Auto-Renew for expired order: ${orderData.id}`);
            try {
              const token = await getAccessTokenForApi();
              if (!token) {
                console.warn('Auto-renew skipped: no valid session token');
                continue;
              }
              const res = await fetch(`${getApiBaseUrl()}/api/payment/process-auto-renew`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ old_order_id: orderData.id })
              });
              
              if (res.ok) {
                console.log(`Auto-Renew succeeded for order: ${orderData.id}. Refetching state...`);
                needsRefetch = true;
              } else {
                const retryData = await res.json();
                console.warn(`Auto-Renew failed or suspended on server:`, retryData.message);
              }
            } catch (err) {
               console.error('Lazy auto-renewal fetch failed:', err);
               // Failsafe fallback
               await supabase.from('orders').update({ auto_renew: false }).eq('id', orderData.id);
            }
          }
        }
        
        if (needsRefetch) {
          if (retryCount < 2) {
            console.log('Renewal complete, refetching fresh email state...');
            return fetchEmailData(retryCount + 1); // Maximum of 2 retries to prevent infinite recursion
          } else {
            console.warn('Max renewal retries reached to prevent recursion loop.');
          }
        }
        // ------------------------------------- //
      }

      // UI isolation: hide revoked/inactive emails, but keep them in-memory for auto-renew evaluation above.
      const displayEmails = validFormattedEmails.filter((e: any) => e.is_active === true);
      setEmails(displayEmails);
      
      // Determine if there is at least one active order based on the valid emails
      // Active subscription = at least one currently active email row.
      setHasActiveSubscription(
        (validFormattedEmails || []).some((e: any) => e.is_active === true) || (orders && orders.length > 0)
      );

      // Shared subscription = at least one active email row coming from a non-personal product.
      setHasSharedSubscription(
        (validFormattedEmails || []).some((e: any) => e.is_active === true && e.is_personal === false)
      );

      // Fetch generation logs for the latest order
      if (userEmails && userEmails.length > 0) {
        // Find the latest active order
        const activeOrders = userEmails.filter((e: any) => e.is_active && e.order_id).map((e: any) => e.order_id);
        
        if (activeOrders.length > 0) {
          const latestOrderId = activeOrders[0]; // Since it's sorted by assigned_at desc
          
          const { data: logs } = await supabase
            .from('email_generation_logs')
            .select('count')
            .eq('user_id', user.id)
            .eq('order_id', latestOrderId)
            .maybeSingle();

          if (logs) {
            setGenerationCount(logs.count);
          } else {
            setGenerationCount(0);
          }
        } else {
          setGenerationCount(0);
        }
      } else {
        setGenerationCount(0);
      }

    } catch (error) {
      console.error('Error fetching email data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmailDataRef = useRef(fetchEmailData);
  useEffect(() => {
    fetchEmailDataRef.current = fetchEmailData;
  });

  useEffect(() => {
    void fetchEmailDataRef.current();
  }, [user]);

  const showPersonalTab = personalSubscriptionsEnabled || personalOrders.length > 0;

  useEffect(() => {
    if (!showPersonalTab && activeTab === 'personal') setActiveTab('emails');
  }, [showPersonalTab, activeTab]);

  useEffect(() => {
    if (!personalSubscriptionsEnabled) setIsRequestModalOpen(false);
  }, [personalSubscriptionsEnabled]);

  // Set up Realtime Subscriptions for Auto-Updating Emails & Orders
  const adobeRtTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!user) return;

    const scheduleRefresh = () => {
      if (adobeRtTimerRef.current) window.clearTimeout(adobeRtTimerRef.current);
      adobeRtTimerRef.current = window.setTimeout(() => {
        void fetchEmailDataRef.current();
      }, 850);
    };

    const channel = supabase.channel(`adobe_email_realtime:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${user.id}` }, () => {
        scheduleRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_emails', filter: `user_id=eq.${user.id}` }, () => {
        scheduleRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: 'is_personal=eq.true' }, () => {
        scheduleRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings', filter: 'key=eq.personal_subscriptions' }, () => {
        scheduleRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings', filter: 'key=eq.adobe_email_slots' }, () => {
        scheduleRefresh();
      })
      .subscribe();

    return () => {
      if (adobeRtTimerRef.current) window.clearTimeout(adobeRtTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Personal tab safety net: keep subscriptions fresh even if a realtime event is missed.
  useEffect(() => {
    if (!user || activeTab !== 'personal') return;
    const id = window.setInterval(() => {
      void fetchEmailDataRef.current();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [user?.id, activeTab]);

  const handleGenerateEmail = async (specificOrderId?: string) => {
    // Determine which order to link to
    let orderId = specificOrderId;
    
    if (!orderId) {
      // Find the latest active order ID to link this email to.
      const latestActiveEmailItem = emails.find(e => e.subscription_details && !e.subscription_details.is_expired);
      if (latestActiveEmailItem) {
        orderId = latestActiveEmailItem.order_id;
      }
    }

    if (!user) return;
    
    try {
      setGenerating(true);
      
      if (!orderId) {
        // Fallback to checking the database directly
        const { data: latestOrder } = await supabase
          .from('orders')
          .select('id, products!inner(is_personal)')
          .eq('user_id', user.id)
          .in('status', ['paid', 'completed'])
          .eq('products.is_personal', false) // Only link to team pooled products
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
          
        if (latestOrder) {
          orderId = latestOrder.id;
        }
      }
      
      if (!orderId) {
        toast.error('Could not find a valid active order to link the new email to.');
        setGenerating(false);
        return;
      }

      // Calculate how many emails have been generated for this specific order
      const orderEmailCount = emails.filter(e => e.order_id === orderId).length;

      // Get slot limit from the product config (falls back to 3 if not set)
      let slotLimit = emails.find(e => e.order_id === orderId)?.email_slots;
      if (slotLimit === undefined) {
          const { data: ord_data } = await supabase.from('orders').select('products(email_slots)').eq('id', orderId).single();
          slotLimit = (ord_data?.products as any)?.email_slots ?? 3;
      }

      if (orderEmailCount >= slotLimit) {
        toast.warning(`You have reached the maximum limit of ${slotLimit} email${slotLimit !== 1 ? 's' : ''} for this order.`);
        setGenerating(false);
        return;
      }

      const token = await getAccessTokenForApi();
      if (!token) {
        throw new Error('Session expired. Please sign in again and retry.');
      }
      const res = await fetch(`${getApiBaseUrl()}/api/payment/assign-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.code === 'slot_timing' && data.next_eligible_at) {
          try {
            const d = parseISO(String(data.next_eligible_at));
            throw new Error(`Next Adobe email slot unlocks on ${format(d, 'PPP p')}.`);
          } catch (e) {
            if (e instanceof Error && e.message.startsWith('Next Adobe')) throw e;
            throw new Error(data.message || 'Next slot is not available yet.');
          }
        }
        throw new Error(data.message || 'Failed to generate email');
      }

      toast.success('Email generated successfully!');
      fetchEmailData();
    } catch (error: any) {
      console.error('Email generation error:', error);
      toast.error(error.message || 'Failed to generate email. Please contact support.');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const loadInboxMessages = async (
    emailAddress: string,
    password?: string,
    options?: { closeOnError?: boolean }
  ): Promise<boolean> => {
    const closeOnError = options?.closeOnError ?? false;
    setInboxLoading(true);
    try {
      const API_URL = getApiBaseUrl();
      const token = await getAccessTokenForApi();
      if (!token) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch(`${API_URL}/api/cpanel/inbox`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: emailAddress, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect to email server');
      }

      setInboxMessages(data.messages || []);
      return true;
    } catch (error: unknown) {
      console.error('Error fetching inbox:', error);
      const message = error instanceof Error ? error.message : 'Failed to connect to email server';
      toast.error(message);
      setInboxMessages([]);
      if (closeOnError) setIsInboxOpen(false);
      return false;
    } finally {
      setInboxLoading(false);
    }
  };

  const handleOpenInbox = async (emailAddress: string, password?: string) => {
    setInboxCredentials({ email: emailAddress, password });
    setIsInboxOpen(true);
    await loadInboxMessages(emailAddress, password, { closeOnError: true });
  };

  const refreshInbox = async () => {
    if (!inboxCredentials?.email) return;
    await loadInboxMessages(inboxCredentials.email, inboxCredentials.password, { closeOnError: false });
  };

  const filteredEmails = emails.filter(email => 
    email.email_details.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestForm.email || !requestForm.productId) {
      toast.warning('Please fill in all fields');
      return;
    }
    setIsRequestModalOpen(false);
    navigate(`/checkout/${requestForm.productId}?personal_email=${encodeURIComponent(requestForm.email)}&auto_renew=${requestForm.autoRenew}`);
  };

  const handleToggleAutoRenew = async (orderId: string, currentValue: boolean) => {
    try {
      setTogglingAutoRenewOrderId(orderId);
      const nextValue = !currentValue;

      const API_URL = getApiBaseUrl();
      const token = await getAccessTokenForApi();
      if (!token) {
        throw new Error('Session expired. Please sign in again.');
      }

      const res = await fetch(`${API_URL}/api/payment/toggle-auto-renew`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ order_id: orderId, auto_renew: nextValue })
      });
      
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to toggle auto renew');
      }

      setPersonalOrders(prev => prev.map(order => (
        order.id === orderId ? { ...order, auto_renew: nextValue } : order
      )));

      setEmails(prev => prev.map(email => (
        email.order_id === orderId ? { ...email, order_auto_renew: nextValue } : email
      )));
    } catch (err: any) {
      console.error('Failed to toggle auto renew:', err);
      toast.error(err.message || 'Failed to update auto-renew setting.');
    } finally {
      setTogglingAutoRenewOrderId(null);
    }
  };

  // Group emails by order_id
  const emailsByOrder = filteredEmails.reduce((acc, email) => {
    const orderId = email.order_id || 'unassigned';
    if (!acc[orderId]) {
      acc[orderId] = [];
    }
    acc[orderId].push(email);
    return acc;
  }, {} as Record<string, typeof filteredEmails>);

  const btnOutline =
    'inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200/90 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50/90 dark:border-zinc-700/80 dark:bg-zinc-900/40 dark:text-zinc-200 dark:hover:bg-zinc-800/80 dark:hover:border-zinc-600';
  /** Primary: clean fill + soft depth — no outer ring (avoids “double border” look) */
  const btnPrimary =
    'inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_12px_-2px_rgba(79,70,229,0.35)] transition-[background-color,box-shadow,transform] hover:bg-indigo-700 hover:shadow-[0_1px_2px_rgba(0,0,0,0.08),0_6px_16px_-2px_rgba(79,70,229,0.42)] active:scale-[0.99] dark:bg-indigo-600 dark:hover:bg-indigo-500 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_4px_14px_-2px_rgba(99,102,241,0.45)] dark:hover:shadow-[0_1px_2px_rgba(0,0,0,0.25),0_6px_18px_-2px_rgba(99,102,241,0.5)] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/90 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#121214]';

  return (
    <div className="space-y-6 pb-16 max-w-5xl mx-auto">
      <div>
        <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          Services
        </p>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight mt-1">
          Adobe access
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1 max-w-xl leading-relaxed">
          {activeTab === 'emails' ? (
            <>
              Team plans share pooled logins here—renewal, inbox, and copy-to-clipboard for Adobe’s sign-in page.
            </>
          ) : (
            <>
              Personal plans use{' '}
              <span className="font-medium text-zinc-800 dark:text-zinc-200">your own email</span> for
              Adobe. Track renewal below; pay from checkout or enable wallet auto-renew.
            </>
          )}
        </p>
        {emails.some(e => e.single_device_warning && e.is_active) && activeTab === 'emails' && (
          <div className="mt-3 rounded-xl border border-amber-200/80 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2.5 flex gap-2 items-start max-w-xl">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-900 dark:text-amber-100 leading-relaxed">
              This is a shared team Adobe account. Always save important projects locally. Files stored in Adobe cloud
              may be visible to your shared partner or removed during maintenance.
            </p>
          </div>
        )}
      </div>

      {!hasActiveSubscription && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center text-red-800 dark:text-red-200 font-medium text-sm">
            <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
            No active subscription
          </div>
          <button
            type="button"
            onClick={() => navigate('/store')}
            className={btnPrimary}
          >
            <ShoppingBag className="w-4 h-4" />
            Browse store
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2 p-1 rounded-xl bg-gray-100 dark:bg-zinc-900/80 border border-gray-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab('emails')}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'emails'
                ? 'bg-white text-indigo-600 shadow-sm shadow-indigo-500/10 dark:bg-zinc-800 dark:text-indigo-400 dark:shadow-[inset_0_0_0_1px_rgba(129,140,248,0.2)]'
                : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200'
            }`}
          >
            <Mail className="w-4 h-4" />
            Team / pooled emails
          </button>
          {showPersonalTab && (
            <button
              type="button"
              onClick={() => setActiveTab('personal')}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'personal'
                  ? 'bg-white text-indigo-600 shadow-sm shadow-indigo-500/10 dark:bg-zinc-800 dark:text-indigo-400 dark:shadow-[inset_0_0_0_1px_rgba(129,140,248,0.2)]'
                  : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              Personal subscriptions
            </button>
          )}
        </div>
        {activeTab === 'emails' && emails.length > 0 && (
          <div className="relative w-full sm:max-w-xs sm:ml-auto">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by email…"
              className="w-full rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-2.5 pl-10 pr-3 text-sm text-gray-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none"
              aria-label="Search assigned emails"
            />
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {activeTab === 'emails' ? (
        <div className="space-y-6">
          {Object.entries(emailsByOrder).map(([orderId, orderEmails], index) => {
          const firstEmail = orderEmails[0];
          const isUnassigned = orderId === 'unassigned';
          const isActive = firstEmail?.subscription_details && !firstEmail.subscription_details.is_expired;
          const emailsGenerated = orderEmails.length;
          // Dynamic slot limit — 1 means email is auto-assigned, no manual generation needed
          const slotLimit = firstEmail?.email_slots ?? 3;
          const intervalDays = firstEmail?.email_slot_interval_days ?? 0;
          const orderCreatedAt = firstEmail?.order_created_at;
          const slotTimingOk = isAdobeSlotTimingAllowed(
            orderCreatedAt,
            intervalDays,
            emailsGenerated,
            slotLimit,
            slotEmergencyUnlock,
          );
          const nextSlotAt = getNextAdobeSlotUnlockAt(orderCreatedAt, intervalDays, emailsGenerated, slotLimit);
          const canGenerate = slotLimit > 1;
          const showDeviceWarning = firstEmail?.single_device_warning ?? false;
          const orderAutoRenew = firstEmail?.order_auto_renew ?? false;
          
          return (
            <div
              key={orderId}
              className="rounded-2xl border border-gray-200/90 dark:border-zinc-800 bg-white dark:bg-[#121214] shadow-sm dark:shadow-none overflow-hidden"
            >
              <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-white/5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
                      Plan {isUnassigned ? '(unknown order)' : `#${index + 1}`}
                    </h3>
                    {!isUnassigned && (
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          isActive
                            ? 'border-emerald-700/50 bg-emerald-500/10 text-emerald-400'
                            : 'border-red-800 bg-red-950 text-red-100'
                        }`}
                      >
                        {isActive ? 'Active' : 'Expired'}
                      </span>
                    )}

                    {!isUnassigned && isActive && (
                      <div className="flex items-center gap-2.5 ml-1 pl-3 pr-1 py-1 rounded-full bg-zinc-100 dark:bg-[#151518] border border-zinc-200 dark:border-zinc-800 shadow-sm">
                        <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest hidden sm:inline-block">Auto-renew</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={orderAutoRenew}
                          disabled={togglingAutoRenewOrderId === orderId}
                          onClick={() => handleToggleAutoRenew(orderId, orderAutoRenew)}
                          className={`relative inline-flex h-[24px] w-[42px] shrink-0 cursor-pointer items-center justify-center rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#121214] disabled:opacity-50 disabled:cursor-not-allowed border ${
                            orderAutoRenew
                              ? 'border-indigo-400/50 bg-indigo-600 shadow-sm shadow-indigo-900/30 dark:border-indigo-500/40'
                              : 'bg-zinc-200 dark:bg-zinc-800/80 border-zinc-300 dark:border-zinc-700/80 shadow-inner'
                          }`}
                          title={orderAutoRenew ? "Auto-renew is ON: Uses wallet when term ends" : "Auto-renew is OFF"}
                        >
                          <span className="sr-only">Use setting</span>
                          <span
                            className={`pointer-events-none relative flex h-[18px] w-[18px] items-center justify-center transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-300 ease-in-out ${
                              orderAutoRenew ? 'translate-x-[9px]' : '-translate-x-[9px]'
                            }`}
                          >
                            {togglingAutoRenewOrderId === orderId ? (
                              <Loader2 className="absolute h-3 w-3 animate-spin text-indigo-500" />
                            ) : (
                              <span 
                                className={`transition-opacity duration-200 ${orderAutoRenew ? 'opacity-100' : 'opacity-0'}`}
                              >
                                <svg className="h-[10px] w-[10px] text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </span>
                            )}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed max-w-2xl">
                    {canGenerate
                      ? `${emailsGenerated} of ${slotLimit} Adobe addresses used for this plan.`
                      : 'One address is assigned automatically for this plan.'}
                  </p>
                  {canGenerate &&
                    intervalDays > 0 &&
                    emailsGenerated > 0 &&
                    emailsGenerated < slotLimit &&
                    nextSlotAt &&
                    !slotTimingOk && (
                      <p className="text-sm text-amber-700 dark:text-amber-300/90 mt-1">
                        Next slot unlocks{' '}
                        <span className="font-semibold">{format(nextSlotAt, 'PPP')}</span> (based on your purchase date).
                      </p>
                    )}
                  {canGenerate && slotEmergencyUnlock && emailsGenerated < slotLimit && intervalDays > 0 && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400/90 mt-1">
                      Priority access: you can generate remaining slots without waiting.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0 lg:justify-end">
                  <button type="button" onClick={() => navigate('/tutorial-help')} className={btnOutline}>
                    <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    How to sign in
                  </button>
                  <a
                    href="https://adobe.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={btnOutline}
                  >
                    <ExternalLink className="w-4 h-4 text-zinc-400" />
                    Adobe account site
                  </a>
                  {canGenerate && !isUnassigned && isActive && (
                    <button
                      type="button"
                      onClick={() => handleGenerateEmail(orderId)}
                      disabled={emailsGenerated >= slotLimit || generating || !slotTimingOk}
                      className={`${btnPrimary} gap-2 px-3.5`}
                      title={
                        !slotTimingOk && nextSlotAt
                          ? `Available from ${format(nextSlotAt, 'PPP')}`
                          : undefined
                      }
                    >
                      {generating ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                      ) : (
                        <Plus className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                      )}
                      <span className="whitespace-nowrap">Add email</span>
                      <span
                        className="inline-flex min-w-[2.5rem] items-center justify-center rounded-md bg-black/15 px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                        aria-label={`${slotLimit - emailsGenerated} slots remaining`}
                      >
                        {slotLimit - emailsGenerated} left
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {showDeviceWarning && (
                <div className="mx-5 sm:mx-6 mt-2 mb-4 flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/25 p-4">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">One device only</p>
                    <p className="text-sm text-amber-800 dark:text-amber-300/90 mt-1 leading-relaxed font-semibold">
                      You are strictly allowed 1 device only. Do not click &quot;Sign out other devices&quot; inside Adobe.
                      Any violation or device hopping can trigger a permanent ban on this shared slot.
                    </p>
                  </div>
                </div>
              )}

              <div className="p-4 sm:p-6 space-y-4">
                {orderEmails.map((email, emailIndex) => {
                  const isReplaced = emailIndex > 0;
                  const sub = email.subscription_details;

                  return (
                    <div
                      key={email.id}
                      className={`rounded-xl border p-4 sm:p-5 transition-colors ${
                        isReplaced
                          ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/20 opacity-75'
                          : 'border-gray-200 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-900/30'
                      }`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex gap-3 sm:items-start">
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                                isReplaced ? 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' : 'bg-red-500/15 text-red-600 dark:text-red-400'
                              }`}
                            >
                              A
                            </div>
                            <div className="min-w-0 flex-1 grid gap-4 sm:grid-cols-2 sm:gap-x-6">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-500">
                                  Email address
                                </p>
                                <p
                                  className={`mt-0.5 break-all font-mono text-sm sm:text-base ${
                                    isReplaced
                                      ? 'text-zinc-500 line-through dark:text-zinc-500'
                                      : 'text-gray-900 dark:text-zinc-100'
                                  }`}
                                >
                                  {email.email_details.email}
                                </p>
                              </div>
                              <div className="min-w-0 sm:pt-0">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-500">
                                  Password
                                </p>
                                <div className="mt-0.5">
                                  <PasswordDisplay password={email.email_details.password} />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-gray-200/90 pt-3 text-sm dark:border-zinc-800/90">
                            <div className="shrink-0">
                              <p className="text-xs font-medium text-gray-500 dark:text-zinc-500">Assigned</p>
                              <p className="mt-0.5 whitespace-nowrap text-gray-800 dark:text-zinc-200">
                                {format(new Date(email.assigned_at), 'MMM d, yyyy')}
                              </p>
                            </div>
                            {sub ? (
                              <div className="min-w-0 flex-1 sm:max-w-[min(100%,280px)]">
                                <p className="text-xs font-medium text-gray-500 dark:text-zinc-500">Subscription ends</p>
                                <p
                                  className={`mt-0.5 truncate font-medium ${
                                    isReplaced
                                      ? 'text-zinc-500'
                                      : sub.is_expired
                                        ? 'text-red-600 dark:text-red-400'
                                        : 'text-emerald-700 dark:text-emerald-400'
                                  }`}
                                  title={`${sub.days_left} days left · ${format(sub.expires_at, 'MMM d, yyyy')}`}
                                >
                                  {sub.days_left} days left · {format(sub.expires_at, 'MMM d, yyyy')}
                                </p>
                                {!isReplaced && (
                                  <div className="mt-1.5 h-1.5 max-w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800 sm:max-w-[220px]">
                                    <div
                                      className={`h-full rounded-full ${sub.is_expired ? 'bg-red-500' : 'bg-emerald-500'}`}
                                      style={{
                                        width: `${Math.min(100, Math.max(0, (sub.days_left / (sub.total_days || 30)) * 100))}%`,
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm italic text-zinc-500">End date unavailable</p>
                            )}
                            <div className="flex shrink-0 items-center">
                              {isReplaced ? (
                                <span className="rounded-full border border-zinc-300 dark:border-zinc-600 bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                  Replaced
                                </span>
                              ) : (
                                <span
                                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                    email.is_active
                                      ? 'border-emerald-800 bg-emerald-950 text-emerald-100'
                                      : 'border-red-800 bg-red-950 text-red-100'
                                  }`}
                                >
                                  {email.is_active ? 'Active' : 'Inactive'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col lg:items-stretch">
                          <button
                            type="button"
                            onClick={() => handleOpenInbox(email.email_details.email, email.email_details.password)}
                            className={btnPrimary}
                          >
                            <Inbox className="w-4 h-4" />
                            Open inbox
                          </button>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(email.email_details.email, `email-${email.id}`)}
                            className={btnOutline}
                          >
                            {copiedId === `email-${email.id}` ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                            Copy email
                          </button>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(email.email_details.password, `pass-${email.id}`)}
                            className={btnOutline}
                          >
                            {copiedId === `pass-${email.id}` ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <KeyRound className="w-4 h-4" />
                            )}
                            Copy password
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {!loading && filteredEmails.length === 0 && (
          <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] p-12 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center mb-4 border border-gray-100 dark:border-[#26262d]">
              <XCircle className="w-8 h-8 text-gray-300" />
            </div>
            
            {hasActiveSubscription ? (
              <>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">No Emails Generated</h3>
                <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 text-sm max-w-md mb-6">
                  You haven't generated any Adobe emails yet. Click the "Generate Email" button above to get your first account.
                </p>
                    <button
                  type="button"
                  onClick={() => handleGenerateEmail()}
                  disabled={generating}
                  className={`${btnPrimary} px-6 py-2.5`}
                >
                  {generating ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> : <Plus className="w-4 h-4 shrink-0" strokeWidth={2.25} />}
                  Generate email
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">No Active Subscription</h3>
                <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 text-sm max-w-md">
                  You need an active subscription to generate Adobe emails. Purchase a subscription or redeem a license code to get started.
                </p>
              </>
            )}
          </div>
        )}
      </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-gray-200/90 dark:border-zinc-800 bg-white dark:bg-[#121214] shadow-sm dark:shadow-none overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-white/5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Your personal plans</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed max-w-lg">
                  Each card is one subscription tied to <span className="text-zinc-800 dark:text-zinc-200">your Gmail or work email</span>
                  — not the shared team pool. Order date and renewal are shown in plain language.
                </p>
              </div>
              {personalSubscriptionsEnabled && (
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(true)}
                  className={`${btnPrimary} w-full sm:w-auto shrink-0 px-4 py-2.5`}
                >
                  <CreditCard className="w-4 h-4 shrink-0" aria-hidden />
                  New personal plan
                </button>
              )}
            </div>

            <div className="p-4 sm:p-6">
              {loading ? (
                <div className="flex justify-center py-14">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                </div>
              ) : personalOrders.length > 0 ? (
                <ul className="space-y-4">
                  {personalOrders.map((order) => {
                    const isLive = order.status === 'completed' || order.status === 'paid';
                    return (
                      <li
                        key={order.id}
                        className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50/80 dark:bg-zinc-900/35 p-4 sm:p-5"
                      >
                        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1 space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                  isLive
                                    ? 'border-emerald-800 bg-emerald-950 text-emerald-100'
                                    : 'border-amber-800 bg-amber-950 text-amber-100'
                                }`}
                              >
                                {isLive ? 'Active' : 'Pending setup'}
                              </span>
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                Ordered {format(new Date(order.created_at), 'MMM d, yyyy')}
                              </span>

                              {isLive && (
                                <div className="flex items-center gap-2.5 ml-1 pl-3 pr-1 py-1 rounded-full bg-zinc-100 dark:bg-[#151518] border border-zinc-200 dark:border-zinc-800 shadow-sm">
                                  <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest hidden sm:inline-block">Auto-renew</span>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={!!order.auto_renew}
                                    disabled={togglingAutoRenewOrderId === order.id}
                                    onClick={() => handleToggleAutoRenew(order.id, !!order.auto_renew)}
                                    className={`relative inline-flex h-[24px] w-[42px] shrink-0 cursor-pointer items-center justify-center rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#121214] disabled:opacity-50 disabled:cursor-not-allowed border ${
                                      order.auto_renew
                                        ? 'border-indigo-400/50 bg-indigo-600 shadow-sm shadow-indigo-900/30 dark:border-indigo-500/40'
                                        : 'bg-zinc-200 dark:bg-zinc-800/80 border-zinc-300 dark:border-zinc-700/80 shadow-inner'
                                    }`}
                                    title={order.auto_renew ? "Auto-renew is ON (Uses wallet)" : "Auto-renew is OFF"}
                                  >
                                    <span className="sr-only">Use setting</span>
                                    <span
                                      className={`pointer-events-none relative flex h-[18px] w-[18px] items-center justify-center transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-300 ease-in-out ${
                                        order.auto_renew ? 'translate-x-[9px]' : '-translate-x-[9px]'
                                      }`}
                                    >
                                      {togglingAutoRenewOrderId === order.id ? (
                                        <Loader2 className="absolute h-3 w-3 animate-spin text-indigo-500" />
                                      ) : (
                                        <span 
                                          className={`transition-opacity duration-200 ${order.auto_renew ? 'opacity-100' : 'opacity-0'}`}
                                        >
                                          <svg className="h-[10px] w-[10px] text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                          </svg>
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                </div>
                              )}
                            </div>

                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                Your Adobe login email
                              </p>
                              <p className="mt-1 break-all font-mono text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                                {order.personal_email}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Plan</p>
                              <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                {order.products?.title ?? 'Adobe'}{' '}
                                <span className="text-zinc-500 dark:text-zinc-400 font-normal">
                                  · {order.products?.duration ?? '—'}
                                </span>
                              </p>
                            </div>

                            {isLive && order.expiresAt ? (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                  Access until
                                </p>
                                <p
                                  className={`mt-1 text-sm font-semibold ${
                                    order.isExpired ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
                                  }`}
                                >
                                  {order.daysLeft} days left · {format(order.expiresAt, 'MMM d, yyyy')}
                                </p>
                                <div className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                                  <div
                                    className={`h-full rounded-full ${order.isExpired ? 'bg-red-500' : 'bg-emerald-500'}`}
                                    style={{
                                      width: `${Math.min(100, Math.max(0, (order.daysLeft / (order.totalDays || 30)) * 100))}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-amber-800 dark:text-amber-200/90">
                                We are setting up access for this order. Status updates when payment completes.
                              </p>
                            )}
                          </div>

                          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
                            <button
                              type="button"
                              onClick={() => copyToClipboard(order.personal_email, `personal-${order.id}`)}
                              className={btnOutline}
                            >
                              {copiedId === `personal-${order.id}` ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                              Copy email
                            </button>
                            <a
                              href="https://account.adobe.com/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className={btnOutline}
                            >
                              <ExternalLink className="w-4 h-4" />
                              Adobe account
                            </a>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/20 px-6 py-12 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                    <CreditCard className="h-7 w-7 text-zinc-400" />
                  </div>
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">No personal plans yet</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 max-w-md mx-auto leading-relaxed">
                    {personalSubscriptionsEnabled
                      ? 'Request a plan with your own email, pay at checkout, then track renewal and auto-renew here.'
                      : 'New personal plans are not available right now. Team plans are still offered from the store.'}
                  </p>
                  {personalSubscriptionsEnabled && (
                    <button
                      type="button"
                      onClick={() => setIsRequestModalOpen(true)}
                      className={`${btnPrimary} mt-6 px-6 py-3 text-[15px]`}
                    >
                      <Sparkles className="w-4 h-4 shrink-0" aria-hidden />
                      Start a personal plan
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Personal Subscription Request Modal — portal avoids `main` overflow clipping so blur covers the full viewport */}
      {personalSubscriptionsEnabled &&
        isRequestModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
        <div className="fixed inset-0 z-[110] flex min-h-[100dvh] w-full items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="personal-sub-modal-title"
            aria-describedby="personal-sub-modal-desc"
            className="bg-white dark:bg-[#151518] rounded-2xl shadow-2xl shadow-black/20 border border-gray-200/80 dark:border-[#2a2a32] w-full max-w-lg max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-[#26262d] bg-gray-50/90 dark:bg-[#1a1a1f]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
                    <Sparkles className="w-5 h-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h3 id="personal-sub-modal-title" className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">
                      Personal Adobe subscription
                    </h3>
                    <p id="personal-sub-modal-desc" className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                      Use your own email on Adobe. Pick a duration, then pay on the next screen.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/10 dark:hover:text-gray-200 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleRequestSubmit} className="p-5 sm:p-6 space-y-5">
              <div className="flex gap-2 rounded-xl border border-indigo-100/90 dark:border-indigo-500/25 bg-indigo-50/60 dark:bg-indigo-950/25 px-3 py-2.5">
                <Info className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400 mt-0.5" aria-hidden />
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                  Fill in three quick steps below. You can change auto-renew later from your dashboard.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor="personal-adobe-email" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold mr-1.5">1</span>
                    Your Adobe email
                  </label>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">Required</span>
                </div>
                <input
                  id="personal-adobe-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={requestForm.email}
                  onChange={(e) => setRequestForm({ ...requestForm, email: e.target.value })}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-zinc-600 rounded-xl bg-white dark:bg-[#1a1a22] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all text-[15px]"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">This address will be used for your Adobe sign-in.</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="personal-adobe-plan" className="text-sm font-semibold text-gray-900 dark:text-gray-100 block">
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold mr-1.5">2</span>
                  Plan duration
                </label>
                <select
                  id="personal-adobe-plan"
                  required
                  value={requestForm.productId}
                  onChange={(e) => setRequestForm({ ...requestForm, productId: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 dark:border-zinc-600 rounded-xl bg-white dark:bg-[#1a1a22] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all text-[15px] cursor-pointer"
                >
                  <option value="" className="bg-white text-gray-700 dark:bg-[#1a1a22] dark:text-gray-300">
                    Choose how long you want access…
                  </option>
                  {personalProducts.map((product) => (
                    <option
                      key={product.id}
                      value={product.id}
                      className="bg-white text-gray-900 dark:bg-[#1a1a22] dark:text-gray-100"
                    >
                      {product.title} — ৳{product.price} ({product.duration})
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl border border-gray-200 dark:border-zinc-700 bg-gray-50/90 dark:bg-white/[0.04] p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      <span className="text-indigo-600 dark:text-indigo-400 font-bold mr-1.5">3</span>
                      Auto-renew from wallet
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-[280px] leading-relaxed">
                      When the term ends, we can try to charge your wallet if there is enough balance.
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                      requestForm.autoRenew
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                        : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    {requestForm.autoRenew ? 'On' : 'Off'}
                  </span>
                </div>
                <div
                  className="flex rounded-xl border border-gray-300/80 dark:border-zinc-600 overflow-hidden bg-white dark:bg-[#12121a] p-1 gap-1"
                  role="group"
                  aria-label="Auto renew from wallet"
                >
                  <button
                    type="button"
                    aria-pressed={!requestForm.autoRenew}
                    onClick={() => setRequestForm({ ...requestForm, autoRenew: false })}
                    className={`flex-1 min-h-[2.75rem] rounded-lg text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#151518] ${
                      !requestForm.autoRenew
                        ? 'bg-zinc-200 text-zinc-900 shadow-inner dark:bg-zinc-600 dark:text-white'
                        : 'text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800/80'
                    }`}
                  >
                    Off
                  </button>
                  <button
                    type="button"
                    aria-pressed={requestForm.autoRenew}
                    onClick={() => setRequestForm({ ...requestForm, autoRenew: true })}
                    className={`flex-1 min-h-[2.75rem] rounded-lg text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#151518] ${
                      requestForm.autoRenew
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                        : 'text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800/80'
                    }`}
                  >
                    On
                  </button>
                </div>
                <p
                  className={`text-[11px] leading-relaxed border-t border-gray-200/80 dark:border-zinc-600/80 pt-3 ${
                    requestForm.autoRenew ? 'text-emerald-800 dark:text-emerald-300/90' : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {requestForm.autoRenew
                    ? 'Enabled: we will try to renew automatically when your plan ends (wallet must cover the price).'
                    : 'Disabled: you renew yourself; nothing auto-charges at the end of the term.'}
                </p>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="sm:flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-zinc-600 bg-white dark:bg-transparent text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRequest}
                  className="sm:flex-[1.6] px-4 py-3 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl font-semibold transition-colors flex justify-center items-center gap-2 shadow-md shadow-primary/20"
                >
                  {submittingRequest ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <ShoppingBag className="w-4 h-4" />
                      Continue to checkout
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Inbox Modal */}
      {isInboxOpen &&
        typeof document !== 'undefined' &&
        createPortal(
        <div className="fixed inset-0 z-[110] flex min-h-[100dvh] w-full items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="bg-white dark:bg-[#151518] rounded-2xl shadow-2xl shadow-black/20 border border-gray-200/80 dark:border-[#2a2a32] w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            role="dialog"
            aria-labelledby="inbox-modal-title"
            aria-describedby="inbox-modal-desc"
          >
            <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-[#26262d] bg-gray-50/90 dark:bg-[#1a1a1f]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
                    <Inbox className="w-5 h-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h3 id="inbox-modal-title" className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">
                      Verification inbox
                    </h3>
                    <p id="inbox-modal-desc" className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-all">
                      {inboxCredentials?.email ?? 'Loading…'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => refreshInbox()}
                    disabled={inboxLoading || !inboxCredentials?.email}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                    title="Check again for new mail"
                  >
                    <RefreshCw className={`w-4 h-4 ${inboxLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsInboxOpen(false);
                      setInboxCredentials(null);
                    }}
                    className="p-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                    aria-label="Close inbox"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="mt-4 flex gap-2 rounded-xl border border-indigo-100/80 dark:border-indigo-500/20 bg-white/70 dark:bg-[#1a1a22]/80 px-3 py-2.5 text-left">
                <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" aria-hidden />
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                  This list shows <span className="font-medium text-gray-800 dark:text-gray-200">Adobe verification codes</span> only (sign-in / security codes from Adobe). Times are <span className="font-medium">Bangladesh (GMT+6)</span>. New mail can take a minute — tap <span className="font-medium">Refresh</span> if nothing appears yet.
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-gray-50/50 dark:bg-[#12121a]/50">
              {inboxLoading && verificationInboxMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 px-4">
                  <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-4" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Connecting to your mail…</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center max-w-xs">
                    Fetching the latest messages for this address.
                  </p>
                </div>
              ) : inboxLoading && verificationInboxMessages.length > 0 ? (
                <div className="flex items-center justify-center gap-2 py-3 text-sm text-indigo-600 dark:text-indigo-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Updating…
                </div>
              ) : null}

              {!inboxLoading || verificationInboxMessages.length > 0 ? (
                <>
                  {verificationInboxMessages.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 px-0.5">
                        Verification codes ({verificationInboxMessages.length})
                      </p>
                      {verificationInboxMessages.map((msg) => {
                        const snippetPreview = buildInboxSnippetFromBody(msg.snippet || '', 280) || null;
                        const codePlain = msg.code ? verificationCodePlain(msg.code) : '';
                        return (
                        <div
                          key={msg.id}
                          className="bg-white dark:bg-[#18181f] border border-gray-200 dark:border-[#2e2e38] rounded-xl p-4 shadow-sm hover:border-indigo-300/60 dark:hover:border-indigo-500/40 transition-colors"
                        >
                          <div className="flex justify-between items-start gap-2 mb-2">
                            <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-snug pr-2">{msg.subject}</h4>
                            <span
                              className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/10 px-2 py-1 rounded-lg shrink-0"
                              title="Bangladesh time (Asia/Dhaka)"
                            >
                              {formatInboxTimeBangladesh(msg.date)}
                            </span>
                          </div>
                          {snippetPreview ? (
                            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 leading-relaxed line-clamp-4">{snippetPreview}</p>
                          ) : msg.code ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">
                              Adobe verification message — copy the code below into Adobe.
                            </p>
                          ) : null}
                          {msg.code && (
                            <div className="rounded-lg border border-indigo-200/80 dark:border-indigo-500/30 bg-indigo-50/90 dark:bg-indigo-950/35 px-3 py-3 space-y-2.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-200 uppercase tracking-wide">
                                  Verification code
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    copyToClipboard(codePlain, `inbox-code-${msg.id}`);
                                    toast.success('Code copied — paste it in Adobe');
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200/90 dark:border-indigo-500/40 bg-white/90 dark:bg-[#151518] px-2.5 py-1.5 text-xs font-semibold text-indigo-800 dark:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/80 transition-colors"
                                >
                                  {copiedId === `inbox-code-${msg.id}` ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" aria-hidden />
                                  )}
                                  {copiedId === `inbox-code-${msg.id}` ? 'Copied' : 'Copy code'}
                                </button>
                              </div>
                              <div className="text-center sm:text-left">
                                <span
                                  className="inline-block text-2xl font-mono font-bold text-indigo-700 dark:text-indigo-300 tracking-[0.35em] bg-white dark:bg-[#151518] px-4 py-2.5 rounded-lg shadow-inner border border-indigo-100 dark:border-indigo-900/50 select-all"
                                  title={codePlain}
                                >
                                  {verificationCodeDisplay(msg.code)}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  ) : !inboxLoading ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 dark:border-zinc-700 bg-gray-50/80 dark:bg-zinc-900/40 px-5 py-10 text-center">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-200/80 bg-white dark:border-zinc-700 dark:bg-zinc-800/80 text-indigo-600 dark:text-indigo-400">
                        <Mail className="w-8 h-8 opacity-90" />
                      </div>
                      <p className="text-base font-semibold text-gray-900 dark:text-gray-100">No verification codes yet</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-sm mx-auto leading-relaxed">
                        When Adobe sends a sign-in or verification code to this address, it will appear here (Bangladesh time). Wait a moment, then tap <span className="font-medium text-gray-700 dark:text-gray-300">Refresh</span>.
                      </p>
                      <button
                        type="button"
                        onClick={() => refreshInbox()}
                        disabled={!inboxCredentials?.email}
                        className={`${btnPrimary} mt-6 px-5 py-2.5`}
                      >
                        <RefreshCw className="w-4 h-4" />
                        Check again
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};