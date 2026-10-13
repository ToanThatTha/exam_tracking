import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { BrandMark } from './ui';

export function TeacherLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const links = [
    ['/teacher', 'Tổng quan', true],
    ['/teacher/questions', 'Ngân hàng câu hỏi'],
    ['/teacher/exams', 'Đề thi'],
    ['/teacher/rooms', 'Phòng thi & kết quả'],
    ['/teacher/students', 'Sinh viên'],
  ];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <div>Thi trắc nghiệm<small>Giám sát bằng AI</small></div>
        </div>
        {links.map(([to, label, end]) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            {label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <strong>{user?.fullName}</strong>
          Giảng viên
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-sm" onClick={() => { logout(); nav('/login'); }}>Đăng xuất</button>
          </div>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}

export function StudentLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div>
      <header className="topbar">
        <Link to="/student" className="brand" style={{ padding: 0, color: 'var(--ink)', textDecoration: 'none' }}>
          <BrandMark />
          <div>Thi trắc nghiệm<small style={{ color: 'var(--muted)' }}>Cổng sinh viên</small></div>
        </Link>
        <nav className="row">
          <NavLink to="/student" end className="btn btn-ghost btn-sm">Bài thi</NavLink>
          <NavLink to="/student/results" className="btn btn-ghost btn-sm">Kết quả của tôi</NavLink>
        </nav>
        <div className="row">
          <div className="small" style={{ textAlign: 'right', lineHeight: 1.3 }}>
            <strong>{user?.fullName}</strong>
            <div className="muted">{user?.studentCode} · Lớp {user?.className}</div>
          </div>
          <button className="btn btn-sm" onClick={() => { logout(); nav('/login'); }}>Đăng xuất</button>
        </div>
      </header>
      <main className="student-main"><Outlet /></main>
    </div>
  );
}
