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
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { nanoid } from 'nanoid'
import { toast } from 'sonner'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { VideoForm } from '../components/video-form'
import {
  buildVideoRequest,
  emptyVideoForm,
  videoFormSchema,
} from '../lib/schema'
import type { VideoModel, VideoRequest } from '../types'

vi.mock('nanoid', async (importOriginal) => {
  const original = await importOriginal<typeof import('nanoid')>()
  return { ...original, nanoid: vi.fn(original.nanoid) }
})

const millu: VideoModel = {
  plugin_key: 'millu-seedance',
  model: 'millu-sd-x-2-5-260801',
  display_name: 'Millu Seedance',
  plugin_version: '1.0.0',
  available: true,
  capabilities: {
    supported_modes: ['text_to_video', 'image_to_video'],
    resolutions: ['720p', '1080p'],
    ratios: ['16:9', 'adaptive'],
    image_roles: ['reference_image'],
    duration_required: false,
    resolution_required: false,
    duration_input_min: 1,
    duration_input_max: 3600,
    generate_audio: true,
    watermark: true,
  },
}
const moma: VideoModel = {
  ...millu,
  plugin_key: 'moma-seedance',
  model: 'doubao-seedance-2-0-260128',
  display_name: 'MoMa',
  capabilities: {
    ...millu.capabilities,
    resolutions: [],
    ratios: ['16:9', '9:16', '1:1'],
    duration_input_min: 4,
    duration_input_max: 15,
  },
}
const ctyun: VideoModel = {
  ...millu,
  plugin_key: 'ctyun-cdance',
  model: 'cdance2.5-0807',
  display_name: 'CTYun Cdance',
  plugin_version: '1.0.2',
  capabilities: {
    ...millu.capabilities,
    resolutions: ['480p', '720p', '1080p'],
  },
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.mocked(nanoid).mockReset()
})

function formElement(
  model: VideoModel,
  blocked: boolean,
  callbacks: {
    onBusy: (busy: boolean) => void
    onIntent: (key: string) => void
  }
) {
  return (
    <VideoForm
      key={`${model.plugin_key}:${model.model}`}
      model={model}
      group='default'
      identity='701:test-session'
      blocked={blocked}
      onBusy={callbacks.onBusy}
      onIntent={callbacks.onIntent}
    />
  )
}

function renderForm(model = millu, blocked = false) {
  const callbacks = {
    onBusy: vi.fn<(busy: boolean) => void>(),
    onIntent: vi.fn<(key: string) => void>(),
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      {formElement(model, blocked, callbacks)}
    </QueryClientProvider>
  )
  return {
    ...view,
    ...callbacks,
    changeModel: (next: VideoModel) =>
      view.rerender(
        <QueryClientProvider client={client}>
          {formElement(next, false, callbacks)}
        </QueryClientProvider>
      ),
  }
}

async function openGenerationConfirmation() {
  fireEvent.change(screen.getByLabelText('Prompt'), {
    target: { value: 'A cat runs' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Generate video' }))
  const confirmation = await screen.findByRole('alertdialog')
  return within(confirmation).getByRole('button', { name: 'Generate video' })
}

describe('video generation form', () => {
  test('optional values stay absent and an explicit false reaches the video request', () => {
    const request = buildVideoRequest(moma, 'auto', {
      ...emptyVideoForm,
      prompt: 'A cat runs',
      generateAudio: 'false',
    })
    expect(request.parameters).toEqual({ generate_audio: false })
    expect(request.group).toBe('auto')
    expect(request.media).toEqual([])
  })

  test('CTYun can confirm and submit with upstream duration and resolution defaults', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: true,
        data: { task_id: 'task_public', state: 'accepted' },
      },
    })
    renderForm(ctyun)
    expect(screen.getByLabelText('Duration (seconds)')).toHaveAttribute(
      'placeholder',
      'Use upstream default'
    )
    expect(screen.getByLabelText('Resolution')).toHaveValue('')
    expect(
      within(screen.getByLabelText('Resolution')).getByRole('option', {
        name: 'Use upstream default',
      })
    ).toHaveValue('')
    fireEvent.click(await openGenerationConfirmation())
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][0]).toBe('/pg/video/tasks')
    const payload = post.mock.calls[0][1] as VideoRequest
    expect(payload).toMatchObject({
      plugin_key: 'ctyun-cdance',
      model: 'cdance2.5-0807',
    })
    expect(payload.parameters).toEqual({})
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    )
  })

  test('legacy CTYun requires duration and resolution before the charge confirmation', async () => {
    renderForm({
      ...ctyun,
      plugin_version: '1.0.1',
      capabilities: {
        ...ctyun.capabilities,
        duration_required: true,
        resolution_required: true,
      },
    })
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'A cat runs' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate video' }))
    expect(await screen.findByText('Duration is required')).toBeVisible()
    expect(screen.getByText('Resolution is required')).toBeVisible()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Duration (seconds) *')).toHaveAttribute(
      'aria-invalid',
      'true'
    )
  })

  test('switching Millu to MoMa removes resolution, aspect ratio and the previous image', () => {
    const view = renderForm()
    fireEvent.change(screen.getByLabelText('Resolution'), {
      target: { value: '1080p' },
    })
    fireEvent.change(screen.getByLabelText('Aspect ratio'), {
      target: { value: 'adaptive' },
    })
    fireEvent.change(screen.getByLabelText('Reference image URL'), {
      target: { value: 'https://media.example/cat.png' },
    })
    view.changeModel(moma)
    expect(screen.queryByLabelText('Resolution')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Aspect ratio')).toHaveValue('')
    expect(screen.getByLabelText('Reference image URL')).toHaveValue('')
  })

  test('without randomUUID, confirmation sends the reference role and prevents a second POST while pending', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    })
    let finish: (value: {
      data: { success: true; data: { task_id: string; state: string } }
    }) => void = () => {}
    const post = vi.spyOn(api, 'post').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    renderForm()
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'A cat runs' },
    })
    fireEvent.change(screen.getByLabelText('Generate audio'), {
      target: { value: 'false' },
    })
    fireEvent.change(screen.getByLabelText('Reference image URL'), {
      target: { value: 'https://media.example/cat.png' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate video' }))
    const confirmation = await screen.findByRole('alertdialog')
    const button = within(confirmation).getByRole('button', {
      name: 'Generate video',
    })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    const [url, rawPayload, config] = post.mock.calls[0]
    const payload = rawPayload as VideoRequest
    expect(url).toBe('/pg/video/tasks')
    expect(payload.parameters).toEqual({ generate_audio: false })
    expect(payload.media).toEqual([
      {
        type: 'image',
        url: 'https://media.example/cat.png',
        role: 'reference_image',
      },
    ])
    expect(config?.headers?.['Idempotency-Key']).toMatch(
      /^[a-zA-Z0-9_-]{16,128}$/
    )
    expect(config?.headers?.['X-Auth-Session']).toBe('test-session')
    expect(screen.getByRole('button', { name: 'Submitting...' })).toBeDisabled()
    finish({
      data: {
        success: true,
        data: { task_id: 'task_public', state: 'accepted' },
      },
    })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Generate video' })
      ).toBeEnabled()
    )
  })

  test('when key generation fails, confirmation stays usable and the next attempt can submit', async () => {
    vi.mocked(nanoid).mockImplementationOnce(() => {
      throw new Error('Random source unavailable')
    })
    const errorToast = vi.spyOn(toast, 'error').mockReturnValue('error-toast')
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        success: true,
        data: { task_id: 'task_public', state: 'accepted' },
      },
    })
    const view = renderForm()
    const confirmation = await openGenerationConfirmation()
    fireEvent.click(confirmation)
    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith('Random source unavailable')
    )
    expect(post).not.toHaveBeenCalled()
    expect(view.onIntent).not.toHaveBeenCalled()
    expect(view.onBusy).not.toHaveBeenCalled()
    expect(confirmation).toBeEnabled()
    expect(screen.getByRole('alertdialog')).toBeVisible()
    fireEvent.click(confirmation)
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(view.onBusy).toHaveBeenLastCalledWith(false))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled()
    expect(errorToast).toHaveBeenCalledTimes(1)
  })

  test.each([
    {
      name: 'a rejected replay shows its error code and allows another generation',
      errorCode: 'upstream_rejected',
      message: 'Operation failed (upstream_rejected)',
    },
    {
      name: 'a rejected replay without an error code shows the failure fallback',
      errorCode: undefined,
      message: 'Operation failed',
    },
  ])('$name', async ({ errorCode, message }) => {
    const errorToast = vi.spyOn(toast, 'error').mockReturnValue('error-toast')
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: { task_id: '', state: 'rejected', error_code: errorCode },
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: { task_id: 'task_public', state: 'accepted' },
        },
      })
    const view = renderForm()
    fireEvent.click(await openGenerationConfirmation())
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith(message))
    expect(errorToast).toHaveBeenCalledTimes(1)
    expect(view.onIntent).toHaveBeenLastCalledWith('')
    await waitFor(() => expect(view.onBusy).toHaveBeenLastCalledWith(false))
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled()

    fireEvent.click(await openGenerationConfirmation())
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(view.onIntent).toHaveBeenLastCalledWith(''))
    await waitFor(() => expect(view.onBusy).toHaveBeenLastCalledWith(false))
    expect(post.mock.calls[1][2]?.headers?.['Idempotency-Key']).not.toBe(
      post.mock.calls[0][2]?.headers?.['Idempotency-Key']
    )
    expect(errorToast).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled()
  })

  test('an unresolved submission disables generation without presenting automatic POST retry', () => {
    renderForm(moma, true)
    expect(
      screen.getByRole('button', { name: 'Generate video' })
    ).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: 'Retry' })
    ).not.toBeInTheDocument()
  })

  test.each(['0', '-1', '3601', '5.5', '1e3'])(
    'an invalid duration %s is rejected before submission',
    (duration) => {
      expect(
        videoFormSchema(millu.capabilities).safeParse({
          ...emptyVideoForm,
          prompt: 'A cat runs',
          duration,
        }).success
      ).toBe(false)
    }
  )
})
