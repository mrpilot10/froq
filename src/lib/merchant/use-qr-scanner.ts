"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type JsQrFn = typeof import("jsqr").default;

/** Decode buffer max width; video preview stays full-res. */
const DECODE_MAX_WIDTH = 480;
/** Run jsQR on every Nth animation frame (1 = every frame). */
const DECODE_EVERY_N_FRAMES = 2;

interface UseQrScannerOptions {
  onScan: (payload: string) => void;
  active: boolean;
}

export function useQrScanner({ onScan, active }: UseQrScannerOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const activeRef = useRef(active);
  const frameRef = useRef(0);
  const jsQRRef = useRef<JsQrFn | null>(null);
  const lastScanRef = useRef("");
  const [cameraError, setCameraError] = useState("");

  activeRef.current = active;

  const stopCamera = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const tick = useCallback(() => {
    if (!runningRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const jsQR = jsQRRef.current;
    if (!video || !canvas || !jsQR || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    if (!srcW || !srcH) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    frameRef.current += 1;
    if (frameRef.current % DECODE_EVERY_N_FRAMES !== 0) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const scale = Math.min(1, DECODE_MAX_WIDTH / srcW);
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const t0 = performance.now();
    ctx.drawImage(video, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    const result = jsQR(image.data, width, height, { inversionAttempts: "dontInvert" });
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("qrPerf")) {
      const ms = performance.now() - t0;
      const w = window as Window & { __qrPerf?: number[] };
      w.__qrPerf = w.__qrPerf ?? [];
      w.__qrPerf.push(ms);
      if (w.__qrPerf.length === 30) {
        const avg = w.__qrPerf.reduce((a, b) => a + b, 0) / w.__qrPerf.length;
        console.info(
          `[qrPerf] decode avg ${avg.toFixed(1)}ms over 30 frames @ ${width}x${height} every ${DECODE_EVERY_N_FRAMES}`,
        );
        w.__qrPerf = [];
      }
    }

    if (result?.data && result.data !== lastScanRef.current) {
      lastScanRef.current = result.data;
      onScan(result.data);
    }

    if (!runningRef.current) return;
    rafRef.current = requestAnimationFrame(tick);
  }, [onScan]);

  const startCamera = useCallback(async () => {
    setCameraError("");
    lastScanRef.current = "";
    frameRef.current = 0;

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera is not supported on this device.");
      return;
    }

    try {
      stopCamera();
      if (!jsQRRef.current) {
        jsQRRef.current = (await import("jsqr")).default;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      if (!activeRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        return;
      }
      video.srcObject = stream;
      await video.play();

      if (!activeRef.current) {
        stopCamera();
        return;
      }

      runningRef.current = true;
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      runningRef.current = false;
      setCameraError("Could not access the camera. Allow camera permission and try again.");
    }
  }, [stopCamera, tick]);

  useEffect(() => {
    if (!active) {
      stopCamera();
      return;
    }
    void startCamera();
    return stopCamera;
  }, [active, startCamera, stopCamera]);

  return { videoRef, canvasRef, cameraError, startCamera, stopCamera };
}
