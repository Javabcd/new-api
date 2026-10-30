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
import {
  BookOpen01Icon,
  Download01Icon,
  FileAddIcon,
  Search01Icon,
  SparklesIcon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type HugeiconsIconProps } from '@hugeicons/react'
import type { TFunction } from 'i18next'
import type { ComponentType } from 'react'

import {
  VIDEO_DOC_PAGES,
  type VideoDocPageId,
} from '@/features/video-api-docs/navigation'

import type { NavGroup, SidebarView } from '../types'

type VideoDocIconProps = Omit<HugeiconsIconProps, 'icon'>

const VIDEO_DOC_ICONS = {
  overview: (props) => (
    <HugeiconsIcon {...props} icon={BookOpen01Icon} aria-hidden='true' />
  ),
  create: (props) => (
    <HugeiconsIcon {...props} icon={FileAddIcon} aria-hidden='true' />
  ),
  retrieve: (props) => (
    <HugeiconsIcon {...props} icon={Search01Icon} aria-hidden='true' />
  ),
  content: (props) => (
    <HugeiconsIcon {...props} icon={Download01Icon} aria-hidden='true' />
  ),
  'best-practices': (props) => (
    <HugeiconsIcon {...props} icon={SparklesIcon} aria-hidden='true' />
  ),
  troubleshooting: (props) => (
    <HugeiconsIcon {...props} icon={Wrench01Icon} aria-hidden='true' />
  ),
} satisfies Record<VideoDocPageId, ComponentType<VideoDocIconProps>>

function getVideoDocsNavGroups(t: TFunction): NavGroup[] {
  const groups: NavGroup[] = []
  for (const page of VIDEO_DOC_PAGES) {
    let group = groups.find((entry) => entry.id === page.group)
    if (!group) {
      group = { id: page.group, title: t(page.group), items: [] }
      groups.push(group)
    }
    group.items.push({
      title: t(page.title),
      url: `/docs/video/${page.id}`,
      icon: VIDEO_DOC_ICONS[page.id],
    })
  }
  return groups
}

export const VIDEO_API_DOCS_VIEW: SidebarView = {
  id: 'video-api-docs',
  pathPattern: /^\/docs(\/|$)/,
  parent: { to: '/dashboard/overview', label: 'Back to Dashboard' },
  getNavGroups: getVideoDocsNavGroups,
}
