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
import { describe, expect, it } from 'vitest'

import type { PricingModel } from '../../types'
import { filterAndSortModels, getCatalogCapabilities } from '../filters'

const model: PricingModel = {
  id: 1,
  model_name: 'example-model',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['default'],
}

describe('catalog capability classification', () => {
  it.each([
    [{ supported_endpoint_types: ['openai'] }, ['text']],
    [{ capabilities: ['vision', 'reasoning'] }, ['multi', 'text']],
    [{ supported_endpoint_types: ['image-generation'] }, ['image']],
    [{ output_modalities: ['video'] }, ['video']],
    [{ input_modalities: ['audio'] }, ['audio']],
    [{ supported_endpoint_types: ['jina-rerank'] }, ['embed']],
    [{ tags: 'Vision,IMAGE-GENERATION;音频' }, ['image', 'audio', 'multi']],
  ] as const)(
    'classifies explicitly declared metadata %j',
    (metadata, expected) => {
      const candidate = { ...model, ...metadata } as PricingModel
      expect(getCatalogCapabilities(candidate)).toEqual(expected)
    }
  )

  it('keeps missing metadata unclassified regardless of a suggestive model name', () => {
    expect(
      getCatalogCapabilities({ ...model, model_name: 'image-video-audio-gpt' })
    ).toEqual([])
    expect(
      getCatalogCapabilities({ ...model, tags: 'image-tools,video-preview' })
    ).toEqual([])
    expect(model).not.toHaveProperty('capabilities')
  })

  it('combines capability, provider, group, endpoint and search filters', () => {
    const image = {
      ...model,
      model_name: 'shared-image',
      vendor_name: 'OpenAI',
      supported_endpoint_types: ['image-generation'],
    }
    const text = {
      ...model,
      model_name: 'shared-chat',
      vendor_name: 'OpenAI',
      supported_endpoint_types: ['openai'],
    }
    const other = { ...image, model_name: 'other-image', vendor_name: 'Other' }
    expect(
      filterAndSortModels([image, text, other], {
        search: 'shared',
        vendor: 'OpenAI',
        group: 'default',
        quotaType: 'all',
        endpointType: 'image-generation',
        tag: 'all',
        sortBy: 'name',
        capability: 'image',
      })
    ).toEqual([image])
    expect(
      getCatalogCapabilities({
        ...model,
        supported_endpoint_types: ['openai', 'image-generation'],
      })
    ).toEqual(['image', 'text'])
  })

  it('orders the catalog by declared capability, then short names, keeping unclassified models available', () => {
    const text = {
      ...model,
      model_name: 'long-chat-model',
      supported_endpoint_types: ['openai'],
    }
    const shortText = { ...text, model_name: 'o1' }
    const video = {
      ...model,
      model_name: 'video',
      supported_endpoint_types: ['openai-video'],
    }
    const image = {
      ...model,
      model_name: 'image',
      supported_endpoint_types: ['image-generation'],
    }
    const unknown = { ...model, model_name: 'unknown' }
    expect(
      filterAndSortModels([unknown, image, video, text, shortText], {
        search: '',
        vendor: 'all',
        group: 'all',
        quotaType: 'all',
        endpointType: 'all',
        tag: 'all',
        sortBy: 'catalog',
      })
    ).toEqual([shortText, text, video, image, unknown])
  })
})
