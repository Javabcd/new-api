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

import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { Route as PricingRoute } from '@/routes/pricing'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { Pricing } from '..'
import type { PricingData } from '../types'

// The unopened details drawer imports a canvas renderer unsupported by jsdom.
vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))

const catalog: PricingData = {
  success: true,
  data: [
    {
      id: 1,
      model_name: 'ranked-model',
      supported_endpoint_types: ['openai'],
      vendor_id: 1,
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 1,
      enable_groups: ['default'],
    },
    {
      id: 2,
      model_name: 'rising-model',
      supported_endpoint_types: ['image-generation'],
      vendor_id: 1,
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 1,
      enable_groups: ['default'],
    },
    {
      id: 3,
      model_name: 'other-model',
      vendor_id: 2,
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 1,
      enable_groups: ['default'],
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
}

let client: QueryClient
const originalSystemState = useSystemConfigStore.getState()
const scrollIntoView = vi.fn<HTMLElement['scrollIntoView']>()

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(
    scrollIntoView
  )
  localStorage.clear()
  useAuthStore.getState().auth.setUser(null)
  useSystemConfigStore.getState().setLoading(false)
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  client.setQueryData(STATUS_QUERY_KEY, {
    HeaderNavModules: {
      pricing: { enabled: true, requireAuth: false },
      rankings: { enabled: true, requireAuth: false },
    },
  })
  client.setQueryData(['pricing'], catalog)
  client.setQueryData(['notice'], { success: true, data: '' })
  client.setQueryData(['perf-metrics-summary', 24], {
    success: true,
    data: { models: [] },
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.getState().auth.setUser(null)
  useSystemConfigStore.setState(originalSystemState)
  localStorage.clear()
})

async function renderPricing(initialUrl = '/pricing') {
  const root = createRootRoute()
  const pricing = createRoute({
    getParentRoute: () => root,
    path: '/pricing/',
    validateSearch: PricingRoute.options.validateSearch,
    component: Pricing,
  })
  const router = createRouter({
    routeTree: root.addChildren([pricing]),
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await act(() => router.load())
  await screen.findByRole('textbox', { name: 'Search models' })
  return router
}

it('preserves the initial scroll position when a capability URL loads', async () => {
  await renderPricing('/pricing?capability=image')

  expect(
    within(screen.getByRole('region', { name: 'Model results' })).getByRole(
      'heading',
      { name: 'rising-model' }
    )
  ).toBeVisible()
  expect(scrollIntoView).not.toHaveBeenCalled()
})

it('scrolls to the committed results after a debounced search without moving input focus', async () => {
  const user = userEvent.setup()
  await renderPricing()
  const input = screen.getByRole('textbox', { name: 'Search models' })
  const results = screen.getByRole('region', { name: 'Model results' })

  await user.type(input, 'ranked-model')

  await waitFor(() => {
    expect(within(results).getAllByRole('heading', { level: 3 })).toHaveLength(
      1
    )
    expect(
      within(results).getByRole('heading', { name: 'ranked-model' })
    ).toBeVisible()
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'start',
      behavior: 'auto',
    })
  })
  expect(scrollIntoView.mock.contexts[0]).toBe(results)
  expect(input).toHaveFocus()
})

it('preserves the scroll position when more models are appended', async () => {
  client.setQueryData(['pricing'], {
    ...catalog,
    data: Array.from({ length: 41 }, (_, index) => ({
      ...catalog.data[0],
      id: index + 1,
      model_name: `model-${index + 1}`,
    })),
  })
  const user = userEvent.setup()
  await renderPricing()
  const results = within(screen.getByRole('region', { name: 'Model results' }))
  expect(results.getAllByRole('heading', { level: 3 })).toHaveLength(40)

  await user.click(screen.getByRole('button', { name: 'Show more models' }))

  expect(results.getAllByRole('heading', { level: 3 })).toHaveLength(41)
  expect(scrollIntoView).not.toHaveBeenCalled()
})

it.each(['display settings', 'catalog refresh'])(
  'preserves the scroll position when %s changes without resetting filters',
  async (change) => {
    const user = userEvent.setup()
    await renderPricing()

    if (change === 'display settings') {
      await user.click(screen.getByRole('button', { name: 'Display settings' }))
      const settings = within(
        screen.getByRole('dialog', { name: 'Display settings' })
      )
      await user.click(settings.getByRole('button', { name: '/1K' }))
      expect(settings.getByRole('button', { name: '/1K' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    } else {
      act(() =>
        client.setQueryData(['pricing'], {
          ...catalog,
          data: catalog.data.slice(0, 1),
        })
      )
      await waitFor(() =>
        expect(
          within(
            screen.getByRole('region', { name: 'Model results' })
          ).getAllByRole('heading', { level: 3 })
        ).toHaveLength(1)
      )
    }

    expect(scrollIntoView).not.toHaveBeenCalled()
  }
)

it('groups the default catalog by vendor and links to the independent rankings page', async () => {
  await renderPricing()
  const results = within(screen.getByRole('region', { name: 'Model results' }))
  const openai = within(results.getByRole('region', { name: 'OpenAI' }))
  expect(openai.getByText('2 models available')).toBeVisible()
  expect(
    openai
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
  ).toEqual(['ranked-model', 'rising-model'])
  expect(
    within(results.getByRole('region', { name: 'Anthropic' })).getByRole(
      'heading',
      { name: 'other-model' }
    )
  ).toBeVisible()
  expect(
    within(screen.getByRole('contentinfo')).getByRole('link', {
      name: 'Live platform rankings',
    })
  ).toHaveAttribute('href', '/rankings')
  expect(screen.queryByText('Most used models')).not.toBeInTheDocument()
})

it('keeps name sorting global instead of grouping results by vendor', async () => {
  const user = userEvent.setup()
  await renderPricing()
  await user.click(screen.getByRole('button', { name: 'Display settings' }))
  await user.click(screen.getByRole('button', { name: 'Catalog order' }))
  await user.click(screen.getByRole('menuitem', { name: 'Name' }))
  const results = within(screen.getByRole('region', { name: 'Model results' }))
  expect(
    results
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
  ).toEqual(['other-model', 'ranked-model', 'rising-model'])
  expect(
    results.queryByRole('region', { name: 'OpenAI' })
  ).not.toBeInTheDocument()
})

it('filters the reference price table along with the model results', async () => {
  const user = userEvent.setup()
  await renderPricing()
  const prices = within(
    screen.getByRole('region', { name: 'Current model prices' })
  )
  expect(prices.getAllByRole('row')).toHaveLength(4)
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'All Vendors' }),
    'Anthropic'
  )
  await waitFor(() => expect(prices.getAllByRole('row')).toHaveLength(2))
  expect(prices.getByText('other-model')).toBeVisible()
  expect(prices.queryByText('ranked-model')).not.toBeInTheDocument()
})

it('restores the search, vendor selection and model results after browser back and forward', async () => {
  const router = await renderPricing(
    '/pricing?search=other-model&vendor=Anthropic'
  )
  const input = screen.getByRole('textbox', { name: 'Search models' })
  const catalogView = within(screen.getByRole('main'))
  await act(() =>
    router.navigate({ to: '/pricing', search: { vendor: 'OpenAI' } })
  )
  await waitFor(() =>
    expect(catalogView.getAllByRole('heading', { level: 3 })).toHaveLength(2)
  )

  await act(async () => {
    router.history.back()
  })
  await waitFor(() => {
    expect(input).toHaveValue('other-model')
    expect(
      catalogView.getByRole('combobox', { name: 'All Vendors' })
    ).toHaveValue('Anthropic')
    expect(
      catalogView
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(['other-model'])
  })

  await act(async () => {
    router.history.forward()
  })
  await waitFor(() => {
    expect(input).toHaveValue('')
    expect(
      catalogView.getByRole('combobox', { name: 'All Vendors' })
    ).toHaveValue('OpenAI')
    expect(
      catalogView
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(['ranked-model', 'rising-model'])
  })
})

it('restores default filters when navigation removes the search parameters', async () => {
  const router = await renderPricing(
    '/pricing?search=other-model&vendor=Anthropic'
  )
  await act(() => router.navigate({ to: '/pricing', search: {} }))

  await waitFor(() => {
    expect(screen.getByRole('textbox', { name: 'Search models' })).toHaveValue(
      ''
    )
    const catalogView = within(screen.getByRole('main'))
    expect(
      catalogView.getByRole('combobox', { name: 'All Vendors' })
    ).toHaveValue('all')
    expect(catalogView.getAllByRole('heading', { level: 3 })).toHaveLength(3)
  })
})

it('keeps manual filters local when status updates rerender the page', async () => {
  const user = userEvent.setup()
  const router = await renderPricing('/pricing?search=ranked-model')
  const input = screen.getByRole('textbox', { name: 'Search models' })
  await user.clear(input)
  await user.type(input, 'other-model')
  const catalogView = within(screen.getByRole('main'))
  await user.selectOptions(
    catalogView.getByRole('combobox', { name: 'All Vendors' }),
    'Anthropic'
  )

  act(() =>
    client.setQueryData(STATUS_QUERY_KEY, {
      docs_link: 'https://docs.example.com',
    })
  )

  await waitFor(() =>
    expect(
      catalogView
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(['other-model'])
  )
  expect(input).toHaveValue('other-model')
  expect(
    catalogView.getByRole('combobox', { name: 'All Vendors' })
  ).toHaveValue('Anthropic')
  expect(router.state.location.search).toEqual({ search: 'ranked-model' })
})

it('restores a capability URL, combines provider selection and resets the search and capability together', async () => {
  const user = userEvent.setup()
  const router = await renderPricing('/pricing?capability=image')
  const results = within(screen.getByRole('region', { name: 'Model results' }))
  await waitFor(() =>
    expect(results.getAllByRole('heading', { level: 3 })).toHaveLength(1)
  )
  expect(results.getByRole('heading', { name: 'rising-model' })).toBeVisible()
  scrollIntoView.mockClear()
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'All Vendors' }),
    'Anthropic'
  )
  expect(await results.findByText('No models found')).toBeVisible()
  expect(scrollIntoView.mock.contexts[0]).toBe(
    screen.getByRole('region', { name: 'Model results' })
  )
  await user.type(
    screen.getByRole('textbox', { name: 'Search models' }),
    'missing'
  )
  scrollIntoView.mockClear()
  await user.click(screen.getByRole('button', { name: 'Reset filters' }))
  await waitFor(() =>
    expect(results.getAllByRole('heading', { level: 3 })).toHaveLength(3)
  )
  expect(screen.getByRole('textbox', { name: 'Search models' })).toHaveValue('')
  expect(screen.getByRole('combobox', { name: 'Capabilities' })).toHaveValue(
    'all'
  )
  expect(router.state.location.search).toEqual({ capability: 'image' })
  expect(scrollIntoView.mock.contexts[0]).toBe(
    screen.getByRole('region', { name: 'Model results' })
  )
})

it('ignores an unknown capability URL and points section navigation at the new home anchors', async () => {
  await renderPricing('/pricing?capability=not-a-capability')
  const header = within(screen.getByRole('banner'))
  expect(screen.getByRole('combobox', { name: 'Capabilities' })).toHaveValue(
    'all'
  )
  expect(
    header.getByRole('link', { name: 'Core capabilities' })
  ).toHaveAttribute('href', '/#ability')
  expect(header.getByRole('link', { name: 'Developers' })).toHaveAttribute(
    'href',
    '/#dev'
  )
  expect(header.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
    'href',
    '/#price'
  )
  expect(header.getByRole('link', { name: 'Model Square' })).toHaveAttribute(
    'aria-current',
    'page'
  )
  expect(
    header.queryByRole('link', { name: 'Rankings' })
  ).not.toBeInTheDocument()
})
