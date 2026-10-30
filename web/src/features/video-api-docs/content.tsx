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
import { VIDEO_EXAMPLE_MODEL } from './examples'
import type { VideoDocPageId } from './navigation'

export type VideoDocSection = { id: string; title: string; content: ReactNode }

export function getVideoDocSections(
  page: VideoDocPageId,
  baseUrl: string,
  t: TFunction
): VideoDocSection[] {
  if (page === 'best-practices') {
    return getBestPracticeSections(baseUrl, t)
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
            <p>
              {t(
                'Review the unified request workflow and compatibility notes before integration.'
              )}{' '}
              <Link
                to='/docs/video/$page'
                params={{ page: 'best-practices' }}
                className='text-primary underline underline-offset-4'
              >
                {t('Best practices')}
              </Link>
            </p>
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
                'Preview streams video from upstream. Download completed videos promptly and save them to your own server or object storage. Result links may expire; retention depends on the configured channel.'
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
        model: VIDEO_EXAMPLE_MODEL,
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
                'JSON is recommended. Use reachable media references unless the configured channel explicitly supports file uploads.'
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
                  'Video duration in seconds. Set an explicit supported duration; defaults and automatic duration support depend on the configured channel.'
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
                  'Output resolution, such as 720p. Set an explicit supported value; available resolutions depend on the configured model and channel.'
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
                'Replace YOUR_VIDEO_MODEL with an enabled model name or channel alias before running any example.'
              )}{' '}
              <Link
                to='/docs/video/$page'
                params={{ page: 'best-practices' }}
                hash='provider-differences'
                className='text-primary underline underline-offset-4'
              >
                {t('Request compatibility')}
              </Link>
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
                'Preview streams video from upstream. Download completed videos promptly and save them to your own server or object storage. Result links may expire; retention depends on the configured channel.'
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
      id: 'unified-endpoints',
      title: t('Unified video endpoints'),
      content: (
        <ReferenceTable
          label={t('Unified video endpoints')}
          columns={[t('Method'), t('Endpoint')]}
          rows={[
            ['POST', `${baseUrl}/videos`],
            ['GET', `${baseUrl}/videos/{id}`],
            ['GET / HEAD', `${baseUrl}/videos/{id}/content`],
          ]}
        />
      ),
    },
  ]
}

function getBestPracticeSections(
  baseUrl: string,
  t: TFunction
): VideoDocSection[] {
  return [
    {
      id: 'request-preparation',
      title: t('Request preparation'),
      content: (
        <>
          <p>
            {t(
              'Replace YOUR_VIDEO_MODEL with an enabled model name or channel alias before running any example.'
            )}
          </p>
          <p>
            {t(
              'Model names and aliases follow channel routing. To select a specific provider, configure the matching channel and API key group.'
            )}
          </p>
          <p>
            {t(
              'Set NEW_API_KEY in the environment before running the examples. Python uses the standard library; JavaScript requires Node.js 20 or later.'
            )}
          </p>
        </>
      ),
    },
    {
      id: 'workflow',
      title: t('Request workflow'),
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
              ['video_url', 'reference_video'],
              ['audio_url', 'reference_audio'],
            ]}
          />
          <p>
            {t(
              'Media types, roles, source formats and counts depend on the configured channel. Use reachable HTTP(S) URLs by default; asset, Data URL and Base64 inputs require explicit support.'
            )}
          </p>
          <ReferenceTable
            label={t('Media input compatibility')}
            columns={[t('Type'), t('Description')]}
            rows={[
              [
                'image_url',
                t(
                  'When first/last-frame input is supported, last_frame requires first_frame. Some configurations require an omitted or adaptive ratio and prohibit mixing first/last frames with other media references.'
                ),
              ],
              [
                'video_url / audio_url',
                t(
                  'Supported counts vary. Some configurations allow up to 9 images, 3 videos and 3 audio inputs; audio references may require an image or video.'
                ),
              ],
            ]}
          />
          <p>
            {t(
              'The frames request field is separate from the first_frame and last_frame media roles.'
            )}
          </p>
        </>
      ),
    },
    {
      id: 'provider-differences',
      title: t('Request compatibility'),
      content: (
        <>
          <p>
            {t(
              'The examples set duration, resolution and ratio explicitly. Check supported fields, limits and defaults for your configuration before changing them.'
            )}
          </p>
          <ReferenceTable
            label={t('Request compatibility')}
            columns={[t('Parameter'), t('Description')]}
            rows={[
              [
                'seconds',
                t(
                  'Video duration in seconds. Set an explicit supported duration; defaults and automatic duration support depend on the configured channel.'
                ),
              ],
              [
                'metadata.resolution',
                t(
                  'Output resolution, such as 720p. Set an explicit supported value; available resolutions depend on the configured model and channel.'
                ),
              ],
              [
                'metadata.ratio',
                t(
                  'Aspect ratio, such as 16:9 or adaptive. See provider limits.'
                ),
              ],
              [
                'size / callback_url / frames',
                t(
                  'Fields such as size, callback_url, frames and video encryption options may be rejected. Prefer metadata.resolution over size or metadata.size, and send only supported optional fields.'
                ),
              ],
              [
                'metadata.generate_audio / metadata.watermark',
                t('Optional switch; omitted fields keep provider defaults.'),
              ],
            ]}
          />
          <p>
            {t(
              'The 3600-second gateway limit is a safety bound, not a guarantee of provider support. Confirm supported durations with your provider.'
            )}
          </p>
        </>
      ),
    },
    {
      id: 'retries-and-storage',
      title: t('Retries and video storage'),
      content: (
        <>
          <Alert>
            <AlertDescription>
              {t(
                'If submission times out after reaching the server, check Task Logs before submitting again. Repeating POST may create another task and charge.'
              )}
            </AlertDescription>
          </Alert>
          <p>
            {t(
              'Preview streams video from upstream. Download completed videos promptly and save them to your own server or object storage. Result links may expire; retention depends on the configured channel.'
            )}
          </p>
          <p>
            {t(
              'A task record does not guarantee permanent access to its video. An expired provider link may return HTTP 410.'
            )}
          </p>
        </>
      ),
    },
  ]
}
