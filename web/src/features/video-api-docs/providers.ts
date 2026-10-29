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
export const VIDEO_DOC_PROVIDERS = {
  'ctyun-cdance': {
    name: 'CTYun Cdance',
    model: 'cdance2.0-0807',
    nativePath: '/ctyun/v1/contents/generations/tasks',
    models: [
      { name: 'cdance2.0-0807', resolutions: '480p / 720p / 1080p / 4k' },
      { name: 'cdance2.0-fast-0807', resolutions: '480p / 720p' },
      { name: 'cdance2.0-mini-0807', resolutions: '480p / 720p' },
      { name: 'cdance2.5-0807', resolutions: '480p / 720p / 1080p' },
      { name: 'cdance2.0-0813', resolutions: '480p / 720p / 1080p' },
    ],
  },
  'millu-seedance': {
    name: 'Millu Seedance',
    model: 'millu-sd-x-2-5-260801',
    nativePath: '/millu/api/v3/contents/generations/tasks',
    models: [{ name: 'millu-sd-x-2-5-260801', resolutions: '720p / 1080p' }],
  },
  'moma-seedance': {
    name: 'China Mobile MoMa Seedance',
    model: 'doubao-seedance-2-0-260128',
    nativePath: '/moma/api/v3/contents/generations/tasks',
    models: [
      {
        name: 'doubao-seedance-2-0-260128',
        resolutions: '480p / 720p / 1080p',
      },
      { name: 'doubao-seedance-2.0', resolutions: '480p / 720p / 1080p' },
    ],
  },
} as const

export type VideoDocProviderId = keyof typeof VIDEO_DOC_PROVIDERS
