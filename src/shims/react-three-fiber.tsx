"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

type Vec3 = [number, number, number];

export type ProjectedPoint = {
  x: number;
  y: number;
  scale: number;
  visible: boolean;
  depth: number;
};

type SceneContextValue = {
  project: (position: Vec3, distanceFactor?: number) => ProjectedPoint;
  yaw: number;
  pitch: number;
  distance: number;
};

const SceneContext = createContext<SceneContextValue | null>(null);

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function rotatePoint([x, y, z]: Vec3, yaw: number, pitch: number): Vec3 {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const yawX = x * cosYaw - z * sinYaw;
  const yawZ = x * sinYaw + z * cosYaw;
  const pitchY = y * cosPitch - yawZ * sinPitch;
  const pitchZ = y * sinPitch + yawZ * cosPitch;
  return [yawX, pitchY, pitchZ];
}

export function Canvas({
  camera,
  className,
  children,
}: {
  camera?: { position?: Vec3 };
  className?: string;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 960, height: 640 });
  const initialDistance = Math.max(camera?.position?.[2] ?? 20, 10);
  const [distance, setDistance] = useState(initialDistance);
  const [rotation, setRotation] = useState({ yaw: 0.35, pitch: -0.18 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return undefined;
    }

    const updateSize = () => {
      setSize({
        width: element.clientWidth || 960,
        height: element.clientHeight || 640,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return undefined;
    }

    let pointerId: number | null = null;
    let lastX = 0;
    let lastY = 0;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-scene-interactive='true']")) {
        return;
      }

      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      element.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - lastX;
      const deltaY = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;

      setRotation((current) => ({
        yaw: current.yaw + deltaX * 0.008,
        pitch: clamp(current.pitch + deltaY * 0.006, -1.1, 1.1),
      }));
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) {
        return;
      }

      pointerId = null;
      element.releasePointerCapture(event.pointerId);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      // 近距離ほど感度を下げて細かいズームを可能に
      setDistance((current) => {
        const step = Math.max(0.4, current * 0.08);
        const next = current + Math.sign(event.deltaY) * step * (Math.abs(event.deltaY) / 100);
        return clamp(next, 3, 60);
      });
    };

    element.addEventListener("pointerdown", handlePointerDown);
    element.addEventListener("pointermove", handlePointerMove);
    element.addEventListener("pointerup", handlePointerUp);
    element.addEventListener("pointercancel", handlePointerUp);
    element.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      element.removeEventListener("pointerdown", handlePointerDown);
      element.removeEventListener("pointermove", handlePointerMove);
      element.removeEventListener("pointerup", handlePointerUp);
      element.removeEventListener("pointercancel", handlePointerUp);
      element.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const contextValue = useMemo<SceneContextValue>(() => {
    return {
      yaw: rotation.yaw,
      pitch: rotation.pitch,
      distance,
      project: (position, distanceFactor = 8) => {
        const [rotatedX, rotatedY, rotatedZ] = rotatePoint(position, rotation.yaw, rotation.pitch);
        const cameraDepth = distance - rotatedZ;
        const perspective = (distance * 34) / Math.max(cameraDepth, 0.5);
        const scale = Math.max(0.45, (perspective / 100) * (distanceFactor / 8));
        return {
          x: size.width / 2 + rotatedX * perspective,
          y: size.height / 2 - rotatedY * perspective,
          scale,
          visible: cameraDepth > 0,
          depth: rotatedZ,
        };
      },
    };
  }, [distance, rotation.pitch, rotation.yaw, size.height, size.width]);

  return (
    <div
      ref={containerRef}
      className={className ?? "relative h-full w-full overflow-hidden touch-none"}
    >
      <SceneContext.Provider value={contextValue}>{children}</SceneContext.Provider>
    </div>
  );
}

export function useSceneContext() {
  const context = useContext(SceneContext);
  if (!context) {
    throw new Error("useSceneContext must be used inside Canvas");
  }
  return context;
}
