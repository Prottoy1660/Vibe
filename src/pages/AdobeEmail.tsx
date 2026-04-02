import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  AlertCircle, 
  KeyRound, 
  ShoppingBag, 
  PlayCircle, 
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
  X
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

  // Get all unique active subscriptions for the summary boxes
  const activeSubscriptions = Object.values(emailsByOrder)
    .map(orderEmails => orderEmails[0]) // Get the first email of each order to check subscription details
    .filter(email => email?.subscription_details && !email.subscription_details.is_expired);

  return (
    <div className="space-y-6 pb-12 max-w-6xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Adobe</h1>
      </div>

      {/* Status Banner */}
      {!hasActiveSubscription && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center text-red-600 font-medium">
            <AlertCircle className="w-5 h-5 mr-2" />
            No Active Subscription
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <button 
              onClick={() => navigate('/store')}
              className="flex-1 sm:flex-none flex items-center justify-center px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
            >
              <ShoppingBag className="w-4 h-4 mr-2" />
              Buy Now
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-[#26262d] flex justify-between items-end">
        <nav className="flex space-x-8">
          <button 
            onClick={() => setActiveTab('emails')}
            className={`border-b-2 py-4 px-1 text-sm font-medium flex items-center transition-colors ${
              activeTab === 'emails' 
                ? 'border-primary text-primary' 
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <Mail className="w-4 h-4 mr-2" />
            Adobe Emails
          </button>
          <button 
            onClick={() => setActiveTab('personal')}
            className={`border-b-2 py-4 px-1 text-sm font-medium flex items-center transition-colors ${
              activeTab === 'personal' 
                ? 'border-primary text-primary' 
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <CreditCard className="w-4 h-4 mr-2" />
            Personal Subscriptions
          </button>
        </nav>
        {activeTab === 'personal' && (
          <button
            onClick={() => setIsRequestModalOpen(true)}
            className="mb-2 flex items-center px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <CreditCard className="w-4 h-4 mr-2" />
            Personal Adobe Subscription Request
          </button>
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
            <div key={orderId} className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden">
              <div className="p-6 border-b border-gray-100 dark:border-[#26262d] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
                    Subscription {isUnassigned ? '(Unknown)' : `#${index + 1}`}
                    {!isUnassigned && (
                      <span className={`ml-3 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {isActive ? 'Active' : 'Expired'}
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">
                    {canGenerate
                      ? `${emailsGenerated} of ${slotLimit} emails generated for this subscription`
                      : 'Email automatically assigned to this subscription'}
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  {!isUnassigned && isActive && (
                    <button
                      onClick={() => handleToggleAutoRenew(orderId, orderAutoRenew)}
                      disabled={togglingAutoRenewOrderId === orderId}
                      className={`flex items-center px-3 py-1.5 border rounded-lg text-sm font-medium transition-colors ${
                        orderAutoRenew
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:border-indigo-500/30 dark:text-indigo-300'
                          : 'border-gray-300 text-gray-700 dark:border-[#303038] dark:text-gray-200 dark:bg-white/5'
                      }`}
                    >
                      {togglingAutoRenewOrderId === orderId ? (
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      ) : null}
                      Auto Renew: {orderAutoRenew ? 'ON' : 'OFF'}
                    </button>
                  )}
                  <button className="flex items-center px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-colors">
                    <PlayCircle className="w-4 h-4 mr-1.5" />
                    Tutorial
                  </button>
                  <button className="flex items-center px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors">
                    <Mail className="w-4 h-4 mr-1.5" />
                    Mail Access
                  </button>
                  {/* Only show Generate Email button for multi-slot products */}
                  {canGenerate && !isUnassigned && isActive && (
                    <button 
                      onClick={() => handleGenerateEmail(orderId)}
                      disabled={emailsGenerated >= slotLimit || generating}
                      className={`flex items-center px-3 py-1.5 border rounded-lg text-sm font-medium transition-colors ${
                        emailsGenerated >= slotLimit || generating
                          ? 'border-gray-200 dark:border-[#26262d] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-white/5 cursor-not-allowed'
                          : 'border-gray-300 dark:border-[#303038] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#1c1c21] dark:bg-white/5 bg-white dark:bg-[#151518]'
                      }`}
                    >
                      {generating ? (
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-1.5" />
                      )}
                      Generate Email ({slotLimit - emailsGenerated}/{slotLimit})
                    </button>
                  )}
                </div>
              </div>

              {/* ⚠️ Single-Device Policy Warning — only if product has it enabled */}
              {showDeviceWarning && (
                <div className="mx-6 mt-4 mb-6 flex items-start gap-3 bg-amber-50 dark:bg-[#2a2215]/80 border border-amber-200 dark:border-[#42331c] rounded-xl p-4 shadow-sm">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-1 leading-tight">
                      Single Device Use Only
                    </p>
                    <p className="text-[13px] text-amber-700 dark:text-amber-400/90 leading-relaxed max-w-4xl tracking-tight">
                      This account can only be used on <strong>one device at a time</strong>. 
                      Before signing in, make sure you are signed out of Adobe on all other devices. 
                      Using it on multiple devices simultaneously may cause your access to be revoked.
                    </p>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-white/10">
                  <thead className="bg-gray-50 dark:bg-white/5">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Email Address</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Password</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Assigned Date</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Expiration</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Status</th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-[#151518] divide-y divide-gray-200 dark:divide-white/10">
                    {orderEmails.map((email, emailIndex) => {
                      const isReplaced = emailIndex > 0; // First email is the latest, others are replaced
                      
                      return (
                        <tr key={email.id} className={`hover:bg-gray-50 dark:hover:bg-[#1c1c21] dark:bg-white/5 transition-colors ${isReplaced ? 'opacity-60 bg-gray-50/50 dark:bg-white/5' : ''}`}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center font-bold ${isReplaced ? 'bg-gray-200 text-gray-500 dark:text-gray-400 dark:text-gray-500' : 'bg-red-100 text-red-600'}`}>
                                A
                              </div>
                              <div className="ml-4">
                                <div className={`text-sm font-medium ${isReplaced ? 'text-gray-500 dark:text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{email.email_details.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className={`text-sm font-mono px-2 py-1 rounded inline-block ${isReplaced ? 'text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-white/5' : 'text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-white/10'}`}>
                              {email.email_details.password}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
                            {format(new Date(email.assigned_at), 'MMM dd, yyyy')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {email.subscription_details ? (
                              <div className="flex flex-col">
                                <span className={`text-sm font-bold flex items-center ${
                                  isReplaced ? 'text-gray-400 dark:text-gray-500' :
                                  email.subscription_details.is_expired ? 'text-red-600' : 'text-green-600'
                                }`}>
                                  {email.subscription_details.days_left} Days Left
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 flex items-center mt-1">
                                  <Calendar className="w-3 h-3 mr-1" />
                                  {format(email.subscription_details.expires_at, 'MMM dd, yyyy')}
                                </span>
                                {!isReplaced && (
                                  <div className="w-full bg-gray-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-1000 ${email.subscription_details.is_expired ? 'bg-red-500' : 'bg-green-500'}`} 
                                      style={{ width: `${Math.min(100, Math.max(0, (email.subscription_details.days_left / 30) * 100))}%` }}
                                    ></div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400 dark:text-gray-500 italic">Unknown</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {isReplaced ? (
                              <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 dark:text-gray-500">
                                Replaced
                              </span>
                            ) : (
                              <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                email.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {email.is_active ? 'Active' : 'Inactive'}
                              </span>
                            )}
                          </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end space-x-2">
                              <button 
                                onClick={() => handleOpenInbox(email.email_details.email, email.email_details.password)}
                                className="text-indigo-500 hover:text-indigo-700 transition-colors p-1 flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 rounded mr-2 px-2"
                                title="Check Inbox"
                              >
                                <Inbox className="w-4 h-4 mr-1" /> <span className="text-xs font-medium">Inbox</span>
                              </button>
                              <button 
                                onClick={() => copyToClipboard(email.email_details.email, `email-${email.id}`)}
                                className="text-gray-400 dark:text-gray-500 hover:text-primary transition-colors p-1"
                                title="Copy Email"
                              >
                                {copiedId === `email-${email.id}` ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                              </button>
                              <button 
                                onClick={() => copyToClipboard(email.email_details.password, `pass-${email.id}`)}
                                className="text-gray-400 dark:text-gray-500 hover:text-primary transition-colors p-1"
                                title="Copy Password"
                              >
                                {copiedId === `pass-${email.id}` ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <KeyRound className="w-5 h-5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
                    <thead className="bg-gray-50 dark:bg-white/5">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email Address</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auto Renew</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiration</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
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
                            <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              order.status === 'completed' || order.status === 'paid' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-orange-100 text-orange-800'
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
                  className="w-full px-4 py-2 border border-gray-200 dark:border-[#303038] rounded-xl bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                >
                  <option value="">Select an option</option>
                  {personalProducts.map((product) => (
                    <option key={product.id} value={product.id}>
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