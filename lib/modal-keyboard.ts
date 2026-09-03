"use client"

import { useEffect } from "react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"

// ---------------------------------------------------------------------------
// Keyboard behaviour shared by the four Create/Edit modals (project and order).
//
// The modals are long forms, and a stray Enter used to submit them from
// whichever field happened to have focus — writing a half-finished record with
// no confirmation step. Saving is now only ever deliberate, through a Save
// button; Escape is the one key the modals still answer to.
// ---------------------------------------------------------------------------

/**
 * Closes the modal on Escape, from anywhere inside it and regardless of which
 * field has focus.
 *
 * Ignored while a save is in flight, matching the Cancel button (which is
 * disabled for the same reason): a record being written shouldn't be abandoned
 * halfway on a keystroke.
 */
export function useModalEscape(onClose: () => void, saving = false) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || saving) return
      event.preventDefault()
      onClose()
    }
    // On window rather than the modal element: Escape has to work even when
    // focus has left the form — a native select popup, say, or the close button.
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, saving])
}

/**
 * Swallows Enter anywhere inside a modal, so it can neither submit the form,
 * activate a button, nor trigger any other default action.
 *
 * Attach to the modal's outermost element rather than the <form>, so it also
 * covers the header — where the top Save and close buttons live outside the
 * form element.
 *
 * Space still activates a focused button, so the modals remain operable from
 * the keyboard alone.
 */
export function blockEnterKey(event: ReactKeyboardEvent) {
  if (event.key !== "Enter") return
  // An IME uses Enter to accept the candidate word it is offering. Swallowing
  // it there would make these forms unusable for Japanese, Chinese and Korean
  // input, and it can't submit anything while a composition is open anyway.
  if (event.nativeEvent.isComposing) return
  event.preventDefault()
  event.stopPropagation()
}
