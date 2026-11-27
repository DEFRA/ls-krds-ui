export function buildNavigation(request) {
  const isSignedIn = Boolean(request?.auth?.isAuthenticated)

  return [
    {
      text: 'Home',
      href: '/',
      current: request?.path === '/'
    },
    {
      text: 'About',
      href: '/about',
      current: request?.path === '/about'
    },
    ...(isSignedIn
      ? [
          {
            text: 'Your profile',
            href: '/profile',
            current: request?.path === '/profile'
          },
          {
            text: 'Sign out',
            href: '/signout',
            current: request?.path === '/signout'
          }
        ]
      : [
          {
            text: 'Sign in',
            href: '/auth/login'
          }
        ])
  ]
}
