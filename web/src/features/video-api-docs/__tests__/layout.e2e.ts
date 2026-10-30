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
import { expect, test } from '@playwright/test'

const DOCUMENT_LINKS = [
  ['Video API overview', '/docs/video/overview'],
  ['Create a video task', '/docs/video/create'],
  ['Query a video task', '/docs/video/retrieve'],
  ['Download a video', '/docs/video/content'],
  ['Best practices', '/docs/video/best-practices'],
  ['Video API troubleshooting', '/docs/video/troubleshooting'],
] as const

test.beforeEach(async ({ page, context }) => {
  await context.addCookies([
    { name: 'new_api_has_session', value: '1', url: 'http://127.0.0.1:4173' },
  ])
  await page.addInitScript(() => {
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('i18nextLng', 'en')
  })
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
            server_address: 'https://video.example.com',
            SidebarModulesAdmin: JSON.stringify({
              chat: { enabled: true, video_playground: false },
            }),
          },
        },
      })
    }
    if (path === '/api/user/auth/refresh') {
      return route.fulfill({
        json: {
          success: true,
          data: {
            access_token: 'docs-test-access-token',
            token_type: 'Bearer',
            access_expires_at: 4102444800,
            user: {
              id: 701,
              username: 'docs-reader',
              role: 1,
              group: 'default',
            },
            session: {
              sid: 'docs-test-session',
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
    }
    if (path === '/api/notice') {
      return route.fulfill({ json: { success: true, data: '' } })
    }
    throw new Error(`Unexpected API request: ${path}`)
  })
  await page.route('**/v1/**', () => {
    throw new Error('Documentation must not call generation APIs')
  })
})

test('anonymous document readers are redirected to sign-in with the original destination', async ({
  page,
}) => {
  await page.route('**/api/user/auth/refresh', (route) =>
    route.fulfill({
      status: 401,
      json: { success: false, message: 'Not authenticated' },
    })
  )
  await page.goto('/docs/video/moma-seedance')
  await expect(page).toHaveURL(/\/sign-in\?redirect=.*docs/)
})

test('document shortcuts resolve to the overview and invalid pages show not found', async ({
  page,
}) => {
  for (const path of ['/docs', '/docs/video']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/docs\/video\/overview$/)
    await expect(
      page.getByRole('heading', { name: 'Video API overview', exact: true })
    ).toBeVisible()
  }
  await page.goto('/docs/video/not-a-page')
  await expect(
    page.getByText('Oops! Page Not Found!', { exact: true })
  ).toBeVisible()
})

test('shows one best-practices menu in place of the provider guides', async ({
  page,
}) => {
  await page.goto('/docs/video/best-practices')
  const sidebar = page.locator('[data-sidebar="sidebar"]')
  await expect(
    sidebar.locator('[data-sidebar="menu-button"][href^="/docs/video/"]')
  ).toHaveCount(6)
  for (const [title, path] of DOCUMENT_LINKS) {
    await expect(
      sidebar.getByRole('link', { name: title, exact: true })
    ).toHaveAttribute('href', path)
  }
  await expect(
    sidebar.getByText('Video providers', { exact: true })
  ).toHaveCount(0)
  await expect(
    sidebar.getByRole('link', { name: 'Best practices', exact: true })
  ).toHaveAttribute('data-active')
  await expect(page.getByRole('article')).not.toContainText(
    /ctyun|millu|moma|cdance|seedance/i
  )
})

test('troubleshooting exposes unified endpoints without provider names or native routes', async ({
  page,
}) => {
  await page.goto('/docs/video/troubleshooting')
  const article = page.getByRole('article')
  await expect(article).not.toContainText(/ctyun|millu|moma|cdance|seedance/i)
  await expect(
    article.getByRole('heading', { name: 'Native API routes', exact: true })
  ).toHaveCount(0)
  await expect(
    article.getByRole('table', { name: 'Unified video endpoints', exact: true })
  ).toContainText('https://video.example.com/v1/videos/{id}/content')
})

for (const provider of ['ctyun-cdance', 'millu-seedance', 'moma-seedance']) {
  test(`redirects the legacy ${provider} guide to best practices without a back-navigation loop`, async ({
    page,
  }) => {
    await page.goto('/docs/video/overview')
    await expect(
      page.getByRole('heading', { name: 'Video API overview', exact: true })
    ).toBeVisible()
    await page.goto(`/docs/video/${provider}#models`)
    await expect(page).toHaveURL(
      '/docs/video/best-practices#provider-differences'
    )
    await expect(
      page.getByRole('heading', { name: 'Request compatibility', exact: true })
    ).toBeInViewport()
    await expect(
      page
        .locator('[data-sidebar="sidebar"]')
        .getByRole('link', { name: 'Best practices', exact: true })
    ).toHaveAttribute('data-active')
    await page.goBack()
    await expect(page).toHaveURL('/docs/video/overview')
  })
}

test('keeps the sidebar document selected after chapter navigation and browser history', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/docs/video/create')
  const sidebar = page.locator('[data-sidebar="sidebar"]')
  const createLink = sidebar.getByRole('link', {
    name: 'Create a video task',
    exact: true,
  })
  const retrieveLink = sidebar.getByRole('link', {
    name: 'Query a video task',
    exact: true,
  })
  await expect(createLink).toHaveAttribute('data-active')

  await page
    .getByRole('navigation', { name: 'On this page' })
    .getByRole('link', { name: 'Request parameters', exact: true })
    .click()
  await expect(page).toHaveURL(/\/docs\/video\/create#request-parameters$/)
  await expect(createLink).toHaveAttribute('data-active')

  await page.goBack()
  await expect(page).toHaveURL(/\/docs\/video\/create$/)
  await expect(createLink).toHaveAttribute('data-active')
  await page.goForward()
  await expect(page).toHaveURL(/\/docs\/video\/create#request-parameters$/)
  await expect(createLink).toHaveAttribute('data-active')

  await retrieveLink.click()
  await expect(page).toHaveURL(/\/docs\/video\/retrieve$/)
  await expect(retrieveLink).toHaveAttribute('data-active')
  await expect(createLink).not.toHaveAttribute('data-active')
})

test('desktop collapsed document navigation keeps icons visible and full titles available to pointer and keyboard users', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/docs/video/overview')
  const sidebar = page.locator('[data-slot="sidebar"][data-state]')
  await expect(sidebar).toHaveAttribute('data-state', 'expanded')
  await page
    .getByRole('button', { name: 'Toggle Sidebar', exact: true })
    .first()
    .click()
  await expect(sidebar).toHaveAttribute('data-state', 'collapsed')
  await expect(sidebar).toHaveAttribute('data-collapsible', 'icon')

  for (const [title, path] of DOCUMENT_LINKS) {
    const link = sidebar.getByRole('link', { name: title, exact: true })
    await expect(link).toHaveAttribute('href', path)
    await expect(link).toHaveCSS('width', '32px')
    await expect(link).toHaveCSS('height', '32px')
    const icon = link.locator('svg')
    await expect(icon).toBeVisible()
    await expect(icon).toHaveCSS('width', '16px')
    await expect(icon).toHaveCSS('height', '16px')
    expect(
      await icon.evaluate((element) => {
        const linkElement = element.closest('a')
        if (!linkElement) return false
        const iconBounds = element.getBoundingClientRect()
        const linkBounds = linkElement.getBoundingClientRect()
        return (
          iconBounds.left >= linkBounds.left &&
          iconBounds.right <= linkBounds.right &&
          iconBounds.top >= linkBounds.top &&
          iconBounds.bottom <= linkBounds.bottom
        )
      })
    ).toBe(true)
    await link.hover()
    const tooltip = page
      .locator('[data-slot="tooltip-content"]')
      .filter({ hasText: title })
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toHaveText(title)
  }

  await page.mouse.move(1000, 0)
  // Enter keyboard navigation mode; Safari skips links on Tab by default.
  await page.keyboard.press('Tab')
  const createLink = sidebar.getByRole('link', {
    name: 'Create a video task',
    exact: true,
  })
  await createLink.focus()
  await expect(createLink).toBeFocused()
  await expect(
    page
      .locator('[data-slot="tooltip-content"]')
      .filter({ hasText: 'Create a video task' })
  ).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/docs\/video\/create$/)
  await expect(createLink).toHaveAttribute('data-active')
})

test('desktop collapsed document navigation restored from a cookie survives reload and supports navigation and expansion', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await context.addCookies([
    { name: 'sidebar_state', value: 'false', url: 'http://127.0.0.1:4173' },
  ])
  await page.goto('/docs/video/overview')
  const sidebar = page.locator('[data-slot="sidebar"][data-state]')
  await expect(sidebar).toHaveAttribute('data-state', 'collapsed')
  await expect(sidebar).toHaveAttribute('data-collapsible', 'icon')
  await expect(
    sidebar.locator('[data-sidebar="menu-button"][href^="/docs/video/"] svg')
  ).toHaveCount(DOCUMENT_LINKS.length)

  await page.reload()
  await expect(sidebar).toHaveAttribute('data-state', 'collapsed')
  for (const [title, path] of DOCUMENT_LINKS) {
    const link = sidebar.getByRole('link', { name: title, exact: true })
    await expect(link.locator('svg')).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(path)
    await expect(link).toHaveAttribute('data-active')
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed')
  }

  await page
    .getByRole('button', { name: 'Toggle Sidebar', exact: true })
    .first()
    .click()
  await expect(sidebar).toHaveAttribute('data-state', 'expanded')
  for (const [title] of DOCUMENT_LINKS) {
    const link = sidebar.getByRole('link', { name: title, exact: true })
    await expect(link.locator('svg')).toBeVisible()
    await expect(link.getByText(title, { exact: true })).toBeVisible()
  }
})

test('desktop chapters scroll inside the console, update the outline and preserve hash history', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/docs/video/best-practices')
  const outline = page.getByRole('navigation', { name: 'On this page' })
  await outline
    .getByRole('link', { name: 'Request workflow', exact: true })
    .click()
  await expect(page).toHaveURL(/#workflow$/)
  await expect(
    page.getByRole('heading', { name: 'Request workflow', exact: true })
  ).toBeInViewport()
  await expect(
    outline.getByRole('link', { name: 'Request workflow', exact: true })
  ).toHaveAttribute('aria-current', 'location')
  expect(
    await page
      .getByTestId('video-doc-scroll')
      .evaluate((element) => element.scrollTop)
  ).toBeGreaterThan(0)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await outline
    .getByRole('link', { name: 'Media references', exact: true })
    .click()
  await page.goBack()
  await expect(page).toHaveURL(/#workflow$/)
  await expect(
    page.getByRole('heading', { name: 'Request workflow', exact: true })
  ).toBeInViewport()
  await outline
    .getByRole('link', { name: 'Retries and video storage', exact: true })
    .focus()
  await page.keyboard.press('Enter')
  await expect(
    outline.getByRole('link', {
      name: 'Retries and video storage',
      exact: true,
    })
  ).toHaveAttribute('aria-current', 'location')
  await page
    .getByRole('link', { name: 'Query a video task', exact: true })
    .first()
    .click()
  await expect(
    page.getByRole('heading', { name: 'Query a video task', exact: true })
  ).toBeVisible()
})

test('390px: tabbing to the parameter table lets arrow keys scroll its columns', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await page.goto('/docs/video/create')
  const heading = page.getByRole('heading', {
    name: 'Request parameters',
    exact: true,
  })
  const region = page
    .getByRole('region', { name: 'Request parameters', exact: true })
    .and(page.locator('[tabindex="0"]'))

  await heading.focus()
  await page.keyboard.press('Tab')
  await expect(region).toBeFocused()
  expect(
    await region.evaluate(
      (element) => element.scrollWidth > element.clientWidth
    )
  ).toBe(true)
  await page.keyboard.press('ArrowRight')
  await expect
    .poll(() => region.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0)
  const scrolledRight = await region.evaluate((element) => element.scrollLeft)
  await page.keyboard.press('ArrowLeft')
  await expect
    .poll(() => region.evaluate((element) => element.scrollLeft))
    .toBeLessThan(scrolledRight)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390)
})

for (const width of [390, 768]) {
  test(`${width}px: unified practices keep the comparison and code usable within the document`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 780 })
    await page.goto('/docs/video/best-practices')
    await expect(
      page.getByRole('heading', { name: 'Best practices', exact: true })
    ).toBeVisible()
    const toggle = page.getByRole('button', {
      name: 'On this page',
      exact: true,
    })
    await toggle.click()
    await page
      .getByRole('navigation', { name: 'On this page' })
      .getByRole('link', { name: 'Request compatibility', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Request compatibility', exact: true })
    ).toBeInViewport()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const tableRegion = page
      .getByRole('region', { name: 'Request compatibility', exact: true })
      .and(page.locator('[tabindex="0"]'))
    await tableRegion.focus()
    await page.keyboard.press('ArrowRight')
    await expect
      .poll(() => tableRegion.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0)
    const workflow = page.getByRole('region', {
      name: 'Request workflow',
      exact: true,
    })
    await workflow.getByRole('tab', { name: 'JavaScript', exact: true }).click()
    await expect(
      workflow.getByRole('tab', { name: 'JavaScript', selected: true })
    ).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(width)
  })

  for (const initialHash of ['', '#text-to-video']) {
    test(`${width}px: mobile chapter selection ${initialHash ? 'with the current hash' : 'with a new hash'} focuses its heading and continues tabbing through its controls`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 780 })
      await page.goto(`/docs/video/create${initialHash}`)
      await expect(
        page.getByRole('heading', {
          name: 'Create a video task',
          exact: true,
        })
      ).toBeVisible()
      const toggle = page.getByRole('button', {
        name: 'On this page',
        exact: true,
      })
      await toggle.focus()
      await page.keyboard.press('Enter')
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await page
        .getByRole('navigation', { name: 'On this page' })
        .getByRole('link', { name: 'Text to video', exact: true })
        .focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/#text-to-video$/)
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      const heading = page.getByRole('heading', {
        name: 'Text to video',
        exact: true,
      })
      await expect(heading).toBeFocused()
      await expect(heading).toBeInViewport()
      await page.keyboard.press('Tab')
      await expect(
        page
          .getByRole('region', { name: 'Text to video', exact: true })
          .getByRole('tab', { name: 'cURL', exact: true })
      ).toBeFocused()
    })
  }

  test(`${width}px: mobile outline and wide API examples remain usable without page overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 780 })
    await page.goto('/docs/video/create')
    await expect(
      page.getByRole('heading', { name: 'Create a video task', exact: true })
    ).toBeVisible()
    const toggle = page.getByRole('button', {
      name: 'On this page',
      exact: true,
    })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await page
      .getByRole('navigation', { name: 'On this page' })
      .getByRole('link', { name: 'Request parameters', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Request parameters', exact: true })
    ).toBeInViewport()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(width)
    const table = page.getByRole('table', {
      name: 'Request parameters',
      exact: true,
    })
    await expect(table).toBeVisible()
    const example = page.getByRole('region', {
      name: 'Text to video',
      exact: true,
    })
    await example.getByRole('tab', { name: 'JavaScript', exact: true }).click()
    await expect(
      example.getByRole('tab', { name: 'JavaScript', selected: true })
    ).toBeVisible()
    await page.getByTestId('video-doc-scroll').evaluate((element) => {
      element.scrollTop = 0
    })
    await page
      .getByRole('button', { name: 'Toggle Sidebar', exact: true })
      .first()
      .click()
    await expect(
      page.getByRole('link', { name: 'Query a video task', exact: true })
    ).toBeVisible()
  })
}

test('dark mode keeps the documentation content and navigation available', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/docs/video/content')
  await expect(
    page.getByRole('heading', { name: 'Download a video', exact: true })
  ).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: 'Download example', exact: true })
      .getByRole('button', { name: 'Copy code', exact: true })
  ).toBeVisible()
  await expect(
    page.getByText(
      'A task record does not guarantee permanent access to its video. An expired provider link may return HTTP 410.',
      { exact: true }
    )
  ).toBeVisible()
})
