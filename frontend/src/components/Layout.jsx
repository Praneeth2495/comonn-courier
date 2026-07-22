import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';
import logoFull from '../assets/logo-full.png';
import logoFooter from '../assets/logo-footer.png';

export function SiteHeader() {
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
  return (
    <>
      <SiteHeader />
      <main className="site-main">{children}</main>
      <SiteFooter />
    </>
  );
}
