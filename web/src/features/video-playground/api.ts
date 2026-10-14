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
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import type {
  VideoModel,
  VideoRequest,
  VideoSubmission,
  VideoTask,
} from './types'

interface Result<T> {
  success: boolean
  message?: string
  data: T
}

export async function getUnresolvedVideoSubmissions(): Promise<
  VideoSubmission[]
> {
  const response = await api.get<Result<VideoSubmission[]>>(
    '/pg/video/submissions'
  )
  return requireServerSuccess(response.data).data
}

export async function getVideoModels(group: string): Promise<VideoModel[]> {
  const response = await api.get<Result<{ models: VideoModel[] }>>(
    '/pg/video/models',
    { params: { group } }
  )
  return requireServerSuccess(response.data).data.models
}

export async function getVideoTasks(page: number): Promise<VideoTask[]> {
  const response = await api.get<Result<VideoTask[]>>('/pg/video/tasks', {
    params: { page },
  })
  return requireServerSuccess(response.data).data
}

export async function submitVideo(
  payload: VideoRequest,
  key: string,
  sessionID: string
): Promise<VideoSubmission> {
  const response = await api.post<Result<VideoSubmission>>(
    '/pg/video/tasks',
    payload,
    {
      headers: { 'Idempotency-Key': key, 'X-Auth-Session': sessionID },
      timeout: 960_000,
    }
  )
  return requireServerSuccess(response.data).data
}

export async function getVideoSubmission(
  key: string
): Promise<VideoSubmission> {
  const response = await api.get<Result<VideoSubmission>>(
    `/pg/video/submissions/${encodeURIComponent(key)}`
  )
  return requireServerSuccess(response.data).data
}
