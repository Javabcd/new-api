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
import { createFileRoute, notFound, redirect } from '@tanstack/react-router'

import { VideoApiDocs } from '@/features/video-api-docs'
import { LEGACY_VIDEO_DOC_PAGES } from '@/features/video-api-docs/legacy-pages'
import { isVideoDocPageId } from '@/features/video-api-docs/navigation'

export const Route = createFileRoute('/_authenticated/docs/video/$page')({
  beforeLoad: ({ params }) => {
    if (LEGACY_VIDEO_DOC_PAGES.some((page) => page === params.page)) {
      throw redirect({
        to: '/docs/video/$page',
        params: { page: 'best-practices' },
        hash: 'provider-differences',
        replace: true,
      })
    }
    if (!isVideoDocPageId(params.page)) throw notFound()
    return { videoDocPage: params.page }
  },
  component: VideoDocRoute,
})

function VideoDocRoute() {
  const { videoDocPage } = Route.useRouteContext()
  return <VideoApiDocs key={videoDocPage} page={videoDocPage} />
}
