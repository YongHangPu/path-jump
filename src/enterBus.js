export function subscribeEnter(handler) {
  let lastAt = 0

  const onEnter = (event) => {
    const detail = event.detail
    if (!detail || !detail.action || detail.at === lastAt) return
    lastAt = detail.at
    handler(detail.action)
  }

  window.addEventListener('utools-plugin-enter', onEnter)

  const pending = window.__utoolsEnter
  if (pending && pending.action) {
    lastAt = pending.at
    handler(pending.action)
  }

  return () => window.removeEventListener('utools-plugin-enter', onEnter)
}
