import { Navigate } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="wrap section-narrow" style={{ textAlign: 'center' }}><p className="lead">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}
