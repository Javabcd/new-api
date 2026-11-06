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
import type { PricingModel } from '@/features/pricing/types'

import { FEATURED_MODEL_NAMES } from './brand'

export function selectFeaturedModels(
  models: PricingModel[],
  limit: number
): PricingModel[] {
  const remaining = new Map(models.map((model) => [model.model_name, model]))
  const featured: PricingModel[] = []
  for (const name of FEATURED_MODEL_NAMES) {
    const model = remaining.get(name)
    if (!model) continue
    featured.push(model)
    remaining.delete(name)
    if (featured.length === limit) return featured
  }
  return [...featured, ...remaining.values()].slice(0, limit)
}
