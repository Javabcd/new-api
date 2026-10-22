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
import { useTranslation } from 'react-i18next'

import { Footer } from '@/components/layout/components/footer'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'

import { MARKETING_BRAND } from './brand'

export function MarketingFooter(props: {
  variant?: 'default' | 'home' | 'catalog'
}) {
  const { t } = useTranslation()
  const navLinks = useTopNavLinks()
  const docs = navLinks.find((link) => link.external || link.href === '/docs')
  let columns =
    props.variant === 'home'
      ? [
          {
            title: t('Product'),
            links: [
              ...navLinks
                .filter((link) => link.href === '/pricing')
                .map(() => ({ text: t('Model Square'), href: '/#models' })),
              { text: t('Multimodal generation'), href: '/#modalities' },
              { text: t('Core capabilities'), href: '/#capabilities' },
              { text: t('Flexible access'), href: '/#pricing' },
            ],
          },
          {
            title: t('Developers'),
            links: [
              ...(docs ? [{ text: t('Documentation'), href: docs.href }] : []),
              { text: t('Quick start'), href: '/#getting-started' },
              { text: t('Console'), href: '/dashboard' },
            ],
          },
          {
            title: t('Company'),
            links: [
              { text: t('About us'), href: '/#about' },
              { text: t('Our capabilities'), href: '/#capabilities' },
              { text: t('Service and reliability'), href: '/#reliability' },
            ],
          },
          {
            title: t('Support'),
            links: [
              { text: t('Business cooperation'), href: '/#business' },
              { text: t('Contact information'), href: '/#contact' },
              {
                text: t('Documentation'),
                href: docs?.href ?? '/#getting-started',
              },
              { text: t('Create a free account'), href: '/sign-up' },
            ],
          },
        ]
      : [
          {
            title: t('Product'),
            links: navLinks
              .filter((link) =>
                ['/dashboard', '/pricing', '/rankings'].includes(link.href)
              )
              .map((link) => ({ text: link.title, href: link.href })),
          },
          {
            title: t('Developers'),
            links: docs
              ? [
                  { text: t('Documentation'), href: docs.href },
                  { text: t('Quick start'), href: '/#getting-started' },
                ]
              : [{ text: t('Quick start'), href: '/#getting-started' }],
          },
          {
            title: t('Company'),
            links: [
              { text: t('About us'), href: '/#about' },
              { text: t('Our capabilities'), href: '/#capabilities' },
            ],
          },
          {
            title: t('Support'),
            links: [
              { text: t('Business cooperation'), href: '/#business' },
              { text: t('Contact information'), href: '/#contact' },
            ],
          },
        ]
  if (props.variant === 'catalog') {
    columns = [
      {
        title: t('Product'),
        links: [
          ...navLinks
            .filter((link) => link.href === '/pricing')
            .map(() => ({ text: t('Model Square'), href: '/pricing' })),
          ...navLinks
            .filter((link) => link.href === '/rankings')
            .map(() => ({
              text: t('Live platform rankings'),
              href: '/pricing#rank',
            })),
          { text: t('Core capabilities'), href: '/#capabilities' },
          { text: t('Flexible access'), href: '/#pricing' },
        ],
      },
      {
        title: t('Developers'),
        links: [
          ...(docs ? [{ text: t('Documentation'), href: docs.href }] : []),
          { text: t('Quick start'), href: '/#getting-started' },
          ...navLinks
            .filter((link) => link.href === '/dashboard')
            .map((link) => ({ text: t(link.title), href: link.href })),
        ],
      },
      {
        title: t('Support'),
        links: [
          { text: t('Business cooperation'), href: '/#business' },
          { text: t('Contact information'), href: '/#contact' },
          { text: t('About us'), href: '/#about' },
          { text: t('Create a free account'), href: '/sign-up' },
        ],
      },
    ]
  }
  const branded = props.variant === 'home' || props.variant === 'catalog'
  return (
    <Footer
      appearance='marketing'
      name={MARKETING_BRAND.name}
      logo={MARKETING_BRAND.logo}
      copyright={t('All rights reserved.')}
      subtitle={branded ? MARKETING_BRAND.subtitle : undefined}
      copyrightName={
        branded ? t('Zhejiang Maixiaoyun Technology Co., Ltd.') : undefined
      }
      columns={columns}
    />
  )
}
