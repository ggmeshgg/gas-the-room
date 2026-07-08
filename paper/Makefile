PAPER = main
FIGURES = \
	figures/phase-function.svg \
	figures/trajectories.svg \
	figures/time-to-consensus.svg \
	figures/protocol-loop.svg

.PHONY: all figures clean

all: $(PAPER).pdf

typst: $(PAPER)-typst.pdf

figures: $(FIGURES)

$(PAPER).pdf: $(PAPER).md $(FIGURES)
	pandoc $(PAPER).md \
		--from markdown+tex_math_dollars \
		--pdf-engine=lualatex \
		--resource-path=.:figures \
		-V mainfont="DejaVu Serif" \
		-V sansfont="DejaVu Sans" \
		-V monofont="DejaVu Sans Mono" \
		-o $(PAPER).pdf

$(PAPER).typ: $(PAPER).md $(FIGURES)
	pandoc $(PAPER).md \
		--from markdown+tex_math_dollars \
		--to typst \
		--resource-path=.:figures \
		-o $(PAPER).typ

$(PAPER)-typst.pdf: $(PAPER).typ $(FIGURES)
	typst compile $(PAPER).typ $(PAPER)-typst.pdf

figures/phase-function.svg: figures/phase-function.gnuplot
	gnuplot figures/phase-function.gnuplot

figures/trajectories.svg figures/time-to-consensus.svg: figures/generate-data.py figures/trajectories.gnuplot figures/time-to-consensus.gnuplot
	python3 figures/generate-data.py
	gnuplot figures/trajectories.gnuplot
	gnuplot figures/time-to-consensus.gnuplot

figures/protocol-loop.svg: figures/protocol-loop.dot
	dot -Tsvg figures/protocol-loop.dot -o figures/protocol-loop.svg

clean:
	rm -f $(PAPER).pdf $(PAPER).typ $(PAPER)-typst.pdf figures/*.svg figures/*.dat
