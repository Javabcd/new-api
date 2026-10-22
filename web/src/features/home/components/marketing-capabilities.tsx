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
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { Badge } from '@/components/ui/badge'
import { ModelVendorIcon } from '@/features/marketing/model-vendor-icon'
import { useApiBaseUrl } from '@/features/marketing/use-api-base-url'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

export function MarketingCapabilities() {
  const { t, i18n } = useTranslation()
  const baseUrl = useApiBaseUrl()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const capabilities = [
    {
      title: t('Change one base_url to get connected'),
      description: t(
        'Reuse compatible OpenAI and Anthropic SDKs. Bring conversations, streaming and multimodal requests through a unified entry point, with the capabilities supported by your chosen model.'
      ),
      features: [
        t('Reuse OpenAI and Anthropic-compatible SDKs'),
        t('One gateway for text, image, video and audio'),
        t('Switch models with the model parameter'),
      ],
    },
    {
      title: t('Usage-based billing, visible costs'),
      description: t(
        'Review model usage and request records from one console. Model pricing and supported billing units follow the current platform configuration.'
      ),
      features: [
        t('Text, image and video usage on one bill'),
        t('Model pricing in one place'),
        t('Usage and transaction records'),
      ],
    },
    {
      title: t('Multi-channel routing and failover'),
      description: t(
        'Configure upstream channels, routing weights and retry strategies in the console. Use request logs to understand failures and keep improving your integration.'
      ),
      features: [
        t('Multiple upstream channels and configurable weights'),
        t('Configurable retries and model routing'),
        t('Request logs and usage visibility'),
      ],
    },
  ]
  const usage = [
    { label: t('Text and reasoning'), amount: 8420, width: 82 },
    { label: t('Image generation and editing'), amount: 5180, width: 58 },
    { label: t('Video generation'), amount: 3260, width: 38 },
    { label: t('Speech and audio'), amount: 1940, width: 22 },
  ]
  const routes = [
    { vendor: 'OpenAI', model: 'gpt-5.6-sol', state: t('Primary channel') },
    { vendor: 'ByteDance', model: 'Seedance 2.5', state: t('Task routing') },
    {
      vendor: 'DeepSeek',
      model: 'deepseek-v4-pro',
      state: t('Fallback channel'),
    },
  ]
  return (
    <section className='mxy-section mxy-tinted' id='capabilities'>
      <div className='mxy-wrap'>
        <div className='mxy-section-heading'>
          <Badge variant='outline' className='mxy-eyebrow'>
            <i className='mxy-dot' aria-hidden='true' />
            {t('Core capabilities')}
          </Badge>
          <h2>{t('Turn model integration into infrastructure')}</h2>
          <p>
            {t(
              'Three everyday needs: integrate quickly, understand usage, keep requests moving.'
            )}
          </p>
        </div>
        {capabilities.map((capability, index) => (
          <AnimateInView
            key={capability.title}
            className={`mxy-capability${index === 1 ? ' mxy-capability-reversed' : ''}`}
          >
            <div className='mxy-capability-copy'>
              <div className='mxy-capability-number'>{index + 1}</div>
              <h3>{capability.title}</h3>
              <p>{capability.description}</p>
              <ul className='mxy-capability-list'>
                {capability.features.map((feature) => (
                  <li key={feature}>
                    <Check aria-hidden='true' />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            <div className='mxy-capability-visual'>
              <div className='mxy-visual-heading'>
                <span className='mxy-window-dots' aria-hidden='true'>
                  <i />
                  <i />
                  <i />
                </span>
                {index === 0 && t('Migration at a glance')}
                {index === 1 && t('Generation usage preview')}
                {index === 2 && t('Routing preview')}
                <span>{t('Illustration')}</span>
              </div>
              {index === 0 && (
                <div className='mxy-diff'>
                  <div className='mxy-diff-removed'>
                    <span className='mxy-diff-sign'>−</span>base_url =
                    "https://api.openai.com/v1"
                  </div>
                  <div className='mxy-diff-added'>
                    <span className='mxy-diff-sign'>+</span>base_url = "
                    {baseUrl}"
                  </div>
                  <div className='mxy-diff-unchanged'>
                    <span className='mxy-diff-sign'> </span>api_key =
                    os.environ["AIMXY_API_KEY"]
                  </div>
                  <div className='mxy-diff-unchanged'>
                    <span className='mxy-diff-sign'> </span>client =
                    OpenAI(base_url=base_url, api_key=api_key)
                  </div>
                  <div className='mxy-diff-unchanged'>
                    <span className='mxy-diff-sign'> </span>resp =
                    client.chat.completions.create(...)
                  </div>
                </div>
              )}
              {index === 1 && (
                <div className='mxy-usage-bars'>
                  {usage.map((row) => (
                    <div className='mxy-usage-row' key={row.label}>
                      <div>
                        <span>{row.label}</span>
                        <b>{formatNumber(row.amount, locale)}</b>
                      </div>
                      <div className='mxy-usage-track'>
                        <i style={{ width: `${row.width}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {index === 2 && (
                <div className='mxy-route-preview'>
                  {routes.map((route) => (
                    <div className='mxy-route-row' key={route.model}>
                      <ModelVendorIcon name={route.vendor} />
                      <span>{route.model}</span>
                      <span>{route.state}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </AnimateInView>
        ))}
      </div>
    </section>
  )
}
