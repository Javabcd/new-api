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
import { ArrowRight, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useRankings } from '@/features/rankings/hooks/use-rankings'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber } from '@/lib/format'

import { ModelVendorIcon } from './model-vendor-icon'
import { useMarketingAccess } from './use-marketing-access'

interface RankingsPreviewProps {
  appearance?: 'default' | 'catalog'
  onPricingFilterSelect?: (filters: {
    search?: string
    vendor?: string
  }) => void
}

export function RankingsPreview(props: RankingsPreviewProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const catalog = props.appearance === 'catalog'
  const access = useMarketingAccess('rankings')
  const pricing = useMarketingAccess('pricing')
  const query = useRankings('week', access.allowed)
  if (!access.enabled) return null
  const snapshot = access.allowed ? query.data?.data : undefined
  const columns = snapshot
    ? [
        {
          title: t('Model rankings'),
          rows: snapshot.models.slice(0, 10).map((row) => ({
            name: row.model_name,
            provider: row.vendor,
            vendor: row.vendor,
            icon: row.vendor_icon,
            value: formatCompactNumber(row.total_tokens, locale),
            metric: row.total_tokens,
            search: { search: row.model_name },
          })),
        },
        {
          title: t('Provider rankings'),
          rows: snapshot.vendors.slice(0, 10).map((row) => ({
            name: row.vendor,
            provider: row.vendor,
            vendor: t('{{count}} models', { count: row.models_count }),
            icon: row.vendor_icon,
            value: formatCompactNumber(row.total_tokens, locale),
            metric: row.total_tokens,
            search: { vendor: row.vendor },
          })),
        },
        {
          title: t('Rising models'),
          rows: snapshot.top_movers.slice(0, 10).map((row) => ({
            name: row.model_name,
            provider: row.vendor,
            vendor: row.vendor,
            icon: row.vendor_icon,
            value: `+${formatNumber(row.rank_delta, locale)}`,
            metric: row.rank_delta,
            search: { search: row.model_name },
          })),
        },
      ]
    : []

  return (
    <section
      className={
        catalog
          ? 'mxy-section mxy-tinted mxy-catalog-rank'
          : 'mxy-section mxy-tinted'
      }
      id='rank'
    >
      <div className='mxy-wrap'>
        <div className='mxy-section-heading'>
          <Badge variant='outline' className='mxy-eyebrow'>
            {catalog ? (
              <span className='mxy-dot' aria-hidden='true' />
            ) : (
              <TrendingUp aria-hidden='true' />
            )}
            {t('Live platform rankings')}
          </Badge>
          <h2>{t('See what is moving this week')}</h2>
          <p>
            {t(
              'Model and provider rankings use actual platform token usage. Rising models show changes in rank.'
            )}
          </p>
        </div>
        {!access.allowed && access.requiresAuth && (
          <EmptyState
            title={t('Sign in to view rankings')}
            action={
              <Button
                render={
                  <Link to='/sign-in' search={{ redirect: '/rankings' }} />
                }
              >
                {t('Sign in')}
              </Button>
            }
          />
        )}
        {(access.pending || (access.allowed && query.isLoading)) && (
          <div className='mxy-three-columns'>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className='h-80 rounded-2xl' />
            ))}
          </div>
        )}
        {access.error && (
          <ErrorState
            title={t('Unable to load rankings')}
            onRetry={() => {
              void access.refetch()
            }}
          />
        )}
        {access.allowed && query.isError && (
          <ErrorState
            title={t('Unable to load rankings')}
            onRetry={() => {
              void query.refetch()
            }}
          />
        )}
        {snapshot && !query.isError && (
          <div className='mxy-three-columns'>
            {columns.map((column) => {
              const maximum = Math.max(
                0,
                ...column.rows.map((row) => row.metric)
              )
              return (
                <article className='mxy-ranking-card' key={column.title}>
                  <h3>{column.title}</h3>
                  {column.rows.length === 0 ? (
                    <p className='mxy-ranking-empty'>
                      {t('No ranking data for this period')}
                    </p>
                  ) : (
                    <ol>
                      {column.rows.map((row, i) => (
                        <li key={row.name}>
                          <span className='mxy-rank-number'>{i + 1}</span>
                          <span className='mxy-rank-icon'>
                            <ModelVendorIcon
                              name={row.provider}
                              icon={row.icon}
                            />
                          </span>
                          <div className='mxy-rank-name'>
                            {pricing.enabled ? (
                              <Link
                                to='/pricing'
                                search={row.search}
                                title={row.name}
                                onClick={(event) => {
                                  if (
                                    event.defaultPrevented ||
                                    event.button !== 0 ||
                                    event.metaKey ||
                                    event.ctrlKey ||
                                    event.shiftKey ||
                                    event.altKey
                                  ) {
                                    return
                                  }
                                  props.onPricingFilterSelect?.(row.search)
                                }}
                              >
                                {row.name}
                              </Link>
                            ) : (
                              <strong title={row.name}>{row.name}</strong>
                            )}
                            <span>{row.vendor}</span>
                          </div>
                          {catalog && (
                            <span
                              className='mxy-ranking-bar'
                              role='img'
                              aria-label={`${column.title}: ${row.value}`}
                              title={row.value}
                            >
                              <i
                                style={{
                                  width: `${maximum > 0 ? Math.min(100, Math.max(0, (row.metric / maximum) * 100)) : 0}%`,
                                }}
                              />
                            </span>
                          )}
                          <span
                            className={
                              catalog
                                ? 'mxy-ranking-value sr-only'
                                : 'mxy-ranking-value'
                            }
                          >
                            {row.value}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </article>
              )
            })}
          </div>
        )}
        <div className='mxy-section-bottom'>
          <p>{t('Current week · based on platform usage')}</p>
          <Button
            variant='ghost'
            render={<Link to='/rankings' search={{ period: 'week' }} />}
          >
            {t('View full rankings')}
            <ArrowRight aria-hidden='true' />
          </Button>
        </div>
      </div>
    </section>
  )
}
