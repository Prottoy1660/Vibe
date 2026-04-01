import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Mail, Trash2, Eye, EyeOff, CheckCircle2, AlertCircle, RefreshCw, Server } from 'lucide-react';
import { format } from 'date-fns';

interface EmailPool {
  id: string;
  email: string;
  password: string;
  status: 'available' | 'assigned' | 'used';
  created_at: string;
  assigned_at: string | null;
}

export const AdminEmails = () => {
  const [emails, setEmails] = useState<EmailPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  
  // Auto-generation state
  const [generating, setGenerating] = useState(false);
  const [genCount, setGenCount] = useState(5);
  const [genDomain, setGenDomain] = useState('vibeaccess.space');
  const [genPrefix, setGenPrefix] = useState('adobe');

  useEffect(() => {
    fetchEmails();
  }, []);

  const fetchEmails = async () => {
    try {
      const { data, error } = await supabase
        .from('emails_pool')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setEmails(data || []);
    } catch (error) {
      console.error('Error fetching emails:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = (id: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleDelete = async (id: string, status: string) => {
    if (status !== 'available') {
      if (!window.confirm(`This email is currently marked as '${status}'. Deleting it might affect user access. Are you absolutely sure?`)) {
        return;
      }
    } else {
      if (!window.confirm('Are you sure you want to delete this email from the pool?')) {
        return;
      }
    }
    
    try {
      const { error } = await supabase
        .from('emails_pool')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchEmails();
    } catch (error) {
      console.error('Error deleting email:', error);
      alert('Failed to delete email');
    }
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  const handleAutoGenerate = async () => {
    if (!genPrefix || !genDomain) {
      alert('Prefix and domain are required');
      return;
    }
    
    if (genCount < 1 || genCount > 50) {
      alert('Please generate between 1 and 50 emails at a time');
      return;
    }

    if (!window.confirm(`Are you sure you want to generate ${genCount} emails?\nFormat: ${genPrefix}.xyz@${genDomain}`)) {
      return;
    }

    setGenerating(true);

    try {
      // Create random accounts
      const newAccounts = [];
      for (let i = 0; i < genCount; i++) {
        // Generate random 4 char string for uniqueness
        const randomStr = Math.random().toString(36).substring(2, 6);
        const email = `${genPrefix}.${randomStr}@${genDomain}`;
        const password = generateRandomPassword();
        
        newAccounts.push({
          email,
          password,
          status: 'available'
        });
      }

      // 1. Hit backend API which connects to cPanel
      const API_URL = import.meta.env.VITE_API_URL || '';
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${API_URL}/api/cpanel/create-emails`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ accounts: newAccounts })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'cPanel creation failed');
      }
      
      // 2. Save to database
      const { error } = await supabase
        .from('emails_pool')
        .insert(newAccounts);

      if (error) throw error;
      
      alert(`Success! ${genCount} emails have been created in cPanel and saved to the database.`);
      fetchEmails();
      
    } catch (error: any) {
      console.error('Error generating emails:', error);
      alert(`Failed to generate emails: ${error.message}`);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
  }

  const availableCount = emails.filter(e => e.status === 'available').length;
  const assignedCount = emails.filter(e => e.status === 'assigned').length;

  return (
    <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden transition-colors duration-300">
      <div className="p-6 border-b border-gray-100 dark:border-[#26262d] flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-gray-50/50 dark:bg-white/5 transition-colors duration-300">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
            <Mail className="w-5 h-5 mr-2 text-primary" />
            Email Inventory
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage all Adobe emails in the system.</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="bg-green-50 dark:bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-green-100 dark:border-emerald-500/20 flex items-center transition-colors duration-300">
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-emerald-400 mr-1.5" />
            <span className="text-sm font-medium text-green-800 dark:text-emerald-200">{availableCount} Available</span>
          </div>
          <div className="bg-blue-50 dark:bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-500/20 flex items-center transition-colors duration-300">
            <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mr-1.5" />
            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">{assignedCount} Assigned</span>
          </div>
        </div>
      </div>

      <div className="p-6 border-b border-gray-100 dark:border-[#26262d]">
        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
          <Server className="w-4 h-4 mr-2 text-indigo-500" />
          cPanel Auto Generator
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-indigo-50/60 dark:bg-[#111113] p-4 rounded-xl border border-indigo-100 dark:border-[#303038] transition-colors duration-300">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Prefix</label>
            <input 
              type="text" 
              value={genPrefix}
              onChange={e => setGenPrefix(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg text-sm bg-white text-gray-900 placeholder:text-gray-400 dark:bg-[#1c1c21] dark:text-gray-100 dark:placeholder:text-gray-500 transition-colors duration-300"
              placeholder="e.g. team"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Domain</label>
            <input 
              type="text" 
              value={genDomain}
              onChange={e => setGenDomain(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg text-sm bg-white text-gray-900 placeholder:text-gray-400 dark:bg-[#1c1c21] dark:text-gray-100 dark:placeholder:text-gray-500 transition-colors duration-300"
              placeholder="example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Amount to Generate</label>
            <input 
              type="number" 
              min="1"
              max="50"
              value={genCount}
              onChange={e => setGenCount(parseInt(e.target.value) || 1)}
              className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg text-sm bg-white text-gray-900 placeholder:text-gray-400 dark:bg-[#1c1c21] dark:text-gray-100 dark:placeholder:text-gray-500 transition-colors duration-300"
            />
          </div>
          <button 
            onClick={handleAutoGenerate}
            disabled={generating}
            className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors flex items-center justify-center disabled:opacity-50"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
            ) : (
              <><RefreshCw className="w-4 h-4 mr-2" /> Auto Generate</>
            )}
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#26262d]">
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Email Address</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Password</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Status</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Added Date</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {emails.map(email => (
                <tr key={email.id} className="border-b border-gray-100 dark:border-[#26262d] hover:bg-gray-50/50 dark:hover:bg-[#1c1c21]/50 transition-colors duration-300">
                  <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">{email.email}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/10 px-2 py-1 rounded">
                        {showPasswords[email.id] ? email.password : '••••••••'}
                      </span>
                      <button 
                        onClick={() => togglePasswordVisibility(email.id)}
                        className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1 transition-colors duration-300"
                        title={showPasswords[email.id] ? "Hide Password" : "Show Password"}
                      >
                        {showPasswords[email.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium capitalize ${
                      email.status === 'available' ? 'bg-green-100 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300' : 
                      email.status === 'assigned' ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300' : 
                      'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200'
                    }`}>
                      {email.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                    {format(new Date(email.created_at), 'MMM dd, yyyy HH:mm')}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button 
                      onClick={() => handleDelete(email.id, email.status)}
                      className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded inline-flex items-center transition-colors duration-300"
                      title="Delete Email"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {emails.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500 dark:text-gray-400">
                    No emails found in the pool.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
