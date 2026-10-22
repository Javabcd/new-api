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
import { afterEach, beforeEach, expect, it } from 'vitest'

import { STATUS_QUERY_KEY, type StatusData } from '@/lib/status-query'
import { useAuthStore } from '@/stores/auth-store'

import { MarketingQuickStart } from '../components/marketing-quick-start'

let client: QueryClient

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.setUser(null)
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  localStorage.clear()
  useAuthStore.getState().auth.setUser(null)
})

async function renderQuickStart(status: StatusData) {
  client.setQueryData(STATUS_QUERY_KEY, status)
  const root = createRootRoute({ component: MarketingQuickStart })
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await act(() => router.load())
}

it.each([
  {
    name: 'configured service domain',
    status: { server_address: 'https://gateway.example.com' },
    baseUrl: 'https://gateway.example.com/v1',
  },
  {
    name: 'deployment prefix with trailing slashes',
    status: { server_address: 'https://gateway.example.com/proxy///' },
    baseUrl: 'https://gateway.example.com/proxy/v1',
  },
  {
    name: 'camelCase field',
    status: { serverAddress: 'https://gateway.example.com' },
    baseUrl: 'https://gateway.example.com/v1',
  },
  {
    name: 'legacy nested field',
    status: { data: { server_address: 'https://gateway.example.com' } },
    baseUrl: 'https://gateway.example.com/v1',
  },
  {
    name: 'legacy nested camelCase field',
    status: { data: { serverAddress: 'https://gateway.example.com' } },
    baseUrl: 'https://gateway.example.com/v1',
  },
  {
    name: 'primary field precedence',
    status: {
      server_address: 'https://gateway.example.com',
      serverAddress: 'https://secondary.example.com',
      data: { server_address: 'https://legacy.example.com' },
    },
    baseUrl: 'https://gateway.example.com/v1',
  },
  {
    name: 'missing configuration',
    status: {},
    baseUrl: `${window.location.origin}/v1`,
  },
  {
    name: 'empty configuration',
    status: { server_address: '' },
    baseUrl: `${window.location.origin}/v1`,
  },
  {
    name: 'invalid configuration type',
    status: { server_address: 42 },
    baseUrl: `${window.location.origin}/v1`,
  },
])(
  'displays and copies all three examples using the $name',
  async ({ status, baseUrl }) => {
    const user = userEvent.setup()
    await renderQuickStart(status)

    for (const language of ['cURL', 'Python', 'TypeScript']) {
      await user.click(screen.getByRole('tab', { name: language }))
      const panel = within(screen.getByRole('tabpanel'))
      const code = panel.getByText(/curl |from openai import|import OpenAI/)
      expect(code).toBeVisible()
      expect(code).toHaveTextContent(baseUrl)
      if (language === 'cURL') {
        expect(code).toHaveTextContent(`${baseUrl}/chat/completions`)
      }
      await user.click(panel.getByRole('button', { name: 'Copy code' }))
      expect(await navigator.clipboard.readText()).toBe(code.textContent)
    }
  }
)

it('updates the displayed and copied address when status arrives without resetting the selected language', async () => {
  const user = userEvent.setup()
  await renderQuickStart({})
  await user.click(screen.getByRole('tab', { name: 'Python' }))
  const panel = within(screen.getByRole('tabpanel'))
  expect(panel.getByText(/from openai import/)).toHaveTextContent(
    `${window.location.origin}/v1`
  )

  act(() =>
    client.setQueryData(STATUS_QUERY_KEY, {
      server_address: 'https://gateway.example.com/proxy/',
    })
  )

  await waitFor(() =>
    expect(panel.getByText(/from openai import/)).toHaveTextContent(
      'https://gateway.example.com/proxy/v1'
    )
  )
  expect(
    screen.getByRole('tab', { name: 'Python', selected: true })
  ).toBeVisible()
  await user.click(panel.getByRole('button', { name: 'Copy code' }))
  expect(await navigator.clipboard.readText()).toContain(
    'https://gateway.example.com/proxy/v1'
  )
})
