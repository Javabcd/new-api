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
import { useStatus } from '@/hooks/use-status'

export function useApiBaseUrl(): string {
  const { status } = useStatus()
  const address =
    status?.server_address ??
    status?.serverAddress ??
    status?.data?.server_address ??
    status?.data?.serverAddress
  const currentBaseUrl = `${window.location.origin}/v1`
  if (typeof address !== 'string' || !address.trim()) return currentBaseUrl

  const serviceUrl = address.trim().replace(/\/+$/, '')
  try {
    const url = new URL(serviceUrl)
    const hostname = url.hostname.replace(/\.$/, '')
    const localAddress =
      ['localhost', '0.0.0.0', '[::1]', '[::]'].includes(hostname) ||
      hostname.endsWith('.localhost') ||
      /^127(?:\.\d{1,3}){3}$/.test(hostname)
    if (!['http:', 'https:'].includes(url.protocol) || localAddress) {
      return currentBaseUrl
    }
    return `${serviceUrl}/v1`
  } catch {
    return currentBaseUrl
  }
}
