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
    <div className="min-h-screen bg-[#050505] text-gray-200 font-sans selection:bg-indigo-500/30 flex overflow-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px]" />
      </div>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        className={`fixed lg:static inset-y-0 left-0 w-72 border-r border-white/5 bg-[#080808]/95 backdrop-blur-2xl flex flex-col z-50 transform transition-transform duration-300 ease-in-out lg:transform-none ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="h-24 flex items-center px-8 border-b border-white/5 shrink-0 justify-between">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mr-4 shadow-lg shadow-indigo-500/20">
              <Hexagon className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-black text-white tracking-tight">
              Reseller<span className="text-indigo-400">Pro</span>
            </span>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden text-gray-400 hover:text-white">
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <nav className="flex-1 py-8 px-4 space-y-1.5 overflow-y-auto">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-widest px-4 mb-4 mt-2">Menu</div>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `
                  flex items-center px-4 py-3.5 rounded-2xl transition-all duration-200 group relative
                  ${isActive ? 'text-white bg-indigo-500/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}
                `}
              >
                {isActive && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-indigo-500 rounded-r-full"
                  />
                )}
                <Icon className={`h-5 w-5 mr-3.5 transition-colors ${isActive ? 'text-indigo-400' : 'group-hover:text-gray-300'}`} />
                <span className="font-semibold relative z-10">{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-6 border-t border-white/5">
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-3 rounded-2xl text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-200 font-semibold"
          >
            <LogOut className="h-5 w-5 mr-3" />
            <span>Sign Out</span>
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen w-full lg:w-[calc(100%-18rem)] z-10 relative">
        <header className="h-20 lg:h-24 border-b border-white/5 bg-[#050505]/80 flex items-center justify-between lg:justify-end px-6 lg:px-10 sticky top-0 z-20 backdrop-blur-xl">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="lg:hidden p-2 -ml-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5"
          >
            <Menu className="h-6 w-6" />
          </button>
          
          <button 
            onClick={() => navigate('/reseller/profile')}
            className="flex items-center gap-3 lg:gap-4 hover:bg-white/[0.03] p-1.5 lg:p-2 pr-3 lg:pr-4 rounded-full transition-all cursor-pointer group border border-transparent hover:border-white/5"
          >
            <div className="text-right mr-1 hidden sm:block">
              <div className="text-sm font-bold text-gray-200 group-hover:text-white transition-colors">{userName}</div>
              <div className="text-xs font-medium text-indigo-400/80 group-hover:text-indigo-400 transition-colors">Premium Reseller</div>
            </div>
            <div className="h-9 w-9 lg:h-11 lg:w-11 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20 uppercase ring-2 ring-transparent group-hover:ring-indigo-500/30 transition-all text-sm lg:text-base">
              {avatarUrl ? (
                <img src={avatarUrl} alt={userName} className="h-full w-full object-cover" />
              ) : (
                userName.charAt(0)
              )}
            </div>
          </button>
        </header>
        
        <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-10 lg:pt-6 w-full">
          <div className="max-w-6xl mx-auto w-full">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};
