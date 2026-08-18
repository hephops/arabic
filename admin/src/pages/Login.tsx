import { Logo, Wordmark } from '../icons';
import { useState } from 'react';
import { api, setToken, type Admin } from '../api';

export default function Login({ onLogin }: { onLogin: (a: Admin) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.login(username.trim(), password);
      setToken(res.token);
      onLogin(res.admin);
    } catch (err: any) {
      setError(err.message === 'invalid_credentials' ? "Login yoki parol noto'g'ri" : 'Xatolik: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><Logo size={52} /></div>
        <div className="login-title"><Wordmark /></div>
        <div className="login-sub">Admin panelga kirish</div>
        <div className="field">
          <label>Login</label>
          <input placeholder="admin" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Parol</label>
          <input placeholder="••••••••" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn" type="submit" disabled={busy || !username || !password}>
          Kirish
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}
