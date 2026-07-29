/* Site-wide motion: scroll-reveal for sections and [data-reveal], plus a hover-lift on
   card links. Pure inline-style manipulation so it survives the design's re-renders.
   Respects prefers-reduced-motion. */
(function () {
  var reduce = false;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { var el = e.target; el.style.opacity = "1"; el.style.transform = "none"; io.unobserve(el); }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -6% 0px" });

  function prep(el) {
    if (el.__tkzRev) return; el.__tkzRev = 1;
    if (reduce) return;
    var r = el.getBoundingClientRect();
    if (r.height === 0) { el.__tkzRev = 0; return; }         // not laid out yet
    var inView = r.top < (window.innerHeight * 0.92) && r.bottom > 0;
    if (inView) { el.style.opacity = "1"; return; }          // above the fold: show immediately
    el.style.opacity = "0";
    el.style.transform = "translateY(28px)";
    el.style.transition = "opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1)";
    el.style.willChange = "opacity, transform";
    io.observe(el);
  }

  function lift(a) {
    if (a.__tkzLift) return; a.__tkzLift = 1;
    var base = a.style.transition ? a.style.transition + ", " : "";
    a.style.transition = base + "transform .24s cubic-bezier(.2,.7,.2,1), box-shadow .24s ease";
    a.addEventListener("pointerenter", function () {
      a.style.transform = "translateY(-6px)";
      a.style.boxShadow = "0 18px 38px rgba(18,58,36,.18)";
    });
    a.addEventListener("pointerleave", function () { a.style.transform = "none"; a.style.boxShadow = ""; });
  }

  function scan() {
    document.querySelectorAll("section, [data-reveal]").forEach(prep);
    document.querySelectorAll('a[href*="Player.dc.html?id"], a[href*="Leagues.dc.html?lg"]').forEach(lift);
  }

  var pending = false;
  function tick() { if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; scan(); }); }

  if (document.readyState !== "loading") tick(); else document.addEventListener("DOMContentLoaded", tick);
  try {
    var mo = new MutationObserver(tick);
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
  setTimeout(tick, 250); setTimeout(tick, 800); setTimeout(tick, 1600);
})();
