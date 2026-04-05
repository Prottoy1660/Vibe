import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerHttpErrorNavigator, unregisterHttpErrorNavigator } from '../lib/httpErrorNavigation';

/** Registers react-router navigate for goToHttpError() used from apiClient. */
export function HttpErrorNavBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    registerHttpErrorNavigator((path, opts) => navigate(path, { replace: opts?.replace !== false }));
    return () => unregisterHttpErrorNavigator();
  }, [navigate]);
  return null;
}
