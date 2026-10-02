import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
// /react (not /next) — this is a Vite React SPA, not a Next.js app; the
// /next entry point pulls in Next-specific router hooks that don't exist
// here and would break the build.
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider } from './api/AuthContext';
import { BookingProvider } from './api/BookingContext';
import { PublicLayout } from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingLogo from './components/LoadingLogo';
import { captureReferralCodeFromUrl } from './utils/referral';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import SetPassword from './pages/SetPassword';
import OnboardingDetails from './pages/OnboardingDetails';
import Services from './pages/Services';
import About from './pages/About';
import Quote from './pages/Quote';
import Details from './pages/Details';
import Payment from './pages/Payment';
import PaymentByLink from './pages/PaymentByLink';
import Labels from './pages/Labels';
import Track from './pages/Track';
import Storage from './pages/Storage';
import UserDashboard from './pages/UserDashboard';
import Wallet from './pages/Wallet';
import MyBox from './pages/MyBox';

// Lazy-loaded: these two pull in every admin/driver sub-panel (10+
// components for AdminDashboard alone) and were previously bundled into
// the main chunk that every visitor downloads, even someone just viewing
// the public homepage — neither role ever needs them on first paint.
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const DriverDashboard = lazy(() => import('./pages/DriverDashboard'));

function PageLoadingFallback() {
  return <div className="wrap section-narrow" style={{ textAlign: 'center', paddingTop: 60 }}><LoadingLogo /></div>;
}

function withLayout(el) {
  return <PublicLayout>{el}</PublicLayout>;
}

// Each step of the booking flow (Book -> Details -> Payment) is its own
// route, and the browser otherwise keeps whatever scroll position the
// previous page was at — the next page then renders mid-scroll instead of
// from the top.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// Catches a shared referral link's ?ref=CODE on whatever page it lands on
// (not just Home) — a friend might share a link straight to /quote, for
// instance — and stashes it for the rest of the session (see utils/referral.js).
function CaptureReferral() {
  const { search } = useLocation();
  useEffect(() => {
    captureReferralCodeFromUrl();
  }, [search]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BookingProvider>
        <BrowserRouter>
          <ScrollToTop />
          <CaptureReferral />
          <Analytics />
          <Routes>
            <Route path="/" element={withLayout(<Home />)} />
            <Route path="/login" element={withLayout(<Login />)} />
            <Route path="/register" element={withLayout(<Register />)} />
            <Route path="/forgot-password" element={withLayout(<ForgotPassword />)} />
            <Route path="/set-password" element={withLayout(<SetPassword />)} />
            <Route path="/onboarding-details" element={withLayout(<OnboardingDetails />)} />
            <Route path="/services" element={withLayout(<Services />)} />
            <Route path="/about" element={withLayout(<About />)} />
            <Route path="/quote" element={withLayout(<Quote />)} />
            <Route path="/details" element={withLayout(<Details />)} />
            <Route path="/payment" element={withLayout(<Payment />)} />
            <Route path="/pay/:orderId" element={withLayout(<PaymentByLink />)} />
            <Route path="/labels" element={withLayout(<Labels />)} />
            <Route path="/track" element={withLayout(<Track />)} />
            <Route path="/storage" element={withLayout(<Storage />)} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute roles={['CUSTOMER']}>
                  {withLayout(<UserDashboard />)}
                </ProtectedRoute>
              }
            />
            <Route
              path="/wallet"
              element={
                <ProtectedRoute roles={['CUSTOMER']}>
                  {withLayout(<Wallet />)}
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-box"
              element={
                <ProtectedRoute roles={['CUSTOMER']}>
                  {withLayout(<MyBox />)}
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={['ADMIN', 'STAFF', 'ACCOUNTS']}>
                  <Suspense fallback={<PageLoadingFallback />}>
                    <AdminDashboard />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/driver"
              element={
                <ProtectedRoute roles={['DRIVER']}>
                  <Suspense fallback={<PageLoadingFallback />}>
                    <DriverDashboard />
                  </Suspense>
                </ProtectedRoute>
              }
            />

            <Route path="*" element={withLayout(<div className="wrap section-narrow"><p className="lead">Page not found.</p></div>)} />
          </Routes>
        </BrowserRouter>
      </BookingProvider>
    </AuthProvider>
  );
}
