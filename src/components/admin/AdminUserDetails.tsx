import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Loader2, ArrowLeft, User, Mail, Phone, Calendar, 
  ShoppingBag, CreditCard, ShieldAlert, CheckCircle2, 
  XCircle, Clock, Activity, Zap, Edit2, Save, Camera, Lock, AlertCircle, History
} from 'lucide-react';
import { format, addMonths, isPast, parseISO, differenceInDays, formatDistanceToNow } from 'date-fns';

interface AdminUserDetailsProps {
  userId: string;
  onBack: () => void;
}

export const AdminUserDetails: React.FC<AdminUserDetailsProps> = ({ userId, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  
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

      // Calculate basic stats
      const totalSpent = userOrders?.filter(o => o.status === 'completed' || o.status === 'paid')
                                    .reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
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
          .limit(20);

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

      const response = await fetch(`http://localhost:3001/api/admin/users/${userId}`, {
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

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-white dark:bg-[#151518] p-6 rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] gap-4">
        <div className="flex items-start md:items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-gray-100 dark:hover:bg-[#1c1c21] dark:bg-white/10 rounded-lg transition-colors text-gray-600 dark:text-gray-300 mt-1 md:mt-0 shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-4">
            <div className="relative group shrink-0">
              <div className="w-16 h-16 bg-gradient-primary text-white rounded-full flex items-center justify-center font-bold text-2xl shadow-sm overflow-hidden border-2 border-white ring-2 ring-gray-100">
                {userProfile.avatar_url ? (
                  <img src={userProfile.avatar_url} alt={userProfile.name} className="w-full h-full object-cover" />
                ) : (
                  userProfile.name?.charAt(0).toUpperCase() || 'U'
                )}
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
                title="Change Avatar"
              >
                <Camera className="w-5 h-5 text-white" />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                onChange={handleAvatarUpload}
              />
            </div>
            
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 flex-wrap">
                {userProfile.name}
                {userProfile.role === 'admin' && (
                  <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">Admin</span>
                )}
                {userProfile.is_banned && (
                  <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">Banned</span>
                )}
              </h2>
              <div className="flex flex-col sm:flex-row sm:items-center text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 gap-2 sm:gap-4 mt-1">
                <span className="flex items-center"><Mail className="w-3.5 h-3.5 mr-1.5" /> {userProfile.email}</span>
                {userProfile.phone && <span className="flex items-center"><Phone className="w-3.5 h-3.5 mr-1.5" /> {userProfile.phone}</span>}
                <span className="flex items-center sm:hidden"><Calendar className="w-3.5 h-3.5 mr-1.5" /> Joined {format(new Date(userProfile.created_at), 'MMM yyyy')}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-between w-full md:w-auto gap-4">
          <div className="hidden sm:block text-right text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
            Joined: {format(new Date(userProfile.created_at), 'MMM dd, yyyy')}
          </div>
          <button 
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors ml-auto md:ml-0"
          >
            <Edit2 className="w-4 h-4 mr-2" />
            {isEditing ? 'Cancel Edit' : 'Edit User'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-start ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 mr-2 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 mr-2 shrink-0 mt-0.5" />}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {isEditing && (
        <div className="bg-white dark:bg-[#151518] rounded-xl p-6 shadow-soft dark:shadow-none border border-indigo-100 mb-6">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
            <Edit2 className="w-4 h-4 mr-2 text-indigo-500" />
            Edit User Profile
          </h3>
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

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#151518] rounded-xl p-5 shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] flex items-center">
          <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center mr-4">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Total Spent</p>
            <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100">৳{stats.totalSpent.toFixed(2)}</h4>
          </div>
        </div>
        
        <div className="bg-white dark:bg-[#151518] rounded-xl p-5 shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] flex items-center">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mr-4">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Total Orders</p>
            <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalOrders}</h4>
          </div>
        </div>
        
        <div className="bg-white dark:bg-[#151518] rounded-xl p-5 shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] flex items-center">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mr-4">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Active Subs</p>
            <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.activeSubscriptions}</h4>
          </div>
        </div>
        
        <div className="bg-white dark:bg-[#151518] rounded-xl p-5 shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] flex items-center">
          <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center mr-4">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Emails Gen.</p>
            <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalEmailsGenerated}</h4>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Order History */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden">
            <div className="p-5 border-b border-gray-100 dark:border-[#26262d] bg-gray-50/50 dark:bg-white/5">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center">
                <ShoppingBag className="w-4 h-4 mr-2 text-blue-500" />
                Purchase History
              </h3>
            </div>
            <div className="p-0">
              {orders.length > 0 ? (
                <div className="divide-y divide-gray-100 dark:divide-white/5 max-h-[600px] overflow-y-auto">
                  {orders.map((order) => (
                    <div key={order.id} className="p-4 hover:bg-gray-50 dark:hover:bg-[#1c1c21] dark:bg-white/5 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">{order.products?.title || 'Unknown Product'}</div>
                        <div className="font-bold text-primary text-sm whitespace-nowrap ml-2">৳{order.total_amount}</div>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs mt-2">
                        <div className="flex flex-col gap-1 text-gray-500 dark:text-gray-400 dark:text-gray-500">
                          <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" /> {format(new Date(order.created_at), 'MMM dd, yyyy HH:mm')}</span>
                          <span className="flex items-center capitalize"><CreditCard className="w-3 h-3 mr-1" /> Gateway: {order.payment_method}</span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`px-2 py-0.5 rounded-full font-medium capitalize ${
                            order.status === 'completed' ? 'bg-green-100 text-green-700' :
                            order.status === 'paid' ? 'bg-blue-100 text-blue-700' :
                            order.status === 'refunded' ? 'bg-gray-200 text-gray-700 dark:text-gray-200' :
                            order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {order.status}
                          </span>
                          <span className="text-gray-400 dark:text-gray-500 font-mono">ID: {order.id.slice(0, 6)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400 dark:text-gray-500 text-sm">No purchase history found.</div>
              )}
            </div>
          </div>

          {/* Activity Logs */}
          <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden">
            <div className="p-5 border-b border-gray-100 dark:border-[#26262d] bg-gray-50/50 dark:bg-white/5">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center">
                <History className="w-4 h-4 mr-2 text-purple-500" />
                Recent Activity & Changes
              </h3>
            </div>
            <div className="p-0">
              {activityLogs.length > 0 ? (
                <div className="divide-y divide-gray-100 dark:divide-white/5 max-h-[400px] overflow-y-auto">
                  {activityLogs.map((log) => (
                    <div key={log.id} className="p-4 hover:bg-gray-50 dark:hover:bg-[#1c1c21] dark:bg-white/5 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <div className="font-medium text-gray-900 dark:text-gray-100 text-sm flex items-center">
                          <span className={`w-2 h-2 rounded-full mr-2 ${
                            log.action_type === 'admin_update' ? 'bg-purple-500' :
                            log.action_type === 'profile_update' ? 'bg-blue-500' :
                            'bg-gray-50 dark:bg-white/50'
                          }`}></span>
                          {log.details?.message || log.action_type.replace('_', ' ')}
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 whitespace-nowrap ml-4">
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 pl-4 mt-1 flex items-center">
                        <User className="w-3 h-3 mr-1" />
                        By: {log.changer?.name || 'System'} {log.changer?.role === 'admin' ? '(Admin)' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400 dark:text-gray-500 text-sm flex flex-col items-center">
                  <History className="w-8 h-8 text-gray-300 mb-2" />
                  No recent activity found.
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column - Email Subscriptions */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden">
            <div className="p-5 border-b border-gray-100 dark:border-[#26262d] bg-gray-50/50 dark:bg-white/5">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center">
                <ShieldAlert className="w-4 h-4 mr-2 text-indigo-500" />
                Generated Adobe Emails & Expirations
              </h3>
            </div>
            
            <div className="overflow-x-auto">
              {emails.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-[#26262d] bg-gray-50 dark:bg-white/5">
                      <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Account Details</th>
                      <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Assigned Date</th>
                      <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider">Expiration</th>
                      <th className="py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                    {emails.map((email) => {
                      const isFaded = email.computed_status === 'Replaced' || email.computed_status === 'Revoked';
                      return (
                        <tr key={email.id} className={`hover:bg-gray-50 dark:hover:bg-[#1c1c21] dark:bg-white/5 transition-colors ${isFaded ? 'opacity-60 bg-gray-50/50 dark:bg-white/5' : ''}`}>
                          <td className="py-3 px-4">
                            <div className={`text-sm font-medium ${isFaded ? 'text-gray-500 dark:text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                              {email.emails_pool.email}
                            </div>
                            <div className="text-xs font-mono text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded inline-block">
                              {email.emails_pool.password}
                            </div>
                            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 font-mono">Order: {email.order_id?.slice(0, 8)}</div>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">
                            {format(new Date(email.assigned_at), 'MMM dd, yyyy')}
                          </td>
                          <td className="py-3 px-4">
                            {email.expires_at ? (
                              <div className="flex flex-col">
                                <span className={`text-sm font-bold flex items-center ${
                                  isFaded ? 'text-gray-400 dark:text-gray-500' :
                                  email.computed_status === 'Expired' ? 'text-red-600' : 'text-green-600'
                                }`}>
                                  {email.days_left} Days Left
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 flex items-center mt-1">
                                  <Calendar className="w-3 h-3 mr-1" />
                                  {format(email.expires_at, 'MMM dd, yyyy')}
                                </span>
                                {!isFaded && (
                                  <div className="w-full bg-gray-200 h-1.5 rounded-full mt-1.5 overflow-hidden max-w-[120px]">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-1000 ${email.computed_status === 'Expired' ? 'bg-red-500' : 'bg-green-500'}`} 
                                      style={{ width: `${Math.min(100, Math.max(0, (email.days_left / 30) * 100))}%` }}
                                    ></div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400 dark:text-gray-500 italic">Unknown</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                              email.computed_status === 'Active' ? 'bg-green-100 text-green-800' :
                              email.computed_status === 'Expiring Soon' ? 'bg-yellow-100 text-yellow-800' :
                              email.computed_status === 'Expired' ? 'bg-red-100 text-red-800' :
                              email.computed_status === 'Replaced' ? 'bg-gray-200 text-gray-600 dark:text-gray-300' :
                              'bg-orange-100 text-orange-800'
                            }`}>
                              {email.computed_status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                  <Mail className="w-12 h-12 text-gray-300 mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 text-sm">No emails generated by this user yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};