import { useEffect, useRef, useState } from "react";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Fades an element up into view the first time it crosses the viewport.
 * Generalizes the hero's feature-strip reveal to any element/threshold.
 */
export function useReveal({ threshold = 0.2 } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, inView];
}

/**
 * Reveals a list of items with a staggered delay once the container enters view.
 * Returns a ref for the container and a function to compute each item's transition-delay.
 */
export function useStaggerReveal({ threshold = 0.2, step = 0.08 } = {}) {
  const [ref, inView] = useReveal({ threshold });
  const delayFor = (index) => `${index * step}s`;
  return [ref, inView, delayFor];
}

/**
 * rAF-throttled scroll-linked offset for subtle parallax depth.
 * `speed` is the fraction of scroll distance the element trails by (0 = static, 0.2 = gentle drift).
 * Disabled entirely under prefers-reduced-motion.
 */
export function useParallax(speed = 0.15) {
  const ref = useRef(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    let rafId = null;

    function measure() {
      rafId = null;
      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight || document.documentElement.clientHeight;
      const center = rect.top + rect.height / 2 - viewportH / 2;
      setOffset(center * -speed);
    }

    function onScroll() {
      if (rafId === null) rafId = requestAnimationFrame(measure);
    }

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [speed]);

  return [ref, offset];
}

// The 8 unit vectors a directional pan can snap to, in angle order starting
// at east (0 rad) and stepping 45 degrees at a time: E, SE, S, SW, W, NW, N, NE.
const EIGHT_DIRECTIONS = [
  [1, 0], [1, 1], [0, 1], [-1, 1],
  [-1, 0], [-1, -1], [0, -1], [1, -1],
].map(([x, y]) => {
  const len = Math.hypot(x, y);
  return [x / len, y / len];
});

/**
 * Cursor-following pan, snapped to the 4 cardinal + 4 diagonal directions:
 * the pointer's angle from the element's center picks the nearest of the 8,
 * and the returned offset is a fixed-length shift in that direction — so
 * hovering near the left edge shifts left, near a corner shifts diagonally,
 * never a freely continuous drift. A small deadzone near dead-center holds
 * at (0, 0) so the direction doesn't flicker between octants. The caller is
 * expected to CSS-transition the transform for the glide between snaps.
 * Eases back to zero on mouse leave. No-ops on touch/coarse-pointer devices
 * and under prefers-reduced-motion, so it never fights the resting layout.
 */
export function useCursorParallax(maxShift = 20, deadzone = 0.12) {
  const ref = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const enabled =
    typeof window !== "undefined" &&
    !prefersReducedMotion() &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function onMouseMove(e) {
    if (!enabled || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;

    if (Math.hypot(nx, ny) < deadzone) {
      setOffset({ x: 0, y: 0 });
      return;
    }

    const angle = Math.atan2(ny, nx);
    const index = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
    const [dx, dy] = EIGHT_DIRECTIONS[index];
    setOffset({ x: dx * maxShift, y: dy * maxShift });
  }

  function onMouseLeave() {
    setOffset({ x: 0, y: 0 });
  }

  return [ref, offset, onMouseMove, onMouseLeave];
}

/**
 * Splits text into words for the mandatory tagline-reveal treatment: each word
 * transitions from a muted tone to full color, in reading order, once the
 * container crosses the trigger line. One IntersectionObserver on the
 * container; CSS handles the per-word stagger via transition-delay.
 */
export function useWordReveal() {
  const [ref, inView] = useReveal({ threshold: 0.4 });
  return [ref, inView];
}
