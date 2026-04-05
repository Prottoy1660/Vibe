import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MaintenanceModeProvider } from './contexts/MaintenanceModeContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Layout } from './components/Layout';
import { HttpErrorNavBridge } from './components/HttpErrorNavBridge';
import { Loader2 } from 'lucide-react';

const Login = React.lazy(() => import('./pages/Login').then(module => ({ default: module.Login })));
const Register = React.lazy(() => import('./pages/Register').then(module => ({ default: module.Register })));
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })));
const Store = React.lazy(() => import('./pages/Store').then(module => ({ default: module.Store })));
const Checkout = React.lazy(() => import('./pages/Checkout').then(module => ({ default: module.Checkout })));
const AdobeEmail = React.lazy(() => import('./pages/AdobeEmail').then(module => ({ default: module.AdobeEmail })));
const Orders = React.lazy(() => import('./pages/Orders').then(module => ({ default: module.Orders })));
const RedeemCoupon = React.lazy(() => import('./pages/RedeemCoupon').then(module => ({ default: module.RedeemCoupon })));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const AdminEmailTeamDetail = React.lazy(() => import('./pages/AdminEmailTeamDetail'));
const Profile = React.lazy(() => import('./pages/Profile').then(module => ({ default: module.Profile })));
const TutorialHelp = React.lazy(() => import('./pages/TutorialHelp').then(module => ({ default: module.TutorialHelp })));
const Support = React.lazy(() => import('./pages/Support').then(module => ({ default: module.Support })));
const Status = React.lazy(() => import('./pages/Status').then(module => ({ default: module.Status })));
const Referral = React.lazy(() => import('./pages/Referral').then(module => ({ default: module.Referral })));
const PhoneRequired = React.lazy(() => import('./pages/PhoneRequired').then((m) => ({ default: m.PhoneRequired })));
const HttpErrorPage = React.lazy(() =>
  import('./pages/HttpErrorPage').then((module) => ({ default: module.HttpErrorPage })),
);

// Loading Fallback Component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#09090b]">
    <Loader2 className="w-8 h-8 text-primary animate-spin" />
  </div>
);

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
    <React.Suspense fallback={<PageLoader />}>
      <HttpErrorNavBridge />
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
        <Route path="/register" element={!user ? <Register /> : <Navigate to="/" replace />} />
        <Route path="/status" element={<Status />} />
        <Route path="/error/:code" element={<HttpErrorPage />} />

        <Route
          path="/phone-required"
          element={
            <ProtectedRoute>
              <PhoneRequired />
            </ProtectedRoute>
          }
        />

        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/store" element={<Store />} />
          <Route path="/checkout/:id" element={<Checkout />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/redeem" element={<RedeemCoupon />} />
          <Route path="/adobe-email" element={<AdobeEmail />} />
          <Route path="/tutorial-help" element={<TutorialHelp />} />
          <Route path="/support" element={<Support />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/refer" element={<Referral />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/email-team/:teamId" element={<AdminEmailTeamDetail />} />
        </Route>
      </Routes>
    </React.Suspense>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <MaintenanceModeProvider>
          <Router>
            <AppRoutes />
          </Router>
        </MaintenanceModeProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;