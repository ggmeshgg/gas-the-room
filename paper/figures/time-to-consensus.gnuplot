set terminal svg size 760,420 enhanced font "DejaVu Sans,14"
set output "figures/time-to-consensus.svg"

pc = 0.65

set title "Время до практического консенсуса q=0.90"
set xlabel "начальное p_0"
set ylabel "T(p_0 -> q)"
set xrange [0:1]
set yrange [0:30]
set grid
set key off

set arrow from pc, graph 0 to pc, graph 1 nohead dashtype 2 lw 2 lc rgb "#666666"
set label "p_c" at pc + 0.015, 27 tc rgb "#333333"
set label "замедление около неустойчивого порога" at 0.49, 23 tc rgb "#333333"

plot "figures/time-to-consensus.dat" using 1:2 with lines lw 3 lc rgb "#d34d3f"
