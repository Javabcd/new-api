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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { StaticDataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { ModelGroupSelector } from '@/components/model-group-selector'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getUserGroups } from '@/features/playground/api'
import { TaskArtifacts } from '@/features/usage-logs/components/task-artifacts'
import { useAuthStore } from '@/stores/auth-store'

import {
  getVideoModels,
  getVideoSubmission,
  getVideoTasks,
  getUnresolvedVideoSubmissions,
} from './api'
import { VideoForm } from './components/video-form'
import type { VideoTask } from './types'

export function VideoPlayground() {
  const identity = useAuthStore(
    (state) => `${state.auth.user?.id ?? ''}:${state.auth.session?.sid ?? ''}`
  )
  const userGroup = useAuthStore((state) => state.auth.user?.group || '')
  return (
    <VideoPlaygroundContent
      key={identity}
      identity={identity}
      userGroup={userGroup}
    />
  )
}

function VideoPlaygroundContent(props: {
  identity: string
  userGroup: string
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [group, setGroup] = useState(props.userGroup)
  const [selection, setSelection] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(1)
  const [preview, setPreview] = useState('')
  const [newIntentConfirm, setNewIntentConfirm] = useState(false)
  const [acknowledged, setAcknowledged] = useState<string[]>([])
  const storageKey = `video-playground:${props.identity}:submission`
  const [intent, setIntent] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) || ''
    } catch {
      return ''
    }
  })
  const baseKey = ['video-playground', props.identity]
  const groups = useQuery({
    queryKey: [...baseKey, 'groups'],
    queryFn: getUserGroups,
  })
  const models = useQuery({
    queryKey: [...baseKey, 'models', group],
    queryFn: () => getVideoModels(group),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })
  const tasks = useQuery({
    queryKey: [...baseKey, 'tasks', page],
    queryFn: () => getVideoTasks(page),
    refetchInterval: (query) =>
      query.state.data?.some(
        (task) => !['SUCCESS', 'FAILURE'].includes(task.status)
      )
        ? 5000
        : false,
    refetchIntervalInBackground: false,
  })
  const submission = useQuery({
    queryKey: [...baseKey, 'submission', intent],
    queryFn: () => getVideoSubmission(intent),
    enabled: intent !== '',
    retry: false,
    meta: { errorToast: false },
    refetchInterval: (query) =>
      query.state.data?.state === 'pending' ? 5000 : false,
    refetchIntervalInBackground: false,
  })
  const unresolved = useQuery({
    queryKey: [...baseKey, 'unresolved'],
    queryFn: getUnresolvedVideoSubmissions,
    meta: { errorToast: false },
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.state === 'pending') ? 5000 : false,
    refetchIntervalInBackground: false,
  })
  const acceptedTaskID =
    submission.isSuccess && submission.data.state === 'accepted'
      ? submission.data.task_id
      : ''
  useEffect(() => {
    if (!acceptedTaskID) return
    void client.invalidateQueries({
      queryKey: ['video-playground', props.identity, 'tasks'],
    })
    void client.invalidateQueries({
      queryKey: ['video-playground', props.identity, 'unresolved'],
    })
  }, [acceptedTaskID, client, props.identity])

  const previousUnresolvedTaskIDs = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!unresolved.isSuccess) return
    const currentTaskIDs = new Set(unresolved.data.map((item) => item.task_id))
    const previousTaskIDs = previousUnresolvedTaskIDs.current
    previousUnresolvedTaskIDs.current = currentTaskIDs
    if ([...previousTaskIDs].some((id) => !currentTaskIDs.has(id))) {
      void client.invalidateQueries({
        queryKey: ['video-playground', props.identity, 'tasks'],
      })
    }
  }, [client, props.identity, unresolved.data, unresolved.isSuccess])

  const options = (models.data || []).filter((model) => model.available)
  const selected = options.find(
    (model) => `${model.plugin_key}::${model.model}` === selection
  )
  const serverOutstanding = unresolved.data?.find(
    (item) => !acknowledged.includes(item.task_id)
  )
  const catalogBlocked = models.isPending || models.isError
  const recoveryBlocked = unresolved.isPending || unresolved.isError
  const outstanding =
    Boolean(serverOutstanding) ||
    (intent !== '' &&
      submission.data?.state !== 'accepted' &&
      submission.data?.state !== 'rejected')
  const selectedTask = tasks.data?.find((task) => task.task_id === preview)

  const forgetIntent = () => {
    setAcknowledged((previous) => [
      ...previous,
      ...(unresolved.data || []).map((item) => item.task_id),
    ])
    setIntent('')
    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      /* Query is the source of truth. */
    }
    setNewIntentConfirm(false)
    void client.invalidateQueries({ queryKey: [...baseKey, 'tasks'] })
  }

  return (
    <div className='space-y-6'>
      <h1 className='text-2xl font-semibold'>{t('Video generation')}</h1>
      <div className='grid min-w-0 gap-6 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>{t('Generate video')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <ModelGroupSelector
              selectedModel={selected ? selection : ''}
              models={options.map((model) => ({
                label: model.display_name,
                value: `${model.plugin_key}::${model.model}`,
                category: model.plugin_key,
                description: model.available ? undefined : t('Unavailable'),
              }))}
              onModelChange={setSelection}
              selectedGroup={group}
              groups={groups.data || []}
              onGroupChange={(value) => {
                setGroup(value)
                setSelection('')
              }}
              disabled={busy}
            />
            {models.isPending && <LoadingState />}
            {models.isError && (
              <ErrorState onRetry={() => void models.refetch()} />
            )}
            {!models.isPending && !models.isError && options.length === 0 && (
              <EmptyState title={t('No video models available')} />
            )}
            {selected && !selected.available && (
              <Alert variant='destructive'>
                <AlertTitle>{t('Unavailable')}</AlertTitle>
                <AlertDescription>
                  {selected.disabled_reason === 'model_price_error'
                    ? t('Model price is not configured')
                    : t('The selected provider has no compatible channel')}
                </AlertDescription>
              </Alert>
            )}
            {unresolved.isPending && (
              <LoadingState
                inline
                message={t('Checking previous submissions...')}
              />
            )}
            {unresolved.isError && (
              <ErrorState
                title={t('Unable to recover previous submissions')}
                onRetry={() => void unresolved.refetch()}
              />
            )}
            {outstanding && (
              <Alert>
                <AlertTitle>
                  {(submission.data?.state ?? serverOutstanding?.state) ===
                  'pending'
                    ? t('Submitting...')
                    : t('Submission result unknown')}
                </AlertTitle>
                <AlertDescription>
                  {t(
                    'Check the existing submission before starting another generation.'
                  )}
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      if (intent) void submission.refetch()
                      void unresolved.refetch()
                      void tasks.refetch()
                    }}
                    disabled={submission.isFetching || unresolved.isFetching}
                  >
                    {t('Check submission')}
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={busy || recoveryBlocked}
                    onClick={() => setNewIntentConfirm(true)}
                  >
                    {t('Start a new generation')}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {selected && (
              <VideoForm
                key={`${props.identity}:${group}:${selection}`}
                model={selected}
                group={group}
                identity={props.identity}
                blocked={outstanding || recoveryBlocked || catalogBlocked}
                onBusy={setBusy}
                onIntent={(key) => {
                  setIntent(key)
                  try {
                    sessionStorage.setItem(storageKey, key)
                  } catch {
                    /* Recovery also uses server task history. */
                  }
                }}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('Preview')}</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedTask?.status === 'SUCCESS' ? (
              <TaskArtifacts
                key={selectedTask.task_id}
                taskId={selectedTask.task_id}
                enabled
                queryScope={baseKey}
              />
            ) : (
              <EmptyState title={t('Select a completed task to preview')} />
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('Tasks')}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {tasks.isPending && <LoadingState />}
          {tasks.isError && <ErrorState onRetry={() => void tasks.refetch()} />}
          <StaticDataTable<VideoTask>
            data={tasks.data || []}
            getRowKey={(task) => task.task_id}
            emptyContent={<EmptyState title={t('No tasks yet')} />}
            columns={[
              {
                id: 'model',
                header: t('Model'),
                cell: (task) => (
                  <span className='break-all'>
                    {task.plugin_key} · {task.model}
                  </span>
                ),
              },
              {
                id: 'status',
                header: t('Status'),
                cell: (task) => {
                  if (task.status === 'SUCCESS') return t('Success')
                  if (task.status === 'FAILURE') return t('Failed')
                  if (task.status === 'IN_PROGRESS') return t('In progress')
                  if (task.status === 'UNKNOWN') return t('Unknown')
                  return t('Queued')
                },
              },
              {
                id: 'task',
                header: t('Task ID'),
                cell: (task) => (
                  <span className='font-mono text-xs break-all'>
                    {task.task_id}
                  </span>
                ),
              },
              {
                id: 'preview',
                header: t('Preview'),
                cell: (task) => (
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={task.status !== 'SUCCESS'}
                    onClick={() => setPreview(task.task_id)}
                  >
                    {t('Preview')}
                  </Button>
                ),
              },
            ]}
          />
          <div className='flex justify-end gap-2'>
            <Button
              variant='outline'
              disabled={page === 1 || tasks.isFetching}
              onClick={() => setPage((value) => value - 1)}
            >
              {t('Previous')}
            </Button>
            <Button
              variant='outline'
              disabled={(tasks.data?.length || 0) < 20 || tasks.isFetching}
              onClick={() => setPage((value) => value + 1)}
            >
              {t('Next')}
            </Button>
            <Button
              variant='outline'
              onClick={() => void tasks.refetch()}
              disabled={tasks.isFetching}
            >
              {t('Refresh')}
            </Button>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={newIntentConfirm}
        onOpenChange={setNewIntentConfirm}
        title={t('Start a new generation')}
        desc={t(
          'The previous submission may still generate a video and incur a charge. Start another generation?'
        )}
        handleConfirm={forgetIntent}
      />
    </div>
  )
}
