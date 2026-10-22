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
import {
  SORT_OPTIONS,
  FILTER_ALL,
  QUOTA_TYPES,
  QUOTA_TYPE_VALUES,
  ENDPOINT_TYPES,
  CATALOG_CAPABILITIES,
} from '../constants'
import type { CatalogCapability, PricingModel } from '../types'
import { hasTaskUsageSchema } from './dynamic-price'

// ----------------------------------------------------------------------------
// Filter Utilities
// ----------------------------------------------------------------------------

/** Do not infer capabilities from model names or alter reserved backend metadata. */
export function getCatalogCapabilities(
  model: PricingModel
): CatalogCapability[] {
  const categories = new Set<CatalogCapability>()
  const tags = new Set(parseTags(model.tags).map((tag) => tag.toLowerCase()))
  for (const [category, config] of Object.entries(CATALOG_CAPABILITIES)) {
    if (config.tags.some((tag) => tags.has(tag))) {
      categories.add(category as CatalogCapability)
    }
  }
  const endpoints = model.supported_endpoint_types ?? []
  const capabilities = model.capabilities ?? []
  const inputs = model.input_modalities ?? []
  const outputs = model.output_modalities ?? []
  if (
    capabilities.includes('reasoning') ||
    outputs.includes('text') ||
    endpoints.some((endpoint) =>
      [
        'openai',
        'openai-response',
        'openai-response-compact',
        'openai-alpha-search',
        'anthropic',
        'gemini',
      ].includes(endpoint)
    )
  ) {
    categories.add('text')
  }
  if (
    capabilities.includes('vision') ||
    (outputs.includes('text') &&
      (inputs.includes('image') || inputs.includes('video')))
  ) {
    categories.add('multi')
  }
  if (outputs.includes('image') || endpoints.includes('image-generation')) {
    categories.add('image')
  }
  if (outputs.includes('video') || endpoints.includes('openai-video')) {
    categories.add('video')
  }
  if (inputs.includes('audio') || outputs.includes('audio')) {
    categories.add('audio')
  }
  if (
    capabilities.includes('embeddings') ||
    endpoints.includes('embeddings') ||
    endpoints.includes('jina-rerank')
  ) {
    categories.add('embed')
  }
  // Prefer specific generation capabilities for the single compact-card badge.
  return (
    ['video', 'image', 'audio', 'embed', 'multi', 'text'] as const
  ).filter((category) => categories.has(category))
}

/**
 * Filter models by search query
 */
export function filterBySearch(
  models: PricingModel[],
  query: string
): PricingModel[] {
  if (!query) return models

  const lowerQuery = query.toLowerCase()
  return models.filter(
    (m) =>
      m.model_name?.toLowerCase().includes(lowerQuery) ||
      m.description?.toLowerCase().includes(lowerQuery) ||
      m.tags?.toLowerCase().includes(lowerQuery) ||
      m.vendor_name?.toLowerCase().includes(lowerQuery)
  )
}

/**
 * Filter models by vendor
 */
export function filterByVendor(
  models: PricingModel[],
  vendor: string
): PricingModel[] {
  if (vendor === FILTER_ALL) return models
  return models.filter((m) => m.vendor_name === vendor)
}

/**
 * Filter models by group
 */
export function filterByGroup(
  models: PricingModel[],
  group: string
): PricingModel[] {
  if (group === FILTER_ALL) return models
  return models.filter((m) => m.enable_groups?.includes(group))
}

/**
 * Filter models by quota type
 */
export function filterByQuotaType(
  models: PricingModel[],
  quotaType: string
): PricingModel[] {
  if (quotaType === QUOTA_TYPES.ALL) return models
  // Task-usage models form their own bucket, disjoint from token/request.
  if (quotaType === QUOTA_TYPES.TASK) {
    return models.filter((m) => hasTaskUsageSchema(m))
  }
  const targetType =
    quotaType === QUOTA_TYPES.TOKEN
      ? QUOTA_TYPE_VALUES.TOKEN
      : QUOTA_TYPE_VALUES.REQUEST
  return models.filter(
    (m) => m.quota_type === targetType && !hasTaskUsageSchema(m)
  )
}

/**
 * Filter models by endpoint type
 */
export function filterByEndpointType(
  models: PricingModel[],
  endpointType: string
): PricingModel[] {
  if (endpointType === ENDPOINT_TYPES.ALL) return models
  return models.filter((m) =>
    m.supported_endpoint_types?.includes(endpointType)
  )
}

/**
 * Get model price for sorting
 */
function getModelPrice(model: PricingModel): number {
  return model.quota_type === 0 ? model.model_ratio : model.model_price || 0
}

/**
 * Sort models by specified option
 */
export function sortModels(
  models: PricingModel[],
  sortBy: string
): PricingModel[] {
  const sorted = [...models]

  switch (sortBy) {
    case SORT_OPTIONS.CATALOG: {
      const order: Record<CatalogCapability, number> = {
        text: 0,
        multi: 1,
        video: 2,
        image: 3,
        audio: 4,
        embed: 5,
      }
      const priorities = new Map(
        models.map((model) => {
          const primary = getCatalogCapabilities(model)[0]
          return [model, primary ? order[primary] : 6]
        })
      )
      sorted.sort((a, b) => {
        const category = (priorities.get(a) ?? 6) - (priorities.get(b) ?? 6)
        if (category !== 0) return category
        const length = a.model_name.length - b.model_name.length
        if (length !== 0) return length
        return a.model_name < b.model_name
          ? -1
          : Number(a.model_name > b.model_name)
      })
      break
    }
    case SORT_OPTIONS.NAME:
      sorted.sort((a, b) =>
        (a.model_name || '').localeCompare(b.model_name || '')
      )
      break
    case SORT_OPTIONS.PRICE_LOW:
      sorted.sort((a, b) => getModelPrice(a) - getModelPrice(b))
      break
    case SORT_OPTIONS.PRICE_HIGH:
      sorted.sort((a, b) => getModelPrice(b) - getModelPrice(a))
      break
  }

  return sorted
}

/**
 * Apply all filters and sorting to models
 */
export function filterAndSortModels(
  models: PricingModel[],
  filters: {
    search: string
    vendor: string
    group: string
    quotaType: string
    endpointType: string
    tag: string
    sortBy: string
    capability?: CatalogCapability | 'all'
  }
): PricingModel[] {
  let result = filterBySearch(models, filters.search)
  result = filterByVendor(result, filters.vendor)
  result = filterByGroup(result, filters.group)
  result = filterByQuotaType(result, filters.quotaType)
  result = filterByEndpointType(result, filters.endpointType)
  result = filterByTag(result, filters.tag)
  if (filters.capability && filters.capability !== FILTER_ALL) {
    const capability = filters.capability
    result = result.filter((model) =>
      getCatalogCapabilities(model).includes(capability)
    )
  }
  result = sortModels(result, filters.sortBy)

  return result
}

/**
 * Parse tags from comma-separated string
 */
export function parseTags(tagsString?: string): string[] {
  if (!tagsString) return []
  return tagsString
    .split(/[,;|\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Extract all unique tags from models
 */
export function extractAllTags(models: PricingModel[]): string[] {
  const tagSet = new Set<string>()

  models.forEach((model) => {
    if (model.tags) {
      const tags = parseTags(model.tags)
      tags.forEach((tag) => {
        tagSet.add(tag.toLowerCase())
      })
    }
  })

  return [...tagSet].sort((a, b) => a.localeCompare(b))
}

/**
 * Filter models by tag
 */
export function filterByTag(
  models: PricingModel[],
  tag: string
): PricingModel[] {
  if (tag === FILTER_ALL) return models

  const tagLower = tag.toLowerCase()
  return models.filter((m) => {
    if (!m.tags) return false
    const modelTags = parseTags(m.tags).map((t) => t.toLowerCase())
    return modelTags.includes(tagLower)
  })
}
