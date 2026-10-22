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
import { FileSearch, GitBranch, KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { Badge } from '@/components/ui/badge'

export function MarketingReliability() {
  const { t } = useTranslation()
  const facts = [
    {
      title: t('Multiple channels'),
      detail: t('Manage upstream access and routing'),
    },
    { title: t('Observable'), detail: t('Review requests, usage and costs') },
    {
      title: t('Configurable'),
      detail: t('Adapt model access to your applications'),
    },
    {
      title: t('One gateway'),
      detail: t('Unified authentication and usage records'),
    },
  ]
  const badges = [
    { icon: GitBranch, label: t('Intelligent routing') },
    { icon: KeyRound, label: t('Unified access control') },
    { icon: FileSearch, label: t('Request logs') },
  ]
  return (
    <section className='mxy-section' id='reliability'>
      <div className='mxy-wrap mxy-reliability-grid'>
        <div>
          <Badge variant='outline' className='mxy-eyebrow'>
            <i className='mxy-dot' aria-hidden='true' />
            {t('Service and reliability')}
          </Badge>
          <h2>{t('Capabilities your business can build on')}</h2>
          <p className='mxy-lead'>
            {t(
              'Bring model access, routing and operational visibility into one place. Specific service commitments and deployment requirements can be discussed with our team.'
            )}
          </p>
          <div className='mxy-reliability-badges'>
            {badges.map((badge) => (
              <span key={badge.label}>
                <badge.icon aria-hidden='true' />
                {badge.label}
              </span>
            ))}
          </div>
        </div>
        <AnimateInView className='mxy-reliability-stats'>
          {facts.map((fact) => (
            <div key={fact.title}>
              <strong>{fact.title}</strong>
              <span>{fact.detail}</span>
            </div>
          ))}
        </AnimateInView>
      </div>
    </section>
  )
}
