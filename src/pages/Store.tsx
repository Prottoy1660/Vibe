import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Search, ShoppingBag, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface Product {
  id: string;
  title: string;
  title_bn: string;
  price: number;
  duration: string;
  icons: string[];
  description: string;
  image_url?: string;
}

export const Store = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<'adobe' | 'envato'>('adobe');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('is_active', true);

        if (error) throw error;
        if (data) setProducts(data);
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (product.title_bn && product.title_bn.includes(searchQuery));
    
    // Simplistic category filter - in a real app this would use a category column
    const matchesCategory = category === 'adobe' 
      ? product.title.toLowerCase().includes('adobe') 
      : !product.title.toLowerCase().includes('adobe');

    // Currently showing all if search is used, otherwise filter by category
    return matchesSearch && (searchQuery ? true : matchesCategory || category === 'adobe');
  });

  const handleBuyNow = (productId: string) => {
    navigate(`/checkout/${productId}`);
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Product Store</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">Browse our collection of authentic subscriptions</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Category Toggle */}
          <div className="flex p-1 bg-gray-100 dark:bg-white/10 rounded-lg">
            <button
              onClick={() => setCategory('adobe')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                category === 'adobe' 
                  ? 'bg-white dark:bg-[#151518] text-primary shadow-sm' 
                  : 'text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:text-gray-200'
              }`}
            >
              Adobe
            </button>
            <button
              onClick={() => setCategory('envato')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                category === 'envato' 
                  ? 'bg-white dark:bg-[#151518] text-primary shadow-sm' 
                  : 'text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:text-gray-200'
              }`}
            >
              Others
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-200 dark:border-[#26262d] rounded-lg text-sm focus:ring-primary focus:border-primary w-full sm:w-64 outline-none transition-colors dark:bg-[#111113] dark:text-gray-100"
              placeholder="Search products..."
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product, idx) => (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1 }}
              key={product.id}
              className="bg-white dark:bg-[#151518] rounded-2xl shadow-soft dark:shadow-none hover:shadow-glow hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col group"
            >
              {/* Product Banner */}
              <div className="h-32 bg-gradient-to-r from-primary via-purple-500 to-secondary relative flex items-center justify-center overflow-hidden">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.title} className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <>
                    <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
                    <div className="relative z-10 flex space-x-2">
                      {product.icons?.map((icon, i) => (
                        <div key={i} className="w-10 h-10 rounded-lg bg-white dark:bg-[#151518] shadow-md flex items-center justify-center font-bold text-sm text-slate-800 transform group-hover:scale-110 transition-transform" style={{ transitionDelay: `${i * 50}ms` }}>
                          {icon.toUpperCase()}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              
              <div className="p-6 flex-1 flex flex-col">
                <div className="mb-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 line-clamp-2">{product.title_bn || product.title}</h3>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 line-clamp-2">{product.description}</p>
                </div>
                
                <div className="mt-auto">
                  <div className="flex items-end justify-between mb-4">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase font-semibold tracking-wider">Price</p>
                      <p className="text-2xl font-bold text-primary">৳{product.price}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase font-semibold tracking-wider">Duration</p>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{product.duration}</p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleBuyNow(product.id)}
                    className="w-full py-3 px-4 bg-gradient-primary text-white rounded-xl font-medium shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all flex items-center justify-center"
                  >
                    <ShoppingBag className="w-4 h-4 mr-2" />
                    Buy Now
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#151518] rounded-xl p-12 text-center shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d]">
          <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-white/10 rounded-full flex items-center justify-center mb-4">
            <Search className="h-8 w-8 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">No products found</h3>
          <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500">We couldn't find anything matching "{searchQuery}"</p>
          <button 
            onClick={() => {setSearchQuery(''); setCategory('adobe');}}
            className="mt-4 text-primary font-medium hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
};