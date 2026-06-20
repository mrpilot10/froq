"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

interface UseQrScannerOptions {
  onScan: (payload: string) => void;
  active: boolean;
}

export function useQrScanner({ onScan, active }: UseQrScannerOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScanRef = useRef("");
  const [cameraError, setCameraError] = useState("");

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    ctx.drawImage(video, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    const result = jsQR(image.data, width, height, { inversionAttempts: "dontInvert" });

    if (result?.data && result.data !== lastScanRef.current) {
      lastScanRef.current = result.data;
      onScan(result.data);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [onScan]);

  const startCamera = useCallback(async () => {
    setCameraError("");
    lastScanRef.current = "";

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera is not supported on this device.");
      return;
    }

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      rafRef.current = requestAnimationFrame(tick);
    } catch {
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
