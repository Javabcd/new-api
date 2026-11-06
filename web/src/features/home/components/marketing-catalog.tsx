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
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { selectFeaturedModels } from '@/features/marketing/featured-models'
import { ModelVendorIcon } from '@/features/marketing/model-vendor-icon'
import { useMarketingAccess } from '@/features/marketing/use-marketing-access'
import {
  CATALOG_CAPABILITIES,
  CATALOG_CAPABILITY_VALUES,
} from '@/features/pricing/constants'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { getCatalogCapabilities } from '@/features/pricing/lib/filters'
import type { CatalogCapability } from '@/features/pricing/types'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

export function MarketingCatalog() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const access = useMarketingAccess('pricing')
  const catalog = usePricingData(access.allowed)
  const [capability, setCapability] = useState<CatalogCapability | 'all'>('all')
  if (!access.enabled) return null

  const models = access.allowed ? catalog.models : []
  const featured = selectFeaturedModels(models, 4)
  const wallModels = models
    .filter(
      (model) =>
        capability === 'all' ||
        getCatalogCapabilities(model).includes(capability)
    )
    .slice(0, 24)
  const vendorCount = new Set(
    models.map((model) => model.vendor_id ?? model.vendor_name).filter(Boolean)
  ).size

  return (
    <>
      <section
        className='mxy-stats-section'
        aria-label={t('Platform overview')}
      >
        <div className='mxy-wrap mxy-stat-grid'>
          <div className='mxy-stat'>
            <strong>
              {access.allowed && !catalog.isLoading && !catalog.error
                ? formatNumber(models.length, locale)
                : '—'}
            </strong>
            <span>{t('Models in the live catalog')}</span>
          </div>
          <div className='mxy-stat'>
            <strong>
              {access.allowed && !catalog.isLoading && !catalog.error
                ? formatNumber(vendorCount, locale)
                : '—'}
            </strong>
            <span>{t('Model providers')}</span>
          </div>
          <div className='mxy-stat'>
            <strong>{t('Multimodal')}</strong>
            <span>{t('Text, image, video and audio')}</span>
          </div>
          <div className='mxy-stat'>
            <strong>{t('One API')}</strong>
            <span>{t('Unified access and observability')}</span>
          </div>
        </div>
      </section>
      <section className='mxy-section mxy-tinted' id='plaza'>
        <div className='mxy-wrap'>
          <div className='mxy-section-heading mxy-centered'>
            <Badge variant='outline' className='mxy-eyebrow'>
              <i className='mxy-dot' aria-hidden='true' />
              {t('Model Square')}
            </Badge>
            <h2>{t('Leading models, all behind one key')}</h2>
            <p>
              {t(
                'Explore leading reasoning, image and video models from the live catalog. One authentication method, one bill: switch models by changing the model parameter.'
              )}
            </p>
          </div>
          {!access.allowed && access.requiresAuth && (
            <EmptyState
              title={t('Sign in to explore models')}
              description={t('This model catalog requires an account.')}
              action={
                <Button
                  render={
                    <Link to='/sign-in' search={{ redirect: '/pricing' }} />
                  }
                >
                  {t('Sign in')}
                </Button>
              }
            />
          )}
          {(access.pending || (access.allowed && catalog.isLoading)) && (
            <div className='mxy-featured-grid'>
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className='h-40 rounded-2xl' />
              ))}
            </div>
          )}
          {access.error && (
            <ErrorState
              title={t('Unable to load models')}
              onRetry={() => {
                void access.refetch()
              }}
            />
          )}
          {access.allowed && catalog.error && (
            <ErrorState
              title={t('Unable to load models')}
              onRetry={() => {
                void catalog.refetch()
              }}
            />
          )}
          {access.allowed &&
            !catalog.isLoading &&
            !catalog.error &&
            (featured.length > 0 ? (
              <div
                className='mxy-featured-grid'
                role='group'
                aria-label={t('Featured models')}
              >
                {featured.map((model) => (
                  <Link
                    to='/pricing/$modelId'
                    params={{ modelId: model.model_name }}
                    key={model.model_name}
                    aria-label={model.model_name}
                    className='mxy-featured-model'
                  >
                    <div className='mxy-featured-top'>
                      <ModelVendorIcon
                        name={model.vendor_name}
                        icon={model.icon || model.vendor_icon}
                      />
                      <div className='mxy-model-info'>
                        <strong title={model.model_name}>
                          {model.model_name}
                        </strong>
                        <span>{model.vendor_name || t('AI model')}</span>
                      </div>
                    </div>
                    <p>
                      {model.description ||
                        t(
                          'View model details, current prices and supported endpoints.'
                        )}
                    </p>
                    <div className='mxy-featured-capabilities'>
                      {getCatalogCapabilities(model).map((value) => (
                        <Badge key={value} variant='secondary'>
                          {t(CATALOG_CAPABILITIES[value].shortLabelKey)}
                        </Badge>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title={t('No models available')}
                description={t(
                  'The live catalog will appear here when models are published.'
                )}
              />
            ))}
          {access.allowed &&
            !catalog.isLoading &&
            !catalog.error &&
            models.length > 0 && (
              <>
                <div
                  className='mxy-capability-tags'
                  role='group'
                  aria-label={t('Capabilities')}
                >
                  <Button
                    variant={capability === 'all' ? 'default' : 'outline'}
                    aria-pressed={capability === 'all'}
                    onClick={() => setCapability('all')}
                  >
                    {t('All capabilities')}
                  </Button>
                  {CATALOG_CAPABILITY_VALUES.map((value) => (
                    <Button
                      key={value}
                      variant={capability === value ? 'default' : 'outline'}
                      aria-pressed={capability === value}
                      onClick={() => setCapability(value)}
                    >
                      {t(CATALOG_CAPABILITIES[value].labelKey)}
                    </Button>
                  ))}
                </div>
                <div
                  className='mxy-model-wall'
                  role='group'
                  aria-label={t('Model results')}
                >
                  {wallModels.map((model) => (
                    <Link
                      key={model.model_name}
                      to='/pricing/$modelId'
                      params={{ modelId: model.model_name }}
                      className='mxy-wall-model'
                      aria-label={model.model_name}
                    >
                      <ModelVendorIcon
                        name={model.vendor_name}
                        icon={model.icon || model.vendor_icon}
                      />
                      <div className='mxy-model-info'>
                        <strong title={model.model_name}>
                          {model.model_name}
                        </strong>
                        <span>{model.vendor_name || t('AI model')}</span>
                      </div>
                    </Link>
                  ))}
                </div>
                {wallModels.length === 0 && (
                  <EmptyState
                    title={t('No models available')}
                    action={
                      <Button
                        variant='outline'
                        onClick={() => setCapability('all')}
                      >
                        {t('Reset')}
                      </Button>
                    }
                  />
                )}
              </>
            )}
          <div className='mxy-section-bottom'>
            <p>
              {t(
                'Model availability and pricing follow the current platform configuration.'
              )}
            </p>
            <Button
              className='mxy-button mxy-button-small'
              render={<Link to='/pricing' />}
            >
              {t('View all models')}
              <ArrowRight aria-hidden='true' />
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
