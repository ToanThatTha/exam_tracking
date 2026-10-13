-- =====================================================================
-- CSDL: Website thi trắc nghiệm tích hợp AI giám sát và phát hiện gian lận
-- Chạy bằng: npm run db:init  (hoặc import file này trong phpMyAdmin)
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS proctor_events;
DROP TABLE IF EXISTS answers;
DROP TABLE IF EXISTS attempts;
DROP TABLE IF EXISTS room_students;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS exam_questions;
DROP TABLE IF EXISTS exams;
DROP TABLE IF EXISTS question_options;
DROP TABLE IF EXISTS questions;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- Người dùng: giảng viên và sinh viên (GV01, SV01)
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role          ENUM('teacher','student') NOT NULL,
  full_name     VARCHAR(100) NOT NULL,
  student_code  VARCHAR(20)  NULL UNIQUE,   -- Mã sinh viên (chỉ sinh viên)
  class_name    VARCHAR(30)  NULL,          -- Lớp (chỉ sinh viên)
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role_class (role, class_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ngân hàng câu hỏi (GV02)
CREATE TABLE questions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id  INT          NOT NULL,
  subject     VARCHAR(100) NOT NULL,
  chapter     VARCHAR(100) NOT NULL DEFAULT '',
  content     TEXT         NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_q_subject (teacher_id, subject, chapter)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE question_options (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  question_id INT     NOT NULL,
  content     TEXT    NOT NULL,
  is_correct  TINYINT(1) NOT NULL DEFAULT 0,
  position    TINYINT NOT NULL,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Đề thi (GV03)
CREATE TABLE exams (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id        INT          NOT NULL,
  title             VARCHAR(200) NOT NULL,
  subject           VARCHAR(100) NOT NULL DEFAULT '',
  duration_minutes  INT          NOT NULL,
  shuffle_questions TINYINT(1)   NOT NULL DEFAULT 1,
  shuffle_options   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exam_questions (
  exam_id     INT NOT NULL,
  question_id INT NOT NULL,
  position    INT NOT NULL,
  PRIMARY KEY (exam_id, question_id),
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  -- Không cho xóa câu hỏi đang nằm trong đề thi
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Phòng thi + cấu hình giám sát (GV04, GV05)
CREATE TABLE rooms (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id         INT          NOT NULL,
  exam_id            INT          NOT NULL,
  name               VARCHAR(200) NOT NULL,
  open_at            DATETIME     NOT NULL,
  close_at           DATETIME     NOT NULL,
  allowed_classes    VARCHAR(255) NOT NULL DEFAULT '', -- lớp được giao bài, phân cách bằng dấu phẩy
  require_camera     TINYINT(1)   NOT NULL DEFAULT 1,  -- bật/tắt camera AI
  require_fullscreen TINYINT(1)   NOT NULL DEFAULT 1,
  max_tab_violations INT          NOT NULL DEFAULT 3,  -- 0 = không giới hạn
  violation_action   ENUM('warn','auto_submit') NOT NULL DEFAULT 'auto_submit',
  show_answers       TINYINT(1)   NOT NULL DEFAULT 0,  -- công khai đáp án cho sinh viên
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  -- Không cho xóa đề thi đang được phòng thi sử dụng
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sinh viên được giao bài riêng lẻ (ngoài các lớp được giao)
CREATE TABLE room_students (
  room_id    INT NOT NULL,
  student_id INT NOT NULL,
  PRIMARY KEY (room_id, student_id),
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bài làm / phiên thi (SV03–SV07)
CREATE TABLE attempts (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  room_id               INT      NOT NULL,
  student_id            INT      NOT NULL,
  status                ENUM('in_progress','submitted') NOT NULL DEFAULT 'in_progress',
  submit_reason         ENUM('manual','timeout','violation_limit') NULL,
  started_at            DATETIME NOT NULL,
  deadline_at           DATETIME NOT NULL,
  submitted_at          DATETIME NULL,
  question_order        JSON     NOT NULL,  -- [{q: questionId, o: [optionId,...]}] thứ tự riêng của sinh viên
  baseline              JSON     NULL,      -- tư thế nhìn thẳng sau hiệu chỉnh {yaw, pitch}
  correct_count         INT      NOT NULL DEFAULT 0,
  total_questions       INT      NOT NULL DEFAULT 0,
  score                 DECIMAL(4,2) NULL,  -- thang điểm 10
  tab_violations        INT      NOT NULL DEFAULT 0,
  fullscreen_violations INT      NOT NULL DEFAULT 0,
  risk_score            INT      NOT NULL DEFAULT 0, -- 0..100
  review_status         ENUM('pending','valid','cheating') NOT NULL DEFAULT 'pending',
  review_note           VARCHAR(500) NOT NULL DEFAULT '',
  last_heartbeat        DATETIME NULL,
  UNIQUE KEY uq_attempt (room_id, student_id),   -- mỗi sinh viên thi 1 lần / phòng
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Đáp án tự động lưu (SV04)
CREATE TABLE answers (
  attempt_id  INT NOT NULL,
  question_id INT NOT NULL,
  option_id   INT NULL,
  flagged     TINYINT(1) NOT NULL DEFAULT 0,
  updated_at  DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (attempt_id, question_id),
  FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sự kiện giám sát: trình duyệt + AI camera (GV07, GV08, AI04)
CREATE TABLE proctor_events (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  attempt_id    INT          NOT NULL,
  client_id     VARCHAR(40)  NOT NULL,          -- id do trình duyệt sinh, để cập nhật thời lượng
  type          VARCHAR(30)  NOT NULL,          -- TAB_HIDDEN, FULLSCREEN_EXIT, NO_FACE, MULTI_FACE, HEAD_TURN, HEAD_DOWN, PHONE, MULTI_PERSON, CAMERA_OFF, LOOK_AWAY_REPEATED, CONNECTION_LOST
  source        ENUM('browser','ai','server') NOT NULL,
  started_at    DATETIME(3)  NOT NULL,
  duration_ms   INT          NOT NULL DEFAULT 0,
  confidence    DECIMAL(4,3) NULL,
  details       JSON         NULL,
  snapshot_path VARCHAR(255) NULL,              -- ảnh bằng chứng (đường dẫn nội bộ, không public)
  status        ENUM('pending','confirmed','dismissed') NOT NULL DEFAULT 'pending',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_client (attempt_id, client_id),
  FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
  INDEX idx_events_attempt (attempt_id, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
