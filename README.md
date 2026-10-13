# Website thi trắc nghiệm tích hợp AI giám sát và phát hiện gian lận qua camera

Đồ án chuyên ngành — ReactJS · Node.js (Express) · MySQL · MediaPipe Face Landmarker · COCO-SSD (TensorFlow.js)

- **Giảng viên**: ngân hàng câu hỏi (nhập Excel), tạo đề (chọn tay / ngẫu nhiên, trộn câu và phương án), phòng thi giao cho lớp hoặc từng sinh viên, cấu hình giám sát, kết quả và thống kê theo câu, báo cáo vi phạm kèm ảnh bằng chứng, xác nhận / bỏ qua cảnh báo, kết luận hợp lệ / gian lận.
- **Sinh viên**: tự đăng ký (họ tên, mã SV, lớp) và đăng nhập, thấy các bài thi được giao và bấm *Vào thi* khi đến giờ, kiểm tra camera và hiệu chỉnh tư thế, làm bài toàn màn hình với đồng hồ đếm ngược và tự động lưu, nhận cảnh báo, nộp bài (tự nộp khi hết giờ hoặc vượt giới hạn thoát tab), xem kết quả.
- **AI**: chạy ngay trên trình duyệt của sinh viên; chỉ gửi sự kiện và ảnh bằng chứng về máy chủ, không gửi video.

---

## 1. Cài đặt (làm một lần)

### Cần có
| Phần mềm | Ghi chú |
|---|---|
| **Node.js 18 trở lên** (khuyên dùng bản LTS) | tải tại nodejs.org — có sẵn `npm` |
| **MySQL** | dùng **XAMPP** (bật MySQL) là nhanh nhất; MySQL 8 hoặc MariaDB đều được |
| **Chrome hoặc Edge** bản mới | máy có **webcam** |

### Các bước

```bash
# 1. Mở terminal tại thư mục exam-proctor-ai, cài thư viện cho cả backend và frontend
npm run setup

# 2. Cấu hình kết nối MySQL (bỏ qua nếu dùng XAMPP mặc định: user root, mật khẩu rỗng)
#    Windows:  copy backend\.env.example backend\.env
#    macOS/Linux: cp backend/.env.example backend/.env
#    rồi sửa DB_USER / DB_PASSWORD trong backend/.env nếu cần

# 3. Bật MySQL (XAMPP → Start MySQL), sau đó tạo CSDL + dữ liệu mẫu
npm run db:init
```

`npm run db:init` tự tạo database `exam_proctor`, các bảng và dữ liệu mẫu. **Lệnh này xóa dữ liệu cũ**, chỉ chạy lại khi muốn làm mới.

> Không muốn dùng lệnh? Có thể mở phpMyAdmin, tạo database `exam_proctor` (utf8mb4_unicode_ci) rồi import file `backend/src/db/schema.sql`. Cách này không có dữ liệu mẫu và tài khoản; nên dùng `npm run db:init`.

## 2. Chạy dự án

```bash
npm run dev
```

Lệnh này chạy cùng lúc:
- backend: http://localhost:4000 (API, kiểm tra nhanh: http://localhost:4000/api/health)
- frontend: **http://localhost:5173** ← mở địa chỉ này trên trình duyệt

Dừng bằng `Ctrl + C`. Muốn chạy riêng từng phần: `npm --prefix backend run dev` và `npm --prefix frontend run dev` ở hai terminal.

### Tài khoản mẫu (mật khẩu đều là `123456`)
| Vai trò | Tên đăng nhập |
|---|---|
| Giảng viên | `gv01` |
| Sinh viên lớp 22IT1 | `sv01`, `sv02`, `sv03` |
| Sinh viên lớp 22IT2 | `sv04`, `sv05` |

Bài thi mẫu *Kiểm tra giữa kỳ - Cơ sở dữ liệu* đã giao cho lớp **22IT1** (sv01–sv03), mở 30 ngày kể từ lúc chạy `db:init`, bật camera AI + toàn màn hình, thoát tab tối đa 3 lần thì tự nộp.

### Đăng ký tài khoản mới
Bấm **Đăng ký** ở trang đăng nhập.
- **Sinh viên**: nhập họ tên, mã sinh viên, lớp, mật khẩu (tên đăng nhập bỏ trống thì dùng mã SV). Bài thi đã giao cho lớp đó sẽ tự hiện trong danh sách của sinh viên.
- **Giảng viên**: cần nhập **mã giảng viên**, mặc định là `GIANGVIEN2026` (đổi ở dòng `TEACHER_INVITE_CODE` trong `backend/.env`; để trống thì tắt tự đăng ký giảng viên). Mã này để sinh viên không tự tạo được tài khoản giảng viên.

### Cách giao bài thi
Giảng viên vào **Phòng thi & kết quả → Tạo phòng thi**: chọn đề, giờ mở / đóng, rồi ở mục **Giao bài cho sinh viên** tick cả lớp và/hoặc thêm từng sinh viên. Không cần mã phòng: sinh viên được giao sẽ thấy bài trong trang *Bài thi của bạn* và bấm **Vào thi** khi đến giờ.

### Chạy bản build (một cổng duy nhất, dùng khi demo)
```bash
npm run build     # build giao diện vào frontend/dist
npm start         # backend phục vụ luôn giao diện tại http://localhost:4000
```

## 3. Kịch bản demo gợi ý

1. Đăng nhập `gv01` → **Ngân hàng câu hỏi** (thử *Nhập từ Excel* với file mẫu) → **Đề thi** → **Phòng thi** (xem cấu hình giám sát).
2. Mở **cửa sổ ẩn danh** (hoặc trình duyệt khác), đăng nhập `sv01` → bấm **Vào thi** ở bài *Kiểm tra giữa kỳ* → bật camera → hiệu chỉnh → bắt đầu làm bài.
3. Trong lúc thi, thử: quay đầu sang bên > 3 giây, cúi đầu xuống lâu, rời khỏi camera, cho người thứ hai vào khung hình, giơ điện thoại, nhấn `Esc` thoát toàn màn hình, chuyển tab (`Alt+Tab`). Mỗi lần sẽ có cảnh báo.
4. Quay lại cửa sổ giảng viên → **Phòng thi & kết quả** → **Báo cáo** của sinh viên: dòng thời gian sự kiện, ảnh bằng chứng, điểm rủi ro → *Xác nhận* / *Bỏ qua* → *Đánh dấu hợp lệ / có gian lận*.

> Hai tài khoản đăng nhập trong cùng một trình duyệt sẽ dùng chung phiên (token lưu ở localStorage). Hãy dùng cửa sổ ẩn danh hoặc trình duyệt khác cho tài khoản thứ hai.

## 4. Cấu trúc thư mục

```
exam-proctor-ai/
├── backend/                     Node.js + Express + MySQL
│   ├── .env.example             cấu hình (cổng, MySQL, JWT, thư mục ảnh bằng chứng)
│   └── src/
│       ├── server.js            khởi động server + tự nộp bài hết giờ (mỗi 30 giây)
│       ├── app.js               gắn các route, phân quyền theo vai trò
│       ├── db/schema.sql        lược đồ CSDL (10 bảng)
│       ├── db/init.js           tạo CSDL + dữ liệu mẫu
│       ├── middleware/auth.js   JWT + kiểm tra vai trò
│       ├── routes/              auth, questions, exams, rooms, students, review (GV), studentExam (SV)
│       └── utils/proctorRules.js  danh mục sự kiện + công thức điểm rủi ro
├── frontend/                    React (Vite)
│   ├── public/models/           mô hình AI đặt sẵn (chạy không cần Internet)
│   └── src/
│       ├── ai/                  MÔ-ĐUN AI — xem src/ai/EXPLAIN.md
│       │   ├── config.js        ngưỡng phát hiện (cần hiệu chỉnh khi thực nghiệm)
│       │   ├── models.js        nạp MediaPipe + COCO-SSD, tự chọn GPU/CPU
│       │   ├── headPose.js      tính góc quay / cúi đầu từ điểm mốc 3D
│       │   ├── ProctorEngine.js luật phát hiện + chụp ảnh bằng chứng
│       │   ├── browserMonitor.js thoát tab, thoát toàn màn hình
│       │   └── eventQueue.js    gửi sự kiện về máy chủ trong lúc thi
│       └── pages/teacher, pages/student
└── package.json                 lệnh tiện ích: setup, db:init, dev, build, start
```

## 5. Đối chiếu yêu cầu đề cương

| Mã | Ở đâu |
|---|---|
| GV01, SV01 | `routes/auth.js`, `pages/Login.jsx`, `pages/Register.jsx`; phân quyền `middleware/auth.js` + `App.jsx` |
| GV02 | `routes/questions.js`, `pages/teacher/Questions.jsx` (thêm/sửa/xóa, môn–chương, Excel) |
| GV03 | `routes/exams.js`, `pages/teacher/ExamEditor.jsx`; trộn câu/phương án riêng từng SV ở `utils/attempts.js` |
| GV04, GV05 | `routes/rooms.js`, `pages/teacher/RoomEditor.jsx` (giờ mở/đóng, giao cho lớp / từng SV, cấu hình giám sát) |
| GV06 | `GET /api/teacher/rooms/:id/results`, `/question-stats`, `pages/teacher/RoomDetail.jsx` |
| GV07, GV08 | `routes/review.js`, `pages/teacher/AttemptReport.jsx` |
| SV02–SV07 | `routes/studentExam.js`, `pages/student/*` |
| AI01–AI04 | `frontend/src/ai/*`; nhận sự kiện + lưu ảnh có kiểm soát quyền ở `routes/studentExam.js` và `routes/review.js` |

## 6. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `db:init` báo **MySQL chưa chạy** / `ECONNREFUSED` | Bật MySQL trong XAMPP rồi chạy lại |
| `ER_ACCESS_DENIED_ERROR` | Sai `DB_USER` / `DB_PASSWORD` trong `backend/.env` |
| Trang web báo **Không kết nối được máy chủ** | Backend chưa chạy hoặc lỗi — xem terminal backend |
| Cổng 4000 / 5173 đang bị dùng | Đổi `PORT` trong `backend/.env` (và sửa cổng proxy trong `frontend/vite.config.js`) |
| **Camera không bật** | Chỉ chạy trên `http://localhost` hoặc `https`. Mở qua địa chỉ IP trong mạng LAN (ví dụ `http://192.168.1.5:5173`) thì trình duyệt chặn camera. Kiểm tra quyền Camera ở biểu tượng ổ khóa; tắt Zoom/Meet nếu đang chiếm camera |
| Nạp mô hình AI lâu | Lần đầu 10–30 giây là bình thường. Mở F12 → Console sẽ thấy dòng `[AI] Face Landmarker dùng GPU/CPU ~xx ms/khung hình` |
| Thiếu thư mục `frontend/public/mediapipe-wasm` | Chạy lại `npm --prefix frontend install` (bước này tự sao chép file WASM) |
| Sinh viên không thấy bài thi | Kiểm tra lớp của sinh viên (viết đúng, ví dụ `22IT1`) có được tick trong *Giao bài cho sinh viên*, hoặc thêm riêng sinh viên đó vào phòng |

## 7. Ghi chú kỹ thuật cho báo cáo

- **Mô hình AI**: `face_landmarker.task` (MediaPipe, float16) và COCO-SSD bản `mobilenet_v2` đã đặt sẵn trong `frontend/public/models/`. COCO-SSD được huấn luyện trên tập COCO có lớp `cell phone` và `person`, đúng yêu cầu AI02 về kiểm tra lớp có trong mô hình. Nếu thiếu file, hệ thống tự tải từ CDN chính thức.
- **Hiệu năng**: lúc nạp, hệ thống đo thử tốc độ GPU và CPU rồi chọn cái nhanh hơn, đồng thời giãn nhịp xử lý trên máy yếu để giao diện làm bài không bị giật.
- **Điểm rủi ro (0–100)** chỉ là gợi ý để giảng viên ưu tiên xem bài nào trước; trọng số nằm ở `backend/src/utils/proctorRules.js`. Kết luận cuối cùng do giảng viên đưa ra.
- **Ảnh bằng chứng** lưu ở `backend/storage/evidence/`, không public; chỉ giảng viên sở hữu phòng thi xem được qua API có kiểm tra quyền.
- **Chống mất dữ liệu**: đáp án lưu tự động sau mỗi lần chọn (kèm bản sao trên máy khi mất mạng); sự kiện giám sát gửi ngay trong lúc thi; tải lại trang thì bài làm và thời gian vẫn giữ nguyên; máy chủ tự chốt bài quá giờ kể cả khi sinh viên tắt máy.
- **Giới hạn đã biết**: trang web không thấy được ứng dụng khác đang mở trên máy, chỉ biết khi cửa sổ thi mất focus. Ngưỡng AI trong `frontend/src/ai/config.js` là giá trị khởi điểm, cần hiệu chỉnh bằng thực nghiệm (gợi ý cách làm trong `frontend/src/ai/EXPLAIN.md`).
