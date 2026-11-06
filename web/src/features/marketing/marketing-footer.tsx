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
import { MarketingCompany } from '@/features/home/components/marketing-company'
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
                .map(() => ({ text: t('Model Square'), href: '/#plaza' })),
              { text: t('Core capabilities'), href: '/#ability' },
              { text: t('Flexible access'), href: '/#price' },
              ...navLinks
                .filter((link) => link.href === '/rankings')
                .map((link) => ({ text: link.title, href: link.href })),
            ],
          },
          {
            title: t('Developers'),
            links: [
              ...(docs ? [{ text: t('Documentation'), href: docs.href }] : []),
              { text: t('Quick start'), href: '/#dev' },
              { text: t('Console'), href: '/dashboard' },
            ],
          },
          {
            title: t('Company'),
            links: [
              { text: t('About us'), href: '/#about' },
              { text: t('Our capabilities'), href: '/#ability' },
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
                href: docs?.href ?? '/#dev',
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
                  { text: t('Quick start'), href: '/#dev' },
                ]
              : [{ text: t('Quick start'), href: '/#dev' }],
          },
          {
            title: t('Company'),
            links: [
              { text: t('About us'), href: '/#about' },
              { text: t('Our capabilities'), href: '/#ability' },
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
              href: '/rankings',
            })),
          { text: t('Core capabilities'), href: '/#ability' },
          { text: t('Flexible access'), href: '/#price' },
        ],
      },
      {
        title: t('Developers'),
        links: [
          ...(docs ? [{ text: t('Documentation'), href: docs.href }] : []),
          { text: t('Quick start'), href: '/#dev' },
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
      brandContent={branded ? <MarketingCompany /> : undefined}
      copyrightName={
        branded ? t('Zhejiang Maixiaoyun Technology Co., Ltd.') : undefined
      }
      columns={columns}
    />
  )
}
