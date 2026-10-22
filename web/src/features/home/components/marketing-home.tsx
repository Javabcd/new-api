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
import { Link, useLocation } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { MarketingFooter } from '@/features/marketing/marketing-footer'
import { useMarketingAccess } from '@/features/marketing/use-marketing-access'

import { MarketingCapabilities } from './marketing-capabilities'
import { MarketingCatalog } from './marketing-catalog'
import { MarketingCompany } from './marketing-company'
import { MarketingHero } from './marketing-hero'
import { MarketingModalities } from './marketing-modalities'
import { MarketingQuickStart } from './marketing-quick-start'
import { MarketingReliability } from './marketing-reliability'
import { MarketingServices } from './marketing-services'

export function MarketingHome() {
  const { t } = useTranslation()
  const pricing = useMarketingAccess('pricing')
  const hash = useLocation({ select: (location) => location.hash })

  useEffect(() => {
    if (!hash) return

    // The router may attempt hash scrolling before the home content has loaded.
    document.getElementById(hash)?.scrollIntoView({
      block: 'start',
      behavior: 'auto',
    })
  }, [hash])

  return (
    <PublicLayout
      appearance='marketing'
      marketingVariant='home'
      showMainContainer={false}
      notice={
        <div className='mxy-notice'>
          <div className='mxy-wrap'>
            <span className='mxy-notice-pill'>AIMXY</span>
            <span>
              {t(
                'Text, image, video and audio models through one key. Explore current model capabilities and prices in the live catalog.'
              )}
            </span>
            {pricing.enabled && (
              <Link to='/pricing'>
                {t('Explore models')}
                <ArrowRight aria-hidden='true' />
              </Link>
            )}
          </div>
        </div>
      }
    >
      <main>
        <MarketingHero />
        <MarketingCatalog />
        <MarketingModalities />
        <MarketingCapabilities />
        <MarketingQuickStart />
        <MarketingServices />
        <MarketingReliability />
        <MarketingCompany />
      </main>
      <MarketingFooter variant='home' />
    </PublicLayout>
  )
}
