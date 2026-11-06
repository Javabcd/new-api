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

import { CopyButton } from '@/components/copy-button'
import { MARKETING_BRAND } from '@/features/marketing/brand'

export function MarketingCompany() {
  const { t } = useTranslation()
  return (
    <div className='mxy-footer-company' id='about'>
      <strong>{t('Zhejiang Maixiaoyun Technology Co., Ltd.')}</strong>
      <div id='business'>
        <address id='contact'>
          <div>
            <a href={`tel:${MARKETING_BRAND.phone}`}>138 5879 1566</a>
            <CopyButton
              value={MARKETING_BRAND.phone}
              tooltip={t('Copy phone number')}
            />
          </div>
          <div>
            <a href={`mailto:${MARKETING_BRAND.email}`}>
              {MARKETING_BRAND.email}
            </a>
            <CopyButton
              value={MARKETING_BRAND.email}
              tooltip={t('Copy email address')}
            />
          </div>
          <p>
            {t(
              'Room 1214, East Building 6, 735 Jianghong Road, Changhe Subdistrict, Binjiang District, Hangzhou, Zhejiang, China'
            )}
          </p>
        </address>
      </div>
    </div>
  )
}
