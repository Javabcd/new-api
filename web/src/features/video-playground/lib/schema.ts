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
import { z } from 'zod'

import type { VideoCapabilities, VideoModel, VideoRequest } from '../types'

export function videoFormSchema(cap: VideoCapabilities) {
  return z
    .object({
      prompt: z.string().trim().min(1, 'Prompt is required').max(20000),
      imageUrl: z.string(),
      duration: z.string(),
      resolution: z.string(),
      ratio: z.string(),
      generateAudio: z.enum(['', 'true', 'false']),
      watermark: z.enum(['', 'true', 'false']),
    })
    .superRefine((value, ctx) => {
      if (value.duration === '' && cap.duration_required) {
        ctx.addIssue({
          code: 'custom',
          path: ['duration'],
          message: 'Duration is required',
        })
      }
      if (
        value.duration !== '' &&
        (!/^\d+$/.test(value.duration) ||
          Number(value.duration) < cap.duration_input_min ||
          Number(value.duration) > cap.duration_input_max)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['duration'],
          message: 'Invalid duration',
        })
      }
      if (value.resolution === '' && cap.resolution_required) {
        ctx.addIssue({
          code: 'custom',
          path: ['resolution'],
          message: 'Resolution is required',
        })
      }
      if (
        value.resolution !== '' &&
        !cap.resolutions.includes(value.resolution)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['resolution'],
          message: 'Unsupported resolution',
        })
      }
      if (value.ratio !== '' && !cap.ratios.includes(value.ratio)) {
        ctx.addIssue({
          code: 'custom',
          path: ['ratio'],
          message: 'Unsupported aspect ratio',
        })
      }
      if (value.imageUrl !== '') {
        const url = z.url({ protocol: /^https?$/ }).safeParse(value.imageUrl)
        if (!url.success || /[\s\\]/.test(value.imageUrl)) {
          ctx.addIssue({
            code: 'custom',
            path: ['imageUrl'],
            message: 'Enter an HTTP or HTTPS image URL',
          })
        }
      }
      const mode = value.imageUrl === '' ? 'text_to_video' : 'image_to_video'
      if (!cap.supported_modes.includes(mode)) {
        ctx.addIssue({
          code: 'custom',
          path: ['imageUrl'],
          message: 'This model requires a reference image',
        })
      }
    })
}

export type VideoFormValues = z.infer<ReturnType<typeof videoFormSchema>>

export const emptyVideoForm: VideoFormValues = {
  prompt: '',
  imageUrl: '',
  duration: '',
  resolution: '',
  ratio: '',
  generateAudio: '',
  watermark: '',
}

export function buildVideoRequest(
  model: VideoModel,
  group: string,
  values: VideoFormValues
): VideoRequest {
  const cap = model.capabilities
  const parameters: VideoRequest['parameters'] = {}
  if (values.duration !== '') parameters.duration = Number(values.duration)
  if (values.resolution !== '' && cap.resolutions.includes(values.resolution)) {
    parameters.resolution = values.resolution
  }
  if (values.ratio !== '' && cap.ratios.includes(values.ratio)) {
    parameters.ratio = values.ratio
  }
  if (values.generateAudio !== '' && cap.generate_audio) {
    parameters.generate_audio = values.generateAudio === 'true'
  }
  if (values.watermark !== '' && cap.watermark) {
    parameters.watermark = values.watermark === 'true'
  }
  const media: VideoRequest['media'] = []
  if (
    values.imageUrl !== '' &&
    cap.supported_modes.includes('image_to_video')
  ) {
    media.push({
      type: 'image',
      url: values.imageUrl,
      role: cap.image_roles[0],
    })
  }
  return {
    plugin_key: model.plugin_key,
    model: model.model,
    group,
    prompt: values.prompt,
    media,
    parameters,
  }
}
