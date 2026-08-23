import { useEffect, useState } from 'react';
import { api, type Admin, fmtWhen } from '../api';
import { useEscape } from '../useEscape';

export default function Admins({ me }: { me: Admin }) {
  const [rows, setRows] = useState<Admin[]>([]);
  const [adding, setAdding] = useState(false);
  const [reset, setReset] = useState<Admin | null>(null);
  const [err, setErr] = useState('');

  function load() {
    api.admins().then(setRows).catch((e) => setErr(e.message));
  }

  useEffect(load, []);

  return (
    <>

      <div className="toolbar">
        <div className="panel-title" style={{ margin: 0 }}>Adminlar ro'yxati</div>
        <div className="spacer" />
        <button className="btn sm" onClick={() => setAdding(true)}>
          Yangi admin
        </button>
        {err && <span className="error">{err}</span>}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Login</th>
              <th>Ism</th>
              <th>Rol</th>
              <th>Oxirgi kirish</th>
              <th>Holat</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>
                  <b>{a.username}</b>
                  {a.id === me.id && <span className="muted"> · siz</span>}
                </td>
                <td className="muted">{a.name ?? '—'}</td>
                <td>
                  <span className={`badge ${a.role === 'super' ? 'business' : 'premium'}`}>
                    {a.role === 'super' ? 'Super admin' : 'Admin'}
                  </span>
                </td>
                <td className="muted">{fmtWhen(a.last_login_at)}</td>
                <td>
                  <span className={`badge ${a.is_active ? 'ok' : 'blocked'}`}>{a.is_active ? 'Faol' : 'Bloklangan'}</span>
                </td>
                <td className="num">
                  <button className="btn sm ghost" onClick={() => setReset(a)} style={{ marginRight: 6 }}>
                    Parol
                  </button>
                  {a.id !== me.id && (
                    <button
                      className={`btn sm ${a.is_active ? 'danger' : ''}`}
                      onClick={async () => {
                        setErr('');
                        try {
                          await api.updateAdmin(a.id, { is_active: !a.is_active });
                          load();
                        } catch (e: any) {
                          setErr(e.message);
                        }
                      }}
                    >
                      {a.is_active ? 'Bloklash' : 'Ochish'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <AddAdmin
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            load();
          }}
        />
      )}
      {reset && (
        <ResetPassword
          admin={reset}
          onClose={() => setReset(null)}
          onDone={() => {
            setReset(null);
            load();
          }}
        />
      )}
    </>
  );
}

function AddAdmin({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('admin');
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    try {
      await api.createAdmin({ username, password, name: name || undefined, role });
      onDone();
    } catch (e: any) {
      setErr(e.message === 'username_taken' ? 'Bu login band' : e.message);
    }
  }

  // Escape bosilsa yopilsin — panel klaviatura bilan ishlanadi
  useEscape(onClose);

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Yangi admin</h3>
        <div className="sub">Kamida 6 belgili parol kiriting</div>
        <div className="field">
          <label>Login</label>
          <input style={{ width: '100%' }} value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label>Ism</label>
          <input style={{ width: '100%' }} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Parol</label>
          <input
            style={{ width: '100%' }}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Rol</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: '100%' }}>
            <option value="admin">Admin</option>
            <option value="super">Super admin</option>
          </select>
        </div>
        {err && <p className="error">{err}</p>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Bekor
          </button>
          <button className="btn" disabled={!username || password.length < 6} onClick={submit}>
            Yaratish
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetPassword({ admin, onClose, onDone }: { admin: Admin; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  // Escape bosilsa yopilsin — panel klaviatura bilan ishlanadi
  useEscape(onClose);

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Parolni almashtirish</h3>
        <div className="sub">{admin.username}</div>
        <div className="field">
          <label>Yangi parol</label>
          <input
            style={{ width: '100%' }}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {err && <p className="error">{err}</p>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Bekor
          </button>
          <button
            className="btn"
            disabled={password.length < 6}
            onClick={async () => {
              setErr('');
              try {
                await api.updateAdmin(admin.id, { password });
                onDone();
              } catch (e: any) {
                setErr(e.message);
              }
            }}
          >
            Saqlash
          </button>
        </div>
      </div>
    </div>
  );
}
