import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import ChangePassword from './ChangePassword';
import EditProfile from './EditProfile';
import logoFull from '../assets/logo-full.png';
import logoFooter from '../assets/logo-footer.png';

function AccountMenu({ name, onOpen }) {
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

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)}>
        {name} ▾
      </button>
      {open && (
        <div
          className="card"
          style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, padding: 8, minWidth: 180, zIndex: 50 }}
        >
          <button type="button" className="acct-menu-item" onClick={() => choose('profile')}>Profile details</button>
          <button type="button" className="acct-menu-item" onClick={() => choose('password')}>Change password</button>
        </div>
      )}
    </div>
  );
}

export function SiteHeader({ onOpenAccount }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = [
    ...(user?.role === 'CUSTOMER' ? [['/dashboard', 'Dashboard']] : []),
    ['/quote', 'Book'],
    ['/track', 'Track'],
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
            <>
              {user.role === 'ADMIN' || user.role === 'STAFF' ? (
                <Link to="/admin" className="btn btn-ghost btn-sm">{user.fullName?.split(' ')[0]}</Link>
              ) : (
                <AccountMenu name={user.fullName?.split(' ')[0]} onOpen={onOpenAccount} />
              )}
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  logout();
                  navigate('/');
                }}
              >
                Log out
              </button>
            </>
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
