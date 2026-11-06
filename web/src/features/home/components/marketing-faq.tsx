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

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { useApiBaseUrl } from '@/features/marketing/use-api-base-url'

export function MarketingFaq() {
  const { t } = useTranslation()
  const baseUrl = useApiBaseUrl()
  const questions = [
    {
      id: 'gateway',
      question: t('Why use an API gateway?'),
      answer: t(
        'Access different providers through one entry point, with unified authentication, routing and usage records. Available models follow the live catalog.'
      ),
    },
    {
      id: 'sdk',
      question: t('Do I need to change my SDK?'),
      answer: t(
        'Reuse an OpenAI-compatible SDK. Update your API key and base URL to {{baseUrl}}, then use the parameters supported by your chosen model.',
        { baseUrl }
      ),
    },
    {
      id: 'models',
      question: t('Which models are available?'),
      answer: t(
        'Browse the live catalog for current models, declared capabilities and supported endpoints. Availability follows the platform configuration.'
      ),
    },
    {
      id: 'prices',
      question: t('How can I check model prices?'),
      answer: t(
        'Review current prices in the model catalog. Billing units and prices depend on the model and selected group; manage your balance from the wallet.'
      ),
    },
    {
      id: 'usage',
      question: t('Where can I review my usage?'),
      answer: t(
        'Use the console to review request logs, model usage and transaction records.'
      ),
    },
    {
      id: 'business',
      question: t('How can I discuss business requirements?'),
      answer: t(
        'Contact our team using the phone number or email in the footer to discuss resource supply, procurement, partnerships or custom integrations.'
      ),
    },
  ]
  return (
    <section className='mxy-section' id='faq'>
      <div className='mxy-wrap'>
        <div className='mxy-section-heading mxy-centered'>
          <Badge variant='outline' className='mxy-eyebrow'>
            <i className='mxy-dot' aria-hidden='true' />
            {t('Frequently asked questions')}
          </Badge>
          <h2>{t('Before your first request')}</h2>
        </div>
        <Accordion defaultValue={['gateway']} multiple className='mxy-faq'>
          {questions.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>
                <p>{item.answer}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
