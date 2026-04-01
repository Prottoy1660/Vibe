import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Store } from './pages/Store';
import { Checkout } from './pages/Checkout';
import { AdobeEmail } from './pages/AdobeEmail';
import { Orders } from './pages/Orders';
import { RedeemCoupon } from './pages/RedeemCoupon';
import { AdminDashboard } from './pages/AdminDashboard';
import { Profile } from './pages/Profile';

// Protected Route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  
  return <>{children}</>;
};

function AppRoutes() {
  const { user } = useAuth();
  
  // Since we don't have direct access to role in useAuth yet without fetching,
  // we let the components handle their own role-based redirects.
  // But we can add a small wrapper for Admin route protection if needed, 
  // though AdminDashboard already checks it.

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
      <Route path="/register" element={!user ? <Register /> : <Navigate to="/" replace />} />
      
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/store" element={<Store />} />
        <Route path="/checkout/:id" element={<Checkout />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/redeem" element={<RedeemCoupon />} />
        <Route path="/adobe-email" element={<AdobeEmail />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;