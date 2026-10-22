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

const models = Array.from({ length: 81 }, (_, index) => ({
  id: index + 1,
  model_name: `catalog-model-${String(index + 1).padStart(3, '0')}`,
  vendor_id: (index % 2) + 1,
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 2,
  enable_groups: ['default', 'premium'],
  supported_endpoint_types: [index % 3 === 2 ? 'image-generation' : 'openai'],
}))
const catalog = {
  success: true,
  data: models,
  vendors: [
    { id: 1, name: 'OpenAI' },
    { id: 2, name: 'Anthropic' },
  ],
  group_ratio: { default: 1, premium: 2 },
  usable_group: {
    default: { desc: 'Default', ratio: 1 },
    premium: { desc: 'Premium', ratio: 2 },
  },
  supported_endpoint: {
    openai: { path: '/v1/chat/completions', method: 'POST' },
    'image-generation': { path: '/v1/images/generations', method: 'POST' },
  },
  auto_groups: [],
}

const manyProvidersCatalog = {
  ...catalog,
  vendors: Array.from({ length: 24 }, (_, index) => ({
    id: index + 1,
    name: `Catalog Provider ${String(index + 1).padStart(2, '0')}`,
  })),
  data: models.map((model, index) => ({
    ...model,
    vendor_id: (index % 24) + 1,
  })),
}

async function expectFirstCatalogModelVisible(page: Page) {
  await expect
    .poll(() =>
      page
        .locator('.mxy-compact-model')
        .first()
        .evaluate((element) => {
          const card = element.getBoundingClientRect()
          const filters = document
            .querySelector('.mxy-catalog-filter-section')
            ?.getBoundingClientRect()
          return {
            belowFilters: filters != null && card.top >= filters.bottom,
            withinViewport:
              card.top >= 0 &&
              card.bottom <= innerHeight &&
              card.left >= 0 &&
              card.right <= innerWidth,
            unobscured: element.contains(
              document.elementFromPoint(
                card.x + card.width / 2,
                card.y + card.height / 2
              )
            ),
          }
        })
    )
    .toEqual({
      belowFilters: true,
      withinViewport: true,
      unobscured: true,
    })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'))
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/setup') {
      return route.fulfill({ json: { success: true, data: { status: true } } })
    }
    if (path === '/api/status') {
      return route.fulfill({
        json: {
          success: true,
          data: {
            system_name: 'New API',
            logo: '/logo.png',
            HeaderNavModules: {
              pricing: { enabled: true, requireAuth: false },
              rankings: { enabled: false, requireAuth: false },
            },
          },
        },
      })
    }
    if (path === '/api/pricing') return route.fulfill({ json: catalog })
    if (path === '/api/perf-metrics/summary') {
      return route.fulfill({
        json: {
          success: true,
          data: { models: [], window_start: 1, window_end: 2 },
        },
      })
    }
    if (path === '/api/perf-metrics') {
      return route.fulfill({
        json: {
          success: false,
          message: 'No performance data in this fixture',
        },
      })
    }
    if (['/api/notice', '/api/home_page_content'].includes(path)) {
      return route.fulfill({ json: { success: true, data: '' } })
    }
    if (path === '/api/user/auth/refresh') {
      return route.fulfill({
        status: 401,
        json: { success: false, message: 'Authentication required' },
      })
    }
    throw new Error(`Unexpected API request: ${path}`)
  })
})

for (const [width, columns] of [
  [390, 1],
  [560, 1],
  [820, 2],
  [1040, 3],
  [1120, 3],
  [1440, 4],
]) {
  test(`${width}px: keeps compact catalog columns, filters and navigation within the viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/pricing')
    await expect(page.locator('.mxy-compact-model')).toHaveCount(40)
    await page.evaluate(() => document.fonts.ready)
    expect(
      await page
        .locator('.mxy-model-grid')
        .evaluate(
          (element) =>
            getComputedStyle(element).gridTemplateColumns.split(' ').length
        )
    ).toBe(columns)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    if (width === 390) {
      const toolbar = await page
        .locator('.mxy-catalog-result-toolbar')
        .boundingBox()
      if (!toolbar) throw new Error('The catalog toolbar has no bounds')
      expect(toolbar.height).toBeLessThanOrEqual(40)
    }
    const menu = page.getByRole('button', {
      name: 'Toggle navigation menu',
      exact: true,
    })
    if (width <= 1040) await expect(menu).toBeInViewport({ ratio: 1 })
    else await expect(menu).toBeHidden()
    await page
      .locator('.mxy-catalog-filter-section')
      .evaluate((element) => element.scrollIntoView({ block: 'start' }))
    const headerBounds = await page.getByRole('banner').boundingBox()
    const filterBounds = await page
      .locator('.mxy-catalog-filter-section')
      .boundingBox()
    if (!filterBounds || !headerBounds) {
      throw new Error('Catalog header or filters have no bounds')
    }
    expect(filterBounds.y).toBeGreaterThanOrEqual(
      headerBounds.y + headerBounds.height - 1
    )
  })
}

for (const viewport of [
  { width: 390, height: 480 },
  { width: 844, height: 390 },
]) {
  test(`${viewport.width}x${viewport.height}: dense sticky filters leave room for a complete model card`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.route('**/api/pricing', (route) =>
      route.fulfill({ json: manyProvidersCatalog })
    )
    await page.goto('/pricing')
    await expect(page.locator('.mxy-compact-model')).toHaveCount(40)
    await page.evaluate(() => document.fonts.ready)
    await page
      .getByRole('region', { name: 'Model results', exact: true })
      .evaluate((element) => element.scrollIntoView({ block: 'start' }))

    await expect
      .poll(() =>
        page
          .getByRole('region', {
            name: 'Search and filter models',
            exact: true,
          })
          .evaluate(
            (element) => innerHeight - element.getBoundingClientRect().bottom
          )
      )
      .toBeGreaterThanOrEqual(160)
    await expectFirstCatalogModelVisible(page)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
  })

  test(`${viewport.width}x${viewport.height}: keyboard navigation reaches clipped provider filters`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.route('**/api/pricing', (route) =>
      route.fulfill({ json: manyProvidersCatalog })
    )
    await page.goto('/pricing')
    await expect(page.locator('.mxy-compact-model')).toHaveCount(40)
    const providers = page.getByRole('group', {
      name: 'All Vendors',
      exact: true,
    })
    await providers.focus()
    await page.keyboard.press('Tab')
    for (const _provider of manyProvidersCatalog.vendors) {
      await page.keyboard.press('Tab')
    }
    const lastProvider = providers.getByRole('button', {
      name: /^Catalog Provider 24\s*3$/,
    })
    await expect(lastProvider).toBeFocused()
    await expect
      .poll(() =>
        lastProvider.evaluate((element) => {
          const bounds = element.getBoundingClientRect()
          return element.contains(
            document.elementFromPoint(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2
            )
          )
        })
      )
      .toBe(true)
    await page.keyboard.press('Enter')
    await expect(lastProvider).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.mxy-compact-model')).toHaveCount(3)
  })
}

test('deep scrolling then changing capability returns to the first forty model results', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/pricing')
  const cards = page.locator('.mxy-compact-model')
  await expect(cards).toHaveCount(40)
  await page
    .getByRole('button', { name: 'Show more models', exact: true })
    .click()
  await expect(cards).toHaveCount(80)
  await cards
    .last()
    .evaluate((element) => element.scrollIntoView({ block: 'end' }))
  expect(
    await cards
      .first()
      .evaluate((element) => element.getBoundingClientRect().bottom)
  ).toBeLessThan(0)
  const capability = page.getByRole('button', {
    name: 'Chat and reasoning',
    exact: true,
  })
  await expect(capability).toBeInViewport({ ratio: 1 })

  await capability.click()

  await expect(cards).toHaveCount(40)
  await expectFirstCatalogModelVisible(page)
})

test('reduced motion: hovering buttons and cards keeps them stationary', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/pricing')
  await expect(page.locator('.mxy-compact-model')).toHaveCount(40)
  for (const selector of [
    '.mxy-button',
    '.mxy-button-outline',
    '.mxy-compact-model',
  ]) {
    const element = page.locator(selector).first()
    await element.hover()
    await expect(element).toHaveCSS('transform', 'none')
  }
})

test('appends forty models, resets on capability changes, and preserves clipboard and details actions', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/pricing')
  const cards = page.locator('.mxy-compact-model')
  await expect(cards).toHaveCount(40)
  await page
    .getByRole('button', { name: 'Show more models', exact: true })
    .click()
  await expect(cards).toHaveCount(80)
  await page
    .getByRole('button', { name: 'Show more models', exact: true })
    .click()
  await expect(cards).toHaveCount(81)
  await expect(
    page.getByRole('button', { name: 'All models shown' })
  ).toBeDisabled()
  await page
    .getByRole('button', { name: 'Image generation', exact: true })
    .click()
  await expect(cards).toHaveCount(27)
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click()
  await expect(cards).toHaveCount(40)
  await cards.first().hover()
  await cards
    .first()
    .getByRole('button', { name: 'Copy model name', exact: true })
    .click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('catalog-model-001')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await cards
    .first()
    .getByRole('button', {
      name: 'View details for catalog-model-001',
      exact: true,
    })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('keeps display settings, advanced filters and table prices functional', async ({
  page,
}) => {
  await page.goto('/pricing')
  await page
    .getByRole('button', { name: 'Display settings', exact: true })
    .click()
  const settings = page.getByRole('dialog', {
    name: 'Display settings',
    exact: true,
  })
  await settings.getByRole('button', { name: '/1K', exact: true }).click()
  await expect(
    settings.getByRole('button', { name: '/1K', exact: true })
  ).toHaveAttribute('aria-pressed', 'true')
  await settings.getByRole('button', { name: 'Recharge', exact: true }).click()
  await expect(
    settings.getByRole('button', { name: 'Recharge', exact: true })
  ).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('button', { name: 'Display settings', exact: true })
  ).toBeFocused()
  await page
    .getByRole('button', { name: 'Advanced filters', exact: true })
    .click()
  const filters = page.getByRole('dialog', { name: 'Filter', exact: true })
  await filters.getByRole('button', { name: /premium/ }).click()
  await expect(
    filters.getByRole('button', { name: /premium/ })
  ).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Table view', exact: true }).click()
  await expect(page.getByRole('table')).toBeVisible()
  await expect(
    page.getByRole('table').getByText('catalog-model-001')
  ).toBeVisible()
})

test('390x480: reserves the remaining viewport for the menu and restores focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 480 })
  await page.goto('/pricing')
  await expect(page.locator('.mxy-compact-model')).toHaveCount(40)
  const trigger = page.getByRole('button', {
    name: 'Toggle navigation menu',
    exact: true,
  })
  await trigger.click()
  const menu = page.getByRole('dialog', { name: '麦小云', exact: true })
  await expect(menu).toBeVisible()
  const bounds = await menu.boundingBox()
  if (!bounds) throw new Error('The mobile menu has no bounds')
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(480.5)
  await expect(
    menu.getByRole('link', { name: 'About', exact: true })
  ).toHaveAttribute('href', '/#about')
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
})
