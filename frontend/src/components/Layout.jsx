import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import ChangePassword from './ChangePassword';
import EditProfile from './EditProfile';
import logoFull from '../assets/logo-full.png';
import logoFooter from '../assets/logo-footer.png';

function AccountMenu({ name, onOpen, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function choose(section) {
    setOpen(false);
    onOpen(section);
  }

  const initial = name?.[0]?.toUpperCase() || '?';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
      >
        <span
          style={{
            width: 34, height: 34, borderRadius: '50%', background: 'var(--navy)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flex: 'none',
          }}
        >
          {initial}
        </span>
        <span style={{ fontSize: 12, color: 'var(--slate)' }}>▾</span>
      </button>
      {open && (
        <div
          className="card"
          style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, padding: 8, minWidth: 180, zIndex: 50 }}
        >
          <button type="button" className="acct-menu-item" onClick={() => choose('profile')}>Profile details</button>
          <button type="button" className="acct-menu-item" onClick={() => choose('password')}>Change password</button>
          <div style={{ borderTop: '1px solid var(--line-2)', margin: '6px 0' }} />
          <button type="button" className="acct-menu-item" onClick={() => { setOpen(false); onLogout(); }}>Log out</button>
        </div>
      )}
    </div>
  );
}

// Where "Dashboard" in the header should go for a logged-in user, by role.
function dashboardPath(role) {
  if (role === 'ADMIN' || role === 'STAFF') return '/admin';
  if (role === 'DRIVER') return '/driver';
  return '/dashboard';
}

export function SiteHeader({ onOpenAccount }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // Services/About only collapse on mobile when logged in — Dashboard takes
  // up the extra slot then. Logged-out visitors see all four regardless of
  // screen size, since there's no Dashboard link competing for space.
  const hideOnMobile = user ? 'nav-hide-mobile' : '';
  const links = [
    ...(user ? [[dashboardPath(user.role), 'Dashboard']] : []),
    ['/quote', 'Book'],
    ['/track', 'Track'],
    ['/services', 'Services', hideOnMobile],
    ['/about', 'About', hideOnMobile],
  ];
  return (
    <header className="site-header">
      <div className="row">
        <Link to="/" className="brand">
          <img className="logo-img lg" src={logoFull} alt="Comonn" />
        </Link>
        <nav className="nav-links">
          {links.map(([to, label, extraClass]) => (
            <Link key={to} to={to} className={[pathname === to ? 'current' : '', extraClass].filter(Boolean).join(' ')}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="nav-actions">
          {user ? (
            <AccountMenu
              name={user.fullName?.split(' ')[0]}
              onOpen={onOpenAccount}
              onLogout={() => { logout(); navigate('/'); }}
            />
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm">Login</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Register</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div className="footer-brand">
          <img className="logo-img lg" src={logoFooter} alt="Comonn" />
        </div>
        <div className="footer-col">
          <h4>Quick links</h4>
          <Link to="/">Home</Link>
          <Link to="/quote">Book</Link>
          <a href="#" onClick={(e) => e.preventDefault()}>Terms &amp; Conditions</a>
          <a href="#" onClick={(e) => e.preventDefault()}>Transit Warranty</a>
        </div>
        <div className="footer-col">
          <h4>Get in touch</h4>
          <span className="line">📍 Hyderabad, Telangana</span>
          <span className="line">📞 +91 9108038783</span>
          <span className="line">✉️ support@comonn.in</span>
        </div>
      </div>
      <div className="footer-bottom">© {new Date().getFullYear()} Comonn. All rights reserved.</div>
    </footer>
  );
}

export function PublicLayout({ children }) {
  // null | 'profile' | 'password' — lets the header's account dropdown open
  // either section as a modal from anywhere in the app, not just the
  // Dashboard page.
  const [accountSection, setAccountSection] = useState(null);
  return (
    <>
      <SiteHeader onOpenAccount={setAccountSection} />
      <main className="site-main">{children}</main>
      <SiteFooter />
      {accountSection && (
        <div className="modal-overlay open" onClick={() => setAccountSection(null)}>
          <div className="modal-box" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <button
                onClick={() => setAccountSection(null)}
                style={{ background: 'var(--paper)', border: 'none', width: 36, height: 36, borderRadius: '50%', fontSize: 14, color: 'var(--slate)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            {accountSection === 'profile' ? <EditProfile /> : <ChangePassword />}
          </div>
        </div>
      )}
    </>
  );
}
