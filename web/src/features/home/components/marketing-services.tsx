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
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useMarketingAccess } from '@/features/marketing/use-marketing-access'
import { cn } from '@/lib/utils'

export function MarketingServices() {
  const { t } = useTranslation()
  const pricing = useMarketingAccess('pricing')
  const cards = [
    {
      title: t('Usage-based access'),
      headline: t('Pay as you go'),
      description: t(
        'Explore model capabilities and review current unit prices in the live catalog.'
      ),
      features: [
        t('Model pricing in one place'),
        t('Token and per-request pricing'),
        t('Usage visibility'),
      ],
      label: t('View model pricing'),
      to: pricing.enabled ? '/pricing' : '/dashboard',
      hash: undefined,
    },
    {
      title: t('For growing teams'),
      headline: t('Prepaid credits'),
      description: t('Manage your balance and recharge from your wallet.'),
      features: [
        t('Centralized balance management'),
        t('Flexible recharge options'),
        t('Usage and transaction records'),
      ],
      label: t('Open wallet'),
      to: '/wallet',
      hash: undefined,
    },
    {
      title: t('For your business'),
      headline: t('Talk to us'),
      description: t(
        'Discuss model access, resource supply and integration requirements with our team.'
      ),
      features: [
        t('Supply and procurement'),
        t('Channel partnerships'),
        t('Custom integration discussions'),
      ],
      label: t('Contact our team'),
      to: '/',
      hash: 'contact',
    },
  ]
  return (
    <section className='mxy-section mxy-tinted' id='pricing'>
      <div className='mxy-wrap'>
        <div className='mxy-section-heading mxy-centered'>
          <Badge variant='outline' className='mxy-eyebrow'>
            <i className='mxy-dot' aria-hidden='true' />
            {t('Flexible access')}
          </Badge>
          <h2>{t('Pay for what you use')}</h2>
          <p>{t('Choose models and manage spending from your console.')}</p>
        </div>
        <div className='mxy-three-columns'>
          {cards.map((card, i) => (
            <article
              className={cn(
                'mxy-service-card',
                i === 1 && 'mxy-service-featured'
              )}
              key={card.title}
            >
              <span>{card.title}</span>
              <h3>{card.headline}</h3>
              <p>{card.description}</p>
              <ul>
                {card.features.map((feature) => (
                  <li key={feature}>
                    <Check aria-hidden='true' />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                variant={i === 1 ? 'default' : 'outline'}
                className={i === 1 ? 'mxy-button' : 'mxy-button-outline'}
                render={<Link to={card.to} hash={card.hash} />}
              >
                {card.label}
              </Button>
            </article>
          ))}
        </div>
        <p className='mxy-fine-print'>
          {t(
            'Availability, prices and recharge options are determined by the current platform configuration.'
          )}
        </p>
      </div>
    </section>
  )
}
