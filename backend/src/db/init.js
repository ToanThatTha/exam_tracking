/**
 * Khởi tạo CSDL: tạo database (nếu chưa có), tạo bảng, nạp dữ liệu mẫu.
 * Chạy: npm run db:init
 * CẢNH BÁO: lệnh này XÓA toàn bộ dữ liệu cũ trong database.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const config = require('../config');

const QUESTIONS = [
  // [môn, chương, câu hỏi, [phương án], vị trí đáp án đúng]
  ['Cơ sở dữ liệu', 'Chương 1', 'Khóa chính (primary key) của một bảng có đặc điểm nào sau đây?', ['Có thể chứa giá trị NULL', 'Giá trị là duy nhất và khác NULL', 'Bắt buộc là kiểu số nguyên', 'Mỗi bảng có nhiều khóa chính'], 1],
  ['Cơ sở dữ liệu', 'Chương 1', 'Mô hình dữ liệu nào tổ chức dữ liệu thành các bảng gồm hàng và cột?', ['Mô hình phân cấp', 'Mô hình mạng', 'Mô hình quan hệ', 'Mô hình hướng đối tượng'], 2],
  ['Cơ sở dữ liệu', 'Chương 1', 'Khóa ngoại (foreign key) dùng để làm gì?', ['Tăng tốc độ truy vấn', 'Liên kết và đảm bảo toàn vẹn tham chiếu giữa các bảng', 'Mã hóa dữ liệu', 'Sắp xếp dữ liệu'], 1],
  ['Cơ sở dữ liệu', 'Chương 2', 'Câu lệnh SQL nào dùng để lấy dữ liệu từ bảng?', ['INSERT', 'UPDATE', 'SELECT', 'DELETE'], 2],
  ['Cơ sở dữ liệu', 'Chương 2', 'Mệnh đề nào dùng để lọc nhóm sau khi GROUP BY?', ['WHERE', 'HAVING', 'ORDER BY', 'LIMIT'], 1],
  ['Cơ sở dữ liệu', 'Chương 2', 'Phép JOIN nào trả về tất cả các dòng của bảng bên trái kể cả khi không khớp?', ['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'CROSS JOIN'], 1],
  ['Cơ sở dữ liệu', 'Chương 2', 'Hàm nào đếm số dòng trong SQL?', ['SUM()', 'COUNT()', 'AVG()', 'MAX()'], 1],
  ['Cơ sở dữ liệu', 'Chương 3', 'Dạng chuẩn 1NF yêu cầu điều gì?', ['Mọi thuộc tính đều là giá trị nguyên tố', 'Không có phụ thuộc bắc cầu', 'Không có phụ thuộc bộ phận', 'Mọi bảng có khóa ngoại'], 0],
  ['Cơ sở dữ liệu', 'Chương 3', 'Dạng chuẩn 3NF loại bỏ loại phụ thuộc nào?', ['Phụ thuộc đa trị', 'Phụ thuộc bắc cầu vào khóa', 'Phụ thuộc hàm đầy đủ', 'Phụ thuộc kết nối'], 1],
  ['Cơ sở dữ liệu', 'Chương 4', 'Tính chất nào trong ACID đảm bảo giao dịch thực hiện trọn vẹn hoặc không thực hiện gì?', ['Atomicity', 'Consistency', 'Isolation', 'Durability'], 0],
  ['Cơ sở dữ liệu', 'Chương 4', 'Index (chỉ mục) chủ yếu giúp gì?', ['Giảm dung lượng lưu trữ', 'Tăng tốc độ tìm kiếm dữ liệu', 'Bảo mật dữ liệu', 'Sao lưu dữ liệu'], 1],
  ['Cơ sở dữ liệu', 'Chương 4', 'Lệnh nào hủy bỏ các thay đổi của giao dịch hiện tại?', ['COMMIT', 'ROLLBACK', 'SAVE', 'GRANT'], 1],
  ['Mạng máy tính', 'Chương 1', 'Mô hình OSI có bao nhiêu tầng?', ['4', '5', '7', '8'], 2],
  ['Mạng máy tính', 'Chương 1', 'Giao thức HTTP mặc định dùng cổng nào?', ['21', '25', '80', '443'], 2],
  ['Mạng máy tính', 'Chương 2', 'Giao thức nào đảm bảo truyền dữ liệu tin cậy, có thứ tự?', ['UDP', 'TCP', 'IP', 'ICMP'], 1],
  ['Mạng máy tính', 'Chương 2', 'DNS dùng để làm gì?', ['Cấp phát địa chỉ IP động', 'Phân giải tên miền thành địa chỉ IP', 'Mã hóa đường truyền', 'Định tuyến gói tin'], 1],
  ['Mạng máy tính', 'Chương 3', 'Địa chỉ IPv4 có độ dài bao nhiêu bit?', ['16', '32', '64', '128'], 1],
  ['Mạng máy tính', 'Chương 3', 'Thiết bị nào hoạt động chủ yếu ở tầng 3 (Network)?', ['Hub', 'Switch', 'Router', 'Repeater'], 2],
];

const STUDENTS = [
  ['sv01', 'Nguyễn Văn An', '22IT001', '22IT1'],
  ['sv02', 'Trần Thị Bình', '22IT002', '22IT1'],
  ['sv03', 'Lê Hoàng Cường', '22IT003', '22IT1'],
  ['sv04', 'Phạm Minh Dũng', '22IT101', '22IT2'],
  ['sv05', 'Võ Thị Hạnh', '22IT102', '22IT2'],
];

async function main() {
  const { host, port, user, password, database } = config.db;
  const conn = await mysql.createConnection({ host, port, user, password, multipleStatements: true, timezone: 'Z' });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${database}\``);
  await conn.query("SET time_zone = '+00:00'");

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(schema);
  console.log('✓ Đã tạo các bảng');

  const hash = await bcrypt.hash('123456', 10);
  const [t] = await conn.query(
    "INSERT INTO users (username, password_hash, role, full_name) VALUES ('gv01', ?, 'teacher', 'ThS. Nguyễn Văn Giảng')",
    [hash]
  );
  const teacherId = t.insertId;
  for (const [username, name, code, cls] of STUDENTS) {
    await conn.query(
      "INSERT INTO users (username, password_hash, role, full_name, student_code, class_name) VALUES (?, ?, 'student', ?, ?, ?)",
      [username, hash, name, code, cls]
    );
  }
  console.log('✓ Đã tạo 1 giảng viên và', STUDENTS.length, 'sinh viên (mật khẩu: 123456)');

  const dbQuestionIds = [];
  for (const [subject, chapter, content, options, correct] of QUESTIONS) {
    const [q] = await conn.query('INSERT INTO questions (teacher_id, subject, chapter, content) VALUES (?, ?, ?, ?)', [teacherId, subject, chapter, content]);
    for (let i = 0; i < options.length; i++) {
      await conn.query('INSERT INTO question_options (question_id, content, is_correct, position) VALUES (?, ?, ?, ?)', [q.insertId, options[i], i === correct ? 1 : 0, i]);
    }
    if (subject === 'Cơ sở dữ liệu') dbQuestionIds.push(q.insertId);
  }
  console.log('✓ Đã tạo', QUESTIONS.length, 'câu hỏi mẫu');

  const [e] = await conn.query(
    "INSERT INTO exams (teacher_id, title, subject, duration_minutes, shuffle_questions, shuffle_options) VALUES (?, 'Kiểm tra giữa kỳ - Cơ sở dữ liệu', 'Cơ sở dữ liệu', 20, 1, 1)",
    [teacherId]
  );
  const examQs = dbQuestionIds.slice(0, 10);
  for (let i = 0; i < examQs.length; i++) {
    await conn.query('INSERT INTO exam_questions (exam_id, question_id, position) VALUES (?, ?, ?)', [e.insertId, examQs[i], i]);
  }

  const now = new Date();
  const openAt = new Date(now.getTime() - 60 * 60 * 1000);
  const closeAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await conn.query(
    `INSERT INTO rooms (teacher_id, exam_id, name, open_at, close_at, allowed_classes, require_camera, require_fullscreen, max_tab_violations, violation_action, show_answers)
     VALUES (?, ?, 'Phòng thi demo - lớp 22IT1', ?, ?, '22IT1', 1, 1, 3, 'auto_submit', 1)`,
    [teacherId, e.insertId, openAt, closeAt]
  );
  console.log('✓ Đã tạo đề thi mẫu và giao cho lớp 22IT1 (sv01, sv02, sv03)');

  await conn.end();
  console.log('\nHoàn tất. Tài khoản: gv01 / 123456 (giảng viên), sv01..sv05 / 123456 (sinh viên)');
}

main().catch((err) => {
  console.error('✗ Khởi tạo CSDL thất bại:', err.message);
  if (err.code === 'ECONNREFUSED') console.error('  → MySQL chưa chạy. Hãy bật MySQL (ví dụ trong XAMPP) rồi thử lại.');
  if (err.code === 'ER_ACCESS_DENIED_ERROR') console.error('  → Sai DB_USER / DB_PASSWORD trong file backend/.env');
  process.exit(1);
});
