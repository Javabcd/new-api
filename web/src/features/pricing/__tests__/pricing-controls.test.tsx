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
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PricingSidebar } from '../components/pricing-sidebar'
import {
  PricingToolbar,
  type PricingToolbarProps,
} from '../components/pricing-toolbar'
import type { PricingModel } from '../types'

afterEach(async () => {
  await i18next.changeLanguage('en')
  for (const language of [
    'zhCN',
    'zhTW',
    'fr',
    'ja',
    'ru',
    'vi',
    'invalid-locale',
  ]) {
    i18next.removeResourceBundle(language, 'translation')
  }
})

function toolbarProps(): PricingToolbarProps {
  return {
    filteredCount: 2,
    totalCount: 2,
    sortBy: 'name',
    tokenUnit: 'M',
    showRechargePrice: false,
    viewMode: 'card',
    quotaTypeFilter: 'all',
    endpointTypeFilter: 'all',
    vendorFilter: 'all',
    groupFilter: 'all',
    tagFilter: 'all',
    onSortChange: vi.fn(),
    onTokenUnitChange: vi.fn(),
    onRechargePriceChange: vi.fn(),
    onViewModeChange: vi.fn(),
    onQuotaTypeChange: vi.fn(),
    onEndpointTypeChange: vi.fn(),
    onVendorChange: vi.fn(),
    onGroupChange: vi.fn(),
    onTagChange: vi.fn(),
    vendors: [],
    groups: ['default', 'premium'],
    groupRatios: { default: 1, premium: 3 },
    tags: [],
    models: [],
    hasActiveFilters: false,
    activeFilterCount: 0,
    onClearFilters: vi.fn(),
  }
}

describe('pricing controls', () => {
  it('keeps vendor and capability selection in the horizontal catalog filters', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const onCapabilityChange = vi.fn()
    const model: PricingModel = {
      id: 1,
      model_name: 'text-model',
      vendor_name: 'Vendor A',
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 1,
      enable_groups: ['default'],
      supported_endpoint_types: ['openai'],
    }
    render(
      <PricingSidebar
        {...props}
        presentation='catalog'
        onCapabilityChange={onCapabilityChange}
        models={[model]}
        vendors={[{ id: 1, name: 'Vendor A' }]}
      />
    )
    expect(
      screen.queryByRole('button', { name: /^Groups$/ })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Vendor A/ }))
    expect(props.onVendorChange).toHaveBeenCalledWith('Vendor A')
    await user.click(screen.getByRole('button', { name: /^Chat/ }))
    expect(onCapabilityChange).toHaveBeenCalledWith('text')
  })

  it('keeps catalog price controls in display settings and restores focus on Escape', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    render(<PricingToolbar {...props} presentation='catalog' />)
    expect(
      screen.queryByRole('button', { name: '/1K' })
    ).not.toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: 'Display settings' })
    await user.click(trigger)
    const settings = await screen.findByRole('dialog', {
      name: 'Display settings',
    })
    await user.click(within(settings).getByRole('button', { name: '/1K' }))
    expect(props.onTokenUnitChange).toHaveBeenCalledWith('K')
    await user.click(within(settings).getByRole('button', { name: 'Recharge' }))
    expect(props.onRechargePriceChange).toHaveBeenCalledWith(true)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('updates count formatting when switching between all interface languages and an invalid locale', async () => {
    render(
      <PricingToolbar
        {...toolbarProps()}
        filteredCount={12345}
        totalCount={23456}
      />
    )
    const cases = [
      ['en', '12,345'],
      ['zhCN', '12,345'],
      ['zhTW', '12,345'],
      ['fr', '12\u202f345'],
      ['ja', '12,345'],
      ['ru', '12\u00a0345'],
      ['vi', '12.345'],
      ['invalid-locale', '12,345'],
    ]
    for (const [language, expected] of cases) {
      if (language !== 'en') {
        i18next.addResourceBundle(language, 'translation', { Filter: 'Filter' })
      }
      await act(async () => {
        await i18next.changeLanguage(language)
      })
      expect(
        screen.getByText(expected, { normalizer: (text) => text })
      ).toBeVisible()
    }
  })
  it('counts each model once per filter and updates counts when the catalog changes', () => {
    const props = toolbarProps()
    const base: PricingModel = {
      id: 1,
      model_name: 'text-model',
      vendor_name: 'Vendor A',
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 1,
      enable_groups: ['default'],
      tags: 'Chat,chat',
      supported_endpoint_types: ['openai', 'openai'],
    }
    const models: PricingModel[] = [
      base,
      {
        ...base,
        id: 2,
        model_name: 'image-model',
        quota_type: 1,
        tags: 'chat,Image',
        supported_endpoint_types: ['image-generation'],
      },
      {
        ...base,
        id: 3,
        model_name: 'task-model',
        vendor_name: 'Vendor B',
        tags: 'Video',
        supported_endpoint_types: ['openai-video'],
        billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
      },
    ]
    const sidebarProps = {
      ...props,
      vendors: [
        { id: 1, name: 'Vendor A' },
        { id: 2, name: 'Vendor B' },
      ],
      tags: ['Chat', 'Image', 'Video'],
    }
    const { rerender } = render(
      <PricingSidebar {...sidebarProps} models={models} />
    )

    expect(
      screen.getByRole('button', { name: /^All Vendors\s*3$/ })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /^Vendor A\s*2$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Vendor B\s*1$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Chat\s*2$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Chat\s*1$/ })).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Token-based\s*1$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Per Request\s*1$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Task billing\s*1$/ })
    ).toBeVisible()

    rerender(<PricingSidebar {...sidebarProps} models={[models[1]]} />)
    expect(
      screen.getByRole('button', { name: /^All Vendors\s*1$/ })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /^Vendor A\s*1$/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Vendor B\s*1$/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Chat\s*1$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Chat\s*0$/ })).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Token-based\s*0$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Task billing\s*0$/ })
    ).toBeVisible()
  })

  it('changes the token unit and keeps the selected unit pressed when clicked again', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(<PricingToolbar {...props} />)
    await user.click(screen.getByRole('button', { name: '/1K' }))
    expect(props.onTokenUnitChange).toHaveBeenCalledWith('K')
    rerender(<PricingToolbar {...props} tokenUnit='K' />)
    const selected = screen.getByRole('button', { name: '/1K' })
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    await user.click(selected)
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    expect(props.onTokenUnitChange).toHaveBeenCalledTimes(1)
  })

  it('changes the recharge display mode with an accessible selected state', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(<PricingToolbar {...props} />)
    await user.click(screen.getByRole('button', { name: 'Recharge' }))
    expect(props.onRechargePriceChange).toHaveBeenCalledWith(true)
    rerender(<PricingToolbar {...props} showRechargePrice />)
    expect(screen.getByRole('button', { name: 'Recharge' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Standard' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('switches to table view with the keyboard and exposes the selected view', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(<PricingToolbar {...props} />)
    const tableButton = screen.getByRole('button', { name: 'Table view' })
    tableButton.focus()
    await user.keyboard('{Enter}')
    expect(props.onViewModeChange).toHaveBeenCalledWith('table')
    rerender(<PricingToolbar {...props} viewMode='table' />)
    expect(tableButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Card view' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('selects price sorting from the shared dropdown', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    render(<PricingToolbar {...props} />)
    await user.click(screen.getByRole('button', { name: 'Name' }))
    await user.click(
      screen.getByRole('menuitem', { name: 'Price: Low to High' })
    )
    expect(props.onSortChange).toHaveBeenCalledWith('price-low')
  })

  it.each(['sidebar', 'catalog'] as const)(
    'opens %s filters from the left, selects a group, and restores focus on close',
    async (presentation) => {
      const props = toolbarProps()
      const user = userEvent.setup()
      const triggerLabel =
        presentation === 'catalog' ? 'Advanced filters' : 'Filter'
      const { rerender } = render(
        <PricingToolbar {...props} presentation={presentation} />
      )
      await user.click(screen.getByRole('button', { name: triggerLabel }))
      const dialog = await screen.findByRole('dialog', { name: 'Filter' })
      expect(dialog).toHaveAttribute('data-side', 'left')
      expect(
        within(dialog).getByRole('button', { name: 'Reset' })
      ).toBeDisabled()
      await user.click(within(dialog).getByRole('button', { name: /premium/ }))
      expect(props.onGroupChange).toHaveBeenCalledWith('premium')
      rerender(
        <PricingToolbar
          {...props}
          presentation={presentation}
          groupFilter='premium'
          hasActiveFilters
          activeFilterCount={1}
        />
      )
      expect(
        within(dialog).getByRole('button', { name: /premium/ })
      ).toHaveAttribute('aria-pressed', 'true')
      await user.click(within(dialog).getByRole('button', { name: 'Reset' }))
      expect(props.onClearFilters).toHaveBeenCalledOnce()
      await user.keyboard('{Escape}')
      expect(
        await screen.findByRole('button', {
          name: new RegExp(`^${triggerLabel}`),
        })
      ).toHaveFocus()
    }
  )
})
