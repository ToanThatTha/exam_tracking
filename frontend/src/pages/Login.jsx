import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { errMsg } from '../api';
import { Bubble, BrandMark } from '../components/ui';

// GV01, SV01: đăng nhập chung, hệ thống tự chuyển giao diện theo vai trò
export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />;

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await login(username.trim(), password);
      nav(u.role === 'teacher' ? '/teacher' : '/student', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const demo = [[1, 2], [0, 3], [2, 1], [3, 0]];
  return (
    <div className="login-page">
      <section className="login-art">
        <div className="row"><BrandMark /><strong>Thi trắc nghiệm có giám sát AI</strong></div>
        <div>
          <h1>Làm bài trực tuyến, giám sát minh bạch.</h1>
          <p>Camera và trình duyệt ghi nhận sự kiện đáng ngờ kèm ảnh bằng chứng. Giảng viên xem lại và là người kết luận cuối cùng.</p>
          <div className="sheet-demo" aria-hidden="true">
            {demo.map(([pick], i) => (
              <div className="sheet-demo-row" key={i}>
                <span style={{ width: 22 }}>{i + 1}.</span>
                {[0, 1, 2, 3].map((k) => <Bubble key={k} index={k} filled={k === pick} />)}
              </div>
            ))}
          </div>
        </div>
        <p className="small">Đồ án chuyên ngành · ReactJS · Node.js · MySQL · MediaPipe · COCO-SSD</p>
      </section>
      <section className="login-form-wrap">
        <form className="login-form stack" onSubmit={submit}>
          <h2>Đăng nhập</h2>
          <p className="muted">Dùng tài khoản do nhà trường cấp.</p>
          <label className="field">
            <span>Tên đăng nhập</span>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
          </label>
          <label className="field">
            <span>Mật khẩu</span>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {error && <div className="alert alert-danger">{error}</div>}
          <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
          <p className="small" style={{ textAlign: 'center' }}>Chưa có tài khoản? <Link to="/register">Đăng ký</Link></p>
          <div className="demo-accounts">
            Tài khoản mẫu (mật khẩu <b>123456</b>): giảng viên <b>gv01</b> · sinh viên <b>sv01</b>–<b>sv05</b>
          </div>
        </form>
      </section>
    </div>
  );
}
