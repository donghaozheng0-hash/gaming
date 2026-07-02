export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

export function canvasToWorld(
  p: { x: number; y: number },
  opts: { canvas: { widthUnits: number; heightUnits: number }; worldUnitsPerCanvasUnit: number },
): WorldPoint {
  const units = opts.worldUnitsPerCanvasUnit;

  return {
    x: (p.x - opts.canvas.widthUnits / 2) * units,
    y: 0,
    z: (opts.canvas.heightUnits / 2 - p.y) * units,
  };
}
