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
import { useId } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { MARKETING_BRAND } from '@/features/marketing/brand'
import { MarketingActions } from '@/features/marketing/marketing-actions'
import { ModelVendorIcon } from '@/features/marketing/model-vendor-icon'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

const DEMO_MODELS = [
  { vendor: 'OpenAI', name: 'GPT', value: 86 },
  { vendor: 'Anthropic', name: 'Claude', value: 64 },
  { vendor: 'DeepSeek', name: 'DeepSeek', value: 52 },
] as const

export function MarketingHero() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const chartId = useId()
  return (
    <section className='mxy-hero' id='top'>
      <div className='mxy-hero-glow mxy-hero-glow-peach' aria-hidden='true' />
      <div className='mxy-hero-glow mxy-hero-glow-rose' aria-hidden='true' />
      <div className='mxy-hero-glow mxy-hero-glow-lilac' aria-hidden='true' />
      <div className='mxy-wrap mxy-hero-grid'>
        <div>
          <Badge variant='outline' className='mxy-eyebrow'>
            <i className='mxy-dot' aria-hidden='true' />
            {t('One gateway for text, image, video and audio')}
          </Badge>
          <h1>
            <span className='mxy-gradient-text'>
              {t('Tokens connect intelligence')}
            </span>
            <br />
            <span className='mxy-hero-title'>
              {t('One gateway for leading AI models')}
            </span>
          </h1>
          <p className='mxy-lead'>
            <Trans
              i18nKey='{{brand}} AIMXY brings <strong>leading AI models</strong> into one protocol: reasoning, image and video models, all behind one key. Change one <strong>base_url</strong> to move from conversation to creation, with unified access, billing and observability.'
              values={{ brand: MARKETING_BRAND.name }}
              components={{ strong: <strong /> }}
            />
          </p>
          <MarketingActions />
          <div className='mxy-trust'>
            {[
              t('Text, image, video and audio'),
              t('OpenAI-compatible'),
              t('Anthropic-compatible'),
              t('Usage-based billing'),
            ].map((label) => (
              <span key={label}>
                <i aria-hidden='true' />
                {label}
              </span>
            ))}
          </div>
          <p className='mxy-hero-note'>
            {t(
              'This platform forwards API requests. AI generation is provided by upstream model services.'
            )}
          </p>
        </div>
        <div className='mxy-hero-visual' aria-label={t('Token usage preview')}>
          <svg
            className='mxy-hero-flow'
            viewBox='0 0 560 460'
            fill='none'
            aria-hidden='true'
          >
            <path
              d='M48 82C-20 216 38 352 254 356S522 294 526 204'
              stroke='currentColor'
              strokeWidth='1.5'
              strokeDasharray='5 7'
            />
          </svg>
          <div className='mxy-generation-card'>
            <div className='mxy-console-heading'>
              <span className='mxy-window-dots' aria-hidden='true'>
                <i />
                <i />
                <i />
              </span>
              <span>{t('Usage overview')}</span>
              <Badge variant='secondary' className='mxy-live'>
                <i aria-hidden='true' />
                {t('Demo preview')}
              </Badge>
            </div>
            <div className='mxy-usage-total'>
              <strong>{formatNumber(12.84, locale)}M</strong>
              <span>{t('Tokens consumed')}</span>
            </div>
            <svg
              className='mxy-usage-chart'
              viewBox='0 0 460 100'
              preserveAspectRatio='none'
              aria-hidden='true'
            >
              <defs>
                <linearGradient id={chartId} x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='0' stopColor='currentColor' stopOpacity='.3' />
                  <stop offset='1' stopColor='currentColor' stopOpacity='0' />
                </linearGradient>
              </defs>
              <path
                d='M0 74C40 70 62 50 96 54S150 30 188 34S244 58 282 48S340 16 380 20S436 34 460 26V100H0Z'
                fill={`url(#${chartId})`}
              />
              <path
                d='M0 74C40 70 62 50 96 54S150 30 188 34S244 58 282 48S340 16 380 20S436 34 460 26'
                fill='none'
                stroke='currentColor'
                strokeWidth='2.4'
              />
            </svg>
            <div className='mxy-usage-models'>
              {DEMO_MODELS.map((model) => (
                <div className='mxy-usage-model' key={model.vendor}>
                  <ModelVendorIcon name={model.vendor} />
                  <strong>{model.name}</strong>
                  <div className='mxy-usage-track' aria-hidden='true'>
                    <i style={{ width: `${model.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className='mxy-generation-note'>
            <span className='mxy-icon-tile'>
              <Check aria-hidden='true' />
            </span>
            <div>
              <strong>{t('Intelligent routing')}</strong>
              <p>{t('Configurable retries and model routing')}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
