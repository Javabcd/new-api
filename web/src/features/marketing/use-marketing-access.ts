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
import { useQuery } from '@tanstack/react-query'

import {
  getModuleAccessFromStatus,
  type HeaderNavModule,
} from '@/lib/nav-modules'
import { statusQueryOptions } from '@/lib/status-query'
import { useAuthStore } from '@/stores/auth-store'

export function useMarketingAccess(module: HeaderNavModule) {
  // Branding can use a localStorage placeholder; access decisions must wait
  // for the shared query's server-confirmed data.
  const query = useQuery(statusQueryOptions)
  const status = query.data ?? null
  const user = useAuthStore((state) => state.auth.user)
  const access = getModuleAccessFromStatus(status, module)
  return {
    enabled: access.enabled,
    allowed:
      query.isSuccess &&
      Boolean(status) &&
      access.enabled &&
      (!access.requireAuth || Boolean(user)),
    requiresAuth: access.requireAuth && !user,
    pending: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}
