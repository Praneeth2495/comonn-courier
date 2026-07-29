import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './api/AuthContext';
import { BookingProvider } from './api/BookingContext';
import { PublicLayout } from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import SetPassword from './pages/SetPassword';
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
import AdminDashboard from './pages/AdminDashboard';
import DriverDashboard from './pages/DriverDashboard';

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

export default function App() {
  return (
    <AuthProvider>
      <BookingProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={withLayout(<Home />)} />
            <Route path="/login" element={withLayout(<Login />)} />
            <Route path="/register" element={withLayout(<Register />)} />
            <Route path="/forgot-password" element={withLayout(<ForgotPassword />)} />
            <Route path="/set-password" element={withLayout(<SetPassword />)} />
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
              path="/admin"
              element={
                <ProtectedRoute roles={['ADMIN', 'STAFF']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/driver"
              element={
                <ProtectedRoute roles={['DRIVER']}>
                  <DriverDashboard />
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
