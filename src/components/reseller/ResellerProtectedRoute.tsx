import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export const ResellerProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, role } = useAuth();
  const location = useLocation();

  // If AuthContext is still doing its initial load or role fetch, show loader
  if (loading || (user && role === null)) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
      </div>
    );
  }

  // Once loading is false AND we have a resolved role (or no user at all)
  if (!user || role !== 'reseller') {
    // Redirect them to the /reseller/login page, but save the current location they were trying to go to
    return <Navigate to="/reseller/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
