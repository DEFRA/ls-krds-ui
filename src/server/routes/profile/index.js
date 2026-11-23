import { profileController } from './controller.js'

/**
 * The signed-in user's profile. Uses the server's default auth, so a
 * signed-out visitor is sent to sign in first.
 * These routes are registered in src/server/plugins/router.js.
 */
export const profile = {
  plugin: {
    name: 'profile',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/profile',
          ...profileController
        }
      ])
    }
  }
}
