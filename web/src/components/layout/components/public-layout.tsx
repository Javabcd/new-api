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

import { MARKETING_BRAND } from '@/features/marketing/brand'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

import '@/styles/maixiaoyun.css'
import '@/styles/maixiaoyun-reference.css'
import '@/styles/maixiaoyun-home.css'
import '@/styles/maixiaoyun-catalog.css'

import type { TopNavLink } from '../types'
import { PublicHeader, type PublicHeaderProps } from './public-header'

type PublicLayoutProps = {
  appearance?: 'default' | 'marketing'
  marketingVariant?: 'default' | 'home' | 'catalog'
  notice?: React.ReactNode
  children: React.ReactNode
  showMainContainer?: boolean
  navContent?: React.ReactNode
  headerProps?: Omit<PublicHeaderProps, 'navContent'>
  navLinks?: TopNavLink[]
  showThemeSwitch?: boolean
  showAuthButtons?: boolean
  showNotifications?: boolean
  logo?: React.ReactNode
  siteName?: string
}

export function PublicLayout(props: PublicLayoutProps) {
  const { t, i18n } = useTranslation()
  const marketing = props.appearance === 'marketing'
  return (
    <div
      lang={toIntlLocale(i18n.resolvedLanguage || i18n.language)}
      className={cn(
        'bg-background text-foreground relative min-h-svh overflow-x-clip',
        marketing && 'mxy-theme mxy-site',
        marketing &&
          props.marketingVariant !== undefined &&
          props.marketingVariant !== 'default' &&
          'mxy-reference',
        marketing && props.marketingVariant === 'home' && 'mxy-home',
        marketing && props.marketingVariant === 'catalog' && 'mxy-catalog'
      )}
    >
      {marketing &&
        (props.notice ?? (
          <div className='mxy-notice'>
            <span>AIMXY</span>
            {t('One API. Text, images, video and audio.')}
          </div>
        ))}
      <PublicHeader
        appearance={props.appearance}
        marketingVariant={props.marketingVariant}
        navContent={props.navContent}
        navLinks={props.navLinks}
        showThemeSwitch={props.showThemeSwitch}
        showAuthButtons={props.showAuthButtons}
        showNotifications={props.showNotifications}
        logo={
          props.logo ??
          (marketing ? (
            <img src={MARKETING_BRAND.logo} alt='' className='size-full' />
          ) : undefined)
        }
        siteName={
          props.siteName ?? (marketing ? MARKETING_BRAND.name : undefined)
        }
        {...props.headerProps}
      />

      {props.showMainContainer !== false ? (
        <main className='container px-4 py-6 pt-20 md:px-4'>
          {props.children}
        </main>
      ) : (
        props.children
      )}
    </div>
  )
}
