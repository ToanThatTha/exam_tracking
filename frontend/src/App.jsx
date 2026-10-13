import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Loading } from './components/ui';
import { TeacherLayout, StudentLayout } from './components/Layouts';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/teacher/Dashboard';
import Questions from './pages/teacher/Questions';
import Exams from './pages/teacher/Exams';
import ExamEditor from './pages/teacher/ExamEditor';
import Rooms from './pages/teacher/Rooms';
import RoomEditor from './pages/teacher/RoomEditor';
import RoomDetail from './pages/teacher/RoomDetail';
import AttemptReport from './pages/teacher/AttemptReport';
import Students from './pages/teacher/Students';
import StudentHome from './pages/student/Home';
import Prepare from './pages/student/Prepare';
import ExamPage from './pages/student/Exam';
import Result from './pages/student/Result';
import History from './pages/student/History';

/** Phân quyền phía giao diện: mỗi vai trò chỉ vào được khu vực của mình (backend cũng kiểm tra lại) */
function RequireRole({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/teacher" element={<RequireRole role="teacher"><TeacherLayout /></RequireRole>}>
        <Route index element={<Dashboard />} />
        <Route path="questions" element={<Questions />} />
        <Route path="exams" element={<Exams />} />
        <Route path="exams/new" element={<ExamEditor />} />
        <Route path="exams/:id" element={<ExamEditor />} />
        <Route path="rooms" element={<Rooms />} />
        <Route path="rooms/new" element={<RoomEditor />} />
        <Route path="rooms/:id/edit" element={<RoomEditor />} />
        <Route path="rooms/:id" element={<RoomDetail />} />
        <Route path="attempts/:id" element={<AttemptReport />} />
        <Route path="students" element={<Students />} />
      </Route>

      <Route path="/student" element={<RequireRole role="student"><StudentLayout /></RequireRole>}>
        <Route index element={<StudentHome />} />
        <Route path="rooms/:id/prepare" element={<Prepare />} />
        <Route path="results" element={<History />} />
        <Route path="attempts/:id/result" element={<Result />} />
      </Route>
      {/* Màn hình làm bài không dùng layout để tối đa diện tích khi toàn màn hình */}
      <Route path="/student/attempts/:id" element={<RequireRole role="student"><ExamPage /></RequireRole>} />

      <Route
        path="*"
        element={loading ? <Loading /> : <Navigate to={user ? (user.role === 'teacher' ? '/teacher' : '/student') : '/login'} replace />}
      />
    </Routes>
  );
}
