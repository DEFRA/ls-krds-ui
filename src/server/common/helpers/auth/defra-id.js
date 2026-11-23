import { config } from '#/config/config.js'
import { createLogger } from '#/server/common/helpers/logging/logger.js'
import { createOidcClient } from './oidc-client.js'

const logger = createLogger()

let client = null

/**
 * The Defra ID OIDC client, built from config on first use so tests can set
 * config before anything reads it.
 * @returns {ReturnType<typeof createOidcClient>}
 */
export function getDefraIdClient() {
  client ??= createOidcClient({
    discoveryUrl: config.get('auth.oidc.discoveryUrl'),
    clientId: config.get('auth.oidc.clientId'),
    clientSecret: config.get('auth.oidc.clientSecret'),
    serviceId: config.get('auth.oidc.serviceId'),
    scope: config.get('auth.oidc.scope'),
    redirectUri: new URL(
      config.get('auth.oidc.redirectPath'),
      config.get('appBaseUrl')
    ).toString(),
    timeoutMs: config.get('auth.oidc.timeoutMs'),
    requireNonce: config.get('auth.oidc.requireNonce')
  })

  if (!config.get('auth.oidc.requireNonce')) {
    logger.warn(
      'OIDC_REQUIRE_NONCE is false: ID tokens without a nonce are accepted. Only for the Defra ID stub.'
    )
  }

  return client
}

/** Drops the cached client, so the next call rebuilds it from config. */
export function resetDefraIdClient() {
  client = null
}
