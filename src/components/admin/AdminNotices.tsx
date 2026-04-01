import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Info, Plus, Edit2, Trash2, Save, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface Notice {
  id: string;
  title: string;
  content: string;
  type: string;
  is_active: boolean;
  created_at: string;
}

export const AdminNotices = () => {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<Notice>>({
    title: '',
    content: '',
    type: 'info',
    is_active: true
  });

  useEffect(() => {
    fetchNotices();
  }, []);

  const fetchNotices = async () => {
    try {
      const { data, error } = await supabase
        .from('notices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setNotices(data || []);
    } catch (error) {
      console.error('Error fetching notices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      if (!formData.title || !formData.content) {
        alert('Title and content are required');
        return;
      }

      if (editingId) {
        // Update
        const { error } = await supabase
          .from('notices')
          .update(formData)
          .eq('id', editingId);

        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from('notices')
          .insert(formData);

        if (error) throw error;
      }

      setIsAdding(false);
      setEditingId(null);
      setFormData({
        title: '',
        content: '',
        type: 'info',
        is_active: true
      });
      fetchNotices();
    } catch (error: any) {
      console.error('Error saving notice:', error);
      alert(error.message || 'Error saving notice');
    }
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('notices')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      fetchNotices();
    } catch (error) {
      console.error('Error updating notice:', error);
    }
  };

  const startEdit = (notice: Notice) => {
    setFormData({
      title: notice.title,
      content: notice.content,
      type: notice.type,
      is_active: notice.is_active
    });
    setEditingId(notice.id);
    setIsAdding(false);
  };

  const startAdd = () => {
    setFormData({
      title: '',
      content: '',
      type: 'info',
      is_active: true
    });
    setIsAdding(true);
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this notice?')) return;
    
    try {
      const { error } = await supabase
        .from('notices')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchNotices();
    } catch (error) {
      console.error('Error deleting notice:', error);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
  }

  return (
    <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden transition-colors duration-300">
      <div className="p-6 border-b border-gray-100 dark:border-[#26262d] flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
          <Info className="w-5 h-5 mr-2 text-yellow-500" />
          Important Notices
        </h3>
        <button 
          onClick={startAdd}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Notice
        </button>
      </div>

      <div className="p-6">
        {(isAdding || editingId) && (
          <div className="mb-8 p-6 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-[#26262d] transition-colors duration-300">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">{editingId ? 'Edit Notice' : 'New Notice'}</h4>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Title</label>
                  <input 
                    type="text" 
                    value={formData.title} 
                    onChange={e => setFormData({...formData, title: e.target.value})}
                    className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg bg-white text-gray-900 placeholder:text-gray-400 dark:bg-[#111113] dark:text-gray-100 dark:placeholder:text-gray-500 transition-colors duration-300"
                    placeholder="e.g. System Maintenance"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Type</label>
                  <select 
                    value={formData.type} 
                    onChange={e => setFormData({...formData, type: e.target.value})}
                    className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg bg-white text-gray-900 dark:bg-[#111113] dark:text-gray-100 transition-colors duration-300"
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="error">Error</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Content</label>
                <textarea 
                  value={formData.content} 
                  onChange={e => setFormData({...formData, content: e.target.value})}
                  className="w-full p-3 border border-gray-300 dark:border-[#303038] rounded-lg min-h-[120px] bg-white text-gray-900 placeholder:text-gray-400 dark:bg-[#111113] dark:text-gray-100 dark:placeholder:text-gray-500 transition-colors duration-300"
                  placeholder="Type the notice message here. Newlines will be preserved."
                />
              </div>

              <div>
                <label className="flex items-center space-x-2">
                  <input 
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={e => setFormData({...formData, is_active: e.target.checked})}
                    className="rounded border-gray-300 dark:border-[#303038] text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Active (Visible to users)</span>
                </label>
              </div>

              <div className="flex items-end justify-end space-x-2 pt-2 border-t border-gray-200 dark:border-[#26262d]">
                <button 
                  onClick={() => { setIsAdding(false); setEditingId(null); }}
                  className="px-4 py-2 border border-gray-300 dark:border-[#303038] text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1c1c21] dark:bg-white/5 transition-colors duration-300"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  disabled={!formData.title || !formData.content}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center justify-center disabled:opacity-50"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Notice
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#26262d]">
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Notice</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Type</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Date</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Status</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {notices.map(notice => (
                <tr key={notice.id} className="border-b border-gray-100 dark:border-[#26262d] hover:bg-gray-50/50 dark:hover:bg-[#1c1c21]/50 transition-colors duration-300">
                  <td className="py-3 px-4">
                    <div className="font-bold text-gray-900 dark:text-gray-100">{notice.title}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 max-w-md">{notice.content}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium capitalize ${
                      notice.type === 'error' ? 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-300' :
                      notice.type === 'warning' ? 'bg-yellow-100 dark:bg-amber-500/10 text-yellow-700 dark:text-amber-300' :
                      'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
                    }`}>
                      {notice.type}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">
                    {format(new Date(notice.created_at), 'MMM dd, yyyy')}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => toggleStatus(notice.id, notice.is_active)}
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                        notice.is_active 
                          ? 'bg-green-100 dark:bg-emerald-500/10 text-green-700 dark:text-emerald-300 hover:bg-green-200 dark:hover:bg-emerald-500/20' 
                          : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-white/20'
                      }`}
                    >
                      {notice.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button 
                        onClick={() => startEdit(notice)}
                        className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-colors duration-300"
                        title="Edit Notice"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(notice.id)}
                        className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors duration-300"
                        title="Delete Notice"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {notices.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500 dark:text-gray-400">
                    No notices found. Create one to inform your users.
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
