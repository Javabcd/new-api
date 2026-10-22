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
import { AudioLines, Code2, Film, Image, ScanText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { Badge } from '@/components/ui/badge'
import { useMarketingAccess } from '@/features/marketing/use-marketing-access'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'

const SMALL_MODALITIES = [
  {
    icon: ScanText,
    title: 'Text and reasoning',
    subtitle: 'Chat · Reasoning · Agent',
    description:
      'Streaming conversations, deep reasoning, tool calling and structured output provide the foundation for your applications.',
    models: ['gpt-5.6-sol', 'claude-opus-4-8', 'deepseek-v4-pro'],
  },
  {
    icon: AudioLines,
    title: 'Speech and audio',
    subtitle: 'TTS · Music · SFX',
    description:
      'Connect speech synthesis, music and sound effects with your creative workflows through the same gateway.',
    models: ['TTS', 'Music', 'Audio'],
  },
  {
    icon: Code2,
    title: 'Embeddings and retrieval',
    subtitle: 'Embedding · Rerank',
    description:
      'Embeddings and reranking for retrieval-augmented applications, sharing the same API key as generation models.',
    models: ['BAAI/bge-m3', 'jina-reranker-m0'],
  },
] as const

export function MarketingModalities() {
  const { t } = useTranslation()
  const access = useMarketingAccess('pricing')
  const catalog = usePricingData(access.allowed)
  const modelNames = new Set(
    access.allowed ? catalog.models.map((model) => model.model_name) : []
  )
  return (
    <section className='mxy-section' id='modalities'>
      <div className='mxy-wrap'>
        <div className='mxy-section-heading'>
          <Badge variant='outline' className='mxy-eyebrow'>
            <i className='mxy-dot' aria-hidden='true' />
            {t('Multimodal generation')}
          </Badge>
          <h2>{t('Not just conversation. Images, video and sound.')}</h2>
          <p>
            {t(
              'One protocol connects your creative workflows. Choose the model for the modality your product needs, without integrating a separate provider each time.'
            )}
          </p>
        </div>
        <AnimateInView className='mxy-modality-grid' threshold={0}>
          <article className='mxy-modality-card mxy-modality-wide'>
            <div className='mxy-card-heading'>
              <span className='mxy-icon-tile'>
                <Film aria-hidden='true' />
              </span>
              <div>
                <h3>{t('Video generation')}</h3>
                <span>{t('Text / Image → Video')}</span>
              </div>
              <Badge
                role='note'
                variant='outline'
                className='mxy-example-label'
              >
                {t('Illustration')}
              </Badge>
            </div>
            <p>
              {t(
                'Explore text-to-video, image-to-video and storyboard workflows. Available generation capabilities depend on the selected model.'
              )}
            </p>
            <div className='mxy-story-wall'>
              {[1, 2, 3, 4].map((frame) => (
                <div className='mxy-frame' key={frame}>
                  <img
                    src={`/maixiaoyun/images/story-0${frame}.jpg`}
                    alt={t('Video storyboard example {{number}}', {
                      number: frame,
                    })}
                    width={1536}
                    height={960}
                    loading='lazy'
                  />
                  <img
                    className='mxy-play'
                    src='/maixiaoyun/play.svg'
                    alt=''
                    width={22}
                    height={22}
                    loading='lazy'
                  />
                  <span>0{frame}</span>
                </div>
              ))}
            </div>
            <div className='mxy-model-tags'>
              {[
                'doubao-seedance-2-5-260628',
                'sora-2-pro',
                'kling-v2-master',
                'veo-3.1-generate-preview',
              ]
                .filter((model) => modelNames.has(model))
                .map((model) => (
                  <span key={model}>{model}</span>
                ))}
            </div>
          </article>
          <article className='mxy-modality-card mxy-modality-wide'>
            <div className='mxy-card-heading'>
              <span className='mxy-icon-tile'>
                <Image aria-hidden='true' />
              </span>
              <div>
                <h3>{t('Image generation and editing')}</h3>
                <span>{t('Text / Image → Image')}</span>
              </div>
              <Badge
                role='note'
                variant='outline'
                className='mxy-example-label'
              >
                {t('Illustration')}
              </Badge>
            </div>
            <p>
              {t(
                'Generate product imagery, campaign visuals and illustrations. Choose models for image generation, editing and reference-based creative work.'
              )}
            </p>
            <div className='mxy-image-wall'>
              {[1, 2, 3, 4].map((frame) => (
                <img
                  key={frame}
                  src={`/maixiaoyun/images/image-0${frame}.jpg`}
                  alt={t('AI image generation example {{number}}', {
                    number: frame,
                  })}
                  width={1024}
                  height={960}
                  loading='lazy'
                />
              ))}
            </div>
            <div className='mxy-model-tags'>
              {[
                'qwen-image-3.0-pro',
                'gemini-3-pro-image',
                'doubao-seedream-5-0-pro',
              ]
                .filter((model) => modelNames.has(model))
                .map((model) => (
                  <span key={model}>{model}</span>
                ))}
            </div>
          </article>
          {SMALL_MODALITIES.map((card) => (
            <article
              className='mxy-modality-card mxy-modality-small'
              key={card.title}
            >
              <div className='mxy-card-heading'>
                <span className='mxy-icon-tile'>
                  <card.icon aria-hidden='true' />
                </span>
                <div>
                  <h3>{t(card.title)}</h3>
                  <span>{t(card.subtitle)}</span>
                </div>
              </div>
              <p>{t(card.description)}</p>
              {card.icon === AudioLines && (
                <div className='mxy-wave' aria-hidden='true'>
                  {[40, 72, 55, 90, 48, 78, 62, 95, 52, 70, 38, 66].map(
                    (height) => (
                      <i key={height} style={{ height: `${height}%` }} />
                    )
                  )}
                </div>
              )}
              <div className='mxy-model-tags'>
                {card.models
                  .filter(
                    (model) => card.icon === AudioLines || modelNames.has(model)
                  )
                  .map((model) => (
                    <span key={model}>{model}</span>
                  ))}
              </div>
            </article>
          ))}
        </AnimateInView>
      </div>
    </section>
  )
}
