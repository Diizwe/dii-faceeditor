// Thin-plate spline in 2D: maps control points to 2D values (here displacements), solved once, evaluated anywhere.
export interface Tps { pts: [number, number][]; wx: Float64Array; wy: Float64Array; ax: number[]; ay: number[]; }

const U = (r2: number) => (r2 <= 1e-12 ? 0 : 0.5 * r2 * Math.log(r2));

export function solveTps(pts: [number, number][], vals: [number, number][], lambda = 1e-3): Tps {
  const n = pts.length, N = n + 3;
  const A = Array.from({ length: N }, () => new Float64Array(N + 2));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) A[i][j] = U((pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2) + (i === j ? lambda : 0);
    A[i][n] = 1; A[i][n + 1] = pts[i][0]; A[i][n + 2] = pts[i][1];
    A[n][i] = 1; A[n + 1][i] = pts[i][0]; A[n + 2][i] = pts[i][1];
    A[i][N] = vals[i][0]; A[i][N + 1] = vals[i][1];
  }
  // Gaussian elimination with partial pivoting, two right-hand sides
  for (let c = 0; c < N; c++) {
    let p = c; for (let r = c + 1; r < N; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c] || 1e-12;
    for (let r = c + 1; r < N; r++) { const f = A[r][c] / d; if (f === 0) continue; for (let k = c; k < N + 2; k++) A[r][k] -= f * A[c][k]; }
  }
  const sol = [new Float64Array(N), new Float64Array(N)];
  for (let k = 0; k < 2; k++) for (let r = N - 1; r >= 0; r--) { let v = A[r][N + k]; for (let c = r + 1; c < N; c++) v -= A[r][c] * sol[k][c]; sol[k][r] = v / (A[r][r] || 1e-12); }
  return { pts, wx: sol[0].slice(0, n), wy: sol[1].slice(0, n), ax: [sol[0][n], sol[0][n + 1], sol[0][n + 2]], ay: [sol[1][n], sol[1][n + 1], sol[1][n + 2]] };
}

export function evalTps(t: Tps, x: number, y: number): [number, number] {
  let vx = t.ax[0] + t.ax[1] * x + t.ax[2] * y, vy = t.ay[0] + t.ay[1] * x + t.ay[2] * y;
  for (let i = 0; i < t.pts.length; i++) { const u = U((x - t.pts[i][0]) ** 2 + (y - t.pts[i][1]) ** 2); vx += t.wx[i] * u; vy += t.wy[i] * u; }
  return [vx, vy];
}
