import inert from '@hapi/inert'

import { home } from '../routes/home/index.js'
import { about } from '../routes/about/index.js'
import { health } from '../routes/health/index.js'
import { cookies } from '../routes/cookies/controller.js'
import { authRoutes } from '../routes/auth/index.js'
import { profile } from '../routes/profile/index.js'
import { serveStaticFiles } from './serve-static-files.js'
import { config } from '#/config/config.js'

/**
 * Makes a route registered by a third-party plugin public. Sign-in is the
 * server's default auth, and hapi applies it at request time to any route
 * that sets no auth of its own.
 */
function makeRoutePublic(server, method, path) {
  const route = server
    .table()
    .find((r) => r.method === method && r.path === path)

  if (route) {
    route.settings.auth = false
  }
}

export const router = {
  plugin: {
    name: 'router',
    async register(server) {
      await server.register([inert])
      // Health-check route. Used by platform to check if service is running, do not remove!
      await server.register([health])
      // Cookie consent & policy page
      await server.register([cookies])
      // Defra ID sign-in, callback and sign-out
      await server.register([authRoutes])

      // Application specific routes, add your own routes here
      await server.register([home, about, profile])

      // Static assets
      if (!config.get('isProduction') && !config.get('isTest')) {
        await (async () => {
          const createViteServer = (await import('vite')).createServer
          const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'custom'
          })

          await server.register({
            plugin: (await import('@defra/hapi-connect')).default,
            options: {
              path: '/public',
              middleware: [vite.middlewares]
            }
          })

          makeRoutePublic(server, '*', '/public/{param*}')
        })()
      } else {
        server.register(serveStaticFiles)
      }
    }
  }
}
