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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { nanoid } from 'nanoid'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'
import { createServerError } from '@/lib/server-error-message'

import { submitVideo } from '../api'
import {
  buildVideoRequest,
  emptyVideoForm,
  videoFormSchema,
  type VideoFormValues,
} from '../lib/schema'
import type { VideoModel, VideoRequest } from '../types'

export function VideoForm(props: {
  model: VideoModel
  group: string
  identity: string
  blocked: boolean
  onBusy: (busy: boolean) => void
  onIntent: (key: string) => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const cap = props.model.capabilities
  const form = useForm<VideoFormValues>({
    resolver: zodResolver(videoFormSchema(cap)),
    defaultValues: emptyVideoForm,
  })
  const [confirmation, setConfirmation] = useState<VideoRequest | null>(null)
  const sending = useRef(false)
  const mutation = useMutation({
    mutationFn: async (intent: {
      key: string
      payload: VideoRequest
      sessionID: string
    }) => {
      const result = await submitVideo(
        intent.payload,
        intent.key,
        intent.sessionID
      )
      if (result.state === 'rejected') {
        props.onIntent('')
        let message = t('Operation failed')
        if (result.error_code) message += ` (${result.error_code})`
        throw createServerError(result, message)
      }
      return result
    },
    retry: false,
    onSuccess: (result) => {
      if (result.state === 'accepted') {
        props.onIntent('')
      }
      void client.invalidateQueries({
        queryKey: ['video-playground', props.identity],
      })
    },
    onError: (error) => {
      if (
        isAxiosError(error) &&
        error.response &&
        [400, 401, 403, 415, 429].includes(error.response.status)
      ) {
        props.onIntent('')
      }
      handleServerError(error)
      void client.invalidateQueries({
        queryKey: ['video-playground', props.identity, 'submission'],
      })
      void client.invalidateQueries({
        queryKey: ['video-playground', props.identity, 'unresolved'],
      })
    },
    onSettled: () => {
      sending.current = false
      props.onBusy(false)
    },
  })
  const disabled = mutation.isPending || props.blocked || !props.model.available

  return (
    <>
      <Form {...form}>
        <form
          className='space-y-4'
          onSubmit={form.handleSubmit((values) =>
            setConfirmation(buildVideoRequest(props.model, props.group, values))
          )}
        >
          <fieldset disabled={disabled} className='space-y-4'>
            <FormField
              control={form.control}
              name='prompt'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Prompt')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={5} maxLength={20000} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {cap.supported_modes.includes('image_to_video') && (
              <FormField
                control={form.control}
                name='imageUrl'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Reference image URL')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='url'
                        placeholder='https://'
                        maxLength={4096}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <div className='grid gap-4 sm:grid-cols-2'>
              <FormField
                control={form.control}
                name='duration'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('Duration (seconds)')}
                      {cap.duration_required && ' *'}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='number'
                        min={cap.duration_input_min}
                        max={cap.duration_input_max}
                        step={1}
                        placeholder={
                          cap.duration_required
                            ? undefined
                            : t('Use upstream default')
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {cap.resolutions.length > 0 && (
                <FormField
                  control={form.control}
                  name='resolution'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('Resolution')}
                        {cap.resolution_required && ' *'}
                      </FormLabel>
                      <FormControl>
                        <NativeSelect {...field} className='w-full'>
                          <NativeSelectOption value=''>
                            {cap.resolution_required
                              ? t('Select')
                              : t('Use upstream default')}
                          </NativeSelectOption>
                          {cap.resolutions.map((resolution) => (
                            <NativeSelectOption
                              key={resolution}
                              value={resolution}
                            >
                              {resolution}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name='ratio'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Aspect ratio')}</FormLabel>
                    <FormControl>
                      <NativeSelect {...field} className='w-full'>
                        <NativeSelectOption value=''>
                          {t('Use upstream default')}
                        </NativeSelectOption>
                        {cap.ratios.map((ratio) => (
                          <NativeSelectOption key={ratio} value={ratio}>
                            {ratio}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {(
                [
                  ['generateAudio', cap.generate_audio, t('Generate audio')],
                  ['watermark', cap.watermark, t('Watermark')],
                ] as const
              ).map(
                ([name, supported, label]) =>
                  supported && (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{label}</FormLabel>
                          <FormControl>
                            <NativeSelect {...field} className='w-full'>
                              <NativeSelectOption value=''>
                                {t('Use upstream default')}
                              </NativeSelectOption>
                              <NativeSelectOption value='true'>
                                {t('Yes')}
                              </NativeSelectOption>
                              <NativeSelectOption value='false'>
                                {t('No')}
                              </NativeSelectOption>
                            </NativeSelect>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )
              )}
            </div>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Generation is billed using your configured model price. Provider limits still apply.'
              )}
            </p>
            <Button type='submit' disabled={disabled}>
              {mutation.isPending ? t('Submitting...') : t('Generate video')}
            </Button>
          </fieldset>
        </form>
      </Form>
      <ConfirmDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
        title={t('Generate video')}
        desc={t(
          'This generation will use your balance or subscription quota. Continue?'
        )}
        confirmText={t('Generate video')}
        disabled={disabled}
        isLoading={mutation.isPending}
        handleConfirm={() => {
          if (!confirmation || sending.current || props.blocked) return
          let key: string
          try {
            key = nanoid()
          } catch (error) {
            handleServerError(error, t('Operation failed'))
            return
          }
          sending.current = true
          props.onIntent(key)
          props.onBusy(true)
          mutation.mutate({
            key,
            payload: confirmation,
            sessionID: props.identity.slice(props.identity.indexOf(':') + 1),
          })
          setConfirmation(null)
        }}
      />
    </>
  )
}
