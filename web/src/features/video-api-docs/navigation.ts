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
export const VIDEO_DOC_PAGES = [
  { id: 'overview', title: 'Video API overview', group: 'Getting started' },
  { id: 'create', title: 'Create a video task', group: 'API reference' },
  { id: 'retrieve', title: 'Query a video task', group: 'API reference' },
  { id: 'content', title: 'Download a video', group: 'API reference' },
  { id: 'ctyun-cdance', title: 'CTYun Cdance', group: 'Video providers' },
  { id: 'millu-seedance', title: 'Millu Seedance', group: 'Video providers' },
  {
    id: 'moma-seedance',
    title: 'China Mobile MoMa Seedance',
    group: 'Video providers',
  },
  { id: 'troubleshooting', title: 'Video API troubleshooting', group: 'Help' },
] as const

export type VideoDocPageId = (typeof VIDEO_DOC_PAGES)[number]['id']

export function isVideoDocPageId(value: string): value is VideoDocPageId {
  return VIDEO_DOC_PAGES.some((page) => page.id === value)
}
