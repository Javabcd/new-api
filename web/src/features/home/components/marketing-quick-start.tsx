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
import { Link } from '@tanstack/react-router'
import { BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useApiBaseUrl } from '@/features/marketing/use-api-base-url'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'

export function MarketingQuickStart() {
  const { t } = useTranslation()
  const baseUrl = useApiBaseUrl()
  const docs = useTopNavLinks().find(
    (link) => link.external || link.href === '/docs'
  )
  const examples = [
    {
      language: 'cURL',
      value: `curl ${baseUrl}/chat/completions \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "YOUR_MODEL_NAME",\n    "messages": [{"role": "user", "content": "Hello!"}]\n  }'`,
    },
    {
      language: 'Python',
      value: `from openai import OpenAI\n\nclient = OpenAI(\n    api_key="YOUR_API_KEY",\n    base_url="${baseUrl}",\n)\n\nresponse = client.chat.completions.create(\n    model="YOUR_MODEL_NAME",\n    messages=[{"role": "user", "content": "Hello!"}],\n)\nprint(response.choices[0].message.content)`,
    },
    {
      language: 'TypeScript',
      value: `import OpenAI from 'openai'\n\nconst client = new OpenAI({\n  apiKey: process.env.AIMXY_API_KEY,\n  baseURL: '${baseUrl}',\n})\n\nconst response = await client.chat.completions.create({\n  model: 'YOUR_MODEL_NAME',\n  messages: [{ role: 'user', content: 'Hello!' }],\n})\nconsole.log(response.choices[0].message.content)`,
    },
  ]
  const steps = [
    {
      title: t('Register and create an API key'),
      description: t('Sign in to the console and set up your workspace.'),
    },
    {
      title: t('Update your base URL'),
      description: t(
        'Point requests to {{baseUrl}} and keep your existing SDK.',
        { baseUrl }
      ),
    },
    {
      title: t('Call your chosen model'),
      description: t(
        'Change the model parameter to explore available models, with usage recorded in one place.'
      ),
    },
  ]
  return (
    <section className='mxy-section mxy-quick-start' id='getting-started'>
      <div className='mxy-wrap'>
        <div className='mxy-section-heading mxy-centered'>
          <Badge variant='outline' className='mxy-eyebrow'>
            <i className='mxy-dot' aria-hidden='true' />
            {t('Quick start')}
          </Badge>
          <h2>{t('Your first request, in three steps')}</h2>
          <p>
            {t(
              'Keep your SDK and architecture. Create a key, update the address, and start building.'
            )}
          </p>
        </div>
        <ol className='mxy-steps'>
          {steps.map((step, index) => (
            <li key={step.title}>
              <span>STEP 0{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
        <Tabs defaultValue='cURL' className='mxy-code-panel'>
          <TabsList aria-label={t('Code examples')}>
            {examples.map((example) => (
              <TabsTrigger key={example.language} value={example.language}>
                {example.language}
              </TabsTrigger>
            ))}
          </TabsList>
          {examples.map((example) => (
            <TabsContent key={example.language} value={example.language}>
              <div className='mxy-code-toolbar'>
                <span className='mxy-window-dots' aria-hidden='true'>
                  <i />
                  <i />
                  <i />
                </span>
                <code>
                  {baseUrl} / {example.language}
                </code>
                <CopyButton value={example.value} tooltip={t('Copy code')} />
              </div>
              <pre>
                <code>{example.value}</code>
              </pre>
            </TabsContent>
          ))}
        </Tabs>
        <div className='mxy-compatible-apps'>
          <span>{t('Works with your tools')}</span>
          <a
            href='https://cherry-ai.com'
            target='_blank'
            rel='noopener noreferrer'
          >
            Cherry Studio ↗
          </a>
          <a
            href='https://ccswitch.io'
            target='_blank'
            rel='noopener noreferrer'
          >
            CC Switch ↗
          </a>
          {docs && (
            <Button
              variant='outline'
              className='mxy-button-outline mxy-button-small'
              render={
                docs.external ? (
                  <a
                    href={docs.href}
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                ) : (
                  <Link to={docs.href} />
                )
              }
            >
              <BookOpen aria-hidden='true' />
              {t('Documentation')}
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
