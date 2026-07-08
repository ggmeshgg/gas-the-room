set terminal svg size 760,420 enhanced font "DejaVu Sans,14"
set output "figures/phase-function.svg"

lambda = 1.0
mu = 0.30
pc = 0.5 * (1 + mu / lambda)
f(x) = x * (1 - x) * (lambda * (2*x - 1) - mu)

set title "Поле скоростей: f(p)=dp/dt"
set xlabel "p = доля агентов с голосом X_1"
set ylabel "f(p)"
set xrange [0:1]
set yrange [-0.18:0.18]
set grid
set zeroaxis lw 1.5 lc rgb "#444444"
set key top left

set arrow from pc, graph 0 to pc, graph 1 nohead dashtype 2 lw 2 lc rgb "#666666"
set label sprintf("p_c = %.2f", pc) at pc + 0.02, 0.145 tc rgb "#333333"
set label "умирает" at 0.17, -0.075 tc rgb "#345a7a"
set label "каскад" at 0.78, 0.075 tc rgb "#a13d32"

plot f(x) lw 3 lc rgb "#d34d3f" title "lambda=1, mu=0.30"
