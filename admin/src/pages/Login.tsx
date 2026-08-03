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
      <form className="login-box" onSubmit={submit}>
        <div className="brand-logo">A</div>
        <h2>ARABIC.ONE</h2>
        <p className="sub">Admin panelga kirish</p>
        <input placeholder="Login" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <input placeholder="Parol" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn" type="submit" disabled={busy || !username || !password}>
          Kirish
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}
