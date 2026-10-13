class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Ép kiểu id từ URL, báo lỗi 400 nếu không hợp lệ */
function toId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Mã không hợp lệ');
  return n;
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, ...(err.extra || {}) });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Dữ liệu gửi lên quá lớn' });
  }
  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
    return res.status(409).json({ message: 'Không thể xóa vì dữ liệu đang được sử dụng ở nơi khác' });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'Dữ liệu bị trùng (tên đăng nhập, mã sinh viên hoặc mã phòng đã tồn tại)' });
  }
  if (err.code === 'ECONNREFUSED') {
    console.error('Không kết nối được MySQL:', err.message);
    return res.status(503).json({ message: 'Không kết nối được cơ sở dữ liệu' });
  }
  console.error(err);
  res.status(500).json({ message: 'Lỗi máy chủ' });
}

module.exports = { HttpError, toId, errorHandler };
