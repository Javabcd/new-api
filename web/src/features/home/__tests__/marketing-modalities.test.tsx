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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { MarketingModalities } from '@/features/home/components/marketing-modalities'
import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zhCN from '@/i18n/locales/zh.json'
import { useAuthStore } from '@/stores/auth-store'

const descriptions = [
  'Chat · Reasoning · Agent',
  'TTS · Music · SFX',
  'Embedding · Rerank',
  'Text / Image → Video',
  'Text / Image → Image',
] as const

const resources: Record<string, { translation: Record<string, string> }> = {
  en,
  fr,
  ja,
  ru,
  vi,
  zhCN,
  zhTW,
}

let client: QueryClient

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.setUser(null)
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  client.setQueryData(['status'], {
    HeaderNavModules: { pricing: { enabled: true, requireAuth: true } },
  })
})

afterEach(() => {
  client.clear()
  useAuthStore.getState().auth.setUser(null)
  localStorage.clear()
})

it.each(Object.entries(resources))(
  '%s supplies all five modality descriptions without English fallback',
  (code, resource) => {
    for (const key of descriptions) {
      expect(resource.translation[key], key).toBeTypeOf('string')
      expect(resource.translation[key], key).not.toBe('')
      if (code === 'en') {
        expect(resource.translation[key], key).toBe(key)
      } else {
        expect(resource.translation[key], key).not.toBe(key)
      }
    }
  }
)

it('updates all modality descriptions in place when switching from English to Chinese and Japanese', async () => {
  const language = createInstance()
  await language.init({ lng: 'en', fallbackLng: 'en', resources })
  render(
    <I18nextProvider i18n={language}>
      <QueryClientProvider client={client}>
        <MarketingModalities />
      </QueryClientProvider>
    </I18nextProvider>
  )

  for (const key of descriptions) {
    expect(screen.getByText(key, { exact: true })).toBeVisible()
  }

  for (const code of ['zhCN', 'ja']) {
    await act(() => language.changeLanguage(code))
    for (const key of descriptions) {
      expect(resources[code].translation[key], key).toBeTypeOf('string')
      expect(
        screen.getByText(resources[code].translation[key], { exact: true })
      ).toBeVisible()
      expect(screen.queryByText(key, { exact: true })).not.toBeInTheDocument()
    }
  }
})
