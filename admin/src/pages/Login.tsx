import { useState } from 'react';
import { api, setToken, type Admin } from '../api';
import { Logo, Wordmark, Glyph } from '../icons';

/**
 * Admin panelga kirish.
 *
 * Maydon ustidagi yozuvlar yo'q — nomi maydon ichida turadi va yonida
 * ikonka bo'ladi. Shunda oyna qisqaradi va ko'z bir joyga tikiladi:
 * ikkita maydon va bitta tugma.
 */
export default function Login({ onLogin }: { onLogin: (a: Admin) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
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
        <div className="login-logo"><Logo size={54} /></div>
        <div className="login-title"><Wordmark /></div>

        <div className={`in-field ${error ? 'bad' : ''}`}>
          <Glyph name="person" size={19} color="#9aa0aa" />
          <input
            placeholder="Login"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(''); }}
            autoFocus
            autoComplete="username"
          />
        </div>

        <div className={`in-field ${error ? 'bad' : ''}`}>
          <Glyph name="lock" size={19} color="#9aa0aa" />
          <input
            placeholder="Parol"
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            autoComplete="current-password"
          />
          {/* Ko'z — parolni ko'rish. Uzun parolni ko'rmasdan terish
              xatoga olib keladi, ayniqsa telefon klaviaturasida. */}
          <button
            type="button"
            className="in-eye"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Parolni yashirish" : "Parolni ko'rsatish"}
            tabIndex={-1}
          >
            <Glyph name={show ? 'eyeOff' : 'eye'} size={19} color="#9aa0aa" />
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <button className="btn login-go" type="submit" disabled={busy || !username || !password}>
          {busy ? 'Tekshirilmoqda…' : 'Kirish'}
        </button>

        <div className="login-foot">
          <Glyph name="shield" size={14} color="#9aa0aa" /> Himoyalangan ulanish
        </div>
      </form>
    </div>
  );
}
