import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, UserPlus, Wallet, LogOut, Hexagon, History, ListPlus, UserMinus } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export const ResellerLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [userName, setUserName] = useState('Reseller Agent');

  useEffect(() => {
    if (user?.id) {
      supabase.from('users').select('name, full_name, email').eq('id', user.id).single().then(({ data }) => {
        if (data) {
          // Fallback logic: full_name -> name -> email prefix
          setUserName(data.full_name || data.name || data.email?.split('@')[0] || 'Reseller Agent');
        }
      });
    }
  }, [user]);

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
    <div className="min-h-screen bg-[#050505] text-gray-200 font-sans selection:bg-indigo-500/30 flex">
      {/* Dynamic Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px]" />
      </div>

      {/* Sidebar */}
      <motion.aside 
        initial={{ x: -250 }}
        animate={{ x: 0 }}
        className="w-64 border-r border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl flex flex-col z-10"
      >
        <div className="h-20 flex items-center px-6 border-b border-white/5">
          <Hexagon className="h-8 w-8 text-indigo-500 fill-indigo-500/20 mr-3" />
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
            Super Reseller
          </span>
        </div>
        
        <nav className="flex-1 py-6 px-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `
                  flex items-center px-4 py-3 rounded-xl transition-all duration-300 group relative overflow-hidden
                  ${isActive ? 'text-white bg-white/5' : 'text-gray-400 hover:text-white hover:bg-white/[0.02]'}
                `}
              >
                {isActive && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-transparent border-l-2 border-indigo-500"
                  />
                )}
                <Icon className={`h-5 w-5 mr-3 transition-transform duration-300 ${isActive ? 'scale-110 text-indigo-400' : 'group-hover:scale-110'}`} />
                <span className="font-medium relative z-10">{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5">
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-3 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors duration-300"
          >
            <LogOut className="h-5 w-5 mr-3" />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen z-10 relative">
        <header className="h-20 border-b border-white/5 bg-[#0a0a0a]/50 backdrop-blur-md flex items-center justify-end px-8 sticky top-0">
          <div className="flex items-center gap-4">
            <div className="text-right mr-2">
              <div className="text-sm font-medium text-gray-200">{userName}</div>
              <div className="text-xs text-gray-500">Premium Account</div>
            </div>
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20 uppercase">
              {userName.charAt(0)}
            </div>
          </div>
        </header>
        
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};
