// Theme doodles, drawn with rough.js. The same code pre-renders the static SVGs in
// _includes/doodles/ (node scripts/doodles.js).
(function (root) {
  var INK = '#1c1f3a';
  var DOODLES = {
    tickets: function (d, a) { [8, 42, 76].forEach(function (x, i) { d.p('M' + x + ' 26 h30 v11 a5 5 0 0 0 0 10 v11 h-30 v-11 a5 5 0 0 0 0 -10 z', i === 2 ? d.h(a) : {}); }); d.l(10, 74, 104, 74, { stroke: a }); d.p('M96 68 L106 74 L96 80', { stroke: a }); },
    alicebob: function (d, a) { [26, 94].forEach(function (x) { d.c(x, 28, 14); d.l(x, 35, x, 58); d.l(x, 58, x - 8, 74); d.l(x, 58, x + 8, 74); d.l(x - 10, 44, x + 10, 44); }); d.r(48, 34, 24, 16, d.h(a, { stroke: a })); d.p('M48 34 L60 44 L72 34', { stroke: a }); },
    crown: function (d, a) { d.p('M40 28 L45 8 L54 19 L61 4 L68 19 L77 8 L82 28 Z', d.h(a)); d.p('M44 36 Q54 32 58 42 L80 84', { strokeWidth: 3.8 }); d.l(62, 54, 42, 84, { strokeWidth: 3.8 }); },
    containers: function (d, a) { [[20, 46], [50, 46], [80, 46], [35, 24], [65, 24]].forEach(function (p, i) { d.r(p[0], p[1], 26, 20, i === 4 ? d.h(a) : {}); }); d.p('M10 68 L110 68 L100 82 L20 82 Z', { stroke: a }); },
    tree: function (d, a) { d.l(60, 22, 34, 50); d.l(60, 22, 86, 50); d.l(34, 50, 22, 76); d.l(34, 50, 46, 76); d.c(60, 22, 16, d.h(a)); [[34, 50], [86, 50], [22, 76], [46, 76]].forEach(function (p) { d.c(p[0], p[1], 12, d.s('#fff')); }); },
    braces: function (d, a) { d.p('M30 16 Q20 16 20 28 L20 40 Q20 46 12 46 Q20 46 20 52 L20 64 Q20 76 30 76', { strokeWidth: 3 }); d.l(42, 46, 62, 46, { stroke: a }); d.p('M56 40 L62 46 L56 52', { stroke: a }); d.r(72, 28, 36, 36, d.h(a)); },
    ring: function (d, a) { d.e(32, 32, 60, 58, { stroke: a, strokeWidth: 2.4, roughness: 1.6 }); },
    arrow: function (d, a) { d.p('M2 9 Q14 3 30 8', { strokeWidth: 1.8, stroke: a }); d.p('M24 3 L31 8 L24 13', { strokeWidth: 1.8, stroke: a }); },
  };
  function render(key, accent, seed) {
    var gen = root.rough.generator(), n = seed || 7, out = [];
    function o(x) { var b = { seed: n++, roughness: 1.3, bowing: 1.1, strokeWidth: 2.2, stroke: INK }; for (var k in x) b[k] = x[k]; return b; }
    function add(dr) { gen.toPaths(dr).forEach(function (p) { out.push('<path d="' + p.d + '" stroke="' + p.stroke + '" stroke-width="' + p.strokeWidth + '" fill="' + (p.fill || 'none') + '" stroke-linecap="round" stroke-linejoin="round"/>'); }); }
    var d = {
      l: function (a, b, c, e, x) { add(gen.line(a, b, c, e, o(x))); },
      p: function (s, x) { add(gen.path(s, o(x))); },
      r: function (a, b, w, h, x) { add(gen.rectangle(a, b, w, h, o(x))); },
      c: function (a, b, r, x) { add(gen.circle(a, b, r, o(x))); },
      e: function (a, b, w, h, x) { add(gen.ellipse(a, b, w, h, o(x))); },
      h: function (fill, x) { var b = { fill: fill, fillStyle: 'hachure', hachureGap: 5, fillWeight: 1.4 }; for (var k in x) b[k] = x[k]; return b; },
      s: function (fill) { return { fill: fill, fillStyle: 'solid' }; },
    };
    DOODLES[key](d, accent);
    return out.join('');
  }
  if (typeof module !== 'undefined') module.exports = { render: render, keys: Object.keys(DOODLES) };

})(typeof window !== 'undefined' ? window : global);
