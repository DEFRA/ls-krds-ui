import { describe, test, expect } from 'vitest'
import { isSafeRedirect, toSafeRedirect } from './is-safe-redirect.js'

describe('isSafeRedirect', () => {
  test('returns true for a relative path', () => {
    expect(isSafeRedirect('/')).toBe(true)
  })

  test('returns true for a deeper relative path', () => {
    expect(isSafeRedirect('/search?q=test')).toBe(true)
  })

  test('returns false for an absolute URL', () => {
    expect(isSafeRedirect('https://evil.example.com')).toBe(false)
  })

  test('returns false for a protocol-relative URL', () => {
    expect(isSafeRedirect('//evil.example.com')).toBe(false)
  })

  test('returns false for null', () => {
    expect(isSafeRedirect(null)).toBe(false)
  })

  test('returns false for undefined', () => {
    expect(isSafeRedirect(undefined)).toBe(false)
  })

  test('returns false for empty string', () => {
    expect(isSafeRedirect('')).toBe(false)
  })

  test('returns false for non-string', () => {
    expect(isSafeRedirect(123)).toBe(false)
  })

  test('returns false for a backslash that browsers read as //', () => {
    expect(isSafeRedirect('/\\evil.example.com')).toBe(false)
  })

  test('returns false for a path with a control character', () => {
    expect(isSafeRedirect('/\t/evil.example.com')).toBe(false)
  })
})

describe('toSafeRedirect', () => {
  test('returns a safe path unchanged', () => {
    expect(toSafeRedirect('/profile?tab=1')).toBe('/profile?tab=1')
  })

  test('returns the fallback for an unsafe URL', () => {
    expect(toSafeRedirect('https://evil.example.com')).toBe('/')
  })

  test('returns the given fallback', () => {
    expect(toSafeRedirect(undefined, '/home')).toBe('/home')
  })
})
