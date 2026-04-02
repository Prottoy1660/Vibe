import React, { useEffect, useState } from 'react';
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
  ExternalLink
} from 'lucide-react';
import { format, addMonths, isPast, differenceInDays, parseISO } from 'date-fns';

interface UserEmail {
  id: string;
  email_id: string;
  assigned_at: string;
  is_active: boolean;
  order_id: string;
  email_slots: number;
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
  };
}

export const AdobeEmail = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [emails, setEmails] = useState<UserEmail[]>([]);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [generationCount, setGenerationCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
      alert('Payment successful! Your order is being processed.');
    }
  }, []);

  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxMessages, setInboxMessages] = useState<{id: number, subject: string, snippet: string, date: string, code: string | null}[]>([]);

  // Personal Subscriptions state
  const [activeTab, setActiveTab] = useState<'emails' | 'personal'>('emails');
  const [personalOrders, setPersonalOrders] = useState<any[]>([]);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [personalProducts, setPersonalProducts] = useState<any[]>([]);
  const [requestForm, setRequestForm] = useState({ email: '', productId: '', autoRenew: false });
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [togglingAutoRenewOrderId, setTogglingAutoRenewOrderId] = useState<string | null>(null);

  const fetchEmailData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Check active subscription
      const { data: orders } = await supabase
        .from('orders')
        .select('*, products(*)')
        .eq('user_id', user.id)
        .in('status', ['paid', 'completed', 'pending']);
        
      if (orders) {
        const pOrders = orders.filter(o => o.products?.is_personal && o.personal_email).map(order => {
          // Calculate days left for personal subscriptions
          let daysLeft = 0;
          let expiresAt = null;
          let isExpired = false;

          if (order.status === 'completed' || order.status === 'paid') {
            const durationStr = order.products?.duration?.toLowerCase() || '';
            let monthsToAdd = 1;
            
            if (durationStr.includes('year') || durationStr.includes('yr')) {
              const match = durationStr.match(/\d+/);
              monthsToAdd = match ? parseInt(match[0]) * 12 : 12;
            } else {
              const match = durationStr.match(/\d+/);
              monthsToAdd = match ? parseInt(match[0]) : 1;
            }

            const orderDate = parseISO(order.created_at);
            expiresAt = addMonths(orderDate, monthsToAdd);
            isExpired = isPast(expiresAt);
            daysLeft = isExpired ? 0 : differenceInDays(expiresAt, new Date());
          }

          return {
            ...order,
            daysLeft,
            expiresAt,
            isExpired
          };
        });
        setPersonalOrders(pOrders);
      }

      // Fetch personal products for modal
      const { data: pProducts } = await supabase
        .from('products')
        .select('*')
        .eq('is_personal', true)
        .eq('is_active', true)
        .order('price', { ascending: true });
        
      if (pProducts) {
        setPersonalProducts(pProducts);
      }
        
      // Fetch assigned emails with order and product details
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
            id,
            created_at,
            status,
            auto_renew,
            products:product_id (id, duration, price, email_slots, max_users_per_email, single_device_warning)
          )
        `)
        .eq('user_id', user.id)
        .order('assigned_at', { ascending: false });

      if (emailsError) throw emailsError;

      let validFormattedEmails: any[] = [];

      if (userEmails) {
        // Map the joined data and calculate expiration
        validFormattedEmails = userEmails
          .filter((item: any) => {
             // Exclude emails tied to refunded or cancelled orders
             return item.orders?.status === 'paid' || item.orders?.status === 'completed';
          })
          .map((item: any) => {
          let subscription_details = undefined;
          
          if (item.orders && item.orders.products) {
            const durationStr = item.orders.products.duration.toLowerCase();
            let monthsToAdd = 1; // Default to 1 month
            
            if (durationStr.includes('year') || durationStr.includes('yr')) {
              const match = durationStr.match(/\d+/);
              monthsToAdd = match ? parseInt(match[0]) * 12 : 12;
            } else {
              const match = durationStr.match(/\d+/);
              monthsToAdd = match ? parseInt(match[0]) : 1;
            }

            const orderDate = parseISO(item.orders.created_at);
            const expiresAt = addMonths(orderDate, monthsToAdd);
            const isExpired = isPast(expiresAt);
            const daysLeft = isExpired ? 0 : differenceInDays(expiresAt, new Date());
            
            subscription_details = {
              duration: item.orders.products.duration,
              expires_at: expiresAt,
              is_expired: isExpired,
              days_left: daysLeft
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
              const productPrice = Number(orderData.products?.price || 0);
              
              const { data: uData } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();
              const currentBalance = Number(uData?.wallet_balance) || 0;
              
              if (currentBalance >= productPrice && productPrice > 0) {
                console.log(`Wallet sufficient (${currentBalance}), processing renewal for ${productPrice}...`);
                
                // 1. Deduct wallet
                await supabase.from('users').update({ wallet_balance: currentBalance - productPrice }).eq('id', user.id);
                
                // 2. Shut off auto-renew on the old order so it doesn't duplicate
                await supabase.from('orders').update({ auto_renew: false }).eq('id', orderData.id);
                
                // 3. Create new completed order perfectly inheriting context
                const { data: newOrder } = await supabase.from('orders').insert({
                  user_id: user.id,
                  product_id: orderData.products.id,
                  payment_method: 'wallet',
                  total_amount: productPrice,
                  status: 'completed',
                  payment_status: 'paid',
                  auto_renew: true // Propagate the setting forwards!
                }).select().single();
                
                // 4. Provision fresh email access immediately
                if (newOrder) {
                  try {
                    await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/payment/assign-email`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ order_id: newOrder.id })
                    });
                  } catch (e) { console.error('Auto renew assign err:', e); }
                  needsRefetch = true;
                }
              } else {
                console.log(`Insufficient wallet balance (${currentBalance} < ${productPrice}). Suspending Auto-Renew.`);
                await supabase.from('orders').update({ auto_renew: false }).eq('id', orderData.id);
              }
            } catch (renewalErr) {
              console.error('Lazy auto-renewal failed:', renewalErr);
              // Fail safe: turn off auto-renew to prevent infinite error loops
              await supabase.from('orders').update({ auto_renew: false }).eq('id', orderData.id);
            }
          }
        }
        
        if (needsRefetch) {
          console.log('Renewal complete, refetching fresh email state...');
          return fetchEmailData(); // Restart the loop completely
        }
        // ------------------------------------- //

        setEmails(validFormattedEmails);
      }
      
      // Determine if there is at least one active order based on the valid emails
      setHasActiveSubscription(validFormattedEmails.length > 0 || (orders && orders.length > 0));

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

  useEffect(() => {
    fetchEmailData();
  }, [user]);

  const handleGenerateEmail = async (specificOrderId?: string) => {
    // Determine which order to link to
    let orderId = specificOrderId;
    
    if (!orderId) {
      // Find the latest active order ID to link this email to.
      const latestActiveEmailItem = emails.find(e => e.subscription_details && !e.subscription_details.is_expired);
      orderId = latestActiveEmailItem?.order_id;
    }
    
    // Calculate how many emails have been generated for this specific order
    const orderEmailCount = emails.filter(e => e.order_id === orderId).length;

    // Get slot limit from the product config (falls back to 3 if not set)
    const slotLimit = emails.find(e => e.order_id === orderId)?.email_slots ?? 3;

    if (orderEmailCount >= slotLimit) {
      alert(`You have reached the maximum limit of ${slotLimit} email${slotLimit !== 1 ? 's' : ''} for this order.`);
      return;
    }

    if (!user) return;
    
    try {
      setGenerating(true);
      
      if (!orderId) {
        // Fallback to checking the database directly
        const { data: latestOrder } = await supabase
          .from('orders')
          .select('id')
          .eq('user_id', user.id)
          .in('status', ['paid', 'completed'])
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
          
        if (latestOrder) {
          orderId = latestOrder.id;
        }
      }
      
      if (!orderId) {
        alert('Could not find a valid active order to link the new email to.');
        setGenerating(false);
        return;
      }

      // Use the secure centralized backend to assign the email
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/payment/assign-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to generate email');
      }

      alert('Email generated successfully!');
      fetchEmailData();
    } catch (error: any) {
      console.error('Email generation error:', error);
      alert(error.message || 'Failed to generate email. Please contact support.');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenInbox = async (emailAddress: string, password?: string) => {
    setIsInboxOpen(true);
    setInboxLoading(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL || '';
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${API_URL}/api/cpanel/inbox`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ email: emailAddress, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect to email server');
      }
      
      setInboxMessages(data.messages || []);
      
    } catch (error: any) {
      console.error('Error fetching inbox:', error);
      alert(error.message || 'Failed to connect to email server');
      setIsInboxOpen(false);
    } finally {
      setInboxLoading(false);
    }
  };

  const filteredEmails = emails.filter(email => 
    email.email_details.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestForm.email || !requestForm.productId) {
      alert('Please fill in all fields');
      return;
    }
    setIsRequestModalOpen(false);
    navigate(`/checkout/${requestForm.productId}?personal_email=${encodeURIComponent(requestForm.email)}&auto_renew=${requestForm.autoRenew}`);
  };

  const handleToggleAutoRenew = async (orderId: string, currentValue: boolean) => {
    try {
      setTogglingAutoRenewOrderId(orderId);
      const nextValue = !currentValue;

      const { error } = await supabase
        .from('orders')
        .update({ auto_renew: nextValue })
        .eq('id', orderId)
        .eq('user_id', user?.id);

      if (error) throw error;

      setPersonalOrders(prev => prev.map(order => (
        order.id === orderId ? { ...order, auto_renew: nextValue } : order
      )));

      setEmails(prev => prev.map(email => (
        email.order_id === orderId ? { ...email, order_auto_renew: nextValue } : email
      )));
    } catch (err: any) {
      console.error('Failed to toggle auto renew:', err);
      alert(err.message || 'Failed to update auto-renew setting.');
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
    'inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-zinc-600 bg-white dark:bg-zinc-900/50 px-3 py-2 text-sm font-medium text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors';
  const btnPrimary =
    'inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 transition-colors disabled:opacity-50';

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
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
          Your pooled Adobe logins, renewal, and inbox—one place. Use copy buttons to paste into Adobe’s sign-in page.
        </p>
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
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200'
            }`}
          >
            <Mail className="w-4 h-4" />
            Team / pooled emails
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('personal')}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'personal'
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Personal subscriptions
          </button>
        </div>
        {activeTab === 'personal' && (
          <button type="button" onClick={() => setIsRequestModalOpen(true)} className={btnPrimary}>
            <CreditCard className="w-4 h-4" />
            Request personal plan
          </button>
        )}
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
          const canGenerate = slotLimit > 1;
          const showDeviceWarning = firstEmail?.single_device_warning ?? false;
          const orderAutoRenew = firstEmail?.order_auto_renew ?? false;
          
          return (
            <div
              key={orderId}
              className="rounded-2xl border border-gray-200/90 dark:border-zinc-800 bg-white dark:bg-[#121214] shadow-sm dark:shadow-none overflow-hidden"
            >
              <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-white/5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 gap-y-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
                      Plan {isUnassigned ? '(unknown order)' : `#${index + 1}`}
                    </h3>
                    {!isUnassigned && (
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          isActive
                            ? 'border-emerald-700 bg-emerald-950 text-emerald-100'
                            : 'border-red-800 bg-red-950 text-red-100'
                        }`}
                      >
                        {isActive ? 'Active' : 'Expired'}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                    {canGenerate
                      ? `${emailsGenerated} of ${slotLimit} Adobe addresses used for this plan.`
                      : 'One address is assigned automatically for this plan.'}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full lg:w-auto lg:max-w-xl">
                  {!isUnassigned && isActive && (
                    <div className="flex items-center justify-between sm:justify-start gap-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/40 px-3 py-2">
                      <div className="text-left">
                        <p className="text-xs font-medium text-gray-500 dark:text-zinc-500">Auto-renew</p>
                        <p className="text-xs text-gray-600 dark:text-zinc-400">
                          {orderAutoRenew ? 'Uses wallet when term ends' : 'Off — renew manually'}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={orderAutoRenew}
                        disabled={togglingAutoRenewOrderId === orderId}
                        onClick={() => handleToggleAutoRenew(orderId, orderAutoRenew)}
                        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 disabled:opacity-50 ${
                          orderAutoRenew ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-zinc-300 dark:bg-zinc-600'
                        }`}
                      >
                        {togglingAutoRenewOrderId === orderId ? (
                          <Loader2 className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
                        ) : (
                          <span
                            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                              orderAutoRenew ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
                            }`}
                          />
                        )}
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => navigate('/tutorial-help')} className={btnOutline}>
                      <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      How to sign in
                    </button>
                    <a
                      href="https://account.adobe.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={btnOutline}
                    >
                      <ExternalLink className="w-4 h-4" />
                      Adobe account site
                    </a>
                    {canGenerate && !isUnassigned && isActive && (
                      <button
                        type="button"
                        onClick={() => handleGenerateEmail(orderId)}
                        disabled={emailsGenerated >= slotLimit || generating}
                        className={`${btnOutline} disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Add email ({slotLimit - emailsGenerated} left)
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {showDeviceWarning && (
                <div className="mx-5 sm:mx-6 mt-2 mb-4 flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/25 p-4">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">One device at a time</p>
                    <p className="text-sm text-amber-800 dark:text-amber-300/90 mt-1 leading-relaxed">
                      Sign out of Adobe on other devices before using this login. Simultaneous use can revoke access.
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
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1 space-y-4">
                          <div className="flex gap-3">
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                                isReplaced ? 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' : 'bg-red-500/15 text-red-600 dark:text-red-400'
                              }`}
                            >
                              A
                            </div>
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
                          </div>

                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-500">
                              Password
                            </p>
                            <div className="mt-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-950 px-3 py-2.5 font-mono text-sm text-zinc-900 dark:text-zinc-100">
                              {email.email_details.password}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-6 text-sm">
                            <div>
                              <p className="text-xs font-medium text-gray-500 dark:text-zinc-500">Assigned</p>
                              <p className="mt-0.5 text-gray-800 dark:text-zinc-200">
                                {format(new Date(email.assigned_at), 'MMM d, yyyy')}
                              </p>
                            </div>
                            {sub ? (
                              <div>
                                <p className="text-xs font-medium text-gray-500 dark:text-zinc-500">Subscription ends</p>
                                <p
                                  className={`mt-0.5 font-medium ${
                                    isReplaced
                                      ? 'text-zinc-500'
                                      : sub.is_expired
                                        ? 'text-red-600 dark:text-red-400'
                                        : 'text-emerald-700 dark:text-emerald-400'
                                  }`}
                                >
                                  {sub.days_left} days left · {format(sub.expires_at, 'MMM d, yyyy')}
                                </p>
                                {!isReplaced && (
                                  <div className="mt-2 h-1.5 max-w-[200px] overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                                    <div
                                      className={`h-full rounded-full ${sub.is_expired ? 'bg-red-500' : 'bg-emerald-500'}`}
                                      style={{
                                        width: `${Math.min(100, Math.max(0, (sub.days_left / 30) * 100))}%`,
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-zinc-500 text-sm italic">End date unavailable</p>
                            )}
                            <div className="flex items-end">
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
                  onClick={() => handleGenerateEmail()}
                  disabled={generating}
                  className="px-6 py-2.5 bg-gradient-primary text-white rounded-xl font-medium shadow-sm hover:opacity-90 transition-opacity flex items-center"
                >
                  {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Generate Email
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
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-[#26262d] flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Personal Adobe Subscriptions</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Your personal Adobe Creative Cloud subscription requests
                </p>
              </div>
            </div>
            
            <div className="p-6">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : personalOrders.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-white/10">
                    <thead className="bg-gray-100/90 dark:bg-zinc-900/80">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-zinc-300 uppercase tracking-wide">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-zinc-300 uppercase tracking-wide">Plan</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-zinc-300 uppercase tracking-wide">Auto-renew</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-zinc-300 uppercase tracking-wide">Ends</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-zinc-300 uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-[#151518] divide-y divide-gray-200 dark:divide-white/10">
                      {personalOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-[#1c1c21] transition-colors border-b border-gray-100 dark:border-white/10 last:border-0">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                            {order.personal_email}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {order.products?.title} ({order.products?.duration})
                            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Ordered: {format(new Date(order.created_at), 'MMM dd, yyyy')}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              onClick={() => handleToggleAutoRenew(order.id, !!order.auto_renew)}
                              disabled={togglingAutoRenewOrderId === order.id}
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider transition-opacity ${
                                order.auto_renew
                                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400'
                                  : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400'
                              } ${togglingAutoRenewOrderId === order.id ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-80'}`}
                            >
                              {togglingAutoRenewOrderId === order.id ? 'UPDATING...' : (order.auto_renew ? 'ON' : 'OFF')}
                            </button>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {(order.status === 'completed' || order.status === 'paid') && order.expiresAt ? (
                              <div className="flex flex-col">
                                <span className={`text-sm font-bold flex items-center ${
                                  order.isExpired ? 'text-red-600' : 'text-green-600'
                                }`}>
                                  {order.daysLeft} Days Left
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center mt-1">
                                  <Calendar className="w-3 h-3 mr-1" />
                                  {format(order.expiresAt, 'MMM dd, yyyy')}
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400 italic">Pending Setup</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${
                              order.status === 'completed' || order.status === 'paid'
                                ? 'border-emerald-800 bg-emerald-950 text-emerald-100'
                                : 'border-amber-800 bg-amber-950 text-amber-100'
                            }`}>
                              {order.status === 'completed' || order.status === 'paid' ? 'Active' : 'Pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-gray-50 dark:bg-white/5 flex items-center justify-center mx-auto mb-4 border border-gray-100 dark:border-[#26262d]">
                    <CreditCard className="w-8 h-8 text-gray-300" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">No Personal Subscriptions</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md mx-auto">
                    You haven't requested any personal Adobe subscriptions yet.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Personal Subscription Request Modal */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#151518] rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 dark:border-[#26262d] flex justify-between items-center bg-gray-50/50 dark:bg-white/5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                Personal Adobe Subscription
              </h3>
              <button 
                onClick={() => setIsRequestModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleRequestSubmit} className="p-6 space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Subscribe to get your personal Adobe account with your own email.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Your Adobe Email *
                </label>
                <input
                  type="email"
                  required
                  value={requestForm.email}
                  onChange={(e) => setRequestForm({ ...requestForm, email: e.target.value })}
                  placeholder="your-email@example.com"
                  className="w-full px-4 py-2 border border-gray-200 dark:border-[#303038] rounded-xl bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                />
                <p className="text-xs text-gray-500 mt-1">This will be your Adobe account email</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subscription Duration *
                </label>
                <select
                  required
                  value={requestForm.productId}
                  onChange={(e) => setRequestForm({ ...requestForm, productId: e.target.value })}
                  className="w-full px-4 py-2.5 border-2 border-gray-300 dark:border-indigo-500/70 rounded-xl bg-white dark:bg-[#1f1f28] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary/70 focus:border-primary outline-none transition-all"
                >
                  <option value="" className="bg-white text-gray-700 dark:bg-[#1f1f28] dark:text-gray-300">
                    Select an option
                  </option>
                  {personalProducts.map((product) => (
                    <option
                      key={product.id}
                      value={product.id}
                      className="bg-white text-gray-900 dark:bg-[#1f1f28] dark:text-gray-100"
                    >
                      {product.title} - ৳{product.price} ({product.duration})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between py-2 border-t border-gray-100 dark:border-[#26262d] mt-2">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Auto Renew</p>
                  <p className="text-xs text-gray-500">Automatically renew using wallet balance</p>
                </div>
                <button
                  type="button"
                  onClick={() => setRequestForm({ ...requestForm, autoRenew: !requestForm.autoRenew })}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-[#151518] ${
                    requestForm.autoRenew ? 'bg-primary' : 'bg-gray-200 dark:bg-[#303038]'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                    requestForm.autoRenew ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={submittingRequest}
                  className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors flex justify-center items-center"
                >
                  {submittingRequest ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                    <>
                      <ShoppingBag className="w-4 h-4 mr-2" />
                      Proceed to Checkout
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inbox Modal */}
      {isInboxOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#151518] rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 dark:border-[#26262d] flex justify-between items-center bg-gray-50/50 dark:bg-white/5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
                <Inbox className="w-5 h-5 mr-2 text-indigo-600" />
                Email Inbox
              </h3>
              <button 
                onClick={() => setIsInboxOpen(false)}
                className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1c1c21] dark:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/30 dark:bg-transparent">
              {inboxLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
                  <p>Connecting to mail server...</p>
                </div>
              ) : inboxMessages.length > 0 ? (
                <div className="space-y-3">
                  {inboxMessages.map((msg) => (
                    <div key={msg.id} className="bg-white dark:bg-[#151518] border border-gray-200 dark:border-[#26262d] rounded-xl p-4 hover:border-indigo-200 transition-colors shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100">{msg.subject}</h4>
                        <span className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-white/10 px-2 py-1 rounded-full">
                          {format(new Date(msg.date), 'MMM d, HH:mm')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{msg.snippet}</p>
                      {msg.code && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex justify-between items-center">
                          <span className="text-sm text-indigo-800 font-medium">Verification Code:</span>
                          <span className="text-lg font-mono font-bold text-indigo-700 tracking-wider bg-white dark:bg-[#151518] px-3 py-1 rounded shadow-sm">
                            {msg.code}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <Inbox className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p>No messages found in this inbox.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};