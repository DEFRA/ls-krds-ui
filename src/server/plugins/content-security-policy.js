import Blankie from 'blankie'

import { config } from '#/config/config.js'

/**
 * Origins the sign-out form may redirect through. Browsers apply form-action
 * to every redirect that follows a form post, and POST /signout redirects to
 * the identity provider's end-session endpoint. Real Defra ID then redirects
 * through its issuer host, so those origins are added by config.
 * @returns {string[]}
 */
function signOutFormActionOrigins() {
  const origins = [
    new URL(config.get('auth.oidc.discoveryUrl')).origin,
    ...config.get('auth.oidc.signOutFormActionOrigins')
  ]

  return [...new Set(origins.filter(Boolean))]
}

/**
 * Manage content security policies.
 * @satisfies {import('@hapi/hapi').Plugin}
 */
const contentSecurityPolicy = {
  plugin: Blankie,
  options: {
    defaultSrc: ['self'],
    connectSrc: [
      'self',
      'wss',
      'data:',
      'https://www.google.com',
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
      'https://*.googletagmanager.com'
    ],
    imgSrc: ['self', 'data:'],
    mediaSrc: ['self'],
    frameSrc: ['https://www.googletagmanager.com'],
    fontSrc: ['self', 'data:'],
    objectSrc: ['none'],
    scriptSrc: [
      'self',
      "'sha256-GUQ5ad8JK5KmEWmROf3LZd9ge94daqNvd8xy9YS1iDw='",
      'https://*.googletagmanager.com',
      'https://*.google-analytics.com'
    ],
    styleSrc: ['self'],
    frameAncestors: ['none'],
    formAction: ['self', ...signOutFormActionOrigins()],
    manifestSrc: ['self'],
    generateNonces: true
  }
}

export { contentSecurityPolicy }
