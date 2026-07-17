import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';

export function SiteHeader() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = [
    ['/quote', 'Book'],
    ['/track', 'Track'],
    ['/services', 'Services'],
    ['/about', 'About'],
  ];
  return (
    <header className="site-header">
      <div className="airmail-edge" />
      <div className="row">
        <Link to="/" className="brand">
          Comonn<span className="dot">.</span>
        </Link>
        <nav className="nav-links">
          {links.map(([to, label]) => (
            <Link key={to} to={to} className={pathname === to ? 'current' : ''}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="nav-actions">
          {user ? (
            <>
              <Link
                to={user.role === 'ADMIN' || user.role === 'STAFF' ? '/admin' : '/dashboard'}
                className="btn btn-ghost btn-sm"
              >
                {user.fullName?.split(' ')[0]}
              </Link>
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
        <div>
          <div className="brand" style={{ color: '#fff' }}>Comonn.</div>
          <p style={{ marginTop: 10, color: '#93A0C4', maxWidth: 320, fontSize: 13.5 }}>
            International courier, priced instantly by zone, weight and volume.
          </p>
        </div>
        <div>
          <div style={{ color: '#7381AB', fontSize: 12, textTransform: 'uppercase', marginBottom: 10 }}>Get in touch</div>
          <div>📍 Truganina, Victoria</div>
          <div>📞 1800 001 030</div>
          <div>✉️ info@comonn.com</div>
        </div>
      </div>
      <div className="footer-bottom">© {new Date().getFullYear()} Comonn. All rights reserved.</div>
    </footer>
  );
}

export function PublicLayout({ children }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
