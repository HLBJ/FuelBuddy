/**
 * Mobile keyboards show "next" on text fields, but pressing it sends Enter, which
 * submits the surrounding <form>. This handler makes Enter move focus to the next
 * field and only lets the last field submit. Multi-line notes keep their newlines.
 *
 * Usage: <form @keydown.enter="advanceOnEnter" ...>
 */
export function advanceOnEnter(event) {
  const target = event.target
  if (!target || target.tagName === 'TEXTAREA') return
  const form = event.currentTarget
  const fields = [...form.querySelectorAll('input:not([type="hidden"]):not([disabled]), textarea:not([disabled])')]
    .filter((el) => el.offsetParent !== null)
  const index = fields.indexOf(target)
  if (index === -1 || index === fields.length - 1) return // last field: allow submit
  event.preventDefault()
  fields[index + 1].focus()
}
