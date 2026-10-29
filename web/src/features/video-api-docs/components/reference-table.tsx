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
import type { ReactNode } from 'react'

import { StaticDataTable } from '@/components/data-table'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function ReferenceTable(props: {
  label: string
  columns: string[]
  rows: ReactNode[][]
}) {
  return (
    <StaticDataTable
      className='focus-visible:outline-ring overflow-x-auto overflow-y-hidden focus-visible:-outline-offset-2'
      tableClassName='min-w-[36rem]'
      tableProps={{ 'aria-label': props.label, withContainer: false }}
      containerProps={{
        tabIndex: 0,
        role: 'region',
        'aria-label': props.label,
      }}
    >
      <TableHeader>
        <TableRow>
          {props.columns.map((column) => (
            <TableHead key={column}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.rows.map((row) => (
          <TableRow key={typeof row[0] === 'string' ? row[0] : String(row[1])}>
            {row.map((cell, column) => (
              <TableCell
                key={props.columns[column]}
                className='align-top whitespace-normal'
              >
                {column === 0 ? (
                  <code className='text-xs break-all'>{cell}</code>
                ) : (
                  <div className='min-w-32 leading-6'>{cell}</div>
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </StaticDataTable>
  )
}
