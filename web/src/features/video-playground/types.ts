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
export interface VideoCapabilities {
  supported_modes: string[]
  resolutions: string[]
  ratios: string[]
  image_roles: string[]
  duration_required: boolean
  resolution_required: boolean
  duration_input_min: number
  duration_input_max: number
  generate_audio: boolean
  watermark: boolean
}

export interface VideoModel {
  plugin_key: string
  model: string
  display_name: string
  plugin_version: string
  capabilities: VideoCapabilities
  available: boolean
  disabled_reason?: string
}

export interface VideoRequest {
  plugin_key: string
  model: string
  group: string
  prompt: string
  media: { type: 'image'; url: string; role: string }[]
  parameters: {
    duration?: number
    resolution?: string
    ratio?: string
    generate_audio?: boolean
    watermark?: boolean
  }
}

export interface VideoTask {
  task_id: string
  plugin_key: string
  model: string
  status: string
  created_at: number
  finish_time: number
}

export interface VideoSubmission {
  task_id: string
  state: 'pending' | 'accepted' | 'unknown' | 'rejected'
  error_code?: string
}
