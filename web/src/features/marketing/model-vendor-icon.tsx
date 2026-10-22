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
import { getLobeIcon } from '@/lib/lobe-icon'

const VENDOR_ASSETS: Record<string, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  deepseek: 'deepseek',
  alibaba: 'alibaba',
  qwen: 'alibaba',
  阿里云通义: 'alibaba',
  阿里云: 'alibaba',
  bytedance: 'bytedance',
  字节跳动: 'bytedance',
  火山引擎: 'bytedance',
  智谱: 'zhipu',
  '智谱 ai': 'zhipu',
  zhipu: 'zhipu',
  moonshot: 'moonshot',
  月之暗面: 'moonshot',
  meta: 'meta',
  mistral: 'mistral',
  'mistral ai': 'mistral',
  minimax: 'minimax',
  xai: 'xai',
  'xai (grok)': 'xai',
  kling: 'kling',
  快手可灵: 'kling',
  'black forest labs': 'flux',
  flux: 'flux',
  baidu: 'baidu',
  百度智能云: 'baidu',
  tencent: 'tencent',
  腾讯云: 'tencent',
  cohere: 'cohere',
  perplexity: 'perplexity',
  'jina ai': 'jina',
  阶跃星辰: 'stepfun',
  生数科技: 'vidu',
  科大讯飞: 'xunfei',
  百川智能: 'baichuan',
  'aws bedrock': 'aws',
  suno: 'suno',
  cloudflare: 'cloudflare',
}

export function ModelVendorIcon(props: { name?: string; icon?: string }) {
  const asset = VENDOR_ASSETS[props.name?.trim().toLowerCase() || '']
  if (asset) {
    return (
      <img
        src={`/maixiaoyun/vendors/${asset}.svg`}
        alt=''
        width={40}
        height={40}
        loading='lazy'
      />
    )
  }
  const icon = props.icon ? getLobeIcon(props.icon, 32) : null
  return (
    <span aria-hidden='true' className='mxy-vendor-fallback'>
      {icon || props.name?.charAt(0).toUpperCase() || 'AI'}
    </span>
  )
}
