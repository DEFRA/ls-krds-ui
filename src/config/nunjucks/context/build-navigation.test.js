import { buildNavigation } from './build-navigation.js'

function mockRequest(options) {
  return { ...options }
}

const signInItem = { text: 'Sign in', href: '/auth/login' }

describe('#buildNavigation', () => {
  test('Should provide expected navigation details', () => {
    expect(
      buildNavigation(mockRequest({ path: '/non-existent-path' }))
    ).toEqual([
      {
        current: false,
        text: 'Home',
        href: '/'
      },
      {
        current: false,
        text: 'About',
        href: '/about'
      },
      signInItem
    ])
  })

  test('Should provide expected highlighted navigation details', () => {
    expect(buildNavigation(mockRequest({ path: '/' }))).toEqual([
      {
        current: true,
        text: 'Home',
        href: '/'
      },
      {
        current: false,
        text: 'About',
        href: '/about'
      },
      signInItem
    ])
  })

  test('Should offer the profile and sign out to a signed-in user', () => {
    expect(
      buildNavigation(
        mockRequest({ path: '/profile', auth: { isAuthenticated: true } })
      )
    ).toEqual([
      {
        current: false,
        text: 'Home',
        href: '/'
      },
      {
        current: false,
        text: 'About',
        href: '/about'
      },
      {
        current: true,
        text: 'Your profile',
        href: '/profile'
      },
      {
        current: false,
        text: 'Sign out',
        href: '/signout'
      }
    ])
  })
})
