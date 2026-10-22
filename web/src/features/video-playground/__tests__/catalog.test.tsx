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
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { VideoPlayground } from '..'
import type { VideoModel } from '../types'

const model: VideoModel = {
  plugin_key: 'moma-seedance',
  model: 'doubao-seedance-2-0-260128',
  display_name: 'MoMa · doubao-seedance-2-0-260128',
  plugin_version: '1.1.0',
  available: true,
  capabilities: {
    supported_modes: ['text_to_video'],
    resolutions: [],
    ratios: ['16:9'],
    image_roles: [],
    duration_required: false,
    resolution_required: false,
    duration_input_min: 4,
    duration_input_max: 15,
    generate_audio: true,
    watermark: true,
  },
}
const clients: QueryClient[] = []

beforeEach(() => {
  sessionStorage.clear()
  useAuthStore
    .getState()
    .auth.setUser({ id: 701, username: 'alice', role: 1, group: 'default' })
})

afterEach(() => {
  cleanup()
  clients.forEach((client) => client.clear())
  clients.length = 0
  focusManager.setFocused(undefined)
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset()
  sessionStorage.clear()
})

function renderCatalog(initialModels: VideoModel[] = [model]) {
  const state: {
    models: Record<string, VideoModel[]>
    error?: Error
    delay?: Promise<void>
  } = { models: { default: initialModels, vip: [] } }
  const get = vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (url !== '/pg/video/models') {
      throw new Error(`Unexpected catalog URL: ${url}`)
    }
    if (state.delay) await state.delay
    if (state.error) throw state.error
    const group = config?.params.group as string
    return {
      data: { success: true, data: { models: state.models[group] || [] } },
    }
  })
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
      },
    },
  })
  clients.push(client)
  const key = ['video-playground', '701:']
  client.setQueryData(
    [...key, 'groups'],
    ['default', 'vip'].map((group) => ({ value: group, label: group }))
  )
  client.setQueryData([...key, 'tasks', 1], [])
  client.setQueryData([...key, 'unresolved'], [])
  const page = (
    <QueryClientProvider client={client}>
      <VideoPlayground />
    </QueryClientProvider>
  )
  return { state, get, client, page, view: render(page) }
}

async function selectModel(label = model.display_name) {
  fireEvent.click(screen.getByRole('combobox', { expanded: false }))
  fireEvent.click(await screen.findByRole('option', { name: label }))
  return screen.findByRole('button', { name: 'Generate video' })
}

test('unavailable server options are omitted from the model menu', async () => {
  renderCatalog([
    model,
    {
      ...model,
      model: 'unavailable-model',
      display_name: 'Unavailable provider model',
      available: false,
      disabled_reason: 'model_price_error',
    },
  ])
  fireEvent.click(screen.getByRole('combobox', { expanded: false }))
  expect(
    await screen.findByRole('option', { name: model.display_name })
  ).toBeVisible()
  expect(
    screen.queryByRole('option', { name: 'Unavailable provider model' })
  ).not.toBeInTheDocument()
})

test('changing groups reloads the catalog and removes the previous selection', async () => {
  const catalog = renderCatalog()
  const vipModel = {
    ...model,
    model: 'vip-video-alias',
    display_name: 'MoMa · vip-video-alias',
  }
  catalog.state.models.vip = [vipModel]
  expect(await selectModel()).toBeEnabled()
  fireEvent.click(screen.getByRole('combobox', { expanded: false }))
  fireEvent.click(await screen.findByRole('button', { name: 'vip' }))
  expect(
    await screen.findByRole('option', { name: vipModel.display_name })
  ).toBeVisible()
  expect(
    screen.queryByRole('option', { name: model.display_name })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Generate video' })
  ).not.toBeInTheDocument()
  expect(catalog.get).toHaveBeenCalledWith('/pg/video/models', {
    params: { group: 'vip' },
  })
})

test('returning to the window refreshes the catalog and retires an invalid selection', async () => {
  const catalog = renderCatalog()
  expect(await selectModel()).toBeEnabled()
  act(() => focusManager.setFocused(false))
  catalog.state.models.default = []
  act(() => focusManager.setFocused(true))
  expect(await screen.findByText('No video models available')).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Generate video' })
  ).not.toBeInTheDocument()
  expect(screen.getByRole('combobox')).not.toHaveTextContent(model.display_name)
})

test('remounting the page refreshes a previously cached catalog', async () => {
  const catalog = renderCatalog()
  expect(await selectModel()).toBeEnabled()
  catalog.view.unmount()
  catalog.state.models.default = []
  render(catalog.page)
  expect(await screen.findByText('No video models available')).toBeVisible()
})

test('a failed window-focus catalog refresh preserves the draft and blocks generation until retry succeeds', async () => {
  const catalog = renderCatalog()
  const post = vi
    .spyOn(api, 'post')
    .mockRejectedValue(new Error('Unexpected submission'))
  const draft = [
    ['Prompt', 'A cat runs through a sunlit garden'],
    ['Duration (seconds)', 8],
    ['Aspect ratio', '16:9'],
    ['Generate audio', 'false'],
    ['Watermark', 'true'],
  ] as const
  expect(await selectModel()).toBeEnabled()
  for (const [label, value] of draft) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }

  act(() => focusManager.setFocused(false))
  catalog.state.error = new Error('catalog offline')
  act(() => focusManager.setFocused(true))
  expect(await screen.findByRole('button', { name: 'Retry' })).toBeVisible()
  for (const [label, value] of draft) {
    expect(screen.getByLabelText(label)).toHaveValue(value)
    expect(screen.getByLabelText(label)).toBeDisabled()
  }
  expect(screen.getByRole('combobox', { expanded: false })).toHaveTextContent(
    model.display_name
  )
  expect(screen.getByRole('button', { name: 'Generate video' })).toBeDisabled()
  expect(post).not.toHaveBeenCalled()

  let finishRetry: () => void = () => {}
  catalog.state.delay = new Promise<void>((resolve) => {
    finishRetry = resolve
  })
  catalog.state.error = undefined
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(catalog.get).toHaveBeenCalledTimes(3))
  expect(screen.getByRole('button', { name: 'Generate video' })).toBeDisabled()
  await act(async () => {
    finishRetry()
  })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled()
  )
  expect(
    screen.queryByRole('button', { name: 'Retry' })
  ).not.toBeInTheDocument()
  for (const [label, value] of draft) {
    expect(screen.getByLabelText(label)).toHaveValue(value)
    expect(screen.getByLabelText(label)).toBeEnabled()
  }
  expect(post).not.toHaveBeenCalled()
})

test('a catalog refresh failure disables an already-open generation confirmation without submitting', async () => {
  const catalog = renderCatalog()
  const post = vi
    .spyOn(api, 'post')
    .mockRejectedValue(new Error('Unexpected submission'))
  expect(await selectModel()).toBeEnabled()
  fireEvent.change(screen.getByLabelText('Prompt'), {
    target: { value: 'A cat runs through a sunlit garden' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Generate video' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(
    within(dialog).getByRole('button', { name: 'Generate video' })
  ).toBeEnabled()

  act(() => focusManager.setFocused(false))
  catalog.state.error = new Error('catalog offline')
  act(() => focusManager.setFocused(true))
  await waitFor(() =>
    expect(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Generate video',
      })
    ).toBeDisabled()
  )
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Generate video' })
  )
  expect(post).not.toHaveBeenCalled()
})

test('an empty catalog shows the shared empty state without a generation form', async () => {
  renderCatalog([])
  expect(await screen.findByText('No video models available')).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Generate video' })
  ).not.toBeInTheDocument()
})
