# Mô-đun AI giám sát — giải thích cho báo cáo

| Mã | File | Nội dung |
|---|---|---|
| AI01 | `headPose.js`, `ProctorEngine.js` (`processFaces`), `calibrate()` | MediaPipe Face Landmarker trả 478 điểm mốc 3D. Đếm số khuôn mặt; tính góc quay ngang (yaw) từ hai bên má (điểm 234, 454) và góc cúi (pitch) từ trán–cằm (điểm 10, 152). Trước khi thi lấy trung bình 3 giây nhìn thẳng làm tư thế gốc; khi thi so độ lệch với tư thế gốc. |
| AI02 | `models.js`, `ProctorEngine.js` (`processObjects`) | COCO-SSD (TensorFlow.js) huấn luyện trên tập COCO 80 lớp — có lớp `cell phone` và `person`, nên phát hiện được điện thoại và nhiều người. Trả về nhãn, độ tin cậy, khung bao. Xét 3 lần phát hiện gần nhất, phải xuất hiện ≥ 2 lần mới tính. |
| AI03 | `config.js`, `ProctorEngine.js` (`evaluate`) | Mỗi quy tắc = điều kiện + thời gian duy trì tối thiểu. Ví dụ quay đầu lệch > 30° liên tục ≥ 2.5 giây. Quay/cúi ≥ 3 lần trong 60 giây → sự kiện lặp lại. Ngưỡng là giá trị khởi điểm, cần hiệu chỉnh khi thử nghiệm. |
| AI04 | `ProctorEngine.js` (`snapshot`), `eventQueue.js` | Khi sự kiện được ghi nhận: chụp khung hình JPEG 480px, vẽ khung khuôn mặt / vật thể + nhãn thời gian. Gửi về máy chủ gồm mã bài làm, loại sự kiện, thời điểm, thời lượng, độ tin cậy, ảnh. Ảnh lưu ngoài thư mục public, chỉ giảng viên sở hữu phòng thi xem được qua API. |

Video không rời khỏi máy sinh viên: chỉ sự kiện và ảnh bằng chứng được gửi đi.

## Cách hiệu chỉnh ngưỡng (gợi ý cho chương thực nghiệm)

1. Mở trang thi, đặt camera như khi thi thật.
2. Quay video thử từng hành vi (nhìn màn hình bình thường, nhìn bàn phím, quay sang bên, cúi xuống gầm bàn, giơ điện thoại, có người thứ hai).
3. Ghi lại số lần hệ thống phát hiện đúng / bỏ sót / báo nhầm cho mỗi ngưỡng trong `config.js`.
4. Chọn ngưỡng cân bằng giữa bỏ sót và báo nhầm; đưa bảng số liệu vào báo cáo.
