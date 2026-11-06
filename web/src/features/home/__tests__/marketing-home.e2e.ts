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
import { expect, test as base, type Page } from '@playwright/test'

const test = base.extend<{ footerHtml: string }>({
  footerHtml: ['', { option: true }],
})

test.beforeEach(async ({ page, footerHtml }) => {
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'))
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/setup') {
      return route.fulfill({ json: { success: true, data: { status: true } } })
    }
    if (path === '/api/status') {
      return route.fulfill({
        json: {
          success: true,
          data: {
            server_address: 'https://gateway.example',
            footer_html: footerHtml,
            HeaderNavModules: {
              pricing: { enabled: true, requireAuth: false },
              rankings: { enabled: false },
            },
          },
        },
      })
    }
    if (path === '/api/pricing') {
      return route.fulfill({
        json: {
          success: true,
          data: [
            {
              id: 1,
              model_name: 'chat-model',
              vendor_id: 1,
              quota_type: 0,
              model_ratio: 1,
              completion_ratio: 2,
              enable_groups: ['default'],
              supported_endpoint_types: ['openai'],
            },
            {
              id: 2,
              model_name: 'image-model',
              vendor_id: 1,
              quota_type: 1,
              model_price: 0.1,
              model_ratio: 1,
              completion_ratio: 1,
              enable_groups: ['default'],
              supported_endpoint_types: ['image-generation'],
            },
            {
              id: 3,
              model_name: 'another-chat-model-with-a-long-version-name',
              vendor_id: 2,
              quota_type: 0,
              model_ratio: 1,
              completion_ratio: 1,
              enable_groups: ['default'],
              supported_endpoint_types: ['anthropic'],
            },
          ],
          vendors: [
            { id: 1, name: 'OpenAI' },
            { id: 2, name: 'Anthropic' },
          ],
          group_ratio: { default: 1 },
          usable_group: {},
          supported_endpoint: {},
          auto_groups: [],
        },
      })
    }
    if (path === '/api/notice' || path === '/api/home_page_content') {
      return route.fulfill({ json: { success: true, data: '' } })
    }
    throw new Error(`Unexpected API request: ${path}`)
  })
})

async function expectCompanyAnchorBelowHeader(page: Page, hash: string) {
  const target = page.locator(`#${hash}`)
  await expect(target).toBeInViewport()
  await expect
    .poll(async () => {
      const headerBottom = await page
        .getByRole('banner')
        .evaluate((element) => element.getBoundingClientRect().bottom)
      return target.evaluate(
        (element, bottom) => element.getBoundingClientRect().top - bottom,
        headerBottom
      )
    })
    .toBeGreaterThanOrEqual(0)
  if (hash === 'about') {
    await expect(
      target.getByText('Zhejiang Maixiaoyun Technology Co., Ltd.')
    ).toBeInViewport({ ratio: 1 })
    await expect(
      target.getByRole('link', { name: '138 5879 1566' })
    ).toBeInViewport({ ratio: 1 })
  }
}

for (const anchor of [
  { name: 'About us', hash: 'about' },
  { name: 'Business cooperation', hash: 'business' },
  { name: 'Contact information', hash: 'contact' },
]) {
  test(`390px: keeps #${anchor.hash} below the header when its footer link is clicked`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto('/')
    const footer = page
      .getByRole('contentinfo')
      .filter({ has: page.locator('#contact') })
    await expect(footer).toBeVisible()
    await page.evaluate(() => document.fonts.ready)

    await footer.getByRole('link', { name: anchor.name, exact: true }).click()

    await expect(page).toHaveURL(new RegExp(`/#${anchor.hash}$`))
    await expectCompanyAnchorBelowHeader(page, anchor.hash)
  })
}

test.describe('custom footer contact anchors', () => {
  test.use({ footerHtml: '<strong>Configured footer</strong>' })

  for (const hash of ['about', 'business', 'contact']) {
    test(`390px: keeps #${hash} visible below the header when its hash URL is opened with a custom footer`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 900 })

      await page.goto(`/#${hash}`)

      const footer = page
        .getByRole('contentinfo')
        .filter({ has: page.locator('#contact') })
      await expect(footer.getByText('Configured footer')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await expectCompanyAnchorBelowHeader(page, hash)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true)
    })
  }
})

for (const width of [390, 768, 1080, 1440]) {
  test(`${width}px: shows the gateway illustration, live models and footer contacts without horizontal overflow`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(
      page.getByRole('banner').locator('.mxy-brand-name')
    ).toHaveAttribute('title', '麦小云官网')
    await expect(page.locator('#top .mxy-lead')).toContainText(
      '麦小云官网 AIMXY'
    )
    await expect(page.getByLabel('Token usage preview')).toBeVisible()
    await expect(page.getByLabel('Token usage preview')).toContainText(
      'Demo preview'
    )
    await expect(page.locator('img[src*="/maixiaoyun/images/"]')).toHaveCount(0)
    await expect(
      page.getByRole('group', { name: 'Featured models' }).getByRole('link')
    ).toHaveCount(3)
    await expect(
      page.getByRole('group', { name: 'Model results' }).getByRole('link')
    ).toHaveCount(3)
    const footer = page
      .getByRole('contentinfo')
      .filter({ has: page.locator('#contact') })
    await expect(
      footer.getByRole('img', { name: '麦小云官网', exact: true })
    ).toBeVisible()
    await expect(
      footer.getByRole('link', { name: '138 5879 1566' })
    ).toHaveAttribute('href', 'tel:13858791566')
    await expect(
      footer.getByRole('link', { name: '13858791566@139.com' })
    ).toHaveAttribute('href', 'mailto:13858791566@139.com')
    await expect(
      footer.getByRole('link', { name: 'New API', exact: true })
    ).toHaveAttribute('href', 'https://github.com/QuantumNous/new-api')
    await page.evaluate(() => document.fonts.ready)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath('home.png'),
      fullPage: true,
    })
  })
}

test('filters the model wall, expands FAQ with the keyboard and copies the selected SDK example', async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  const wall = page.getByRole('group', { name: 'Model results' })
  await expect(wall.getByRole('link')).toHaveCount(3)
  await page
    .getByRole('button', { name: 'Image generation', exact: true })
    .click()
  await expect(wall.getByRole('link')).toHaveCount(1)
  await expect(
    wall.getByRole('link', { name: 'image-model', exact: true })
  ).toHaveAttribute('href', '/pricing/image-model')
  const question = page.getByRole('button', {
    name: 'Do I need to change my SDK?',
  })
  await question.focus()
  await page.keyboard.press('Enter')
  await expect(question).toHaveAttribute('aria-expanded', 'true')
  const sdkAnswer = page.getByText('Reuse an OpenAI-compatible SDK.', {
    exact: false,
  })
  await expect(sdkAnswer).toBeVisible()
  await expect(sdkAnswer).toContainText('https://gateway.example/v1')
  await expect(sdkAnswer).not.toContainText('Anthropic')
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  const panel = page.getByRole('tabpanel')
  await expect(panel).toContainText('https://gateway.example/v1')
  await panel.getByRole('button', { name: 'Copy code' }).click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('from openai import OpenAI')
  await page.getByRole('button', { name: 'Page tools', exact: true }).click()
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Dark', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.screenshot({
    path: testInfo.outputPath('home-dark.png'),
    fullPage: true,
  })
})
