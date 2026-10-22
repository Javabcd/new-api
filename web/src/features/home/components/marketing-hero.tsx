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
import { Trans, useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { MarketingActions } from '@/features/marketing/marketing-actions'

const MODEL_CHIPS = [
  'GPT-5.6',
  'Claude Opus 4.8',
  'DeepSeek V4',
  'Seedance 2.5',
  'Sora 2 Pro',
  'Kling v2',
]

export function MarketingHero() {
  const { t } = useTranslation()
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
              {t('Tokens power possibilities')}
            </span>
            <br />
            <span className='mxy-hero-title'>
              {t('One gateway for multimodal creation')}
            </span>
          </h1>
          <p className='mxy-lead'>
            <Trans
              i18nKey='Maixiaoyun AIMXY brings <strong>leading AI models</strong> into one protocol: reasoning, image and video models, all behind one key. Change one <strong>base_url</strong> to move from conversation to creation, with unified access, billing and observability.'
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
        </div>
        <div
          className='mxy-hero-visual'
          aria-label={t('Multimodal generation preview')}
        >
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
              <span>AIMXY Studio · {t('Multimodal generation')}</span>
              <Badge variant='secondary' className='mxy-live'>
                <i aria-hidden='true' />
                {t('Demo preview')}
              </Badge>
            </div>
            <div className='mxy-prompt'>
              <span>/imagine</span>
              <p>
                {t(
                  'A wheat spirit floating in a nebula, cinematic, backlit, 8K'
                )}
              </p>
              <i className='mxy-caret' aria-hidden='true' />
            </div>
            <div className='mxy-mode-labels'>
              {[t('Text'), t('Image'), t('Video'), t('Audio')].map(
                (label, index) => (
                  <Badge
                    key={label}
                    variant='outline'
                    className={index === 2 ? 'mxy-mode-active' : undefined}
                  >
                    {label}
                  </Badge>
                )
              )}
            </div>
            <div className='mxy-frames'>
              {[1, 2, 3, 4].map((frame) => (
                <div className='mxy-frame' key={frame}>
                  <img
                    src={`/maixiaoyun/images/hero-0${frame}.jpg`}
                    alt={t('Wheat field storyboard, frame {{frame}}', {
                      frame,
                    })}
                    width={1536}
                    height={960}
                    fetchPriority={frame === 1 ? 'high' : undefined}
                  />
                  <img
                    className='mxy-play'
                    src='/maixiaoyun/play.svg'
                    alt=''
                    width={27}
                    height={27}
                  />
                  <span>0{frame}</span>
                </div>
              ))}
            </div>
            <Progress
              value={78}
              aria-label={t('Demo generation progress')}
              className='mxy-demo-progress'
            />
            <div className='mxy-console-meta'>
              <span>
                <b>doubao-seedance-2-5-260628</b> · 1080p · 5s · 16:9
              </span>
              <span>78%</span>
            </div>
          </div>
          <div className='mxy-generation-note'>
            <span className='mxy-icon-tile'>
              <Check aria-hidden='true' />
            </span>
            <div>
              <strong>{t('Token usage in one place')}</strong>
              <p>{t('Text, image and video usage on one bill')}</p>
            </div>
          </div>
          <div className='mxy-provider-pills'>
            {MODEL_CHIPS.map((name) => (
              <Badge variant='outline' key={name}>
                <i aria-hidden='true' />
                {name}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
