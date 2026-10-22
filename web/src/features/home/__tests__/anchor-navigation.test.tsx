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
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { Pricing } from '@/features/pricing'
import type { PricingData } from '@/features/pricing/types'
import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { Route as PricingRoute } from '@/routes/pricing'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { Home } from '..'
import type { HomePageContentResponse } from '../types'

// The unopened pricing details drawer imports a canvas renderer unsupported by jsdom.
vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))

const catalog: PricingData = {
  success: true,
  data: [],
  vendors: [],
  group_ratio: {},
  usable_group: {},
  supported_endpoint: {},
  auto_groups: [],
}
const originalSystemState = useSystemConfigStore.getState()
const scrollIntoView = vi.fn<HTMLElement['scrollIntoView']>()
let client: QueryClient
let homeResponse: Promise<{ data: HomePageContentResponse }>
let resolveHomeContent: (response: { data: HomePageContentResponse }) => void
let rejectHomeContent: (error: Error) => void

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.setUser(null)
  useSystemConfigStore.getState().setLoading(false)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(
    scrollIntoView
  )
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  client.setQueryData(STATUS_QUERY_KEY, {
    HeaderNavModules: {
      pricing: { enabled: true, requireAuth: false },
      rankings: { enabled: false },
    },
  })
  client.setQueryData(['pricing'], catalog)
  client.setQueryData(['notice'], { success: true, data: '' })
  client.setQueryData(['perf-metrics-summary', 24], {
    success: true,
    data: { models: [] },
  })
  homeResponse = new Promise((resolve, reject) => {
    resolveHomeContent = resolve
    rejectHomeContent = reject
  })
  vi.spyOn(api, 'get').mockImplementation((url) => {
    if (url !== '/api/home_page_content') {
      throw new Error(`Unexpected request: ${url}`)
    }
    return homeResponse
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.getState().auth.setUser(null)
  useSystemConfigStore.setState(originalSystemState)
  localStorage.clear()
})

async function renderPages(initialUrl: string) {
  const root = createRootRoute()
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: Home,
  })
  const pricing = createRoute({
    getParentRoute: () => root,
    path: '/pricing/',
    validateSearch: PricingRoute.options.validateSearch,
    component: Pricing,
  })
  const router = createRouter({
    routeTree: root.addChildren([home, pricing]),
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await act(() => router.load())
  return router
}

async function loadHomeContent(content = '') {
  await act(async () => {
    resolveHomeContent({ data: { success: true, data: content } })
    await homeResponse
  })
}

it.each([
  { source: 'CTA', name: 'Business cooperation', hash: 'business' },
  { source: 'footer', name: 'Quick start', hash: 'getting-started' },
  { source: 'footer', name: 'About us', hash: 'about' },
  { source: 'footer', name: 'Core capabilities', hash: 'capabilities' },
  { source: 'footer', name: 'Business cooperation', hash: 'business' },
  { source: 'footer', name: 'Contact information', hash: 'contact' },
])(
  'scrolls to $hash after delayed home content when the pricing $source link is followed',
  async ({ source, name, hash }) => {
    const user = userEvent.setup()
    const router = await renderPages('/pricing')
    const renderedHashes: string[] = []
    const unsubscribe = router.subscribe('onRendered', ({ toLocation }) => {
      renderedHashes.push(toLocation.hash)
    })
    const link =
      source === 'CTA'
        ? screen.getByRole('button', { name })
        : within(screen.getByRole('contentinfo')).getByRole('link', { name })

    await user.click(link)

    // Let the router finish its first hash-scroll attempt while the target is absent.
    await waitFor(() => expect(renderedHashes).toContain(hash))
    unsubscribe()
    expect(screen.getByText('Loading...')).toBeVisible()
    expect(document.querySelector(`#${hash}`)).not.toBeInTheDocument()
    scrollIntoView.mockClear()

    await loadHomeContent()

    const target = document.querySelector(`#${hash}`)
    expect(target).toBeInTheDocument()
    expect(scrollIntoView.mock.contexts).toContain(target)
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'start',
      behavior: 'auto',
    })
  }
)

it('scrolls to the requested section after opening a home hash URL directly', async () => {
  await renderPages('/#business')
  expect(screen.getByText('Loading...')).toBeVisible()

  await loadHomeContent()

  expect(scrollIntoView.mock.contexts).toContain(
    document.querySelector('#business')
  )
})

it('scrolls to a new hash while the marketing home is already mounted', async () => {
  const user = userEvent.setup()
  await renderPages('/#business')
  await loadHomeContent()
  scrollIntoView.mockClear()

  await user.click(
    within(screen.getByRole('contentinfo')).getByRole('link', {
      name: 'About us',
    })
  )

  await waitFor(() =>
    expect(scrollIntoView.mock.contexts).toContain(
      document.querySelector('#about')
    )
  )
})

it.each(['/', '/#missing-section'])(
  'does not scroll when %s has no matching home section',
  async (url) => {
    await renderPages(url)

    await loadHomeContent()

    expect(document.querySelector('#business')).toBeInTheDocument()
    expect(scrollIntoView).not.toHaveBeenCalled()
  }
)

it('shows a custom home page without scrolling to absent marketing sections', async () => {
  await renderPages('/#business')

  await loadHomeContent('## Custom landing page')

  expect(
    await screen.findByRole('heading', { name: 'Custom landing page' })
  ).toBeVisible()
  expect(document.querySelector('#business')).not.toBeInTheDocument()
  expect(scrollIntoView).not.toHaveBeenCalled()
})

it('scrolls to the requested section when a failed content request falls back to marketing home', async () => {
  await renderPages('/#business')

  await act(async () => {
    rejectHomeContent(new Error('Home content unavailable'))
    await homeResponse.catch(() => undefined)
  })

  expect(document.querySelector('#business')).toBeInTheDocument()
  expect(scrollIntoView.mock.contexts).toContain(
    document.querySelector('#business')
  )
})

it('keeps the scroll position when unrelated status data updates on marketing home', async () => {
  await renderPages('/#business')
  await loadHomeContent()
  scrollIntoView.mockClear()

  act(() => {
    client.setQueryData(STATUS_QUERY_KEY, {
      docs_link: 'https://docs.example.com',
    })
  })

  expect(document.querySelector('#business')).toBeInTheDocument()
  expect(scrollIntoView).not.toHaveBeenCalled()
})
