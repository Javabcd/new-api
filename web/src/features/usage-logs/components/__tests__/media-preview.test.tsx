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
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test } from 'vitest'

import type { TaskArtifact, TaskLog } from '../../types'
import { TaskArtifacts, TaskArtifactsCell } from '../task-artifacts'

const decodeMessage =
  'Your browser could not decode this video or does not support its format. Download it and open it in a compatible player.'
const contentUrl = `https://media.example.com/v1/tasks/task-public/artifacts/video/content?access=${'A'.repeat(43)}`
const queryKey = ['usage-logs', 'task-artifacts', 'task-public']
let client: QueryClient

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
})

afterEach(() => {
  cleanup()
  client.clear()
})

function renderArtifacts(type: TaskArtifact['type'] = 'video') {
  client.setQueryData(queryKey, {
    artifacts: [{ key: 'result', type, content_url: contentUrl }],
  })
  return render(
    <QueryClientProvider client={client}>
      <TaskArtifacts taskId='task-public' enabled />
    </QueryClientProvider>
  )
}

function renderLegacyPreview() {
  const log: TaskLog = {
    id: 1,
    user_id: 7,
    platform: 'jimeng',
    task_id: 'task-public',
    action: 'text_to_video',
    channel_id: 357,
    group: 'default',
    quota: 25000,
    submit_time: 1,
    status: 'SUCCESS',
    legacy_video_available: true,
  }
  client.setQueryData(queryKey, {
    artifacts: [],
    legacyContentUrl: contentUrl,
  })
  return render(
    <QueryClientProvider client={client}>
      <TaskArtifactsCell log={log} />
    </QueryClientProvider>
  )
}

test.each([3, 4])(
  'video error code %i explains playback compatibility and keeps one original download',
  (code) => {
    const view = renderArtifacts()
    const video = view.container.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'error', { value: { code } })

    fireEvent.error(video)

    expect(screen.getByRole('alert')).toHaveTextContent(decodeMessage)
    expect(screen.getAllByRole('button', { name: 'Download' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Download' })).toHaveAttribute(
      'href',
      contentUrl
    )
  }
)

test.each([1, 2, null])(
  'video error code %s keeps the generic loading failure message',
  (code) => {
    const view = renderArtifacts()
    const video = view.container.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'error', {
      value: code === null ? null : { code },
    })

    fireEvent.error(video)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Media preview failed. Please try again.'
    )
    expect(screen.queryByText(decodeMessage)).not.toBeInTheDocument()
  }
)

test.each(['image', 'audio'] as const)(
  '%s failure keeps the generic message instead of a video decoding hint',
  (type) => {
    const view = renderArtifacts(type)
    const media = view.container.querySelector(
      type === 'image' ? 'img' : 'audio'
    ) as HTMLImageElement | HTMLAudioElement
    if (media instanceof HTMLAudioElement) {
      Object.defineProperty(media, 'error', { value: { code: 3 } })
    }

    fireEvent.error(media)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Media preview failed. Please try again.'
    )
    expect(screen.queryByText(decodeMessage)).not.toBeInTheDocument()
  }
)

test('retrying a decoding failure restores the video without the old hint', async () => {
  const user = userEvent.setup()
  const view = renderArtifacts()
  const video = view.container.querySelector('video') as HTMLVideoElement
  Object.defineProperty(video, 'error', { value: { code: 3 } })
  fireEvent.error(video)

  await user.click(screen.getByRole('button', { name: 'Retry' }))

  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(view.container.querySelector('video')).toHaveAttribute(
    'src',
    contentUrl
  )
})

test('updating an artifact URL restores its video after a decoding failure', async () => {
  const view = renderArtifacts()
  const video = view.container.querySelector('video') as HTMLVideoElement
  Object.defineProperty(video, 'error', { value: { code: 3 } })
  fireEvent.error(video)
  const updatedUrl = contentUrl.replace(
    'media.example.com',
    'updated.example.com'
  )

  act(() => {
    client.setQueryData(queryKey, {
      artifacts: [{ key: 'result', type: 'video', content_url: updatedUrl }],
    })
  })

  await waitFor(() =>
    expect(view.container.querySelector('video')).toHaveAttribute(
      'src',
      updatedUrl
    )
  )
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('a legacy decoding failure offers an original download and keyboard retry', async () => {
  const user = userEvent.setup()
  renderLegacyPreview()
  await user.click(
    screen.getByRole('button', { name: 'Click to preview video' })
  )
  const video = document.querySelector('video') as HTMLVideoElement
  Object.defineProperty(video, 'error', { value: { code: 4 } })

  fireEvent.error(video)

  expect(screen.getByRole('alert')).toHaveTextContent(decodeMessage)
  expect(screen.getByRole('button', { name: 'Download' })).toHaveAttribute(
    'href',
    `${contentUrl}&download=1`
  )
  screen.getByRole('button', { name: 'Retry' }).focus()
  await user.keyboard('{Enter}')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(document.querySelector('video')).toHaveAttribute('src', contentUrl)
})

test('updating a legacy video URL clears its previous decoding failure', async () => {
  const user = userEvent.setup()
  renderLegacyPreview()
  await user.click(
    screen.getByRole('button', { name: 'Click to preview video' })
  )
  const video = document.querySelector('video') as HTMLVideoElement
  Object.defineProperty(video, 'error', { value: { code: 3 } })
  fireEvent.error(video)
  const updatedUrl = contentUrl.replace(
    'media.example.com',
    'updated.example.com'
  )

  act(() => {
    client.setQueryData(queryKey, {
      artifacts: [],
      legacyContentUrl: updatedUrl,
    })
  })

  await waitFor(() =>
    expect(document.querySelector('video')).toHaveAttribute('src', updatedUrl)
  )
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
