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
import Track from './pages/Track';
import UserDashboard from './pages/UserDashboard';
import Wallet from './pages/Wallet';
import MyBox from './pages/MyBox';

// Lazy-loaded: these two pull in every admin/driver sub-panel (10+
// components for AdminDashboard alone) and were previously bundled into
// the main chunk that every visitor downloads, even someone just viewing
// the public homepage — neither role ever needs them on first paint.
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const DriverDashboard = lazy(() => import('./pages/DriverDashboard'));

// Lazy-loaded: the booking-flow pages (Quote/Details/Payment, each 700+
// lines) and Storage/Labels were previously all bundled into the main
// chunk a first-time visitor downloads just to see the homepage — none of
// these are needed until that visitor actually clicks into a flow.
const Quote = lazy(() => import('./pages/Quote'));
const Details = lazy(() => import('./pages/Details'));
const Payment = lazy(() => import('./pages/Payment'));
const Storage = lazy(() => import('./pages/Storage'));
const Labels = lazy(() => import('./pages/Labels'));
// PaymentByLink statically imports Payment itself to reuse it — keeping
// PaymentByLink eager would pull Payment back into the main chunk despite
// the lazy() above, since Rollup follows every static import reachable
// from an eagerly-loaded module.
const PaymentByLink = lazy(() => import('./pages/PaymentByLink'));

function PageLoadingFallback() {
  return <div className="wrap section-narrow" style={{ textAlign: 'center', paddingTop: 60 }}><LoadingLogo /></div>;
}

function withLayout(el) {
  return <PublicLayout>{el}</PublicLayout>;
}

function withLayoutLazy(el) {
  return <PublicLayout><Suspense fallback={<PageLoadingFallback />}>{el}</Suspense></PublicLayout>;
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

// This is a single-page app — every route is served from the same
// index.html, which has no way to declare a per-route canonical URL on its
// own. Without this, search engines have no explicit signal for which URL
// is the "real" one for a given page's content, which can contribute to a
// search engine showing a less relevant page (e.g. /storage) in place of
// the homepage for a branded search. Always points at the www host, since
// that's what comonn.in itself 308-redirects to and what sitemap.xml uses.
function Canonical() {
  const { pathname } = useLocation();
  useEffect(() => {
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', `https://www.comonn.in${pathname}`);
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
          <Canonical />
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
            <Route path="/quote" element={withLayoutLazy(<Quote />)} />
            <Route path="/details" element={withLayoutLazy(<Details />)} />
            <Route path="/payment" element={withLayoutLazy(<Payment />)} />
            <Route path="/pay/:orderId" element={withLayout(<PaymentByLink />)} />
            <Route path="/labels" element={withLayoutLazy(<Labels />)} />
            <Route path="/track" element={withLayout(<Track />)} />
            <Route path="/storage" element={withLayoutLazy(<Storage />)} />

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
