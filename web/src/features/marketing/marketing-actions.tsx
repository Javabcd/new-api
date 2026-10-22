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
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'

import { useMarketingAccess } from './use-marketing-access'

export function MarketingActions() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const pricing = useMarketingAccess('pricing')
  return (
    <div className='mxy-actions'>
      <Button
        className='mxy-button'
        render={<Link to={user ? '/dashboard' : '/sign-up'} />}
      >
        {user ? t('Go to Dashboard') : t('Start building for free')}
        <ArrowRight aria-hidden='true' />
      </Button>
      {pricing.enabled && (
        <Button
          variant='outline'
          className='mxy-button-outline'
          render={<Link to='/pricing' />}
        >
          {t('Explore models')}
        </Button>
      )}
    </div>
  )
}
