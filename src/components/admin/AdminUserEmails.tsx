import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Users, Mail, Clock, AlertTriangle, CheckCircle2, XCircle, Search, Filter, ShieldAlert } from 'lucide-react';
import { format, addMonths, isPast, parseISO, differenceInDays } from 'date-fns';

interface UserEmailRecord {
  id: string;
  email_id: string;
  order_id: string;
  assigned_at: string;
  is_active: boolean;
  users: {
    name: string;
    email: string;
    phone?: string;
  };
  emails_pool: {
    email: string;
    password: string;
  };
  orders: {
    created_at: string;
    status: string;
    products: {
      duration: string;
    };
  };
  // Computed fields
  computed_status: 'Active' | 'Expiring Soon' | 'Expired' | 'Replaced' | 'Revoked';
  days_left: number;
  expires_at: Date | null;
}

export const AdminUserEmails = () => {
  const [emails, setEmails] = useState<UserEmailRecord[]>([]);
  const [personalSubs, setPersonalSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'All' | 'Active' | 'Expiring Soon' | 'Expired' | 'Replaced' | 'Revoked'>('All');
  const [activeTab, setActiveTab] = useState<'regular' | 'personal'>('regular');

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_emails')
        .select(`
          id,
          email_id,
          order_id,
          assigned_at,
          is_active,
          users:user_id (name, email, phone),
          emails_pool:email_id (email, password),
          orders:order_id (
            created_at,
            status,
            products:product_id (duration)
          )
        `)
        .order('assigned_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      if (data) {
        // Group by order_id to find which ones are "replaced"
        const groupedByOrder = data.reduce((acc: any, curr: any) => {
          const oId = curr.order_id || 'unassigned';
          if (!acc[oId]) acc[oId] = [];
          acc[oId].push(curr);
          return acc;
        }, {});

        const processedData: UserEmailRecord[] = [];

        Object.values(groupedByOrder).forEach((orderGroup: any) => {
          orderGroup.forEach((item: any, index: number) => {
            const isReplaced = index > 0; // Since sorted by assigned_at DESC, index 0 is the latest
            const isRevoked = item.orders?.status === 'refunded' || item.orders?.status === 'cancelled';
            
            let expiresAt = null;
            let daysLeft = 0;
            let computedStatus: UserEmailRecord['computed_status'] = 'Active';

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
              } else {
                computedStatus = 'Active';
              }
            } else {
               computedStatus = isRevoked ? 'Revoked' : (isReplaced ? 'Replaced' : 'Active');
            }

            // Handle pool mapping robustly
            const poolDataRaw = item.emails_pool || (item.email_id && typeof item.email_id === 'object' ? item.email_id : null);
            const poolData = Array.isArray(poolDataRaw) ? poolDataRaw[0] : poolDataRaw;

            processedData.push({
              id: item.id,
              email_id: typeof item.email_id === 'object' ? item.email_id.id : item.email_id,
              order_id: item.order_id,
              assigned_at: item.assigned_at,
              is_active: item.is_active,
              users: item.users || { name: 'Unknown', email: 'Unknown', phone: '' },
              emails_pool: {
                email: poolData?.email || 'Unknown',
                password: poolData?.password || 'Unknown'
              },
              orders: item.orders,
              computed_status: computedStatus,
              days_left: daysLeft,
              expires_at: expiresAt
            });
          });
        });

        // Sort overall by assigned date
        processedData.sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime());
        setEmails(processedData);
      }

      // Fetch Personal Subscriptions from Orders table
      const { data: pData, error: pError } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          status,
          personal_email,
          users:user_id (name, email, phone),
          products:product_id (title, duration, is_personal)
        `)
        .eq('products.is_personal', true)
        .not('personal_email', 'is', null)
        .order('created_at', { ascending: false });
        
      if (!pError && pData) {
        // Handle array vs object correctly from Supabase join
        const validPersonalSubs = pData.filter(o => {
          const prod = Array.isArray(o.products) ? o.products[0] : o.products;
          return prod && prod.is_personal;
        });
        
        const processedPersonal = validPersonalSubs.map(item => {
          const isRevoked = item.status === 'refunded' || item.status === 'cancelled';
          let expiresAt = null;
          let daysLeft = 0;
          let computedStatus = 'Active';
          const prod = Array.isArray(item.products) ? item.products[0] : item.products;
          
          if (prod) {
            const durationStr = prod.duration.toLowerCase();
            let monthsToAdd = 1;
            
            if (durationStr.includes('year') || durationStr.includes('yr')) {
              const match = durationStr.match(/\d+/);
              monthsToAdd = match ? parseInt(match[0]) * 12 : 12;
            } else {
              const match = durationStr.match(/\d+/);
              monthsToAdd = match ? parseInt(match[0]) : 1;
            }

            const orderDate = parseISO(item.created_at);
            expiresAt = addMonths(orderDate, monthsToAdd);
            const isExp = isPast(expiresAt);
            daysLeft = isExp ? 0 : differenceInDays(expiresAt, new Date());

            if (isRevoked) {
              computedStatus = 'Revoked';
            } else if (item.status === 'pending') {
              computedStatus = 'Pending';
            } else if (isExp) {
              computedStatus = 'Expired';
            } else if (daysLeft <= 7) {
              computedStatus = 'Expiring Soon';
            } else {
              computedStatus = 'Active';
            }
          }
          
          return {
            ...item,
            computed_status: computedStatus,
            days_left: daysLeft,
            expires_at: expiresAt
          };
        });
        
        setPersonalSubs(processedPersonal);
      }

    } catch (err) {
      console.error('Error fetching user emails:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const stats = {
    total: activeTab === 'regular' ? emails.length : personalSubs.length,
    active: activeTab === 'regular' ? emails.filter(e => e.computed_status === 'Active').length : personalSubs.filter(s => s.computed_status === 'Active').length,
    expiringSoon: activeTab === 'regular' ? emails.filter(e => e.computed_status === 'Expiring Soon').length : personalSubs.filter(s => s.computed_status === 'Expiring Soon').length,
    expired: activeTab === 'regular' ? emails.filter(e => e.computed_status === 'Expired').length : personalSubs.filter(s => s.computed_status === 'Expired').length,
    replaced: activeTab === 'regular' ? emails.filter(e => e.computed_status === 'Replaced').length : personalSubs.filter(s => s.computed_status === 'Replaced').length,
  };

  const filteredEmails = emails.filter(email => {
    const matchesSearch = 
      email.users.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.users.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.emails_pool.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = filter === 'All' || email.computed_status === filter;
    
    return matchesSearch && matchesFilter;
  });

  const filteredPersonalSubs = personalSubs.filter(sub => {
    const userEmail = sub.users?.email || '';
    const userName = sub.users?.name || '';
    const personalEmail = sub.personal_email || '';
    
    const matchesSearch = 
      userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      personalEmail.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = filter === 'All' || sub.computed_status === filter;
    
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none p-5 border border-gray-100 dark:border-[#26262d] flex items-center">
          <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center mr-4">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500">Active Emails</p>
            <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.active}</h4>
          </div>
        </div>
        
        <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none p-5 border border-gray-100 dark:border-[#26262d] flex items-center">
          <div className="w-12 h-12 bg-yellow-100 text-yellow-600 rounded-xl flex items-center justify-center mr-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500">Expiring Soon (≤ 7 days)</p>
            <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.expiringSoon}</h4>
          </div>
        </div>
        
        <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none p-5 border border-gray-100 dark:border-[#26262d] flex items-center">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-xl flex items-center justify-center mr-4">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500">Expired Accounts</p>
            <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.expired}</h4>
          </div>
        </div>
        
        <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none p-5 border border-gray-100 dark:border-[#26262d] flex items-center">
          <div className="w-12 h-12 bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 rounded-xl flex items-center justify-center mr-4">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Replaced / Old Emails</p>
            <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.replaced}</h4>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden transition-colors duration-300">
        {/* ── Sub Navigation Tabs ── */}
        <div className="border-b border-gray-100 dark:border-[#26262d] px-6 flex gap-6">
          <button
            onClick={() => setActiveTab('regular')}
            className={`py-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'regular' 
                ? 'border-primary text-primary' 
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Regular Subscriptions
          </button>
          <button
            onClick={() => setActiveTab('personal')}
            className={`py-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'personal' 
                ? 'border-purple-600 text-purple-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Personal Subscriptions
          </button>
        </div>

        <div className="p-6 border-b border-gray-100 dark:border-[#26262d] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
            <ShieldAlert className="w-5 h-5 mr-2 text-primary" />
            User Subscription Monitoring
          </h3>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="relative flex-1 sm:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400 dark:text-gray-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-[#26262d] rounded-lg text-sm focus:ring-primary focus:border-primary outline-none bg-white text-gray-900 placeholder:text-gray-400 dark:bg-[#111113] dark:text-gray-100 dark:placeholder:text-gray-500 transition-colors duration-300"
                placeholder="Search user or email..."
              />
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="px-3 py-2 border border-gray-200 dark:border-[#26262d] rounded-lg text-sm focus:ring-primary focus:border-primary outline-none bg-white text-gray-900 dark:bg-[#151518] dark:text-gray-100 transition-colors duration-300"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active Only</option>
              <option value="Expiring Soon">Expiring Soon</option>
              <option value="Expired">Expired</option>
              {activeTab === 'regular' && <option value="Replaced">Replaced</option>}
              <option value="Revoked">Revoked</option>
              {activeTab === 'personal' && <option value="Pending">Pending</option>}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {activeTab === 'regular' ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-[#26262d] bg-gray-50 dark:bg-white/5">
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Customer</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Assigned Adobe Email</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Assigned Date</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Expiration</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {filteredEmails.map((email) => {
                  const isFaded = email.computed_status === 'Replaced' || email.computed_status === 'Revoked';
                  
                  return (
                    <tr key={email.id} className={`hover:bg-gray-50/50 dark:hover:bg-[#1c1c21]/50 transition-colors duration-300 ${isFaded ? 'bg-gray-50 dark:bg-white/[0.02]' : ''}`}>
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{email.users.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{email.users.email}</div>
                        {email.users.phone && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{email.users.phone}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <div className={`font-medium ${isFaded ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                          {email.emails_pool.email}
                        </div>
                        <div className="text-xs font-mono text-gray-400 dark:text-gray-500 mt-0.5 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded inline-block">
                          {email.emails_pool.password}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">
                        {format(new Date(email.assigned_at), 'MMM dd, yyyy')}
                      </td>
                      <td className="py-3 px-4">
                        {email.expires_at ? (
                          <div>
                            <div className={`text-sm font-bold ${
                              email.computed_status === 'Expired' ? 'text-red-600 dark:text-red-400' :
                              email.computed_status === 'Expiring Soon' ? 'text-yellow-600 dark:text-amber-300' :
                              isFaded ? 'text-gray-500 dark:text-gray-400' : 'text-green-600 dark:text-emerald-400'
                            }`}>
                              {email.days_left} Days Left
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {format(email.expires_at, 'MMM dd, yyyy')}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-gray-500">Unknown</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          email.computed_status === 'Active' ? 'bg-green-100 dark:bg-emerald-500/10 text-green-800 dark:text-emerald-300' :
                          email.computed_status === 'Expiring Soon' ? 'bg-yellow-100 dark:bg-amber-500/10 text-yellow-800 dark:text-amber-300' :
                          email.computed_status === 'Expired' ? 'bg-red-100 dark:bg-red-500/10 text-red-800 dark:text-red-300' :
                          email.computed_status === 'Replaced' ? 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-300' :
                          'bg-orange-100 dark:bg-orange-500/10 text-orange-800 dark:text-orange-300'
                        }`}>
                          {email.computed_status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filteredEmails.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-500 dark:text-gray-400">
                      No records found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-[#26262d] bg-gray-50 dark:bg-white/5">
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Customer</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Requested Email</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ordered Date</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Expiration</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {filteredPersonalSubs.map((sub) => {
                  const isFaded = sub.computed_status === 'Revoked';
                  
                  return (
                    <tr key={sub.id} className={`hover:bg-gray-50/50 dark:hover:bg-[#1c1c21]/50 transition-colors duration-300 ${isFaded ? 'bg-gray-50 dark:bg-white/[0.02]' : ''}`}>
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{sub.users?.name || 'Unknown'}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{sub.users?.email}</div>
                        {sub.users?.phone && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub.users.phone}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <div className={`font-medium ${isFaded ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-purple-600 dark:text-purple-400'}`}>
                          {sub.personal_email}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Plan: {Array.isArray(sub.products) ? sub.products[0]?.duration : sub.products?.duration}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">
                        {format(new Date(sub.created_at), 'MMM dd, yyyy')}
                      </td>
                      <td className="py-3 px-4">
                        {sub.expires_at ? (
                          <div>
                            <div className={`text-sm font-bold ${
                              sub.computed_status === 'Expired' ? 'text-red-600 dark:text-red-400' :
                              sub.computed_status === 'Expiring Soon' ? 'text-yellow-600 dark:text-amber-300' :
                              isFaded ? 'text-gray-500 dark:text-gray-400' : 'text-green-600 dark:text-emerald-400'
                            }`}>
                              {sub.days_left} Days Left
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {format(sub.expires_at, 'MMM dd, yyyy')}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-gray-500">Unknown</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          sub.computed_status === 'Active' ? 'bg-green-100 dark:bg-emerald-500/10 text-green-800 dark:text-emerald-300' :
                          sub.computed_status === 'Expiring Soon' ? 'bg-yellow-100 dark:bg-amber-500/10 text-yellow-800 dark:text-amber-300' :
                          sub.computed_status === 'Expired' ? 'bg-red-100 dark:bg-red-500/10 text-red-800 dark:text-red-300' :
                          sub.computed_status === 'Pending' ? 'bg-orange-100 dark:bg-orange-500/10 text-orange-800 dark:text-orange-300' :
                          'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-300'
                        }`}>
                          {sub.computed_status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filteredPersonalSubs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-500 dark:text-gray-400">
                      No personal subscriptions found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
