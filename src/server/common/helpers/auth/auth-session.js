// Everything sign-in keeps in the yar session (stored in Redis or memory; the
// browser only holds an encrypted cookie naming the session).

const authFlowKey = 'auth-flow'
const authSessionKey = 'auth-session'

/**
 * @typedef {object} AuthFlow
 * @property {string} state
 * @property {string} nonce
 * @property {string} codeVerifier
 * @property {string} returnUrl
 */

/**
 * @typedef {object} AuthSession
 * @property {import('./claims.js').DefraIdUser} user
 * @property {string} idToken - Kept only to sign the user out of Defra ID.
 * @property {string} authenticatedAt
 */

/** @returns {AuthFlow | null} */
export function getAuthFlow(request) {
  return request.yar.get(authFlowKey) ?? null
}

/** @param {AuthFlow} authFlow */
export function setAuthFlow(request, authFlow) {
  request.yar.set(authFlowKey, authFlow)
}

export function clearAuthFlow(request) {
  request.yar.clear(authFlowKey)
}

/** @returns {AuthSession | null} */
export function getAuthSession(request) {
  return request.yar.get(authSessionKey) ?? null
}

/**
 * Starts a new session for the signed-in user. The old session is reset first
 * so a session id seen before sign-in is never carried into the signed-in
 * session (session fixation).
 * @param {AuthSession} authSession
 */
export function startAuthSession(request, authSession) {
  request.yar.reset()
  request.yar.set(authSessionKey, authSession)
}

/** Ends the session entirely: user, tokens and any half-finished sign-in. */
export function endAuthSession(request) {
  request.yar.reset()
}
