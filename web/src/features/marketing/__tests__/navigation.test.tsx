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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { SystemBrand } from '@/components/layout/components/system-brand'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AuthLayout } from '@/features/auth/auth-layout'
import { MarketingFooter } from '@/features/marketing/marketing-footer'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

let client: QueryClient
const originalConfig = useSystemConfigStore.getState().config

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.setUser(null)
  useSystemConfigStore.getState().setConfig({
    systemName: 'Existing site',
    footerHtml: '',
    logo: '/logo.png',
  })
  useSystemConfigStore.getState().setLoading(false)
  useSystemConfigStore.getState().setLoadedLogoUrl('/logo.png')
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  client.setQueryData(['status'], {
    HeaderNavModules: {},
    user_agreement_enabled: true,
    privacy_policy_enabled: true,
  })
  client.setQueryData(['notice'], { success: true, data: '' })
})

afterEach(() => {
  client.clear()
  useSystemConfigStore.getState().setConfig(originalConfig)
  localStorage.clear()
})

async function renderNavigation(content: React.ReactNode) {
  const root = createRootRoute({ component: () => content })
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await act(() => router.load())
}

it('opens the marketing menu as a dialog and returns keyboard focus when Escape closes it', async () => {
  const user = userEvent.setup()
  await renderNavigation(
    <PublicLayout
      appearance='marketing'
      showThemeSwitch={false}
      showNotifications={false}
      showAuthButtons={false}
    >
      <p>Content</p>
    </PublicLayout>
  )
  const trigger = screen.getByRole('button', { name: 'Toggle navigation menu' })
  await user.click(trigger)
  const menu = await screen.findByRole('dialog', { name: '麦小云官网' })
  expect(
    within(menu).getByRole('link', { name: 'Model Square' })
  ).toHaveAttribute('href', '/pricing')
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await user.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  expect(trigger).toHaveFocus()
})

it('keeps the configured brand on other public pages', async () => {
  await renderNavigation(
    <PublicLayout
      showThemeSwitch={false}
      showNotifications={false}
      showAuthButtons={false}
    >
      <p>Content</p>
    </PublicLayout>
  )
  expect(await screen.findByText('Existing site')).toBeVisible()
  expect(screen.queryByText('麦小云官网')).not.toBeInTheDocument()
})

it('shows the website name in the public header when the configured system name is AIMXY', async () => {
  useSystemConfigStore.getState().setConfig({ systemName: 'AIMXY' })
  await renderNavigation(
    <PublicLayout
      showThemeSwitch={false}
      showNotifications={false}
      showAuthButtons={false}
    >
      <p>Content</p>
    </PublicLayout>
  )
  const header = within(screen.getByRole('banner'))
  expect(header.getByText('麦小云官网')).toBeVisible()
  expect(header.queryByText('AIMXY')).not.toBeInTheDocument()
})

it('shows the website name in the authentication layout when the configured system name is AIMXY', async () => {
  useSystemConfigStore.getState().setConfig({ systemName: 'AIMXY' })
  await renderNavigation(
    <AuthLayout>
      <p>Content</p>
    </AuthLayout>
  )
  expect(screen.getByRole('heading', { name: '麦小云官网' })).toBeVisible()
  expect(screen.queryByText('AIMXY')).not.toBeInTheDocument()
})

it.each(['inline', 'sidebar'] as const)(
  'shows the website name in the %s system brand when status supplies AIMXY',
  async (variant) => {
    client.setQueryData(['status'], {
      system_name: 'AIMXY',
      version: 'test-version',
    })
    await renderNavigation(
      <SidebarProvider>
        <SystemBrand variant={variant} />
      </SidebarProvider>
    )
    expect(screen.getByText('麦小云官网')).toBeVisible()
    expect(screen.queryByText('AIMXY')).not.toBeInTheDocument()
  }
)

it('groups home utility controls behind one trigger and restores focus after Escape', async () => {
  const user = userEvent.setup()
  await renderNavigation(
    <PublicLayout
      appearance='marketing'
      marketingVariant='home'
      showNotifications={false}
      showAuthButtons={false}
    >
      <p>Content</p>
    </PublicLayout>
  )
  expect(
    screen.queryByRole('button', { name: 'Change language' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Toggle theme' })
  ).not.toBeInTheDocument()
  const trigger = screen.getByRole('button', { name: 'Page tools' })
  await user.click(trigger)
  const tools = await screen.findByRole('dialog', { name: 'Page tools' })
  expect(
    within(tools).getByRole('button', { name: 'Change language' })
  ).toBeVisible()
  expect(
    within(tools).getByRole('button', { name: 'Toggle theme' })
  ).toBeVisible()
  await user.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  expect(trigger).toHaveFocus()
})

it('preserves custom footer content, legal links and project attribution in the marketing footer', async () => {
  useSystemConfigStore
    .getState()
    .setConfig({ footerHtml: '<strong>Configured footer</strong>' })
  await renderNavigation(<Footer appearance='marketing' />)
  expect(await screen.findByText('Configured footer')).toBeVisible()
  expect(screen.getByRole('link', { name: 'User Agreement' })).toHaveAttribute(
    'href',
    '/user-agreement'
  )
  expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
    'href',
    '/privacy-policy'
  )
  expect(screen.getByRole('link', { name: /^New API$/ })).toHaveAttribute(
    'href',
    'https://github.com/QuantumNous/new-api'
  )
})

it.each(['home', 'catalog'] as const)(
  'preserves company contacts and unique anchors in the %s footer when custom HTML is configured',
  async (variant) => {
    useSystemConfigStore
      .getState()
      .setConfig({ footerHtml: '<strong>Configured footer</strong>' })

    await renderNavigation(<MarketingFooter variant={variant} />)

    const footer = within(screen.getByRole('contentinfo'))
    expect(footer.getByText('Configured footer')).toBeVisible()
    expect(
      footer.getByText('Zhejiang Maixiaoyun Technology Co., Ltd.')
    ).toBeVisible()
    expect(footer.getByRole('link', { name: '138 5879 1566' })).toHaveAttribute(
      'href',
      'tel:13858791566'
    )
    expect(
      footer.getByRole('link', { name: '13858791566@139.com' })
    ).toHaveAttribute('href', 'mailto:13858791566@139.com')
    for (const hash of ['about', 'business', 'contact']) {
      expect(document.querySelectorAll(`#${hash}`)).toHaveLength(1)
    }
    expect(
      footer.getByRole('link', { name: 'User Agreement' })
    ).toHaveAttribute('href', '/user-agreement')
    expect(
      footer.getByRole('link', { name: 'Privacy Policy' })
    ).toHaveAttribute('href', '/privacy-policy')
    expect(footer.getByRole('link', { name: /^New API$/ })).toHaveAttribute(
      'href',
      'https://github.com/QuantumNous/new-api'
    )
  }
)

it('marks only the selected home anchor as current when navigating to core capabilities', async () => {
  const user = userEvent.setup()
  await renderNavigation(
    <PublicLayout
      appearance='marketing'
      marketingVariant='home'
      showThemeSwitch={false}
      showNotifications={false}
      showAuthButtons={false}
    >
      <section id='ability'>Core capabilities</section>
    </PublicLayout>
  )
  const about = screen.getByRole('link', { name: 'Core capabilities' })
  const home = screen.getByRole('link', { name: 'Home' })
  expect(about).not.toHaveAttribute('aria-current', 'page')
  expect(home).toHaveAttribute('aria-current', 'page')
  await user.click(about)
  await waitFor(() => expect(about).toHaveAttribute('aria-current', 'page'))
  expect(home).not.toHaveAttribute('aria-current', 'page')
  await user.click(
    screen.getByRole('button', { name: 'Toggle navigation menu' })
  )
  const menu = await screen.findByRole('dialog', { name: '麦小云官网' })
  expect(
    within(menu).getByRole('link', { name: 'Core capabilities' })
  ).toHaveAttribute('aria-current', 'page')
  expect(within(menu).getByRole('link', { name: 'Home' })).not.toHaveAttribute(
    'aria-current',
    'page'
  )
})

it('anchors the home menu below the notice and reserves only the remaining viewport height', async () => {
  const user = userEvent.setup()
  await renderNavigation(
    <PublicLayout
      appearance='marketing'
      marketingVariant='home'
      showThemeSwitch={false}
      showNotifications={false}
      showAuthButtons={false}
    >
      <p>Content</p>
    </PublicLayout>
  )
  vi.spyOn(screen.getByRole('banner'), 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 42, 390, 76)
  )
  await user.click(
    screen.getByRole('button', { name: 'Toggle navigation menu' })
  )
  const menu = await screen.findByRole('dialog', { name: '麦小云官网' })
  expect(menu).toHaveStyle({ top: '118px', maxHeight: 'calc(100dvh - 118px)' })
})
