// Open-redirect prevention utility.
//
// When the cookie banner form submits, it includes a returnUrl so the
// server can redirect the user back to the page they were on. An attacker
// could try to inject an external URL (e.g. https://evil.com or //evil.com)
// to redirect users off-site after accepting cookies.
//
// This function ensures the URL:
// - Is a string
// - Starts with "/" (relative to the current origin)
// - Does NOT start with "//" (protocol-relative URL, which would navigate
//   to an external domain)
// - Contains no backslash or control character: browsers read "/\evil.com"
//   as "//evil.com", and strip tabs and newlines before parsing
//
// Also used for the return URL after sign-in.

// eslint-disable-next-line no-control-regex
const UNSAFE_CHARACTERS = /[\\\u0000-\u001f\u007f]/

export function isSafeRedirect(url) {
  if (!url || typeof url !== 'string') {
    return false
  }
  return (
    url.startsWith('/') && !url.startsWith('//') && !UNSAFE_CHARACTERS.test(url)
  )
}

/**
 * @param {unknown} url
 * @param {string} [fallback='/']
 * @returns {string} the URL when it is a safe same-site path, else the fallback
 */
export function toSafeRedirect(url, fallback = '/') {
  return isSafeRedirect(url) ? url : fallback
}
