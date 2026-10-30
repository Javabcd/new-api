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

import type { VideoModel, VideoTask } from '../types'

const model: VideoModel = {
  plugin_key: 'layout',
  model: 'video',
  display_name: 'Layout video model',
  plugin_version: '1.0.0',
  available: true,
  capabilities: {
    supported_modes: ['text_to_video', 'image_to_video'],
    resolutions: ['720p'],
    ratios: ['16:9'],
    image_roles: ['reference_image'],
    duration_required: false,
    resolution_required: false,
    duration_input_min: 4,
    duration_input_max: 15,
    generate_audio: true,
    watermark: true,
  },
}
const tasks: VideoTask[] = Array.from({ length: 20 }, (_, index) => ({
  task_id: `task-${index + 1}`,
  plugin_key: model.plugin_key,
  model: model.model,
  status: 'SUCCESS',
  created_at: 1700000000,
  finish_time: 1700000010,
}))

test.beforeEach(async ({ page, context }) => {
  await context.addCookies([
    {
      name: 'new_api_has_session',
      value: '1',
      url: 'http://127.0.0.1:4173',
    },
  ])
  await page.addInitScript(() => {
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('i18nextLng', 'en')
  })
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    switch (path) {
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
              SidebarModulesAdmin: JSON.stringify({
                chat: { enabled: true, video_playground: true },
              }),
            },
          },
        })
      case '/api/user/auth/refresh':
        return route.fulfill({
          json: {
            success: true,
            data: {
              access_token: 'video-layout-test-token',
              token_type: 'Bearer',
              access_expires_at: 4102444800,
              user: {
                id: 701,
                username: 'layout-user',
                role: 1,
                group: 'default',
              },
              session: {
                sid: 'video-layout-test-session',
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
      case '/api/user/self/groups':
        return route.fulfill({
          json: {
            success: true,
            data: { default: { desc: 'Default', ratio: 1 } },
          },
        })
      case '/api/notice':
        return route.fulfill({ json: { success: true, data: '' } })
      default:
        throw new Error(`Unexpected API request: ${path}`)
    }
  })
  await page.route('**/pg/video/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    switch (path) {
      case '/pg/video/models':
        return route.fulfill({
          json: { success: true, data: { models: [model] } },
        })
      case '/pg/video/tasks':
        return route.fulfill({ json: { success: true, data: tasks } })
      case '/pg/video/submissions':
        return route.fulfill({ json: { success: true, data: [] } })
      default:
        throw new Error(`Unexpected video request: ${path}`)
    }
  })
})

async function openVideoPage(page: Page) {
  await page.goto('/video-playground')
  await page.getByRole('main').last().getByRole('combobox').click()
  await page
    .getByRole('option', { name: model.display_name, exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Prompt', exact: true })
  ).toBeVisible()
}

async function wheelVideoPage(page: Page, deltaY: number) {
  await page
    .getByRole('main')
    .last()
    .hover({ position: { x: 8, y: 8 } })
  await page.mouse.wheel(0, deltaY)
}

test('video generation links to the signed-in video API documentation', async ({
  page,
}) => {
  await page.goto('/video-playground')
  await page
    .getByRole('link', { name: 'Video API documentation', exact: true })
    .click()
  await expect(page).toHaveURL(/\/docs\/video\/overview$/)
  await expect(
    page.getByRole('heading', { name: 'Video API overview', exact: true })
  ).toBeVisible()
})

test('an unsupported video shows a readable hint and reachable actions on a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 600 })
  const contentUrl = `http://127.0.0.1:4173/v1/tasks/task-1/artifacts/video/content?access=${'A'.repeat(43)}`
  await page.route('**/api/task/task-1/artifacts', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          artifacts: [{ key: 'video', type: 'video', content_url: contentUrl }],
        },
      },
    })
  )
  await page.route('**/v1/tasks/task-1/artifacts/video/content**', (route) =>
    route.fulfill({ contentType: 'video/mp4', body: 'unsupported video' })
  )
  await page.goto('/video-playground')
  await page
    .getByRole('button', { name: 'Preview', exact: true })
    .first()
    .click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText(
    'Your browser could not decode this video or does not support its format.'
  )
  const download = page.getByRole('button', { name: 'Download', exact: true })
  await download.scrollIntoViewIfNeeded()
  await expect(download).toBeInViewport({ ratio: 1 })
  await expect(download).toHaveAttribute('href', contentUrl)
  const retry = alert.getByRole('button', { name: 'Retry', exact: true })
  await retry.scrollIntoViewIfNeeded()
  await expect(retry).toBeInViewport({ ratio: 1 })
  expect(
    await alert.evaluate(
      (element) => element.scrollWidth <= element.clientWidth
    )
  ).toBe(true)
})

for (const viewport of [
  { width: 1280, height: 480 },
  { width: 390, height: 480 },
]) {
  test(`${viewport.width}x${viewport.height}: wheel scrolling reaches the last task and pagination, then returns to the title`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await openVideoPage(page)
    const lastTask = page.getByRole('cell', { name: 'task-20', exact: true })
    await expect(lastTask).not.toBeInViewport()

    await wheelVideoPage(page, 10000)

    await expect(lastTask).toBeInViewport({ ratio: 1 })
    for (const name of ['Previous', 'Next', 'Refresh']) {
      await expect(
        page.getByRole('main').last().getByRole('button', { name, exact: true })
      ).toBeInViewport({ ratio: 1 })
    }

    await wheelVideoPage(page, -10000)

    await expect(
      page.getByRole('heading', { name: 'Video generation', exact: true })
    ).toBeInViewport({ ratio: 1 })
  })
}

test('shrinking the window keeps the last task and refresh action reachable by wheel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openVideoPage(page)
  await page.setViewportSize({ width: 1280, height: 480 })

  await wheelVideoPage(page, 10000)

  await expect(
    page.getByRole('cell', { name: 'task-20', exact: true })
  ).toBeInViewport({ ratio: 1 })
  await expect(
    page
      .getByRole('main')
      .last()
      .getByRole('button', { name: 'Refresh', exact: true })
  ).toBeInViewport({ ratio: 1 })
})

test('an empty task list keeps the empty state and refresh action reachable by wheel', async ({
  page,
}) => {
  await page.route('**/pg/video/tasks*', (route) =>
    route.fulfill({ json: { success: true, data: [] } })
  )
  await page.setViewportSize({ width: 1280, height: 480 })
  await openVideoPage(page)
  const emptyState = page.getByText('No tasks yet', { exact: true })
  await expect(emptyState).toBeVisible()

  await wheelVideoPage(page, 10000)

  await expect(emptyState).toBeInViewport({ ratio: 1 })
  await expect(
    page
      .getByRole('main')
      .last()
      .getByRole('button', { name: 'Refresh', exact: true })
  ).toBeInViewport({ ratio: 1 })
})
