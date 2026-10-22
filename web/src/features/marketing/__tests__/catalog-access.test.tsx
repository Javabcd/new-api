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
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MarketingCatalog } from '@/features/home/components/marketing-catalog'
import { MarketingModalities } from '@/features/home/components/marketing-modalities'
import type { PricingData } from '@/features/pricing/types'
import type { RankingsSnapshot } from '@/features/rankings/types'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { RankingsPreview } from '../rankings-preview'

let client: QueryClient

async function renderCatalog(component: React.ReactNode) {
  const root = createRootRoute({ component: () => component })
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await act(() => router.load())
  return view
}

const catalog: PricingData = {
  success: true,
  data: Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    model_name: `model-${i + 1}`,
    vendor_id: 1,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
  })),
  vendors: [{ id: 1, name: 'OpenAI' }],
  group_ratio: { default: 1 },
  usable_group: {},
  supported_endpoint: {},
  auto_groups: [],
}

const rankings: RankingsSnapshot = {
  models: [
    {
      rank: 1,
      model_name: 'ranked-model',
      vendor: 'OpenAI',
      category: 'all',
      total_tokens: 12000,
      share: 1,
      growth_pct: 5,
    },
  ],
  vendors: [
    {
      rank: 1,
      vendor: 'OpenAI',
      total_tokens: 12000,
      share: 1,
      growth_pct: 5,
      models_count: 2,
      top_model: 'ranked-model',
    },
  ],
  top_movers: [
    {
      model_name: 'rising-model',
      vendor: 'OpenAI',
      rank_delta: 3,
      current_rank: 2,
      growth_pct: 20,
    },
  ],
  top_droppers: [],
  models_history: { points: [], models: [], buckets: 0 },
  vendor_share_history: { points: [], vendors: [], buckets: 0 },
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.setUser(null)
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  client.setQueryData(['status'], {
    HeaderNavModules: {
      pricing: { enabled: true, requireAuth: false },
      rankings: { enabled: true, requireAuth: false },
    },
  })
})

afterEach(() => {
  client.clear()
  localStorage.clear()
  useAuthStore.getState().auth.setUser(null)
})

describe('public catalog access', () => {
  it('shows only available model IDs in modality cards and hides them when sign-in becomes required', async () => {
    client.setQueryData(['pricing'], {
      ...catalog,
      data: [{ ...catalog.data[0], model_name: 'gpt-5.6-sol' }],
    })
    await renderCatalog(<MarketingModalities />)
    expect(await screen.findByText('gpt-5.6-sol')).toBeVisible()
    expect(screen.queryByText('sora-2-pro')).not.toBeInTheDocument()
    act(() =>
      client.setQueryData(['status'], {
        HeaderNavModules: { pricing: { enabled: true, requireAuth: true } },
      })
    )
    await waitFor(() =>
      expect(screen.queryByText('gpt-5.6-sol')).not.toBeInTheDocument()
    )
  })

  it('visibly labels the generated image and video examples as illustrations', async () => {
    client.setQueryData(['pricing'], catalog)
    await renderCatalog(<MarketingModalities />)
    const notes = screen.getAllByRole('note')
    expect(notes).toHaveLength(2)
    for (const note of notes) expect(note).toHaveTextContent('Illustration')
  })

  it('uses the actual model count and limits the home preview to ten unique models', async () => {
    client.setQueryData(['pricing'], catalog)
    await renderCatalog(<MarketingCatalog />)
    expect(await screen.findByText('model-1')).toBeVisible()
    expect(screen.getByText('12')).toBeVisible()
    expect(screen.getByText('model-10')).toBeVisible()
    expect(screen.queryByText('model-11')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'model-1' })).toHaveAttribute(
      'href',
      '/pricing/model-1'
    )
  })

  it('hides cached catalog data and makes no catalog request when sign-in is required', async () => {
    client.setQueryData(['status'], {
      HeaderNavModules: { pricing: { enabled: true, requireAuth: true } },
    })
    client.setQueryData(['pricing'], catalog)
    const get = vi.spyOn(api, 'get')
    await renderCatalog(<MarketingCatalog />)
    expect(await screen.findByText('Sign in to explore models')).toBeVisible()
    expect(screen.queryByText('model-1')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/sign-in?redirect=%2Fpricing'
    )
    expect(get).not.toHaveBeenCalled()
  })

  it('waits for server access settings before displaying a catalog cached under old local settings', async () => {
    client.removeQueries({ queryKey: ['status'] })
    localStorage.setItem(
      'status',
      JSON.stringify({
        HeaderNavModules: { pricing: { enabled: true, requireAuth: false } },
      })
    )
    client.setQueryData(['pricing'], catalog)
    let finishStatus!: (response: { data: unknown }) => void
    const response = new Promise<{ data: unknown }>((resolve) => {
      finishStatus = resolve
    })
    vi.spyOn(api, 'get').mockReturnValue(response)
    await renderCatalog(<MarketingCatalog />)
    expect(screen.queryByText('model-1')).not.toBeInTheDocument()
    await act(async () => {
      finishStatus({
        data: {
          success: true,
          data: {
            HeaderNavModules: { pricing: { enabled: true, requireAuth: true } },
          },
        },
      })
      await response
    })
    expect(await screen.findByText('Sign in to explore models')).toBeVisible()
    expect(screen.queryByText('model-1')).not.toBeInTheDocument()
  })

  it('removes the preview when the model square is disabled', async () => {
    client.setQueryData(['status'], {
      HeaderNavModules: { pricing: { enabled: false } },
    })
    await renderCatalog(<MarketingCatalog />)
    expect(screen.queryByText('Model Square')).not.toBeInTheDocument()
  })

  it('shows a retry action after a model request fails and displays the recovered catalog', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'get')
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce({ data: catalog })
    await renderCatalog(<MarketingCatalog />)
    expect(await screen.findByText('Unable to load models')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('model-1')).toBeVisible()
  })

  it('shows three real weekly ranking lists and links model names to the catalog', async () => {
    client.setQueryData(['rankings', 'week'], { success: true, data: rankings })
    await renderCatalog(<RankingsPreview />)
    expect(await screen.findByText('ranked-model')).toBeVisible()
    expect(screen.getByText('rising-model')).toBeVisible()
    expect(screen.getByText('+3')).toBeVisible()
    expect(screen.getAllByRole('list')).toHaveLength(3)
    expect(
      screen.getByRole('button', { name: 'View full rankings' })
    ).toHaveAttribute('href', '/rankings?period=week')
  })

  it('replaces cached rankings with a sign-in prompt when access becomes restricted', async () => {
    client.setQueryData(['rankings', 'week'], { success: true, data: rankings })
    await renderCatalog(<RankingsPreview />)
    expect(await screen.findByText('ranked-model')).toBeVisible()
    act(() => {
      client.setQueryData(['status'], {
        HeaderNavModules: { rankings: { enabled: true, requireAuth: true } },
      })
    })
    expect(await screen.findByText('Sign in to view rankings')).toBeVisible()
    expect(screen.queryByText('ranked-model')).not.toBeInTheDocument()
  })

  it('shows empty ranking states without adding sample rows', async () => {
    client.setQueryData(['rankings', 'week'], {
      success: true,
      data: { ...rankings, models: [], vendors: [], top_movers: [] },
    })
    await renderCatalog(<RankingsPreview />)
    const empty = await screen.findAllByText('No ranking data for this period')
    expect(empty).toHaveLength(3)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})
