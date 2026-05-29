import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MaintenanceModeProvider } from './contexts/MaintenanceModeContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ConfirmDialogProvider } from './contexts/ConfirmDialogContext';
import { Layout } from './components/Layout';
import { AppToaster } from './components/AppToaster';
import { HttpErrorNavBridge } from './components/HttpErrorNavBridge';
import { NetworkStatusToasts } from './components/NetworkStatusToasts';
import { Loader2, Sparkles } from 'lucide-react';

import { ResellerLayout } from './components/reseller/ResellerLayout';
import { ResellerProtectedRoute } from './components/reseller/ResellerProtectedRoute';
const ResellerDashboard = React.lazy(() => import('./pages/reseller/ResellerDashboard').then(m => ({ default: m.ResellerDashboard })));
const ActivateUser = React.lazy(() => import('./pages/reseller/ActivateUser').then(m => ({ default: m.ActivateUser })));
const BulkActivate = React.lazy(() => import('./pages/reseller/BulkActivate').then(m => ({ default: m.BulkActivate })));
const BulkRemove = React.lazy(() => import('./pages/reseller/BulkRemove').then(m => ({ default: m.BulkRemove })));
const MyUsers = React.lazy(() => import('./pages/reseller/MyUsers').then(m => ({ default: m.MyUsers })));
const AddFunds = React.lazy(() => import('./pages/reseller/AddFunds').then(m => ({ default: m.AddFunds })));
const TransactionHistory = React.lazy(() => import('./pages/reseller/TransactionHistory').then(m => ({ default: m.TransactionHistory })));
const ResellerLogin = React.lazy(() => import('./pages/reseller/ResellerLogin').then(m => ({ default: m.ResellerLogin })));
const ResellerSignup = React.lazy(() => import('./pages/reseller/ResellerSignup').then(m => ({ default: m.ResellerSignup })));
const ResellerForgotPassword = React.lazy(() => import('./pages/reseller/ResellerForgotPassword').then(m => ({ default: m.ResellerForgotPassword })));
const ResellerOauthCallback = React.lazy(() => import('./pages/reseller/ResellerOauthCallback').then(m => ({ default: m.ResellerOauthCallback })));
const ResellerProfile = React.lazy(() => import('./pages/reseller/ResellerProfile').then(m => ({ default: m.ResellerProfile })));
const BulkExtend = React.lazy(() => import('./pages/reseller/BulkExtend').then(m => ({ default: m.BulkExtend })));

const Login = React.lazy(() => import('./pages/Login').then(module => ({ default: module.Login })));
const Register = React.lazy(() => import('./pages/Register').then(module => ({ default: module.Register })));
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })));
const Store = React.lazy(() => import('./pages/Store').then(module => ({ default: module.Store })));
const Checkout = React.lazy(() => import('./pages/Checkout').then(module => ({ default: module.Checkout })));
const AdobeEmail = React.lazy(() => import('./pages/AdobeEmail').then(module => ({ default: module.AdobeEmail })));
const Orders = React.lazy(() => import('./pages/Orders').then(module => ({ default: module.Orders })));
const Invoices = React.lazy(() => import('./pages/Invoices').then((m) => ({ default: m.Invoices })));
const InvoicePage = React.lazy(() => import('./pages/InvoicePage').then((m) => ({ default: m.InvoicePage })));
const RedeemCoupon = React.lazy(() => import('./pages/RedeemCoupon').then(module => ({ default: module.RedeemCoupon })));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const AdminEmailTeamDetail = React.lazy(() => import('./pages/AdminEmailTeamDetail'));
const Profile = React.lazy(() => import('./pages/Profile').then(module => ({ default: module.Profile })));
const TutorialHelp = React.lazy(() => import('./pages/TutorialHelp').then(module => ({ default: module.TutorialHelp })));
const Support = React.lazy(() => import('./pages/Support').then(module => ({ default: module.Support })));
const Status = React.lazy(() => import('./pages/Status').then(module => ({ default: module.Status })));
const Referral = React.lazy(() => import('./pages/Referral').then(module => ({ default: module.Referral })));
const Downloads = React.lazy(() => import('./pages/Downloads').then(module => ({ default: module.Downloads })));
const Landing = React.lazy(() => import('./pages/Landing.tsx').then(module => ({ default: module.Landing })));
const DesktopOauthCallback = React.lazy(() =>
  import('./pages/DesktopOauthCallback').then((module) => ({ default: module.DesktopOauthCallback })),
);
const PhoneRequired = React.lazy(() => import('./pages/PhoneRequired').then((m) => ({ default: m.PhoneRequired })));
const HttpErrorPage = React.lazy(() =>
  import('./pages/HttpErrorPage').then((module) => ({ default: module.HttpErrorPage })),
);
const BkashReturn = React.lazy(() => import('./pages/BkashReturn').then((m) => ({ default: m.BkashReturn })));

// Loading Fallback Component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#09090b]">
    <div className="relative overflow-hidden rounded-2xl border border-gray-200/80 dark:border-[#26262d] bg-white/90 dark:bg-[#111113]/90 px-7 py-6 shadow-xl backdrop-blur-sm">
      <div className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full bg-indigo-500/20 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-10 h-24 w-24 rounded-full bg-fuchsia-500/20 blur-2xl" />
      <div className="relative flex flex-col items-center gap-3">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <div className="relative rounded-full bg-primary/10 p-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          Loading your workspace
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.2s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/80 [animation-delay:-0.1s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60" />
        </div>
      </div>
    </div>
  </div>
);

// Protected Route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  
  return <>{children}</>;
};

// Domain-based routing logic to enforce separation
function DomainRouter() {
  const location = useLocation();
  
  React.useEffect(() => {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const RESELLER_DOMAIN = 'superreseller.shop';
    
    if (!isLocalhost) {
      const isResellerPath = location.pathname.startsWith('/reseller');
      
      // If someone visits /reseller on vibeaccessbd.com, redirect to superreseller.shop
      if (hostname !== RESELLER_DOMAIN && isResellerPath) {
        window.location.replace(`https://${RESELLER_DOMAIN}${location.pathname}${location.search}`);
        return;
      }
      
      // If someone visits superreseller.shop, force them into /reseller paths
      // so they can't access main domain features (like customer login or admin panel)
      if (hostname === RESELLER_DOMAIN && !isResellerPath) {
        window.location.replace(`https://${RESELLER_DOMAIN}/reseller`);
        return;
      }
    }
  }, [location.pathname, location.search]);
  
  return null;
}

function AppRoutes() {
  const { user, loading, role, isAdmin } = useAuth();
  const roleResolved = !user || role !== null;
  
  // Since we don't have direct access to role in useAuth yet without fetching,
  // we let the components handle their own role-based redirects.
  // But we can add a small wrapper for Admin route protection if needed, 
  // though AdminDashboard already checks it.

  return (
    <React.Suspense fallback={<PageLoader />}>
      <HttpErrorNavBridge />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/app" replace />} />
        <Route path="/register" element={!user ? <Register /> : <Navigate to="/app" replace />} />
        <Route path="/oauth/desktop-callback" element={<DesktopOauthCallback />} />
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

        {/* Reseller Panel Auth Routes */}
        <Route path="/reseller/login" element={<ResellerLogin />} />
        <Route path="/reseller/signup" element={<ResellerSignup />} />
        <Route path="/reseller/forgot-password" element={<ResellerForgotPassword />} />
        <Route path="/reseller/oauth/callback" element={<ResellerOauthCallback />} />

        {/* Reseller Panel Protected Routes */}
        <Route path="/reseller" element={<ResellerProtectedRoute><ResellerLayout /></ResellerProtectedRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<ResellerDashboard />} />
          <Route path="profile" element={<ResellerProfile />} />
          <Route path="activate" element={<ActivateUser />} />
          <Route path="bulk-activate" element={<BulkActivate />} />
          <Route path="bulk-extend" element={<BulkExtend />} />
          <Route path="bulk-remove" element={<BulkRemove />} />
          <Route path="users" element={<MyUsers />} />
          <Route path="add-funds" element={<AddFunds />} />
          <Route path="transactions" element={<TransactionHistory />} />
        </Route>

        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route
            path="/app"
            element={
              loading || !roleResolved
                ? <PageLoader />
                : isAdmin
                  ? <Navigate to="/admin" replace />
                  : <Dashboard />
            }
          />
          <Route path="/store" element={<Store />} />
          <Route path="/checkout/:id" element={<Checkout />} />
          <Route path="/bkash-return" element={<BkashReturn />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/:orderId" element={<InvoicePage />} />
          <Route path="/redeem" element={<RedeemCoupon />} />
          <Route path="/adobe-email" element={<AdobeEmail />} />
          <Route path="/tutorial-help" element={<TutorialHelp />} />
          <Route path="/support" element={<Support />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/refer" element={<Referral />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/email-team/:teamId" element={<AdminEmailTeamDetail />} />
          {/* Catch-all for logged-in app routes */}
          <Route path="*" element={<Navigate to="/error/404" replace />} />
        </Route>

        {/* Catch-all for public routes */}
        <Route path="*" element={<Navigate to="/error/404" replace />} />
      </Routes>
    </React.Suspense>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ConfirmDialogProvider>
        <AuthProvider>
          <MaintenanceModeProvider>
            <Router>
              <DomainRouter />
              <NetworkStatusToasts />
              <AppRoutes />
              <AppToaster />
            </Router>
          </MaintenanceModeProvider>
        </AuthProvider>
      </ConfirmDialogProvider>
    </ThemeProvider>
  );
}

export default App;