import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import ChangePassword from './ChangePassword';
import EditProfile from './EditProfile';
import SavedAddresses from './SavedAddresses';
import logoFull from '../assets/logo-full.png';
import logoFooter from '../assets/logo-footer.png';

// Shared by both AccountMenu and GuestMenu dropdowns — hidden entirely once
// the app is already installed or on a browser with no install path at all
// (e.g. desktop Firefox), so it never shows up as a dead end. install* comes
// from a single useInstallPrompt() call up in SiteHeader (always mounted),
// not from this component — beforeinstallprompt fires once, early, right
// after page load, well before a user has opened either dropdown, so a
// listener registered only on menu-open would miss it every time.
function InstallMenuItem({ install, onClose, onShowIosHelp }) {
  const { canInstall, showIosHelp, promptInstall } = install;
  if (!canInstall && !showIosHelp) return null;
  return (
    <button
      type="button"
      className="acct-menu-item"
      onClick={() => {
        onClose();
        if (canInstall) promptInstall();
        else onShowIosHelp();
      }}
    >
      📲 Install app
    </button>
  );
}

function IosInstallHelpModal({ onClose }) {
  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <button
            onClick={onClose}
            style={{ background: 'var(--paper)', border: 'none', width: 36, height: 36, borderRadius: '50%', fontSize: 14, color: 'var(--slate)', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
        <h3 style={{ marginTop: 0 }}>Install the Comonn app</h3>
        <p style={{ color: 'var(--slate)', fontSize: 14 }}>iPhone/iPad don't let websites trigger this automatically — a couple of manual taps in Safari:</p>
        <ol style={{ fontSize: 14, lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Tap the <b>Share</b> icon <span style={{ fontFamily: 'monospace' }}>⬆️</span> in Safari's toolbar</li>
          <li>Scroll down and tap <b>Add to Home Screen</b></li>
          <li>Tap <b>Add</b> in the top-right corner</li>
        </ol>
        <p style={{ color: 'var(--slate)', fontSize: 12.5 }}>Note: this only works in Safari, not Chrome or other browsers on iPhone.</p>
      </div>
    </div>
  );
}

function AccountMenu({ name, onOpen, onLogout, install, onShowIosHelp }) {
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
          <Link to="/about" className="acct-menu-item acct-menu-mobile-only" onClick={() => setOpen(false)}>About</Link>
          <Link to="/services" className="acct-menu-item acct-menu-mobile-only" onClick={() => setOpen(false)}>Services</Link>
          <div className="acct-menu-mobile-only" style={{ borderTop: '1px solid var(--line-2)', margin: '6px 0' }} />
          <button type="button" className="acct-menu-item" onClick={() => choose('addresses')}>Saved addresses</button>
          <button type="button" className="acct-menu-item" onClick={() => choose('profile')}>Profile details</button>
          <button type="button" className="acct-menu-item" onClick={() => choose('password')}>Change password</button>
          <InstallMenuItem install={install} onClose={() => setOpen(false)} onShowIosHelp={onShowIosHelp} />
          <div style={{ borderTop: '1px solid var(--line-2)', margin: '6px 0' }} />
          <button type="button" className="acct-menu-item acct-menu-item-danger" onClick={() => { setOpen(false); onLogout(); }}>Log out</button>
        </div>
      )}
    </div>
  );
}

// Compact stand-in for the Login/Register button pair on narrow screens,
// where those two buttons plus the logo don't fit on one line and push the
// whole header into an awkward extra row. Mirrors AccountMenu's circular
// avatar + dropdown, just with a generic person icon (no name yet) and
// Login/Register as the menu options instead of profile/logout.
function GuestMenu({ install, onShowIosHelp }) {
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
          <Link to="/about" className="acct-menu-item acct-menu-mobile-only" onClick={() => setOpen(false)}>About</Link>
          <Link to="/services" className="acct-menu-item acct-menu-mobile-only" onClick={() => setOpen(false)}>Services</Link>
          <div className="acct-menu-mobile-only" style={{ borderTop: '1px solid var(--line-2)', margin: '6px 0' }} />
          <InstallMenuItem onClose={() => setOpen(false)} onShowIosHelp={onShowIosHelp} />
          <Link to="/login" className="acct-menu-item acct-menu-login" onClick={() => setOpen(false)}>Login</Link>
          <Link to="/register" className="acct-menu-item acct-menu-register" onClick={() => setOpen(false)}>Register</Link>
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

export function SiteHeader({ onOpenAccount, onShowIosHelp }) {
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
              onShowIosHelp={onShowIosHelp}
            />
          ) : (
            <>
              <div className="guest-actions-desktop">
                <Link to="/login" className="btn btn-ghost btn-sm">Login</Link>
                <Link to="/register" className="btn btn-primary btn-sm">Register</Link>
              </div>
              <div className="guest-actions-mobile">
                <GuestMenu onShowIosHelp={onShowIosHelp} />
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
  const [showIosHelp, setShowIosHelp] = useState(false);
  return (
    <>
      <SiteHeader onOpenAccount={setAccountSection} onShowIosHelp={() => setShowIosHelp(true)} />
      <main className="site-main">{children}</main>
      <SiteFooter />
      {showIosHelp && <IosInstallHelpModal onClose={() => setShowIosHelp(false)} />}
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
