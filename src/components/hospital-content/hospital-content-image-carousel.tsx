"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";

/** Arrow keys move one slide and Home/End jump to the ends; other keys are left to the browser. */
export function carouselIndexForKey(key: string, index: number, count: number): number | null {
  const next = key === "ArrowRight" ? index + 1 : key === "ArrowLeft" ? index - 1 : key === "Home" ? 0 : key === "End" ? count - 1 : null;
  if (next === null) return null;
  return Math.min(count - 1, Math.max(0, next));
}

export function HospitalContentImageCarousel({ imageIds, title }: { imageIds: readonly string[]; title: string }): React.JSX.Element | null {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = imageIds.length;
  if (count === 0) return null;

  const slideClass = "relative aspect-[4/3] w-full shrink-0 snap-center snap-always overflow-hidden bg-surface-muted";
  const imageClass = "h-full w-full object-contain";
  const imageSource = (imageId: string): string => `/api/hospital-content/images/${imageId}`;

  if (count === 1) {
    return (
      <figure className="mt-5 min-w-0 overflow-hidden rounded-panel border border-border">
        <div className={slideClass}>
          {/* eslint-disable-next-line @next/next/no-img-element -- authorized per-user image route (cookie auth, private no-store, signed-URL redirect); the shared Next optimizer cache must not serve it */}
          <img alt={`${title} ภาพที่ 1`} className={imageClass} decoding="async" loading="lazy" src={imageSource(imageIds[0] as string)} />
        </div>
      </figure>
    );
  }

  function goTo(target: number): void {
    const track = trackRef.current;
    const clamped = Math.min(count - 1, Math.max(0, target));
    setIndex(clamped);
    if (!track) return;
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: clamped * track.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
  }

  function handleScroll(): void {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setIndex(Math.min(count - 1, Math.max(0, Math.round(track.scrollLeft / track.clientWidth))));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const target = carouselIndexForKey(event.key, index, count);
    if (target === null) return;
    event.preventDefault();
    goTo(target);
  }

  return (
    <section aria-label={`ภาพประกอบ ${title}`} aria-roledescription="carousel" className="mt-5 min-w-0">
      <div className="overflow-hidden rounded-panel border border-border">
        <div
          aria-label={`ภาพประกอบ ${title} ใช้ปุ่มลูกศรซ้ายขวาเพื่อเปลี่ยนภาพ`}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] motion-safe:scroll-smooth focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring [&::-webkit-scrollbar]:hidden"
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          ref={trackRef}
          role="group"
          tabIndex={0}
        >
          {imageIds.map((imageId, slideIndex) => (
            <div aria-label={`ภาพที่ ${slideIndex + 1} จาก ${count}`} aria-roledescription="slide" className={slideClass} key={imageId} role="group">
              {/* eslint-disable-next-line @next/next/no-img-element -- authorized per-user image route (cookie auth, private no-store, signed-URL redirect); the shared Next optimizer cache must not serve it */}
              <img alt={`${title} ภาพที่ ${slideIndex + 1}`} className={imageClass} decoding="async" loading="lazy" src={imageSource(imageId)} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Button aria-label="ภาพก่อนหน้า" disabled={index === 0} onClick={() => goTo(index - 1)} size="compact" type="button" variant="secondary">
          ก่อนหน้า
        </Button>
        <p aria-live="polite" className="min-w-12 text-center text-sm font-medium text-text">{index + 1}/{count}</p>
        <Button aria-label="ภาพถัดไป" disabled={index === count - 1} onClick={() => goTo(index + 1)} size="compact" type="button" variant="secondary">
          ถัดไป
        </Button>
      </div>
    </section>
  );
}
