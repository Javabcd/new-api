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
import { Buffer } from 'node:buffer'

import { expect, test } from '@playwright/test'

import type { TaskLog } from '../types'

test('a legacy video decoding failure downloads the original file across origins', async ({
  page,
  context,
}) => {
  const task: TaskLog = {
    id: 1,
    user_id: 701,
    platform: 'jimeng',
    task_id: 'task-legacy',
    action: 'text_to_video',
    channel_id: 1,
    group: 'default',
    quota: 0,
    submit_time: 1700000000,
    status: 'SUCCESS',
    legacy_video_available: true,
  }
  const contentUrl = `https://media.example.com/prefix/v1/tasks/${task.task_id}/artifacts/video/content?access=${'A'.repeat(43)}`
  const mediaBody = 'unsupported video'

  await context.addCookies([
    { name: 'new_api_has_session', value: '1', url: 'http://127.0.0.1:4173' },
  ])
  await page.addInitScript(() => {
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('i18nextLng', 'en')
  })
  await page.route('**/api/**', (route) => {
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
            data: { system_name: 'New API', logo: '/logo.png' },
          },
        })
      case '/api/user/auth/refresh':
        return route.fulfill({
          json: {
            success: true,
            data: {
              access_token: 'legacy-video-test-token',
              token_type: 'Bearer',
              access_expires_at: 4102444800,
              user: {
                id: 701,
                username: 'artifact-reader',
                role: 1,
                group: 'default',
              },
              session: {
                sid: 'legacy-video-test-session',
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
      case '/api/notice':
        return route.fulfill({ json: { success: true, data: '' } })
      case '/api/task/self':
        return route.fulfill({
          json: {
            success: true,
            data: { items: [task], total: 1, page: 1, page_size: 100 },
          },
        })
      case `/api/task/${task.task_id}/artifacts`:
        return route.fulfill({
          json: {
            success: true,
            data: { artifacts: [], legacy_content_url: contentUrl },
          },
        })
      default:
        throw new Error(`Unexpected API request: ${path}`)
    }
  })
  // The download opens a new target, whose first request needs context routing.
  await context.route('https://media.example.com/**', (route) => {
    const download =
      new URL(route.request().url()).searchParams.get('download') === '1'
    const headers: Record<string, string> = {
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    }
    if (download) {
      headers['Content-Disposition'] = 'attachment; filename="video"'
    }
    return route.fulfill({
      contentType: 'video/mp4',
      headers,
      body: mediaBody,
    })
  })
  await page.goto('/usage-logs/task')
  await page
    .getByRole('button', { name: 'Click to preview video', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'Your browser could not decode this video or does not support its format.'
  )

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.getByRole('button', { name: 'Download', exact: true }).click(),
  ])

  expect(download.url()).toBe(`${contentUrl}&download=1`)
  expect(download.suggestedFilename()).toBe('video')
  expect(await download.failure()).toBeNull()
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) {
    chunks.push(Buffer.from(chunk))
  }
  expect(Buffer.concat(chunks).toString()).toBe(mediaBody)
})
