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
import { describe, expect, it } from 'vitest'

import { checkIsActive } from '../lib/url-utils'

describe('sidebar page selection', () => {
  it.each([
    ['/docs/video/create#request-parameters', true],
    ['/docs/video/create?view=api#request-parameters', true],
    ['/docs/video/retrieve#request-parameters', false],
    ['/docs/video/create-extra#request-parameters', false],
  ])(
    'selects a document link for %s only when its page matches (%s)',
    (href, active) => {
      expect(
        checkIsActive(href, {
          title: 'Create a video task',
          url: '/docs/video/create',
        })
      ).toBe(active)
    }
  )

  it('keeps a document selected when its configured URL names a different chapter', () => {
    expect(
      checkIsActive('/docs/video/create#request-parameters', {
        title: 'Create a video task',
        url: '/docs/video/create#endpoint',
      })
    ).toBe(true)
  })

  it.each([
    ['/docs/video/create?view=api#request-parameters', true],
    ['/docs/video/create?view=other#request-parameters', false],
    ['/docs/video/create#request-parameters', false],
  ])(
    'selects a query-specific link for %s only when its query matches (%s)',
    (href, active) => {
      expect(
        checkIsActive(href, {
          title: 'Create a video task',
          url: '/docs/video/create?view=api#endpoint',
        })
      ).toBe(active)
    }
  )

  it.each([
    ['/docs/video/create#request-parameters', true],
    ['/docs/video/retrieve?view=api#task-status', true],
    ['/docs/video/retrieve?view=other#task-status', false],
  ])(
    'activates a collapsible group for %s only when a child matches (%s)',
    (href, active) => {
      expect(
        checkIsActive(href, {
          title: 'API reference',
          items: [
            {
              title: 'Create a video task',
              url: '/docs/video/create#endpoint',
            },
            {
              title: 'Query a video task',
              url: '/docs/video/retrieve?view=api#endpoint',
            },
          ],
        })
      ).toBe(active)
    }
  )

  it.each([
    ['/docs#introduction', '/docs', true],
    ['/docs?view=api#introduction', '/docs#overview', true],
    ['/docs/video/retrieve#introduction', '/docs', false],
  ])(
    'selects the alias %s -> %s only when its page matches (%s)',
    (href, alias, active) => {
      expect(
        checkIsActive(href, {
          title: 'Documentation',
          url: '/docs/video/overview',
          activeUrls: [alias],
        })
      ).toBe(active)
    }
  )
})
