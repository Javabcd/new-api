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
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  Handshake,
  Mail,
  MapPin,
  Phone,
  Workflow,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { CopyButton } from '@/components/copy-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MARKETING_BRAND } from '@/features/marketing/brand'
import { MarketingActions } from '@/features/marketing/marketing-actions'

export function MarketingCompany() {
  const { t } = useTranslation()
  const cooperation = [
    {
      icon: ArrowUpFromLine,
      title: t('Resource supply'),
      description: t(
        'Bring model channels, compute resources and specialized tools to the conversation.'
      ),
    },
    {
      icon: ArrowDownToLine,
      title: t('Business procurement'),
      description: t(
        'Discuss model access and usage requirements for your organization.'
      ),
    },
    {
      icon: Handshake,
      title: t('Channel partnerships'),
      description: t(
        'Work together on integration, distribution and delivery opportunities.'
      ),
    },
    {
      icon: Workflow,
      title: t('Custom integration'),
      description: t(
        'Explore deployment and integration requirements for your business.'
      ),
    },
  ]
  return (
    <>
      <section className='mxy-section' id='business'>
        <div className='mxy-wrap'>
          <div className='mxy-section-heading mxy-centered'>
            <Badge variant='outline' className='mxy-eyebrow'>
              <i className='mxy-dot' aria-hidden='true' />
              {t('Business cooperation')}
            </Badge>
            <h2>{t('Supply or procurement, start here')}</h2>
            <p>
              {t(
                'Tell us what you want to build. Contact our team directly to discuss the next step.'
              )}
            </p>
          </div>
          <div className='mxy-two-columns mxy-business-grid'>
            <AnimateInView className='mxy-cooperation-list'>
              {cooperation.map((item) => (
                <article key={item.title}>
                  <span className='mxy-icon-tile'>
                    <item.icon aria-hidden='true' />
                  </span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                </article>
              ))}
            </AnimateInView>
            <div className='mxy-contact-prompt'>
              <Handshake aria-hidden='true' />
              <h3>{t('Good partnerships start with a conversation')}</h3>
              <p>
                {t(
                  'Reach us by phone or email using the company contact information below.'
                )}
              </p>
              <Button
                className='mxy-button'
                render={<Link to='/' hash='contact' />}
              >
                {t('Contact our team')}
              </Button>
            </div>
          </div>
        </div>
      </section>
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
      <section className='mxy-section mxy-tinted' id='about'>
        <div className='mxy-wrap'>
          <div className='mxy-section-heading mxy-centered'>
            <Badge variant='outline' className='mxy-eyebrow'>
              <i className='mxy-dot' aria-hidden='true' />
              {t('About us')}
            </Badge>
            <h2>{t('Zhejiang Maixiaoyun Technology Co., Ltd.')}</h2>
            <p>
              {t(
                'Multimodal model API infrastructure. Our company information and official contact details are listed below.'
              )}
            </p>
          </div>
          <div className='mxy-about-grid'>
            <AnimateInView className='mxy-about-copy'>
              <p>
                {t(
                  'Maixiaoyun focuses on model API infrastructure, bringing services from different providers into one entry point, one authentication method and one bill. Teams can integrate new models without repeating the entire integration process.'
                )}
              </p>
              <p>
                {t(
                  'Our gateway connects text, image, video and audio models through OpenAI and Anthropic-compatible protocols. Reuse your SDK, update the base URL, and manage channels, routing and usage in one place.'
                )}
              </p>
              <p>
                {t(
                  'For resource supply, procurement, channel partnerships or custom integrations, contact our team to discuss your requirements and available service options.'
                )}
              </p>
            </AnimateInView>
            <address className='mxy-contact-facts' id='contact'>
              <div>
                <MapPin aria-hidden='true' />
                <div>
                  <strong>{t('Company address')}</strong>
                  <p>
                    {t(
                      'Room 1214, East Building 6, 735 Jianghong Road, Changhe Subdistrict, Binjiang District, Hangzhou, Zhejiang, China'
                    )}
                  </p>
                </div>
              </div>
              <div>
                <Phone aria-hidden='true' />
                <div>
                  <strong>{t('Business phone')}</strong>
                  <a href={`tel:${MARKETING_BRAND.phone}`}>138 5879 1566</a>
                </div>
                <CopyButton
                  value={MARKETING_BRAND.phone}
                  tooltip={t('Copy phone number')}
                />
              </div>
              <div>
                <Mail aria-hidden='true' />
                <div>
                  <strong>{t('Business email')}</strong>
                  <a href={`mailto:${MARKETING_BRAND.email}`}>
                    {MARKETING_BRAND.email}
                  </a>
                </div>
                <CopyButton
                  value={MARKETING_BRAND.email}
                  tooltip={t('Copy email address')}
                />
              </div>
              <div>
                <Building2 aria-hidden='true' />
                <div>
                  <strong>{t('Company name')}</strong>
                  <p>{t('Zhejiang Maixiaoyun Technology Co., Ltd.')}</p>
                </div>
              </div>
            </address>
          </div>
        </div>
      </section>
    </>
  )
}
