import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import ChangePassword from './ChangePassword';
import EditProfile from './EditProfile';
import SavedAddresses from './SavedAddresses';
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
          <button type="button" className="acct-menu-item" onClick={() => choose('addresses')}>Saved addresses</button>
          <button type="button" className="acct-menu-item" onClick={() => choose('profile')}>Profile details</button>
          <button type="button" className="acct-menu-item" onClick={() => choose('password')}>Change password</button>
          <div style={{ borderTop: '1px solid var(--line-2)', margin: '6px 0' }} />
          <button type="button" className="acct-menu-item acct-menu-item-danger" onClick={() => { setOpen(false); onLogout(); }}>Log out</button>
        </div>
      )}
    </div>
  );
}

// Compact stand-in for the Login/Register button pair on narrow screens,
// where those two buttons plus the logo don't fit on one line. Mirrors
// AccountMenu's circular avatar + dropdown, just with a generic person icon
// (no name yet) and Login/Register as the menu options instead of
// profile/logout.
function GuestMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

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
            display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </span>
        <span style={{ fontSize: 12, color: 'var(--slate)' }}>▾</span>
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, padding: 8, minWidth: 160, zIndex: 50 }}>
          <Link to="/login" className="acct-menu-item acct-menu-login" onClick={() => setOpen(false)}>Login</Link>
          <Link to="/register" className="acct-menu-item acct-menu-register" onClick={() => setOpen(false)}>Register</Link>
        </div>
      )}
    </div>
  );
}

// Left-side hamburger on mobile (see .mobile-nav-toggle) — holds every nav
// destination (Dashboard when logged in, Book/Track/Storage/Services/About)
// now that the header's middle row is gone on narrow screens; the same
// `links` array SiteHeader already builds for the desktop nav-links row.
function MobileNavMenu({ links }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} className="mobile-nav-toggle" style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open menu"
        style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 20, color: 'var(--navy)' }}
      >
        ☰
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, padding: 8, minWidth: 170, zIndex: 50 }}>
          {links.map(([to, label]) => (
            <Link key={to} to={to} className="acct-menu-item" onClick={() => setOpen(false)}>{label}</Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Where "Dashboard" in the header should go for a logged-in user, by role.
function dashboardPath(role) {
  if (role === 'ADMIN' || role === 'STAFF' || role === 'ACCOUNTS') return '/admin';
  if (role === 'DRIVER') return '/driver';
  return '/dashboard';
}

export function SiteHeader({ onOpenAccount }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // On mobile the second nav row is reserved for Book/Track/Storage —
  // Services/About move into the account dropdown (AccountMenu/GuestMenu)
  // instead, regardless of login state.
  const links = [
    ...(user ? [[dashboardPath(user.role), 'Dashboard']] : []),
    ['/quote', 'Book'],
    ['/track', 'Track'],
    ['/storage', 'Storage'],
    ['/services', 'Services', 'nav-hide-mobile'],
    ['/about', 'About', 'nav-hide-mobile'],
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
              <div className="guest-actions-desktop">
                <Link to="/login" className="btn btn-ghost btn-sm">Login</Link>
                <Link to="/register" className="btn btn-primary btn-sm">Register</Link>
              </div>
              <div className="guest-actions-mobile">
                <GuestMenu />
              </div>
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
          <a href="/terms-and-conditions.pdf" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a>
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
  // null | 'profile' | 'password' | 'addresses' — lets the header's account
  // dropdown open any of these as a modal from anywhere in the app, not
  // just the Dashboard page.
  const [accountSection, setAccountSection] = useState(null);
  return (
    <>
      <SiteHeader onOpenAccount={setAccountSection} />
      <main className="site-main">{children}</main>
      <SiteFooter />
      {accountSection && (
        <div className="modal-overlay open" onClick={() => setAccountSection(null)}>
          <div className="modal-box" style={{ maxWidth: accountSection === 'addresses' ? 640 : 440 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4, position: 'sticky', top: 0, background: '#fff', zIndex: 5 }}>
              <button
                onClick={() => setAccountSection(null)}
                style={{ background: 'var(--paper)', border: 'none', width: 36, height: 36, borderRadius: '50%', fontSize: 14, color: 'var(--slate)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            {accountSection === 'profile' && <EditProfile />}
            {accountSection === 'password' && <ChangePassword />}
            {accountSection === 'addresses' && <SavedAddresses />}
          </div>
        </div>
      )}
    </>
  );
}
