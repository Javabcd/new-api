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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CodeBlock } from '@/components/ai-elements/code-block'
import { CopyButton } from '@/components/copy-button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  buildVideoExample,
  type VideoExampleLanguage,
  type VideoExampleOperation,
} from '../examples'
import type { VideoDocProviderId } from '../providers'

const LANGUAGES = [
  { id: 'curl', title: 'cURL', highlight: 'bash' },
  { id: 'python', title: 'Python', highlight: 'python' },
  { id: 'javascript', title: 'JavaScript', highlight: 'javascript' },
] as const

export function VideoCodeExamples(props: {
  baseUrl: string
  provider?: VideoDocProviderId
  operation: VideoExampleOperation
  imageReference?: boolean
}) {
  const { t } = useTranslation()
  const [language, setLanguage] = useState<VideoExampleLanguage>('curl')
  return (
    <Tabs
      value={language}
      onValueChange={(value) => setLanguage(value as VideoExampleLanguage)}
    >
      <TabsList aria-label={t('Code examples')}>
        {LANGUAGES.map((entry) => (
          <TabsTrigger key={entry.id} value={entry.id}>
            {entry.title}
          </TabsTrigger>
        ))}
      </TabsList>
      {LANGUAGES.map((entry) => {
        const code = buildVideoExample({
          baseUrl: props.baseUrl,
          provider: props.provider ?? 'ctyun-cdance',
          operation: props.operation,
          imageReference: props.imageReference,
          language: entry.id,
        })
        return (
          <TabsContent key={entry.id} value={entry.id} className='min-w-0'>
            <CodeBlock
              code={code}
              language={entry.highlight}
              enableCollapse={false}
              maxExpandedLines={18}
              showToolbar
              title={entry.title}
            >
              <CopyButton value={code} tooltip={t('Copy code')} />
            </CodeBlock>
          </TabsContent>
        )
      })}
    </Tabs>
  )
}
