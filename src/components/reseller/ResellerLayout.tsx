import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, UserPlus, Wallet, LogOut, Hexagon, History, ListPlus, UserMinus, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export const ResellerLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [userName, setUserName] = useState('Reseller Agent');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const loadProfile = () => {
    if (user?.id) {
      // Reverted to only use 'name' since 'full_name' doesn't exist in the users table
      supabase.from('users').select('name, email, avatar_url').eq('id', user.id).single().then(({ data }) => {
        if (data) {
          setUserName(data.name || data.email?.split('@')[0] || 'Reseller Agent');
          setAvatarUrl(data.avatar_url);
        }
      });
    }
  };

  useEffect(() => {
    loadProfile();
    
    // Listen for avatar/profile updates from ResellerProfile
    const handleRefresh = () => loadProfile();
    window.addEventListener('vibe:reseller-avatar-refresh', handleRefresh);
    return () => window.removeEventListener('vibe:reseller-avatar-refresh', handleRefresh);
  }, [user]);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/reseller/login');
  };

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/reseller/dashboard' },
    { name: 'Activate User', icon: UserPlus, path: '/reseller/activate' },
    { name: 'Bulk Import', icon: ListPlus, path: '/reseller/bulk-activate' },
    { name: 'Bulk Remove', icon: UserMinus, path: '/reseller/bulk-remove' },
    { name: 'My Users', icon: Users, path: '/reseller/users' },
    { name: 'Add Funds', icon: Wallet, path: '/reseller/add-funds' },
    { name: 'Transactions', icon: History, path: '/reseller/transactions' },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-gray-200 font-sans selection:bg-white/20 flex overflow-hidden">
      {/* Dynamic Background (Liquid Feel) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[150px] mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/5 blur-[150px] mix-blend-screen" />
      </div>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-md z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Compact & Floating look on Desktop */}
      <motion.aside 
        className={`fixed lg:static inset-y-0 left-0 w-[260px] lg:m-4 lg:rounded-3xl border-r lg:border border-white/5 bg-[#0a0a0a]/80 backdrop-blur-3xl flex flex-col z-50 transform transition-transform duration-300 ease-in-out lg:transform-none shadow-2xl ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="h-20 flex items-center px-6 border-b border-white/5 shrink-0 justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center overflow-hidden">
              <img src="/super.png" alt="Super Reseller" className="w-full h-full object-contain drop-shadow-xl" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">
              Super<span className="text-gray-500 font-medium">Reseller</span>
            </span>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden text-gray-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto custom-scrollbar">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest px-3 mb-3">Menu</div>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `
                  flex items-center px-3 py-2.5 rounded-xl transition-all duration-300 group relative
                  ${isActive ? 'text-white bg-white/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}
                `}
              >
                <Icon className={`h-4 w-4 mr-3 transition-colors ${isActive ? 'text-white' : 'group-hover:text-gray-300'}`} />
                <span className="text-sm font-medium relative z-10">{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5">
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-3 py-2.5 rounded-xl text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-300 text-sm font-medium"
          >
            <LogOut className="h-4 w-4 mr-3" />
            <span>Sign Out</span>
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen w-full lg:w-[calc(100%-280px)] z-10 relative">
        {/* Compact Header */}
        <header className="h-16 lg:h-20 lg:mt-4 lg:mr-4 lg:rounded-3xl border-b lg:border border-white/5 bg-[#0a0a0a]/80 flex items-center justify-between lg:justify-end px-4 lg:px-6 sticky top-0 lg:top-4 z-20 backdrop-blur-3xl shadow-sm">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="lg:hidden p-2 -ml-2 text-gray-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          
          <button 
            onClick={() => navigate('/reseller/profile')}
            className="flex items-center gap-3 hover:bg-white/5 p-1.5 pr-4 rounded-full transition-all cursor-pointer group border border-transparent"
          >
            <div className="text-right mr-1 hidden sm:block">
              <div className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">{userName}</div>
              <div className="text-[10px] font-medium text-gray-500 transition-colors">Premium Reseller</div>
            </div>
            <div className="h-8 w-8 lg:h-9 lg:w-9 rounded-full overflow-hidden bg-white flex items-center justify-center text-black font-bold shadow-md uppercase transition-transform group-hover:scale-105 text-sm">
              {avatarUrl ? (
                <img src={avatarUrl} alt={userName} className="h-full w-full object-cover" />
              ) : (
                userName.charAt(0)
              )}
            </div>
          </button>
        </header>
        
        {/* Content Area */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 lg:pt-6 w-full custom-scrollbar">
          <div className="w-full max-w-full mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};
