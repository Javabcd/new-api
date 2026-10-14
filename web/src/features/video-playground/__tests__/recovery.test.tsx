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
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { VideoPlayground } from '..'
import type { VideoModel, VideoTask } from '../types'

const model: VideoModel = {
  plugin_key: 'moma-seedance',
  model: 'doubao-seedance-2-0-260128',
  display_name: 'MoMa video',
  plugin_version: '1.0.0',
  available: true,
  capabilities: {
    supported_modes: ['text_to_video', 'image_to_video'],
    resolutions: [],
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
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset()
  sessionStorage.clear()
})

function renderPage(tasks: VideoTask[] = []) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  clients.push(client)
  for (const id of [701, 702]) {
    const key = ['video-playground', `${id}:`]
    client.setQueryData(
      [...key, 'groups'],
      [{ value: 'default', label: 'default' }]
    )
    client.setQueryData([...key, 'models', 'default'], [model])
    client.setQueryData([...key, 'tasks', 1], id === 701 ? tasks : [])
  }
  render(
    <QueryClientProvider client={client}>
      <VideoPlayground />
    </QueryClientProvider>
  )
  return client
}

async function selectModel() {
  fireEvent.click(screen.getByRole('combobox'))
  fireEvent.click(await screen.findByRole('option', { name: 'MoMa video' }))
  return screen.findByRole('button', { name: 'Generate video' })
}

test('generation waits for server recovery even without a local submission key', async () => {
  let finish: (value: { data: { success: true; data: [] } }) => void = () => {}
  vi.spyOn(api, 'get').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  renderPage()
  expect(await selectModel()).toBeDisabled()
  await act(async () => {
    finish({ data: { success: true, data: [] } })
  })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled()
  )
})

test('failed recovery keeps generation disabled until the recovery GET succeeds', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ data: { success: true, data: [] } })
  renderPage()
  expect(await selectModel()).toBeDisabled()
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled()
  )
  expect(get.mock.calls.every(([url]) => url === '/pg/video/submissions')).toBe(
    true
  )
})

test('an unknown submission is recovered from the server after local storage is cleared', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: [{ task_id: 'task_unknown', state: 'unknown' }],
    },
  })
  renderPage()
  expect(await selectModel()).toBeDisabled()
  expect(await screen.findByText('Submission result unknown')).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Start a new generation' })
  ).toBeEnabled()
})

test('switching accounts clears the previous task history and submission warning', async () => {
  vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: {
      success: true,
      data:
        useAuthStore.getState().auth.user?.id === 701
          ? [{ task_id: 'task_unknown', state: 'unknown' }]
          : [],
    },
  }))
  renderPage([
    {
      task_id: 'task_alice',
      plugin_key: 'moma-seedance',
      model: model.model,
      status: 'SUCCESS',
      created_at: 1,
      finish_time: 2,
    },
  ])
  expect(await screen.findByText('Submission result unknown')).toBeVisible()
  expect(screen.getByText('task_alice')).toBeVisible()
  act(() =>
    useAuthStore
      .getState()
      .auth.setUser({ id: 702, username: 'bob', role: 1, group: 'default' })
  )
  expect(await screen.findByText('No tasks yet')).toBeVisible()
  expect(screen.queryByText('task_alice')).not.toBeInTheDocument()
  await waitFor(() =>
    expect(
      screen.queryByText('Submission result unknown')
    ).not.toBeInTheDocument()
  )
})
