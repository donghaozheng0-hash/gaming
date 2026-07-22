import type { Vec2 } from "../map/MapGenerator";

const resampledPointCount = 32; // iso-ok: $1-style recognizer fixed resample count from T7 contract.
const maxScore = 100; // iso-ok: draw recognizer score is expressed on a 0-100 scale.
const scoreDistanceLimit = Math.SQRT1_2 - 1 / resampledPointCount; // iso-ok: normalized-shape distance at which the score bottoms out.

export function scoreStroke(points: readonly Vec2[], template: readonly Vec2[]): number {
  const normalizedPoints = normalizeStroke(points);
  const normalizedTemplate = normalizeStroke(template);

  if (normalizedPoints.length === 0 || normalizedTemplate.length === 0) {
    return 0;
  }

  let totalDistance = 0;
  for (let index = 0; index < resampledPointCount; index += 1) {
    totalDistance += distance(normalizedPoints[index], normalizedTemplate[index]);
  }

  const averageDistance = totalDistance / resampledPointCount;
  return clamp(0, maxScore, maxScore * (1 - averageDistance / scoreDistanceLimit));
}

function normalizeStroke(points: readonly Vec2[]): Vec2[] {
  if (points.length === 0 || pathLength(points) === 0) {
    return [];
  }

  const resampled = resample(points, resampledPointCount);
  const box = boundingBox(resampled);
  const scale = Math.max(box.maxX - box.minX, box.maxY - box.minY);

  if (scale === 0) {
    return resampled.map(() => ({ x: 0, y: 0 }));
  }

  const centerX = box.minX + (box.maxX - box.minX) / 2;
  const centerY = box.minY + (box.maxY - box.minY) / 2;

  return resampled.map((point) => ({
    x: (point.x - centerX) / scale,
    y: (point.y - centerY) / scale,
  }));
}

function resample(points: readonly Vec2[], targetCount: number): Vec2[] {
  if (points.length === 1) {
    return Array.from({ length: targetCount }, () => points[0]);
  }

  const interval = pathLength(points) / (targetCount - 1);
  if (interval === 0) {
    return Array.from({ length: targetCount }, () => points[0]);
  }

  const out: Vec2[] = [points[0]];
  let previous = points[0];
  let accumulated = 0;

  for (let index = 1; index < points.length; index += 1) {
    let current = points[index];
    let segmentLength = distance(previous, current);

    while (accumulated + segmentLength >= interval && out.length < targetCount) {
      const t = (interval - accumulated) / segmentLength;
      const inserted = {
        x: previous.x + (current.x - previous.x) * t,
        y: previous.y + (current.y - previous.y) * t,
      };
      out.push(inserted);
      previous = inserted;
      segmentLength = distance(previous, current);
      accumulated = 0;
    }

    accumulated += segmentLength;
    previous = current;
  }

  while (out.length < targetCount) {
    out.push(points[points.length - 1]);
  }

  return out;
}

function pathLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index]);
  }
  return total;
}

function boundingBox(points: readonly Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}
