// Nạp mô hình AI một lần duy nhất và dùng lại giữa các trang
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { MODEL_PATHS } from './config';

let facePromise = null;
let objectPromise = null;
export let faceInfo = { delegate: null, msPerFrame: null };
export let objectInfo = { backend: null, msPerFrame: null, model: null };
let benchTs = 1; // MediaPipe yêu cầu timestamp tăng dần; khi giám sát dùng performance.now() (lớn hơn)

/** Thời gian xử lý trung bình một khung hình (ms) trên ảnh thử */
function benchmark(landmarker) {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 480;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#777';
  ctx.fillRect(0, 0, 640, 480);
  landmarker.detectForVideo(c, (benchTs += 50)); // lần đầu khởi tạo, không tính
  const t0 = performance.now();
  for (let i = 0; i < 3; i++) landmarker.detectForVideo(c, (benchTs += 50));
  return (performance.now() - t0) / 3;
}

async function urlExists(url) {
  if (/^https?:/.test(url)) return true;
  try {
    const r = await fetch(url, { method: 'HEAD' });
    const type = r.headers.get('content-type') || '';
    return r.ok && !type.includes('text/html'); // Vite trả index.html cho file không tồn tại
  } catch {
    return false;
  }
}

async function firstAvailable(urls) {
  for (const u of urls) if (await urlExists(u)) return u;
  return urls[urls.length - 1];
}

/** AI01: MediaPipe Face Landmarker (478 điểm mốc khuôn mặt) */
export function loadFaceLandmarker() {
  if (!facePromise) {
    facePromise = (async () => {
      const wasmBase = await firstAvailable(MODEL_PATHS.mediapipeWasm.map((b) => b + '/vision_wasm_internal.js'));
      const vision = await FilesetResolver.forVisionTasks(wasmBase.replace(/\/vision_wasm_internal\.js$/, ''));
      const modelAssetPath = await firstAvailable(MODEL_PATHS.faceLandmarker);
      const make = (delegate) => FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO',
        numFaces: 3, // cần > 1 để phát hiện nhiều khuôn mặt
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      // Đo thử tốc độ: có máy dùng GPU "giả lập" bằng phần mềm còn chậm hơn CPU → chọn cái nhanh hơn
      let gpu = null;
      let gpuMs = Infinity;
      try {
        gpu = await make('GPU');
        gpuMs = benchmark(gpu);
      } catch (err) {
        console.warn('[AI] GPU không khả dụng cho MediaPipe:', err?.message);
      }
      if (gpu && gpuMs <= 45) {
        faceInfo = { delegate: 'GPU', msPerFrame: Math.round(gpuMs) };
        return gpu;
      }
      const cpu = await make('CPU');
      const cpuMs = benchmark(cpu);
      if (gpu && gpuMs < cpuMs) {
        cpu.close();
        faceInfo = { delegate: 'GPU', msPerFrame: Math.round(gpuMs) };
        return gpu;
      }
      gpu?.close();
      faceInfo = { delegate: 'CPU', msPerFrame: Math.round(cpuMs) };
      return cpu;
    })().then((m) => {
      console.info('[AI] Face Landmarker dùng', faceInfo.delegate, `~${faceInfo.msPerFrame} ms/khung hình`);
      return m;
    }).catch((err) => {
      facePromise = null;
      throw err;
    });
  }
  return facePromise;
}

/** AI02: COCO-SSD (TensorFlow.js) — 80 lớp COCO, có "cell phone" và "person" */
export function loadObjectDetector() {
  if (!objectPromise) {
    objectPromise = (async () => {
      try {
        await tf.setBackend('webgl');
      } catch {
        await tf.setBackend('cpu');
      }
      await tf.ready();
      const local = await urlExists(MODEL_PATHS.cocoSsd);
      const model = local
        ? await cocoSsd.load({ modelUrl: MODEL_PATHS.cocoSsd })
        : await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      // Chạy thử để khởi tạo shader (tránh giật ở lần phát hiện đầu) và đo tốc độ
      const warm = tf.zeros([480, 640, 3], 'int32');
      await model.detect(warm);
      const t0 = performance.now();
      await model.detect(warm);
      warm.dispose();
      objectInfo = { backend: tf.getBackend(), msPerFrame: Math.round(performance.now() - t0), model: local ? 'COCO-SSD mobilenet_v2' : 'COCO-SSD lite_mobilenet_v2' };
      console.info('[AI] COCO-SSD dùng', objectInfo.backend, `~${objectInfo.msPerFrame} ms/khung hình`);
      return model;
    })().catch((err) => {
      objectPromise = null;
      throw err;
    });
  }
  return objectPromise;
}

/** Nhãn mà mô hình phát hiện vật thể thực sự hỗ trợ (yêu cầu AI02: kiểm tra lớp có trong mô hình) */
export const COCO_HAS = { phone: true, person: true };
export const OBJECT_MODEL_NAME = 'COCO-SSD (TensorFlow.js)';
export { tf };
