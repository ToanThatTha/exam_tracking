// Đăng ký tài khoản: sinh viên (họ tên, mã SV, lớp) hoặc giảng viên (cần mã giảng viên)
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { errMsg } from '../api';
import { BrandMark } from '../components/ui';

export default function Register() {
  const { user, register } = useAuth();
  const nav = useNavigate();
  const [role, setRole] = useState('student');
  const [form, setForm] = useState({ fullName: '', studentCode: '', className: '', username: '', password: '', confirm: '', teacherCode: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  if (user) return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) return setError('Mật khẩu nhập lại không khớp');
    setBusy(true);
    try {
      const { confirm, ...data } = form; 
      const u = await register({ ...data, role });
      nav(u.role === 'teacher' ? '/teacher' : '/student', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const isStudent = role === 'student';
  return (
    <div className="login-form-wrap" style={{ minHeight: '100%' }}>
      <form className="login-form stack" onSubmit={submit} style={{ width: 'min(440px, 100%)' }}>
        <div className="row"><BrandMark /><strong>Thi trắc nghiệm có giám sát AI</strong></div>
        <h2>Tạo tài khoản</h2>
        <div className="tabs" role="tablist" style={{ marginBottom: 4 }}>
          <button type="button" role="tab" aria-selected={isStudent} className={`tab${isStudent ? ' active' : ''}`} onClick={() => setRole('student')}>Sinh viên</button>
          <button type="button" role="tab" aria-selected={!isStudent} className={`tab${!isStudent ? ' active' : ''}`} onClick={() => setRole('teacher')}>Giảng viên</button>
        </div>
        <label className="field">
          <span>Họ và tên</span>
          <input className="input" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} autoComplete="name" required />
        </label>
        {isStudent ? (
          <div className="form-grid">
            <label className="field">
              <span>Mã sinh viên</span>
              <input className="input" value={form.studentCode} onChange={(e) => set('studentCode', e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())} placeholder="22IT001" required />
            </label>
            <label className="field">
              <span>Lớp</span>
              <input className="input" value={form.className} onChange={(e) => set('className', e.target.value.toUpperCase())} placeholder="22IT1" required />
            </label>
          </div>
        ) : (
          <label className="field">
            <span>Mã giảng viên <span className="hint">— do nhà trường / quản trị cấp</span></span>
            <input className="input" value={form.teacherCode} onChange={(e) => set('teacherCode', e.target.value)} required />
          </label>
        )}
        <label className="field">
          <span>Tên đăng nhập {isStudent && <span className="hint">— bỏ trống để dùng mã sinh viên</span>}</span>
          <input className="input" value={form.username} onChange={(e) => set('username', e.target.value)} autoComplete="username" required={!isStudent} />
        </label>
        <div className="form-grid">
          <label className="field">
            <span>Mật khẩu</span>
            <input className="input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" minLength={6} required />
          </label>
          <label className="field">
            <span>Nhập lại mật khẩu</span>
            <input className="input" type="password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} autoComplete="new-password" required />
          </label>
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={busy}>{busy ? 'Đang tạo tài khoản...' : 'Đăng ký'}</button>
        <p className="small" style={{ textAlign: 'center' }}>Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
      </form>
    </div>
  );
}
