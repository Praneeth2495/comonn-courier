import { createContext, useContext, useEffect, useState } from 'react';
import client from './client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('comonn_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('comonn_token');
    if (!token) {
      setLoading(false);
      return;
    }
    client
      .get('/auth/me')
      .then(({ data }) => {
        setUser(data.user);
        localStorage.setItem('comonn_user', JSON.stringify(data.user));
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { data } = await client.post('/auth/login', { email, password });
    localStorage.setItem('comonn_token', data.token);
    localStorage.setItem('comonn_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  async function setPassword(token, password) {
    const { data } = await client.post('/auth/set-password', { token, password });
    localStorage.setItem('comonn_token', data.token);
    localStorage.setItem('comonn_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  async function register(payload) {
    const { data } = await client.post('/auth/register', payload);
    localStorage.setItem('comonn_token', data.token);
    localStorage.setItem('comonn_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('comonn_token');
    localStorage.removeItem('comonn_user');
    setUser(null);
  }

  function updateUser(patch) {
    setUser((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem('comonn_user', JSON.stringify(next));
      return next;
    });
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, setPassword, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
