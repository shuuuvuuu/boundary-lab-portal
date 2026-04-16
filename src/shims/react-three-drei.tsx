"use client";

import { useMemo } from "react";
import { useSceneContext } from "./react-three-fiber";

type Vec3 = [number, number, number];

export function OrbitControls() {
  return null;
}

export function Stars() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
      style={{
        backgroundImage: [
          "radial-gradient(circle at 20% 20%, rgba(148,163,184,0.35) 0 1px, transparent 1.5px)",
          "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.4) 0 1px, transparent 1.5px)",
          "radial-gradient(circle at 30% 80%, rgba(34,211,238,0.25) 0 1.5px, transparent 2px)",
          "linear-gradient(180deg, rgba(2,6,23,0.92), rgba(2,6,23,1))",
        ].join(","),
        backgroundSize: "180px 180px, 220px 220px, 260px 260px, 100% 100%",
        backgroundPosition: "0 0, 40px 80px, 120px 40px, 0 0",
      }}
    />
  );
}

export function Html({
  children,
  position,
  center = false,
  distanceFactor = 8,
  style,
}: {
  children: React.ReactNode;
  position?: Vec3;
  center?: boolean;
  distanceFactor?: number;
  style?: React.CSSProperties;
}) {
  const { project } = useSceneContext();
  const projected = project(position ?? [0, 0, 0], distanceFactor);

  if (!projected.visible) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: projected.x,
        top: projected.y,
        transform: center
          ? `translate(-50%, -50%) scale(${projected.scale})`
          : `scale(${projected.scale})`,
        transformOrigin: "center center",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Line({
  points,
  color = "#22d3ee",
  opacity = 0.35,
  lineWidth = 1,
}: {
  points: Vec3[];
  color?: string;
  opacity?: number;
  lineWidth?: number;
}) {
  const { project } = useSceneContext();
  const projected = useMemo(() => points.map((point) => project(point, 8)), [points, project]);

  if (projected.some((point) => !point.visible)) {
    return null;
  }

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      <line
        x1={projected[0].x}
        y1={projected[0].y}
        x2={projected[1].x}
        y2={projected[1].y}
        stroke={color}
        strokeOpacity={opacity}
        strokeWidth={lineWidth}
      />
    </svg>
  );
}
