set terminal svg size 760,420 enhanced font "DejaVu Sans,14"
set output "figures/trajectories.svg"

set title "Траектории p(t): ниже порога сигнал исчезает, выше порога растет"
set xlabel "t"
set ylabel "p(t)"
set xrange [0:30]
set yrange [0:1]
set grid
set key outside right

plot \
  "figures/trajectories.dat" using 1:2 with lines lw 3 lc rgb "#345a7a" title "p0=0.20", \
  "" using 1:3 with lines lw 3 lc rgb "#6f7d8c" title "p0=0.45", \
  "" using 1:4 with lines lw 3 lc rgb "#d6a33a" title "p0=0.66", \
  "" using 1:5 with lines lw 3 lc rgb "#d96c47" title "p0=0.75", \
  "" using 1:6 with lines lw 3 lc rgb "#d34d3f" title "p0=0.85"
