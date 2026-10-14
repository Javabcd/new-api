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
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { VideoPlayground } from '..'
import type { VideoTask } from '../types'

let client: QueryClient | undefined

afterEach(() => {
  cleanup()
  client?.clear()
  useAuthStore.getState().auth.reset()
  sessionStorage.clear()
  vi.restoreAllMocks()
})

test('switching from a failed video to a cached healthy task displays its player', async () => {
  sessionStorage.clear()
  useAuthStore.getState().auth.reset()
  useAuthStore.getState().auth.setUser({
    id: 701,
    username: 'alice',
    role: 1,
    group: 'default',
  })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: [] },
  })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const scope = ['video-playground', '701:']
  const tasks: VideoTask[] = ['task_failed', 'task_healthy'].map((taskId) => ({
    task_id: taskId,
    plugin_key: 'moma-seedance',
    model: 'doubao-seedance-2-0-260128',
    status: 'SUCCESS',
    created_at: 1,
    finish_time: 2,
  }))
  client.setQueryData([...scope, 'groups'], [])
  client.setQueryData([...scope, 'models', 'default'], [])
  client.setQueryData([...scope, 'tasks', 1], tasks)
  for (const task of tasks) {
    client.setQueryData(
      [...scope, 'usage-logs', 'task-artifacts', task.task_id],
      {
        artifacts: [
          {
            key: 'video',
            type: 'video',
            content_url: `/api/task/${task.task_id}/artifacts/video/content`,
          },
        ],
      }
    )
  }
  const view = render(
    <QueryClientProvider client={client}>
      <VideoPlayground />
    </QueryClientProvider>
  )
  const previews = screen.getAllByRole('button', { name: 'Preview' })
  fireEvent.click(previews[0])
  const failedVideo = view.container.querySelector('video')
  expect(failedVideo).toHaveAttribute(
    'src',
    '/api/task/task_failed/artifacts/video/content'
  )
  fireEvent.error(failedVideo as HTMLVideoElement)
  expect(
    screen.getByText('Media preview failed. Please try again.')
  ).toBeVisible()
  fireEvent.click(previews[1])
  await waitFor(() =>
    expect(view.container.querySelector('video')).toHaveAttribute(
      'src',
      '/api/task/task_healthy/artifacts/video/content'
    )
  )
  expect(
    screen.queryByText('Media preview failed. Please try again.')
  ).not.toBeInTheDocument()
})
