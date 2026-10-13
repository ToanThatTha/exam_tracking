const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

module.exports = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'doi-chuoi-nay-trong-file-env',
  jwtExpires: process.env.JWT_EXPIRES || '8h',
  // Mã xác nhận khi đăng ký tài khoản giảng viên (để trống = không cho tự đăng ký giảng viên)
  teacherInviteCode: process.env.TEACHER_INVITE_CODE ?? 'GIANGVIEN2026',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'exam_proctor',
  },
  // Thư mục lưu ảnh bằng chứng. Không public; chỉ truy cập qua API có kiểm tra quyền.
  evidenceDir: path.resolve(__dirname, '..', process.env.EVIDENCE_DIR || 'storage/evidence'),
  // Sau bao nhiêu giây không nhận heartbeat thì ghi nhận mất kết nối
  heartbeatGapSeconds: Number(process.env.HEARTBEAT_GAP_SECONDS || 45),
};
