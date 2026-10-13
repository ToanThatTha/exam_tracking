import axios from 'axios';

const TOKEN_KEY = 'exam_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* trình duyệt chặn localStorage */ }
}

// Gọi tương đối /api → Vite proxy (khi dev) hoặc chính backend (khi đã build)
const api = axios.create({ baseURL: '/api', timeout: 20000 });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.includes('/auth/')) {
      setToken(null);
      if (!/^\/(login|register)/.test(window.location.pathname)) window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

/** Thông báo lỗi dễ hiểu từ phản hồi của API */
export function errMsg(err) {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.code === 'ERR_NETWORK' || err?.message === 'Network Error') return 'Không kết nối được máy chủ. Kiểm tra backend đã chạy chưa.';
  if (err?.code === 'ECONNABORTED') return 'Máy chủ phản hồi quá lâu, vui lòng thử lại.';
  if (err?.response?.status >= 500) return 'Máy chủ gặp lỗi. Kiểm tra backend và MySQL.';
  return err?.message || 'Đã có lỗi xảy ra';
}

/** Tải file (Excel mẫu) có kèm token */
export async function downloadFile(url, filename) {
  const res = await api.get(url, { responseType: 'blob' });
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export default api;
