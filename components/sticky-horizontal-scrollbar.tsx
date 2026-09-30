"use client"

import { useEffect, useRef } from "react"
import type { RefObject } from "react"

/**
 * A horizontal scrollbar pinned to the bottom of the window for a table that is
 * wider than the screen.
 *
 * The table's own scrollbar sits under its last row, so with 500 rows on a page
 * reaching the far columns meant scrolling all the way down first. This bar
 * mirrors that scrollbar at the bottom of the window whenever the table's own
 * one is out of sight, and the two move together. Once the real scrollbar
 * scrolls into view, or the table fits the screen, this one hides.
 */
export function StickyHorizontalScrollbar({
  targetRef,
}: {
  /** The element that scrolls sideways (overflow-x: auto). */
  targetRef: RefObject<HTMLDivElement | null>
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const target = targetRef.current
    const bar = barRef.current
    const inner = innerRef.current
    if (!target || !bar || !inner) return

    const update = () => {
      const rect = target.getBoundingClientRect()
      const overflows = target.scrollWidth > target.clientWidth + 1
      // Some of the table is on screen, but its bottom edge — where its own
      // scrollbar lives — is below the fold.
      const show =
        overflows && rect.top < window.innerHeight - 40 && rect.bottom > window.innerHeight
      bar.style.left = `${rect.left}px`
      bar.style.width = `${rect.width}px`
      inner.style.width = `${target.scrollWidth}px`
      // Hidden rather than display:none, so it keeps its layout and its
      // scroll position can be set while it is out of sight.
      bar.style.visibility = show ? "visible" : "hidden"
      bar.style.pointerEvents = show ? "auto" : "none"
      if (bar.scrollLeft !== target.scrollLeft) bar.scrollLeft = target.scrollLeft
    }

    // Each side follows the other. Setting a scroll position it already has
    // fires no event, so the pair settles instead of echoing back and forth.
    const fromTarget = () => {
      if (bar.scrollLeft !== target.scrollLeft) bar.scrollLeft = target.scrollLeft
    }
    const fromBar = () => {
      if (target.scrollLeft !== bar.scrollLeft) target.scrollLeft = bar.scrollLeft
    }

    // Rows, hidden columns and filter chips all change the table's size.
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(target)
    if (target.firstElementChild) resizeObserver.observe(target.firstElementChild)

    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    target.addEventListener("scroll", fromTarget, { passive: true })
    bar.addEventListener("scroll", fromBar, { passive: true })

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
      target.removeEventListener("scroll", fromTarget)
      bar.removeEventListener("scroll", fromBar)
    }
  }, [targetRef])

  return (
    <div
      ref={barRef}
      aria-hidden="true"
      className="fixed bottom-0 z-40 overflow-x-scroll overflow-y-hidden"
      style={{
        visibility: "hidden",
        height: 16,
        backgroundColor: "#f8f8f8",
        borderTop: "1px solid #e5e5e5",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div ref={innerRef} style={{ height: 1 }} />
    </div>
  )
}
