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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import viLocale from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useAuthStore } from '@/stores/auth-store'

import { VideoApiDocs } from '..'
import type { VideoDocPageId } from '../navigation'

let client: QueryClient

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  client.setQueryData(STATUS_QUERY_KEY, {
    server_address: 'https://gateway.example.com/proxy/',
  })
  useAuthStore.getState().auth.setUser(null)
  await i18next.changeLanguage('en')
})

afterEach(async () => {
  cleanup()
  client.clear()
  useAuthStore.getState().auth.setUser(null)
  await i18next.changeLanguage('en')
})

async function renderDocs(page: VideoDocPageId) {
  const root = createRootRoute({ component: Outlet })
  const route = createRoute({
    getParentRoute: () => root,
    path: '/docs/video/$page',
    component: () => <VideoApiDocs page={page} />,
  })
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [`/docs/video/${page}`] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await act(() => router.load())
  return router
}

it.each([
  ['ctyun-cdance', 'cdance2.0-0807'],
  ['millu-seedance', 'millu-sd-x-2-5-260801'],
  ['moma-seedance', 'doubao-seedance-2-0-260128'],
] as const)(
  'copies usable %s requests in every example language',
  async (provider, model) => {
    const user = userEvent.setup()
    await renderDocs(provider)
    const examples = within(
      screen.getByRole('region', { name: 'Request example' })
    )
    for (const language of ['cURL', 'Python', 'JavaScript']) {
      await user.click(examples.getByRole('tab', { name: language }))
      await user.click(examples.getByRole('button', { name: 'Copy code' }))
      const code = await navigator.clipboard.readText()
      expect(code).toContain(model)
      expect(code).toContain('https://gateway.example.com/proxy/v1')
      expect(code).not.toContain('/v1/v1')
      expect(code).toContain('720p')
      expect(code).toContain('16:9')
      expect(code).not.toMatch(/["']size["']\s*:/)
      expect(code).toContain('NEW_API_KEY')
      expect(code).not.toContain('YOUR_TASK_ID')
    }

    const imageExample = within(
      screen.getByRole('region', { name: 'Image to video' })
    )
    await user.click(imageExample.getByRole('button', { name: 'Copy code' }))
    expect(await navigator.clipboard.readText()).toContain(
      '"input_reference": "https://example.com/reference.png"'
    )
  }
)

it('switches all seven interface languages while keeping chapter ids and selected example language', async () => {
  const resources = { en, zhCN: zh, zhTW, fr, ja, ru, vi: viLocale }
  for (const [language, resource] of Object.entries(resources)) {
    i18next.addResourceBundle(
      language,
      'translation',
      resource.translation,
      true,
      true
    )
  }
  const user = userEvent.setup()
  await renderDocs('create')
  const examples = within(screen.getByRole('region', { name: 'Text to video' }))
  await user.click(examples.getByRole('tab', { name: 'Python' }))
  for (const [language, resource] of Object.entries(resources)) {
    await act(() => i18next.changeLanguage(language))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      resource.translation['Create a video task']
    )
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: resource.translation['Request parameters'],
      })
    ).toHaveAttribute('id', 'request-parameters')
    expect(
      examples.getByRole('tab', { name: 'Python', selected: true })
    ).toBeVisible()
  }
})

it('selects an example language and copies its code with the keyboard', async () => {
  const user = userEvent.setup()
  await renderDocs('create')
  const examples = within(screen.getByRole('region', { name: 'Text to video' }))
  examples.getByRole('tab', { name: 'cURL' }).focus()
  await user.keyboard('{ArrowRight}')
  expect(examples.getByRole('tab', { name: 'Python' })).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(
    examples.getByRole('tab', { name: 'Python', selected: true })
  ).toHaveFocus()
  examples.getByRole('button', { name: 'Copy code' }).focus()
  await user.keyboard('{Enter}')
  expect(await navigator.clipboard.readText()).toContain(
    'from urllib.request import Request, urlopen'
  )
})

it('changes document hashes through the chapter navigation and supports browser history', async () => {
  const user = userEvent.setup()
  const router = await renderDocs('retrieve')
  const outline = within(
    screen.getByRole('navigation', { name: 'On this page' })
  )
  await user.click(outline.getByRole('link', { name: 'Task status' }))
  expect(router.state.location.hash).toBe('task-status')
  await user.click(outline.getByRole('link', { name: 'Response fields' }))
  expect(router.state.location.hash).toBe('response-fields')
  await act(async () => router.history.back())
  expect(router.state.location.hash).toBe('task-status')
})

it.each([
  [undefined, '/docs', undefined, true],
  ['https://docs.example.com', 'https://docs.example.com', true, undefined],
])(
  'keeps the configured documentation destination (%s)',
  (docsLink, href, external, requiresAuth) => {
    client.setQueryData(STATUS_QUERY_KEY, { docs_link: docsLink })
    const result = renderHook(useTopNavLinks, {
      wrapper: (props) => (
        <QueryClientProvider client={client}>
          {props.children}
        </QueryClientProvider>
      ),
    })
    const link = result.result.current.find((entry) => entry.href === href)
    expect(link?.href).toBe(href)
    expect(link?.external).toBe(external)
    expect(link?.requiresAuth).toBe(requiresAuth)
  }
)
