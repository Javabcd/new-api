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
import type { TFunction } from 'i18next'
import type { ReactNode } from 'react'

import { CodeBlock } from '@/components/ai-elements/code-block'
import { CopyButton } from '@/components/copy-button'
import { Alert, AlertDescription } from '@/components/ui/alert'

import { VideoCodeExamples } from './components/code-examples'
import { ReferenceTable } from './components/reference-table'
import type { VideoDocPageId } from './navigation'
import { VIDEO_DOC_PROVIDERS, type VideoDocProviderId } from './providers'

export type VideoDocSection = { id: string; title: string; content: ReactNode }

export function getVideoDocSections(
  page: VideoDocPageId,
  baseUrl: string,
  t: TFunction
): VideoDocSection[] {
  if (
    page === 'ctyun-cdance' ||
    page === 'millu-seedance' ||
    page === 'moma-seedance'
  ) {
    return getProviderSections(page, baseUrl, t)
  }
  if (page === 'overview') {
    return [
      {
        id: 'before-you-start',
        title: t('Before you start'),
        content: (
          <p>
            {t(
              'Enable the matching task plugin and channel, configure model access and pricing, then create an API key in the console.'
            )}{' '}
            <Link
              to='/keys'
              className='text-primary underline underline-offset-4'
            >
              {t('API Keys')}
            </Link>
          </p>
        ),
      },
      {
        id: 'authentication',
        title: t('Authentication'),
        content: (
          <>
            <p>
              {t(
                'Send your platform API key as Authorization: Bearer YOUR_API_KEY. Keep it on your application server.'
              )}
            </p>
            <CodeBlock
              code='Authorization: Bearer YOUR_API_KEY'
              language='http'
              enableCollapse={false}
            >
              <CopyButton
                value='Authorization: Bearer YOUR_API_KEY'
                tooltip={t('Copy code')}
              />
            </CodeBlock>
            <p>
              {t(
                'Set NEW_API_KEY in the environment before running the examples. Python uses the standard library; JavaScript requires Node.js 20 or later.'
              )}
            </p>
          </>
        ),
      },
      {
        id: 'quick-start',
        title: t('Quick start'),
        content: (
          <>
            <ol className='list-decimal space-y-2 pl-5'>
              <li>{t('Submit once and save the returned task id.')}</li>
              <li>
                {t('Query the task until its status is completed or failed.')}
              </li>
              <li>
                {t(
                  'Download the completed video and save it to your own storage.'
                )}
              </li>
            </ol>
            <VideoCodeExamples baseUrl={baseUrl} operation='workflow' />
            <p>
              {t(
                'Python and JavaScript poll every five seconds for up to ten minutes. On timeout, keep the task id and query again instead of submitting another generation.'
              )}
            </p>
            <p>
              {t(
                'For cURL, replace YOUR_TASK_ID with the returned id and repeat the query before downloading.'
              )}
            </p>
          </>
        ),
      },
      {
        id: 'providers',
        title: t('Supported providers'),
        content: (
          <>
            <p>
              {t(
                'Model names and aliases follow channel routing. To select a specific provider, configure the matching channel and API key group.'
              )}
            </p>
            <ReferenceTable
              label={t('Supported providers')}
              columns={[t('Provider'), t('Model'), t('Supported resolutions')]}
              rows={(
                Object.entries(VIDEO_DOC_PROVIDERS) as [
                  VideoDocProviderId,
                  (typeof VIDEO_DOC_PROVIDERS)[VideoDocProviderId],
                ][]
              ).map(([id, provider]) => [
                <Link
                  key={id}
                  to='/docs/video/$page'
                  params={{ page: id }}
                  className='text-primary underline underline-offset-4'
                >
                  {provider.name}
                </Link>,
                provider.model,
                provider.models[0].resolutions,
              ])}
            />
          </>
        ),
      },
      {
        id: 'storage',
        title: t('Video storage'),
        content: (
          <Alert>
            <AlertDescription>
              {t(
                'Preview streams video from the provider. Save completed videos to your own server or object storage for long-term access. Millu and MoMa result links expire after about 24 hours; CTYun retention is provider-defined.'
              )}
            </AlertDescription>
          </Alert>
        ),
      },
    ]
  }

  if (page === 'create') {
    const response = JSON.stringify(
      {
        id: 'task_example',
        object: 'video',
        model: VIDEO_DOC_PROVIDERS['ctyun-cdance'].model,
        status: 'queued',
        progress: 0,
        created_at: 1700000000,
      },
      null,
      2
    )
    return [
      {
        id: 'endpoint',
        title: t('Endpoint'),
        content: (
          <>
            <code className='bg-muted/40 block overflow-x-auto rounded-lg border p-4 text-xs whitespace-nowrap'>
              POST {baseUrl}/videos
            </code>
            <p>
              {t(
                'JSON is recommended. Multipart fields are accepted, but these three providers require media references instead of uploaded files.'
              )}
            </p>
          </>
        ),
      },
      {
        id: 'request-parameters',
        title: t('Request parameters'),
        content: (
          <ReferenceTable
            label={t('Request parameters')}
            columns={[t('Parameter'), t('Type'), t('Description')]}
            rows={[
              [
                'model',
                'string',
                t('Required. Use an enabled model name or channel alias.'),
              ],
              [
                'prompt',
                'string',
                t(
                  'Text prompt. Provide a prompt or text/media entries in metadata.content.'
                ),
              ],
              [
                'seconds',
                'integer | string',
                t(
                  'Video duration in seconds. Required by CTYun; optional for Millu and MoMa. See provider limits.'
                ),
              ],
              [
                'input_reference',
                'string',
                t(
                  'Optional reference image URL. Use metadata.content for explicit media roles.'
                ),
              ],
              [
                'metadata.resolution',
                'string',
                t(
                  'Output resolution, such as 720p. Required by CTYun; supported values vary by model.'
                ),
              ],
              [
                'metadata.ratio',
                'string',
                t(
                  'Aspect ratio, such as 16:9 or adaptive. See provider limits.'
                ),
              ],
              [
                'metadata.content',
                'array',
                t(
                  'Text, image, video or audio entries. Types, roles and limits depend on the provider.'
                ),
              ],
              [
                'metadata.generate_audio',
                'boolean',
                t('Optional switch; omitted fields keep provider defaults.'),
              ],
              [
                'metadata.watermark',
                'boolean',
                t('Optional switch; omitted fields keep provider defaults.'),
              ],
            ]}
          />
        ),
      },
      {
        id: 'text-to-video',
        title: t('Text to video'),
        content: (
          <>
            <VideoCodeExamples baseUrl={baseUrl} operation='create' />
            <p>
              {t(
                'These examples use CTYun. Open a provider guide for its model names and ready-to-copy request.'
              )}
            </p>
          </>
        ),
      },
      {
        id: 'image-to-video',
        title: t('Image to video'),
        content: (
          <>
            <p>
              {t(
                'Use a reachable reference image URL. The shorthand input_reference is converted to a reference_image entry.'
              )}
            </p>
            <VideoCodeExamples
              baseUrl={baseUrl}
              operation='create'
              imageReference
            />
          </>
        ),
      },
      {
        id: 'response',
        title: t('Response'),
        content: (
          <>
            <p>
              {t(
                'Example response. Save id and query the task; acceptance does not mean the video is ready.'
              )}
            </p>
            <CodeBlock code={response} language='json' enableCollapse={false}>
              <CopyButton value={response} tooltip={t('Copy code')} />
            </CodeBlock>
          </>
        ),
      },
    ]
  }

  if (page === 'retrieve') {
    return [
      {
        id: 'endpoint',
        title: t('Endpoint'),
        content: (
          <>
            <code className='bg-muted/40 block overflow-x-auto rounded-lg border p-4 text-xs whitespace-nowrap'>
              GET {baseUrl}/videos/&#123;id&#125;
            </code>
            <p>
              {t(
                'Queries return the latest saved task state. Use the public id returned by the create response.'
              )}
            </p>
            <VideoCodeExamples baseUrl={baseUrl} operation='retrieve' />
          </>
        ),
      },
      {
        id: 'task-status',
        title: t('Task status'),
        content: (
          <ReferenceTable
            label={t('Task status')}
            columns={[t('Status'), t('Description')]}
            rows={[
              ['queued', t('Queued')],
              ['in_progress', t('In progress')],
              ['completed', t('Video is ready to download.')],
              [
                'failed',
                t(
                  'Generation failed. Inspect the error field before deciding whether to submit again.'
                ),
              ],
              [
                'unknown',
                t('The state is unknown. Keep the task id and query again.'),
              ],
            ]}
          />
        ),
      },
      {
        id: 'response-fields',
        title: t('Response fields'),
        content: (
          <>
            <ReferenceTable
              label={t('Response fields')}
              columns={[t('Field'), t('Type'), t('Description')]}
              rows={[
                ['id', 'string', t('Public task identifier.')],
                ['object', '"video"', t('Resource type.')],
                ['model', 'string', t('Requested model name or alias.')],
                ['status', 'string', t('Current task status.')],
                [
                  'progress',
                  'integer',
                  t('Progress percentage reported by the task.'),
                ],
                [
                  'created_at',
                  'integer',
                  t('Creation time as a Unix timestamp in seconds.'),
                ],
                [
                  'completed_at',
                  'integer',
                  t(
                    'Completion timestamp; present after successful completion.'
                  ),
                ],
                [
                  'error',
                  'object',
                  t('Optional error details supplied by the provider.'),
                ],
              ]}
            />
            <p>
              {t(
                'Identity and status are managed by the gateway. Provider extensions may appear, and optional fields can be absent.'
              )}
            </p>
          </>
        ),
      },
    ]
  }

  if (page === 'content') {
    return [
      {
        id: 'endpoint',
        title: t('Endpoint'),
        content: (
          <>
            <code className='bg-muted/40 block overflow-x-auto rounded-lg border p-4 text-xs whitespace-nowrap'>
              GET / HEAD {baseUrl}/videos/&#123;id&#125;/content
            </code>
            <p>
              {t(
                'Wait for completed before requesting content. GET returns video bytes; HEAD returns headers without a body. Both require your API key.'
              )}
            </p>
          </>
        ),
      },
      {
        id: 'download-example',
        title: t('Download example'),
        content: <VideoCodeExamples baseUrl={baseUrl} operation='content' />,
      },
      {
        id: 'response-headers',
        title: t('Response headers'),
        content: (
          <>
            <p>
              {t(
                'Range requests and conditional headers are forwarded. Partial responses depend on upstream support.'
              )}
            </p>
            <ReferenceTable
              label={t('Response headers')}
              columns={[t('Header'), t('Description')]}
              rows={[
                [
                  'Content-Type',
                  t('Media type supplied by the provider, commonly video/mp4.'),
                ],
                [
                  'Content-Length / Content-Range',
                  t('Length and range information when supplied upstream.'),
                ],
                [
                  'ETag / Last-Modified',
                  t('Cache validation headers when supplied upstream.'),
                ],
              ]}
            />
          </>
        ),
      },
      {
        id: 'retention',
        title: t('Video storage'),
        content: (
          <>
            <p>
              {t(
                'Preview streams video from the provider. Save completed videos to your own server or object storage for long-term access. Millu and MoMa result links expire after about 24 hours; CTYun retention is provider-defined.'
              )}
            </p>
            <Alert>
              <AlertDescription>
                {t(
                  'A task record does not guarantee permanent access to its video. An expired provider link may return HTTP 410.'
                )}
              </AlertDescription>
            </Alert>
          </>
        ),
      },
    ]
  }

  return [
    {
      id: 'http-errors',
      title: t('HTTP errors'),
      content: (
        <ReferenceTable
          label={t('HTTP errors')}
          columns={[t('HTTP status'), t('Description')]}
          rows={[
            [
              '400',
              t(
                'Check required fields and provider limits. Content requests also fail while a task is unfinished.'
              ),
            ],
            [
              '401 / 403',
              t(
                'Check the API key, account access, model permissions and API key group.'
              ),
            ],
            [
              '404',
              t(
                'Check the public task id and ownership. Unavailable or unretained tasks cannot be retrieved.'
              ),
            ],
            [
              '410',
              t(
                'The upstream video is no longer available. Use your archived copy if one exists.'
              ),
            ],
            ['429', t('Rate limit reached. Wait before retrying the query.')],
            [
              '502 / 503 / 504',
              t(
                'The provider, channel or content service is unavailable or timed out. Keep the task id and inspect task logs.'
              ),
            ],
          ]}
        />
      ),
    },
    {
      id: 'routing',
      title: t('Channel routing'),
      content: (
        <p>
          {t(
            'Model names and aliases follow channel routing. To select a specific provider, configure the matching channel and API key group.'
          )}
        </p>
      ),
    },
    {
      id: 'safe-retries',
      title: t('Retries and timeouts'),
      content: (
        <Alert>
          <AlertDescription>
            {t(
              'If submission times out after reaching the server, check Task Logs before submitting again. Repeating POST may create another task and charge.'
            )}
          </AlertDescription>
        </Alert>
      ),
    },
    {
      id: 'native-routes',
      title: t('Native API routes'),
      content: (
        <>
          <p>
            {t(
              'Native routes use the provider request format and your platform API key. This guide uses the unified video endpoints.'
            )}
          </p>
          <ReferenceTable
            label={t('Native API routes')}
            columns={[t('Provider'), t('Create'), t('Query')]}
            rows={Object.values(VIDEO_DOC_PROVIDERS).map((provider) => [
              provider.name,
              `POST ${provider.nativePath}`,
              `GET ${provider.nativePath}/{task_id}`,
            ])}
          />
        </>
      ),
    },
  ]
}

function getProviderSections(
  providerId: VideoDocProviderId,
  baseUrl: string,
  t: TFunction
): VideoDocSection[] {
  const provider = VIDEO_DOC_PROVIDERS[providerId]
  const restrictions: ReactNode[] = []
  if (providerId === 'ctyun-cdance') {
    restrictions.push(
      <p key='duration'>
        {t(
          'CTYun requires an explicit duration and resolution. Size at the request root can be converted to a resolution tier; metadata.size does not satisfy the resolution requirement.'
        )}
      </p>,
      <p key='limits'>
        {t(
          'The 3600-second gateway limit is a safety bound, not a guarantee of provider support. Confirm supported durations with your provider.'
        )}
      </p>,
      <p key='media'>
        {t(
          'CTYun forwards ratio, media content and optional switches to the provider. Confirm their supported values with your channel provider.'
        )}
      </p>
    )
  } else if (providerId === 'millu-seedance') {
    restrictions.push(
      <p key='duration'>
        {t(
          'Millu accepts 720p or 1080p. Duration and resolution may be omitted to keep upstream defaults. Automatic duration -1, callback_url and frames are unsupported.'
        )}
      </p>,
      <p key='limits'>
        {t(
          'The 3600-second gateway limit is a safety bound, not a guarantee of provider support. Confirm supported durations with your provider.'
        )}
      </p>,
      <p key='size'>
        {t(
          'Millu size accepts 1280x720 or 1920x1080. For first/last-frame tasks, omit ratio or use adaptive; last_frame requires first_frame.'
        )}
      </p>,
      <p key='media'>
        {t(
          'Millu accepts HTTP(S), asset and Data URLs. When using multiple images, specify a role for each image. Result links expire after about 24 hours.'
        )}
      </p>
    )
  } else {
    restrictions.push(
      <p key='duration'>
        {t(
          'MoMa accepts integer durations from 4 to 15 seconds, or -1 for automatic duration. Resolutions are 480p, 720p and 1080p.'
        )}
      </p>,
      <p key='defaults'>
        {t(
          'MoMa defaults: 5 seconds, 720p, adaptive ratio, audio enabled, watermark and last-frame return disabled. Omitted fields keep upstream defaults.'
        )}
      </p>,
      <p key='unsupported'>
        {t(
          'MoMa rejects size, frames and SDK video encryption parameters. Video references cannot use Base64. Result links expire after about 24 hours.'
        )}
      </p>,
      <p key='media'>
        {t(
          'MoMa allows up to 9 reference images, 3 videos and 3 audio references. Audio requires an image or video. First/last frames cannot be mixed with multimodal references; last_frame requires first_frame.'
        )}
      </p>
    )
  }
  return [
    {
      id: 'models',
      title: t('Models and resolutions'),
      content: (
        <>
          <p>
            {t(
              'Model names and aliases follow channel routing. To select a specific provider, configure the matching channel and API key group.'
            )}
          </p>
          <ReferenceTable
            label={t('Models and resolutions')}
            columns={[t('Model'), t('Supported resolutions')]}
            rows={provider.models.map((model) => [
              model.name,
              model.resolutions,
            ])}
          />
        </>
      ),
    },
    {
      id: 'provider-limits',
      title: t('Provider limits'),
      content: restrictions,
    },
    {
      id: 'media-references',
      title: t('Media references'),
      content: (
        <>
          <p>
            {t(
              'Use input_reference for a reference image, or metadata.content for explicit types and roles. Provide reachable media sources and follow the provider limits.'
            )}
          </p>
          <ReferenceTable
            label={t('Media references')}
            columns={[t('Type'), t('Roles')]}
            rows={[
              ['image_url', 'reference_image / first_frame / last_frame'],
              [
                'video_url',
                providerId === 'ctyun-cdance'
                  ? t('Provider-defined')
                  : 'reference_video',
              ],
              [
                'audio_url',
                providerId === 'ctyun-cdance'
                  ? t('Provider-defined')
                  : 'reference_audio',
              ],
            ]}
          />
          {providerId !== 'ctyun-cdance' && (
            <p>
              {t(
                'Supported ratios: 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 and adaptive.'
              )}
            </p>
          )}
        </>
      ),
    },
    {
      id: 'example',
      title: t('Request example'),
      content: (
        <VideoCodeExamples
          baseUrl={baseUrl}
          provider={providerId}
          operation='create'
        />
      ),
    },
    {
      id: 'image-example',
      title: t('Image to video'),
      content: (
        <VideoCodeExamples
          baseUrl={baseUrl}
          provider={providerId}
          operation='create'
          imageReference
        />
      ),
    },
    {
      id: 'native-route',
      title: t('Native API routes'),
      content: (
        <>
          <p>
            {t(
              'Native routes use the provider request format and your platform API key. This guide uses the unified video endpoints.'
            )}
          </p>
          <code className='bg-muted/40 block overflow-x-auto rounded-lg border p-4 text-xs'>
            POST {provider.nativePath}
            <br />
            GET {provider.nativePath}/&#123;task_id&#125;
          </code>
        </>
      ),
    },
  ]
}
