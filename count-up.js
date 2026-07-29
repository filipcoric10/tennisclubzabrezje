/* <count-up to="80" from="0" dur="1300" dec="0" prefix="" suffix=""> — animated number.
   Animates from `from` to `to` the first time it scrolls into view; re-animates if `to`
   changes (e.g. a result edit updates the points). Non-numeric `to` renders as plain text. */
(function () {
  var reduce = false;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target._run(); io.unobserve(e.target); } });
  }, { threshold: 0.25 });

  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  class CountUp extends HTMLElement {
    static get observedAttributes() { return ["to"]; }
    connectedCallback() {
      this._seen = false;
      var to = parseFloat(this.getAttribute("to"));
      if (isNaN(to)) { return; }                 // leave inner text as-is
      this._render(parseFloat(this.getAttribute("from")) || 0);
      if (reduce) { this._render(to); this._seen = true; return; }
      io.observe(this);
    }
    disconnectedCallback() { io.unobserve(this); cancelAnimationFrame(this._raf); }
    attributeChangedCallback(name, oldV, newV) {
      if (name === "to" && this._seen && !isNaN(parseFloat(newV))) this._run();
    }
    _fmt(v) {
      var dec = parseInt(this.getAttribute("dec") || "0", 10);
      var s = dec > 0 ? v.toFixed(dec) : String(Math.round(v));
      return (this.getAttribute("prefix") || "") + s + (this.getAttribute("suffix") || "");
    }
    _render(v) { this.textContent = this._fmt(v); }
    _run() {
      var to = parseFloat(this.getAttribute("to"));
      if (isNaN(to)) return;
      this._seen = true;
      var from = this._cur != null ? this._cur : (parseFloat(this.getAttribute("from")) || 0);
      var dur = parseInt(this.getAttribute("dur") || "1300", 10);
      var self = this, t0 = null;
      this.style.display = this.style.display || "inline-block";
      cancelAnimationFrame(this._raf);
      var step = function (ts) {
        if (t0 === null) t0 = ts;
        var k = Math.min(1, (ts - t0) / dur);
        var v = from + (to - from) * ease(k);
        self._cur = v; self._render(v);
        // subtle "roll" as it counts
        self.style.transform = "translateY(" + (1 - ease(k)) * 5 + "px)";
        self.style.opacity = 0.45 + 0.55 * ease(k);
        if (k < 1) self._raf = requestAnimationFrame(step);
        else { self._cur = to; self._render(to); self.style.transform = "none"; self.style.opacity = 1; }
      };
      this._raf = requestAnimationFrame(step);
    }
  }
  if (!customElements.get("count-up")) customElements.define("count-up", CountUp);
})();
