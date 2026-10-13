// Sao chép file WebAssembly của MediaPipe vào public/ để chạy được không cần Internet
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dest = join(root, 'public', 'mediapipe-wasm');
if (!existsSync(src)) {
  console.warn('[copy-mediapipe-wasm] Không tìm thấy', src);
} else {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log('[copy-mediapipe-wasm] Đã sao chép WASM của MediaPipe vào public/mediapipe-wasm');
}
