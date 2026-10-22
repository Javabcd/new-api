/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { expect, test, type Page } from '@playwright/test'

import en from '@/i18n/locales/en.json' with { type: 'json' }
import fr from '@/i18n/locales/fr.json' with { type: 'json' }
import ja from '@/i18n/locales/ja.json' with { type: 'json' }
import ru from '@/i18n/locales/ru.json' with { type: 'json' }
import vi from '@/i18n/locales/vi.json' with { type: 'json' }
import zhTW from '@/i18n/locales/zh-TW.json' with { type: 'json' }
import zhCN from '@/i18n/locales/zh.json' with { type: 'json' }

const languages = [
  { code: 'en', translation: en.translation },
  { code: 'fr', translation: fr.translation },
  { code: 'ru', translation: ru.translation },
  { code: 'zhCN', translation: zhCN.translation },
  { code: 'zhTW', translation: zhTW.translation },
  { code: 'ja', translation: ja.translation },
  { code: 'vi', translation: vi.translation },
] as const

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    switch (pathname) {
      case '/api/setup':
        return route.fulfill({
          json: { success: true, data: { status: true } },
        })
      case '/api/status':
        return route.fulfill({
          json: {
            success: true,
            data: {
              system_name: 'New API',
              logo: '/logo.png',
              HeaderNavModules: {
                pricing: { enabled: true, requireAuth: false },
              },
            },
          },
        })
      case '/api/home_page_content':
      case '/api/notice':
        return route.fulfill({ json: { success: true, data: '' } })
      case '/api/pricing':
        return route.fulfill({
          json: {
            success: true,
            data: [],
            vendors: [],
            group_ratio: {},
            usable_group: {},
            supported_endpoint: {},
            auto_groups: [],
          },
        })
      default:
        throw new Error(`Unexpected API request: ${pathname}`)
    }
  })
})

async function openHome(page: Page, language: string) {
  await page.addInitScript((code) => {
    localStorage.clear()
    localStorage.setItem('i18nextLng', code)
  }, language)
  await page.goto('/')
  // This link is rendered only after system configuration finishes loading.
  await expect(
    page.locator('header .mxy-mobile-nav a[href="/sign-up"]')
  ).toHaveCount(1)
}

for (const language of languages) {
  const widths = ['en', 'fr', 'ru'].includes(language.code)
    ? [320, 374, 375, 390]
    : [320]

  for (const width of widths) {
    test(`${width}px ${language.code}: keeps the menu and account links accessible`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 })
      await openHome(page, language.code)

      const header = page.locator('header')
      const trigger = header.getByRole('button', {
        name: language.translation['Toggle navigation menu'],
        exact: true,
        includeHidden: true,
      })
      await expect(trigger).toBeInViewport({ ratio: 1 })

      const registration = header.locator('.mxy-mobile-nav a[href="/sign-up"]')
      if (width < 375) {
        await expect(registration).toBeHidden()
      } else {
        await expect(registration).toBeVisible()
      }

      await trigger.click()
      const menu = page.getByRole('dialog')
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
      const signIn = menu.getByRole('button', {
        name: language.translation['Sign in'],
        exact: true,
      })
      const signUp = menu.getByRole('button', {
        name: language.translation['Sign up'],
        exact: true,
      })
      await expect(signIn).toBeVisible()
      await expect(signIn).toHaveAttribute('href', '/sign-in')
      await expect(signUp).toBeVisible()
      await expect(signUp).toHaveAttribute('href', '/sign-up')

      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
      await expect(trigger).toBeFocused()
    })
  }
}

test('1280px English: retains the desktop navigation and registration entry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openHome(page, 'en')

  const header = page.getByRole('banner')
  await expect(
    header.getByRole('button', {
      name: en.translation['Toggle navigation menu'],
    })
  ).toBeHidden()
  await expect(
    header.getByRole('link', { name: en.translation.Home, exact: true })
  ).toBeVisible()
  await expect(
    header.getByRole('button', {
      name: en.translation['Create a free account'],
      exact: true,
    })
  ).toBeVisible()
})

for (const path of ['/', '/pricing']) {
  for (const width of [390, 1280]) {
    test(`${path} at ${width}px: shows the complete brand beside the administrator update action`, async ({
      page,
      context,
    }) => {
      await context.addCookies([
        {
          name: 'new_api_has_session',
          value: '1',
          url: 'http://127.0.0.1:4173',
        },
      ])
      await page.addInitScript(() => {
        localStorage.clear()
        localStorage.setItem('i18nextLng', 'en')
      })
      await page.route('**/api/user/auth/refresh', (route) =>
        route.fulfill({
          json: {
            success: true,
            data: {
              access_token: 'brand-layout-test-token',
              token_type: 'Bearer',
              access_expires_at: 4102444800,
              user: { id: 1, username: 'layout-admin', role: 100 },
              session: {
                sid: 'brand-layout-test-session',
                current: true,
                login_method: 'password',
                ip: '127.0.0.1',
                user_agent: 'Playwright',
                created_at: 1700000000,
                last_active_at: 1700000000,
                expires_at: 4102444800,
              },
            },
          },
        })
      )
      await page.route(
        'https://api.github.com/repos/QuantumNous/new-api/releases?*',
        (route) => route.fulfill({ json: [] })
      )
      await page.route('**/api/rankings?*', (route) =>
        route.fulfill({
          json: {
            success: true,
            data: { models: [], vendors: [], top_movers: [] },
          },
        })
      )
      await page.setViewportSize({ width, height: 800 })
      await page.goto(path)
      const header = page.getByRole('banner')
      const update = header.getByRole('button', {
        name: /System updates, current version:/,
      })
      await expect(update).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const brand = header.locator('.mxy-brand-name')
      await expect(brand).toContainText('麦小云')
      await expect
        .poll(() =>
          brand.evaluate(
            (element) => element.scrollWidth <= element.clientWidth
          )
        )
        .toBe(true)
      await expect(update).toBeInViewport({ ratio: 1 })
      const brandBounds = await brand.boundingBox()
      const updateBounds = await update.boundingBox()
      if (!brandBounds || !updateBounds) {
        throw new Error('The brand or update action has no bounds')
      }
      expect(brandBounds.x + brandBounds.width).toBeLessThanOrEqual(
        updateBounds.x
      )
    })
  }
}

test.describe('multimodal card visibility', () => {
  test.use({
    reducedMotion: 'no-preference',
    viewport: { width: 320, height: 240 },
  })

  test('320x240 English: reveals all five modality cards with normal motion', async ({
    page,
  }) => {
    await openHome(page, 'en')

    const cards = page.locator('#modalities').getByRole('article')
    await expect(cards).toHaveCount(5)

    for (const card of await cards.all()) {
      const heading = card.getByRole('heading', { level: 3 })
      await heading.evaluate((element) =>
        element.scrollIntoView({ block: 'center', behavior: 'instant' })
      )
      await expect(heading).toBeInViewport({ ratio: 1 })
      await expect
        .poll(() =>
          card.evaluate((element) => {
            for (
              let current: Element | null = element;
              current;
              current = current.parentElement
            ) {
              if (getComputedStyle(current).opacity !== '1') return false
            }
            return true
          })
        )
        .toBe(true)
    }
  })
})
