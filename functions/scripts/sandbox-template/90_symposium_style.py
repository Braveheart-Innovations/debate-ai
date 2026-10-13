# Symposium house style for Plotly and Graphviz. IPython runs this at every kernel
# start; matplotlib's half is the default matplotlibrc.
# Mirrors the report's Vega-Lite config (symposium-ai-web vegaChart.ts).
import os as _sym_style_os

# kaleido (fig.write_image) and great_tables (GT.gtsave) drive the distro Chromium
# baked into the template.
_sym_style_os.environ.setdefault('BROWSER_PATH', '/usr/bin/chromium')
_sym_style_os.environ.setdefault('CHROME_PATH', '/usr/bin/chromium')


def _sym_plotly_template():
    import plotly.graph_objects as go
    import plotly.io as pio

    font = 'Inter, Noto Sans CJK JP, sans-serif'
    axis = dict(
        gridcolor='#e2e8f0', linecolor='#cbd5e1', tickcolor='#cbd5e1', zerolinecolor='#cbd5e1',
        tickfont=dict(color='#475569', size=11), title=dict(font=dict(color='#334155', size=12)),
    )
    template = go.layout.Template(pio.templates['plotly_white'])
    template.layout.update(
        font=dict(family=font, color='#334155', size=12),
        title=dict(font=dict(family=font, color='#0f172a', size=16), x=0, xanchor='left', xref='paper'),
        colorway=['#0E9594', '#4888F8', '#ea580c', '#10A37F', '#7c3aed', '#a16207', '#db2777', '#4f46e5'],
        paper_bgcolor='white', plot_bgcolor='white',
        xaxis=axis, yaxis=axis,
        legend=dict(font=dict(color='#475569', size=11)),
    )
    pio.templates['symposium'] = template
    pio.templates.default = 'symposium'
    # Image export runs offline: MathJax and geo topojson from the template, not CDNs.
    pio.defaults.mathjax = 'file:///opt/mathjax/MathJax.js?config=TeX-AMS-MML_SVG'
    pio.defaults.topojson = 'file:///opt/plotly-topojson/'


def _sym_graphviz_defaults():
    # Graphviz (symposium-analyze-v3 and later) in the report's typeface and sharp enough
    # to print, as defaults the code can override. dot's -N/-E/-G flags beat what the
    # file says, so Inter goes into each top-level graph's source instead. Raster output
    # gets -Gresolution=150: dot reads dpi before resolution, so a dpi the code sets still
    # wins, and SVG keeps its size (both attributes scale SVG).
    import graphviz.backend.dot_command as dot_command
    import graphviz.graphs as graphs

    init = graphs.BaseGraph.__init__

    def house_init(self, *args, **kwargs):
        init(self, *args, **kwargs)
        if self.strict is not None:  # subgraphs (strict=None) inherit from their parent
            for attrs in (self.graph_attr, self.node_attr, self.edge_attr):
                attrs.setdefault('fontname', 'Inter')

    command = dot_command.command

    def house_command(engine, format_, **kwargs):
        cmd = command(engine, format_, **kwargs)
        if format_ in ('png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tif', 'tiff'):
            cmd.append('-Gresolution=150')
        return cmd

    graphs.BaseGraph.__init__ = house_init
    dot_command.command = house_command


for _sym_style in (_sym_plotly_template, _sym_graphviz_defaults):
    try:
        _sym_style()
    except Exception:  # a broken style must never stop the kernel from starting
        pass
del _sym_plotly_template, _sym_graphviz_defaults, _sym_style
