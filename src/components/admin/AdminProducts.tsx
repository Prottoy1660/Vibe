import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Loader2, Package, Save, X } from 'lucide-react';

interface Product {
  id: string;
  title: string;
  title_bn: string;
  price: number;
  duration: string;
  icons: string[];
  description: string;
  image_url?: string;
  is_active: boolean;
}

export const AdminProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<Product>>({
    title: '',
    title_bn: '',
    price: 0,
    duration: '1 month',
    icons: [],
    description: '',
    image_url: '',
    is_active: true
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        // Sanitize payload
        const updatePayload = { ...formData };
        delete updatePayload.id;
        delete (updatePayload as any).created_at;

        const { error } = await supabase
          .from('products')
          .update({
            ...updatePayload,
            // Ensure icons is properly formatted as a JSON array or string array based on schema
            icons: Array.isArray(formData.icons) ? formData.icons : (formData.icons as string).split(',').map((i: string) => i.trim())
          })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from('products')
          .insert({
            ...formData,
            icons: Array.isArray(formData.icons) ? formData.icons : (formData.icons as string).split(',').map((i: string) => i.trim())
          });

        if (error) throw error;
      }

      setEditingId(null);
      setIsAdding(false);
      fetchProducts();
    } catch (error: any) {
      console.error('Error saving product:', error);
      alert(`Error saving product: ${error.message || 'Unknown database error'}. Check if the image_url column exists in Supabase!`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this product?')) return;
    
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product');
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('WARNING: Are you absolutely sure you want to delete ALL products? This action cannot be undone!')) return;
    
    try {
      setLoading(true);
      // Delete all records where id is not null (which is all of them)
      const { error } = await supabase
        .from('products')
        .delete()
        .not('id', 'is', null);

      if (error) throw error;
      fetchProducts();
    } catch (error) {
      console.error('Error deleting all products:', error);
      alert('Failed to delete all products');
      setLoading(false);
    }
  };

  const startEdit = (product: Product) => {
    setFormData({
      ...product,
      icons: product.icons || []
    });
    setEditingId(product.id);
    setIsAdding(false);
  };

  const startAdd = () => {
    setFormData({
      title: '',
      title_bn: '',
      price: 0,
      duration: '1 month',
      icons: [],
      description: '',
      image_url: '',
      is_active: true
    });
    setIsAdding(true);
    setEditingId(null);
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;
  }

  return (
    <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden">
      <div className="p-6 border-b border-gray-100 dark:border-[#26262d] flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
          <Package className="w-5 h-5 mr-2 text-primary" />
          Product Management
        </h3>
        <div className="flex space-x-2">
          {products.length > 0 && (
            <button 
              onClick={handleDeleteAll}
              className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors flex items-center"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete All
            </button>
          )}
          <button 
            onClick={startAdd}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Product
          </button>
        </div>
      </div>

      <div className="p-6">
        {(isAdding || editingId) && (
          <div className="mb-8 p-6 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-[#26262d]">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">{editingId ? 'Edit Product' : 'New Product'}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Title (English)</label>
                <input 
                  type="text" 
                  value={formData.title} 
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Title (Bangla)</label>
                <input 
                  type="text" 
                  value={formData.title_bn} 
                  onChange={e => setFormData({...formData, title_bn: e.target.value})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Price (৳)</label>
                <input 
                  type="number" 
                  value={formData.price} 
                  onChange={e => setFormData({...formData, price: Number(e.target.value)})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Duration (e.g., "1 month")</label>
                <input 
                  type="text" 
                  value={formData.duration} 
                  onChange={e => setFormData({...formData, duration: e.target.value})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Icons (comma separated, e.g. ai,ps,pr)</label>
                <input 
                  type="text" 
                  value={Array.isArray(formData.icons) ? formData.icons.join(',') : formData.icons} 
                  onChange={e => setFormData({...formData, icons: e.target.value.split(',').map(s => s.trim())})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Status</label>
                <select 
                  value={formData.is_active ? 'true' : 'false'} 
                  onChange={e => setFormData({...formData, is_active: e.target.value === 'true'})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Description</label>
                <textarea 
                  value={formData.description} 
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg h-24"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Image URL (Optional)</label>
                <input 
                  type="text" 
                  value={formData.image_url || ''} 
                  onChange={e => setFormData({...formData, image_url: e.target.value})}
                  className="w-full p-2 border border-gray-300 dark:border-[#303038] rounded-lg"
                  placeholder="https://example.com/image.jpg"
                />
                <p className="text-xs text-gray-500 mt-1">If provided, this image will be displayed instead of the default gradient banner and icons.</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end space-x-3">
              <button 
                onClick={() => { setIsAdding(false); setEditingId(null); }}
                className="px-4 py-2 border border-gray-300 dark:border-[#303038] text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1c1c21] dark:bg-white/5"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Product
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#26262d]">
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Product</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Price</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Duration</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300">Status</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map(product => (
                <tr key={product.id} className="border-b border-gray-100 dark:border-[#26262d] hover:bg-gray-50/50 dark:hover:bg-[#1c1c21]/50 transition-colors duration-300">
                  <td className="py-3 px-4">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{product.title}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{product.title_bn}</div>
                  </td>
                  <td className="py-3 px-4 font-semibold text-emerald-500">৳{product.price}</td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-300">{product.duration}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      product.is_active ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200'
                    }`}>
                      {product.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button 
                        onClick={() => startEdit(product)}
                        className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(product.id)}
                        className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500 dark:text-gray-400">
                    No products found. Add one to get started.
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
