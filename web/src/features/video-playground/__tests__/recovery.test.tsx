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
  within,
} from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { VideoPlayground } from '..'
import type { VideoModel, VideoSubmission, VideoTask } from '../types'

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
const recoveredTask: VideoTask = {
  task_id: 'task_recovered',
  plugin_key: 'moma-seedance',
  model: model.model,
  status: 'IN_PROGRESS',
  created_at: 1,
  finish_time: 0,
}

function mockRecoveryQueries() {
  const responses: {
    submission: VideoSubmission
    unresolved: VideoSubmission[]
    tasks: VideoTask[]
    recoveryError?: Error
    submissionDelay?: Promise<void>
  } = {
    submission: { task_id: recoveredTask.task_id, state: 'pending' },
    unresolved: [],
    tasks: [recoveredTask],
  }
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url.startsWith('/pg/video/submissions/')) {
      if (responses.submissionDelay) await responses.submissionDelay
      return { data: { success: true, data: responses.submission } }
    }
    if (url === '/pg/video/submissions') {
      if (responses.recoveryError) throw responses.recoveryError
      return { data: { success: true, data: responses.unresolved } }
    }
    if (url === '/pg/video/tasks') {
      return { data: { success: true, data: responses.tasks } }
    }
    throw new Error(`Unexpected recovery URL: ${url}`)
  })
  const post = vi
    .spyOn(api, 'post')
    .mockRejectedValue(new Error('Unexpected POST'))
  return { responses, get, post }
}

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
  vi.useRealTimers()
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

test('accepted local recovery refreshes a cached pending server submission before its next poll', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  const server = mockRecoveryQueries()
  let finishSubmission: () => void = () => {}
  server.responses.submissionDelay = new Promise<void>((resolve) => {
    finishSubmission = resolve
  })
  server.responses.unresolved = [
    { task_id: recoveredTask.task_id, state: 'pending' },
  ]
  sessionStorage.setItem(
    'video-playground:701::submission',
    'local_video_intent_0000'
  )
  renderPage()
  expect(await selectModel()).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Check submission' })).toBeVisible()

  await act(async () => {
    server.responses.submission = {
      task_id: recoveredTask.task_id,
      state: 'accepted',
    }
    server.responses.unresolved = []
    finishSubmission()
  })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled()
  )
  expect(await screen.findByText(recoveredTask.task_id)).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Check submission' })
  ).not.toBeInTheDocument()
  expect(server.post).not.toHaveBeenCalled()
})

test.each([
  { history: 'empty', tasks: [] },
  {
    history: 'all terminal',
    tasks: [{ ...recoveredTask, task_id: 'task_completed', status: 'SUCCESS' }],
  },
])(
  'accepted recovery with $history history displays and polls the new task',
  async (fixture) => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const server = mockRecoveryQueries()
    sessionStorage.setItem(
      'video-playground:701::submission',
      'local_video_intent_0000'
    )
    renderPage(fixture.tasks)
    expect(
      await screen.findByRole('button', { name: 'Check submission' })
    ).toBeVisible()

    await act(async () => {
      server.responses.submission = {
        task_id: recoveredTask.task_id,
        state: 'accepted',
      }
      await vi.advanceTimersByTimeAsync(5000)
    })
    const row = await screen.findByRole('row', {
      name: new RegExp(recoveredTask.task_id),
    })
    expect(within(row).getByText('In progress')).toBeVisible()

    await act(async () => {
      server.responses.tasks = [
        { ...recoveredTask, status: 'SUCCESS', finish_time: 2 },
      ]
      await vi.advanceTimersByTimeAsync(5000)
    })
    await waitFor(() =>
      expect(within(row).getByRole('button', { name: 'Preview' })).toBeEnabled()
    )
    const completedRequests = server.get.mock.calls.filter(
      ([url]) => url === '/pg/video/tasks'
    ).length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(
      server.get.mock.calls.filter(([url]) => url === '/pg/video/tasks')
    ).toHaveLength(completedRequests)
    expect(server.post).not.toHaveBeenCalled()
  }
)

test.each([
  { history: 'empty', tasks: [] },
  {
    history: 'all terminal',
    tasks: [{ ...recoveredTask, task_id: 'task_completed', status: 'FAILURE' }],
  },
])(
  'server recovery without a local key refreshes $history history when its pending list becomes empty',
  async (fixture) => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const server = mockRecoveryQueries()
    server.responses.unresolved = [
      { task_id: recoveredTask.task_id, state: 'pending' },
    ]
    renderPage(fixture.tasks)
    expect(
      await screen.findByRole('button', { name: 'Check submission' })
    ).toBeVisible()

    await act(async () => {
      server.responses.unresolved = []
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(await screen.findByText(recoveredTask.task_id)).toBeVisible()
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Check submission' })
      ).not.toBeInTheDocument()
    )
    expect(server.post).not.toHaveBeenCalled()
  }
)

test('one recovered submission appears while another pending submission keeps generation blocked', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  const server = mockRecoveryQueries()
  const remaining: VideoSubmission = {
    task_id: 'task_still_pending',
    state: 'pending',
  }
  server.responses.unresolved = [
    { task_id: recoveredTask.task_id, state: 'pending' },
    remaining,
  ]
  renderPage()
  expect(
    await screen.findByRole('button', { name: 'Check submission' })
  ).toBeVisible()

  await act(async () => {
    server.responses.unresolved = [remaining]
    await vi.advanceTimersByTimeAsync(5000)
  })
  expect(await screen.findByText(recoveredTask.task_id)).toBeVisible()
  expect(await selectModel()).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Check submission' })).toBeVisible()
  expect(server.post).not.toHaveBeenCalled()
})

test('failed recovery preserves pending state and a successful retry refreshes the recovered task', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  const server = mockRecoveryQueries()
  server.responses.unresolved = [
    { task_id: recoveredTask.task_id, state: 'pending' },
  ]
  renderPage()
  expect(
    await screen.findByRole('button', { name: 'Check submission' })
  ).toBeVisible()

  await act(async () => {
    server.responses.recoveryError = new Error('offline')
    await vi.advanceTimersByTimeAsync(5000)
  })
  expect(
    await screen.findByText('Unable to recover previous submissions')
  ).toBeVisible()
  expect(screen.queryByText(recoveredTask.task_id)).not.toBeInTheDocument()
  expect(server.get.mock.calls.some(([url]) => url === '/pg/video/tasks')).toBe(
    false
  )

  server.responses.recoveryError = undefined
  server.responses.unresolved = []
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText(recoveredTask.task_id)).toBeVisible()
  expect(server.post).not.toHaveBeenCalled()
})

test('a provider rejection refreshes submission state and enables another generation', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  let rejected = false
  let rejectSubmission: (error: unknown) => void = () => {}
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: {
      success: true,
      data: url.startsWith('/pg/video/submissions/')
        ? { task_id: 'task_rejected', state: rejected ? 'rejected' : 'pending' }
        : [],
    },
  }))
  const post = vi.spyOn(api, 'post').mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        rejectSubmission = reject
      })
  )
  const errorToast = vi.spyOn(toast, 'error')
  renderPage()
  await selectModel()
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled()
  )
  fireEvent.change(screen.getByLabelText('Prompt'), {
    target: { value: 'A cat runs' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Generate video' }))
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: 'Generate video',
    })
  )
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
  expect(
    await screen.findByRole('button', { name: 'Check submission' })
  ).toBeVisible()
  await act(async () => {
    rejected = true
    rejectSubmission(
      Object.assign(new Error('unsupported duration'), {
        isAxiosError: true,
        response: { status: 422, data: { message: 'unsupported duration' } },
      })
    )
  })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled()
  )
  expect(
    screen.queryByRole('button', { name: 'Check submission' })
  ).not.toBeInTheDocument()
  expect(errorToast.mock.calls[0]?.[0]).toBe('unsupported duration')
  expect(post).toHaveBeenCalledTimes(1)
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
