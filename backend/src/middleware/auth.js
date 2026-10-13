const jwt = require('jsonwebtoken');
const config = require('../config');
const { HttpError } = require('../utils/http');

/** Xác thực JWT trong header Authorization: Bearer <token> */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Bạn chưa đăng nhập'));
  try {
    req.user = jwt.verify(token, config.jwtSecret); // { id, role, username, fullName }
    next();
  } catch {
    next(new HttpError(401, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại'));
  }
}

/** Chỉ cho phép các vai trò được liệt kê */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'Bạn không có quyền truy cập chức năng này'));
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
