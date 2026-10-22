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
import { Link, useRouter } from '@tanstack/react-router'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { PublicLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MarketingFooter } from '@/features/marketing/marketing-footer'
import { RankingsPreview } from '@/features/marketing/rankings-preview'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

import {
  LoadingSkeleton,
  EmptyState,
  SearchBar,
  PricingTable,
  PricingSidebar,
  PricingToolbar,
  ModelCardGrid,
  ModelDetailsDrawer,
} from './components'
import { CATALOG_CAPABILITIES, EXCLUDED_GROUPS, VIEW_MODES } from './constants'
import { useFilters } from './hooks/use-filters'
import { usePricingData } from './hooks/use-pricing-data'
import { getCatalogCapabilities } from './lib/filters'

export function Pricing() {
  const router = useRouter()
  const catalogResultsRef = useRef<HTMLElement>(null)
  const catalogFiltersRef = useRef<HTMLElement>(null)
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [selectedModelName, setSelectedModelName] = useState<string | null>(
    null
  )

  const {
    models,
    vendors,
    groupRatio,
    usableGroup,
    endpointMap,
    autoGroups,
    isLoading,
    error,
    refetch,
    priceRate,
    usdExchangeRate,
  } = usePricingData()

  const {
    searchInput,
    sortBy,
    vendorFilter,
    groupFilter,
    quotaTypeFilter,
    endpointTypeFilter,
    tagFilter,
    capabilityFilter,
    setCapabilityFilter,
    resultsKey,
    tokenUnit,
    viewMode,
    showRechargePrice,
    setSearchInput,
    setSortBy,
    setVendorFilter,
    setGroupFilter,
    setQuotaTypeFilter,
    setEndpointTypeFilter,
    setTagFilter,
    setTokenUnit,
    setViewMode,
    setShowRechargePrice,
    filteredModels,
    hasActiveFilters,
    activeFilterCount,
    availableTags,
    applyFilters,
    clearFilters,
    clearSearch,
  } = useFilters(models || [])

  const previousResultsKey = useRef(resultsKey)
  const scrollToCatalogResults = useCallback(() => {
    const results = catalogResultsRef.current
    const filters = catalogFiltersRef.current
    if (!results || !filters) return

    const filtersHeight = filters.getBoundingClientRect().height
    results.style.setProperty(
      '--mxy-catalog-tools-height',
      `${filtersHeight}px`
    )
    results.scrollIntoView({ block: 'start', behavior: 'auto' })
  }, [])

  const handleModelClick = useCallback((modelName: string) => {
    setSelectedModelName(modelName)
  }, [])

  const selectedModel = useMemo(
    () =>
      selectedModelName
        ? (models || []).find(
            (model) => model.model_name === selectedModelName
          ) || null
        : null,
    [models, selectedModelName]
  )

  const availableGroups = useMemo(
    () =>
      Object.keys(usableGroup || {}).filter(
        (g) => !EXCLUDED_GROUPS.includes(g)
      ),
    [usableGroup]
  )

  const handleClearAll = useCallback(() => {
    clearFilters()
    clearSearch()
  }, [clearFilters, clearSearch])

  useEffect(() => {
    const filters = catalogFiltersRef.current
    if (!filters) return
    const updateOffset = () => {
      catalogResultsRef.current?.style.setProperty(
        '--mxy-catalog-tools-height',
        `${filters.getBoundingClientRect().height}px`
      )
    }
    updateOffset()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateOffset)
    observer.observe(filters)
    return () => observer.disconnect()
  }, [])

  const authenticated = useAuthStore((state) => Boolean(state.auth.user))
  const ready = !isLoading && !error

  useLayoutEffect(() => {
    if (!ready || previousResultsKey.current === resultsKey) return
    previousResultsKey.current = resultsKey
    scrollToCatalogResults()
  }, [ready, resultsKey, scrollToCatalogResults])

  const stats = useMemo(() => {
    const capabilities = new Set(models.flatMap(getCatalogCapabilities))
    const endpoints = new Set(
      models.flatMap((model) => model.supported_endpoint_types ?? [])
    )
    const protocols: string[] = []
    if ([...endpoints].some((endpoint) => endpoint.startsWith('openai'))) {
      protocols.push('OpenAI')
    }
    if (endpoints.has('anthropic')) protocols.push('Anthropic')
    return {
      capabilities: capabilities.size,
      providers: new Set(
        models
          .map((model) => model.vendor_id ?? model.vendor_name)
          .filter(Boolean)
      ).size,
      protocols,
    }
  }, [models])
  const filterSummary = [
    vendorFilter !== 'all' ? vendorFilter : '',
    capabilityFilter !== 'all'
      ? t(CATALOG_CAPABILITIES[capabilityFilter].labelKey)
      : '',
    searchInput.trim(),
  ]
    .filter(Boolean)
    .join(' · ')

  const renderPricingContent = () => {
    if (isLoading) {
      return <LoadingSkeleton presentation='catalog' viewMode={viewMode} />
    }
    if (error) {
      return (
        <ErrorState
          title={t('Unable to load models')}
          onRetry={() => {
            void refetch()
          }}
        />
      )
    }
    if (filteredModels.length === 0) {
      return (
        <EmptyState
          searchQuery={searchInput}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={handleClearAll}
        />
      )
    }

    if (viewMode === VIEW_MODES.CARD) {
      return (
        <ModelCardGrid
          key={resultsKey}
          appearance='marketing'
          presentation='compact'
          models={filteredModels}
          onModelClick={handleModelClick}
          priceRate={priceRate}
          usdExchangeRate={usdExchangeRate}
          tokenUnit={tokenUnit}
          showRechargePrice={showRechargePrice}
          selectedGroup={groupFilter}
        />
      )
    }

    return (
      <PricingTable
        models={filteredModels}
        priceRate={priceRate}
        usdExchangeRate={usdExchangeRate}
        tokenUnit={tokenUnit}
        showRechargePrice={showRechargePrice}
        selectedGroup={groupFilter}
        onModelClick={handleModelClick}
      />
    )
  }

  return (
    <PublicLayout
      appearance='marketing'
      marketingVariant='catalog'
      showMainContainer={false}
      notice={
        <div className='mxy-notice'>
          <div className='mxy-wrap'>
            <span className='mxy-notice-pill'>AIMXY</span>
            <span>
              {ready
                ? t(
                    'Live catalog · {{models}} models · {{providers}} providers',
                    {
                      models: formatNumber(models.length, locale),
                      providers: formatNumber(stats.providers, locale),
                    }
                  )
                : t('Live model catalog')}
            </span>
          </div>
        </div>
      }
    >
      <main className='mxy-catalog-page'>
        <section className='mxy-catalog-hero'>
          <div
            className='mxy-catalog-glow mxy-catalog-glow-peach'
            aria-hidden='true'
          />
          <div
            className='mxy-catalog-glow mxy-catalog-glow-lilac'
            aria-hidden='true'
          />
          <div className='mxy-wrap'>
            <Badge variant='outline' className='mxy-eyebrow'>
              <span className='mxy-dot' aria-hidden='true' />
              {t('Model Square · Synced with the live catalog')}
            </Badge>
            <h1>
              {t('One key, access')}{' '}
              <span className='mxy-gradient-text'>
                {ready
                  ? t('{{total}} available models', {
                      total: formatNumber(models.length, locale),
                    })
                  : t('Available AI models')}
              </span>
            </h1>
            <p>
              {t(
                'Browse the live catalog by provider and declared capabilities. View model details, current prices and API examples. Models share authentication and billing; switch models by changing the model parameter.'
              )}
            </p>
            {ready && (
              <div className='mxy-catalog-counts'>
                <span>
                  <strong>{formatNumber(models.length, locale)}</strong>
                  {t('Available models')}
                </span>
                <span>
                  <strong>{formatNumber(stats.providers, locale)}</strong>
                  {t('Providers and sources')}
                </span>
                <span>
                  <strong>{formatNumber(stats.capabilities, locale)}</strong>
                  {t('Labeled capabilities')}
                </span>
                {stats.protocols.length > 0 && (
                  <span>
                    {t('Compatible with')}{' '}
                    <strong>{stats.protocols.join(' / ')}</strong>
                  </span>
                )}
              </div>
            )}
          </div>
        </section>
        <section
          ref={catalogFiltersRef}
          className='mxy-catalog-filter-section'
          aria-label={t('Search and filter models')}
        >
          <PricingSidebar
            presentation='catalog'
            quotaTypeFilter={quotaTypeFilter}
            endpointTypeFilter={endpointTypeFilter}
            vendorFilter={vendorFilter}
            groupFilter={groupFilter}
            tagFilter={tagFilter}
            onQuotaTypeChange={setQuotaTypeFilter}
            onEndpointTypeChange={setEndpointTypeFilter}
            onVendorChange={setVendorFilter}
            onGroupChange={setGroupFilter}
            onTagChange={setTagFilter}
            vendors={vendors || []}
            groups={availableGroups}
            groupRatios={groupRatio}
            tags={availableTags}
            models={models || []}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearFilters}
            className='mxy-wrap'
            capabilityFilter={capabilityFilter}
            onCapabilityChange={setCapabilityFilter}
            search={
              <SearchBar
                value={searchInput}
                onChange={setSearchInput}
                onClear={clearSearch}
                placeholder={t('Search models, e.g. seedance / gpt / image')}
                className='mxy-catalog-search'
              />
            }
          />
        </section>
        <section
          ref={catalogResultsRef}
          className='mxy-wrap mxy-catalog-results'
          aria-label={t('Model results')}
        >
          <PricingToolbar
            onResetAll={handleClearAll}
            filterSummary={filterSummary}
            presentation='catalog'
            filteredCount={filteredModels.length}
            totalCount={models?.length}
            sortBy={sortBy}
            onSortChange={setSortBy}
            tokenUnit={tokenUnit}
            onTokenUnitChange={setTokenUnit}
            showRechargePrice={showRechargePrice}
            onRechargePriceChange={setShowRechargePrice}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            quotaTypeFilter={quotaTypeFilter}
            endpointTypeFilter={endpointTypeFilter}
            vendorFilter={vendorFilter}
            groupFilter={groupFilter}
            tagFilter={tagFilter}
            onQuotaTypeChange={setQuotaTypeFilter}
            onEndpointTypeChange={setEndpointTypeFilter}
            onVendorChange={setVendorFilter}
            onGroupChange={setGroupFilter}
            onTagChange={setTagFilter}
            vendors={vendors || []}
            groups={availableGroups}
            groupRatios={groupRatio}
            tags={availableTags}
            models={models || []}
            hasActiveFilters={hasActiveFilters}
            activeFilterCount={activeFilterCount}
            onClearFilters={clearFilters}
          />
          {renderPricingContent()}
        </section>
        {selectedModel && (
          <ModelDetailsDrawer
            open={Boolean(selectedModel)}
            onOpenChange={(open) => {
              if (!open) setSelectedModelName(null)
            }}
            model={selectedModel}
            groupRatio={groupRatio || {}}
            usableGroup={usableGroup || {}}
            endpointMap={
              (endpointMap as Record<
                string,
                { path?: string; method?: string }
              >) || {}
            }
            autoGroups={autoGroups || []}
            priceRate={priceRate ?? 1}
            usdExchangeRate={usdExchangeRate ?? 1}
            tokenUnit={tokenUnit}
            showRechargePrice={showRechargePrice}
          />
        )}
      </main>
      <RankingsPreview
        appearance='catalog'
        onPricingFilterSelect={(filters) => {
          applyFilters(filters)
          const target = router.buildLocation({
            to: '/pricing',
            search: filters,
          })
          if (target.href === router.state.location.href) {
            scrollToCatalogResults()
          }
        }}
      />
      <section className='mxy-catalog-cta-section'>
        <div className='mxy-wrap'>
          <div className='mxy-final-cta'>
            <h2>{t('Looking for a particular model?')}</h2>
            <p>
              {t(
                'Talk to our team about the models and integrations your business needs.'
              )}
            </p>
            <div className='mxy-actions'>
              <Button
                className='mxy-button'
                render={<Link to={authenticated ? '/dashboard' : '/sign-up'} />}
              >
                {authenticated
                  ? t('Go to Dashboard')
                  : t('Create a free account')}
              </Button>
              <Button
                variant='outline'
                className='mxy-button-outline'
                render={<Link to='/' hash='business' />}
              >
                {t('Business cooperation')}
              </Button>
            </div>
          </div>
        </div>
      </section>
      <MarketingFooter variant='catalog' />
    </PublicLayout>
  )
}
