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

import { AnimateInView } from '@/components/animate-in-view'
import { MarketingActions } from '@/features/marketing/marketing-actions'

export function MarketingFinalCta() {
  const { t } = useTranslation()
  return (
    <section className='mxy-section mxy-final-section'>
      <div className='mxy-wrap'>
        <AnimateInView className='mxy-final-cta'>
          <h2>{t('Try one request before you decide')}</h2>
          <p>
            {t(
              'Create an account, connect your application, and explore text, image, video and audio models through one gateway.'
            )}
          </p>
          <MarketingActions />
        </AnimateInView>
      </div>
    </section>
  )
}
