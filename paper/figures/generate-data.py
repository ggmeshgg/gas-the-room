from __future__ import annotations

import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LAMBDA = 1.0
MU = 0.30
Q = 0.90
DT = 0.01
T_MAX = 30.0


def f(p: float) -> float:
    return p * (1.0 - p) * (LAMBDA * (2.0 * p - 1.0) - MU)


def integrate(p0: float) -> list[tuple[float, float]]:
    p = p0
    t = 0.0
    out: list[tuple[float, float]] = []
    while t <= T_MAX:
        out.append((t, p))
        # RK4 is overkill here, but it makes the plotted trajectories smooth.
        k1 = f(p)
        k2 = f(min(1.0, max(0.0, p + 0.5 * DT * k1)))
        k3 = f(min(1.0, max(0.0, p + 0.5 * DT * k2)))
        k4 = f(min(1.0, max(0.0, p + DT * k3)))
        p = min(1.0, max(0.0, p + DT * (k1 + 2*k2 + 2*k3 + k4) / 6.0))
        t += DT
    return out


def time_to_q(p0: float, q: float = Q) -> float | None:
    p = p0
    t = 0.0
    while t <= T_MAX:
        if p >= q:
            return t
        k1 = f(p)
        k2 = f(min(1.0, max(0.0, p + 0.5 * DT * k1)))
        k3 = f(min(1.0, max(0.0, p + 0.5 * DT * k2)))
        k4 = f(min(1.0, max(0.0, p + DT * k3)))
        p = min(1.0, max(0.0, p + DT * (k1 + 2*k2 + 2*k3 + k4) / 6.0))
        t += DT
    return None


def main() -> None:
    p0s = [0.20, 0.45, 0.66, 0.75, 0.85]
    with (ROOT / "trajectories.dat").open("w", encoding="utf-8") as fh:
        fh.write("# t " + " ".join(f"p0={p0:.2f}" for p0 in p0s) + "\n")
        series = [integrate(p0) for p0 in p0s]
        for i in range(len(series[0])):
            row = [series[0][i][0]] + [s[i][1] for s in series]
            fh.write(" ".join(f"{value:.6f}" for value in row) + "\n")

    pc = 0.5 * (1.0 + MU / LAMBDA)
    with (ROOT / "time-to-consensus.dat").open("w", encoding="utf-8") as fh:
        fh.write("# p0 T_to_q\n")
        for i in range(1, 101):
            p0 = i / 100
            t = time_to_q(p0)
            if t is not None:
                fh.write(f"{p0:.4f} {t:.6f}\n")
            elif p0 <= pc:
                fh.write(f"{p0:.4f} NaN\n")


if __name__ == "__main__":
    main()
