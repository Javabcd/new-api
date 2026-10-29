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
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { buildVideoExample } from '../examples'

type WorkflowScenario = {
  stage?: 'poll' | 'download'
  failure?: '429' | '503' | 'network' | 'timeout'
  initialStatus?: 'queued' | 'completed'
  expired?: boolean
}

let pythonExecutable =
  process.env.VIDEO_DOCS_PYTHON ??
  (process.platform === 'win32' ? 'python' : 'python3')

// Execute the generated scripts unchanged. Only network and time boundaries
// are replaced; downloading still writes through the real file/stream APIs.
const javascriptHarness = String.raw`
import { readFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import timers from 'node:timers/promises'

const { source, scenario } = JSON.parse(readFileSync(0, 'utf8'))
let clock = 0
Date.now = () => clock
timers.setTimeout = async () => { if (scenario.expired) clock = 600001 }
syncBuiltinESMExports()
globalThis.fetch = async (url, options) => {
  const path = new URL(url).pathname
  const method = options.method ?? 'GET'
  process.stdout.write('REQUEST ' + method + ' ' + path + '\n')
  if (method === 'POST') {
    return Response.json({ id: 'video-created-123', status: scenario.initialStatus ?? 'queued' })
  }
  const stage = path.endsWith('/content') ? 'download' : 'poll'
  if (stage === scenario.stage) {
    if (scenario.failure === 'network') throw new TypeError('mock network')
    if (scenario.failure === 'timeout') throw new DOMException('mock timeout', 'TimeoutError')
    return new Response('mock ' + scenario.failure, { status: Number(scenario.failure) })
  }
  if (stage === 'download') return new Response('example video')
  return Response.json({ id: 'video-created-123', status: scenario.expired ? 'queued' : 'completed' })
}
await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
`

const pythonHarness = String.raw`
import io
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

fixture = json.load(sys.stdin)
scenario = fixture['scenario']
clock = 0
time.monotonic = lambda: clock

def sleep(seconds):
    global clock
    if scenario.get('expired'):
        clock = 601

def urlopen(request, timeout):
    path = urllib.parse.urlparse(request.full_url).path
    method = request.get_method()
    print('REQUEST ' + method + ' ' + path, flush=True)
    if method == 'POST':
        return io.BytesIO(json.dumps({
            'id': 'video-created-123',
            'status': scenario.get('initialStatus', 'queued'),
        }).encode())
    stage = 'download' if path.endswith('/content') else 'poll'
    if stage == scenario.get('stage'):
        failure = scenario['failure']
        if failure == 'network':
            raise urllib.error.URLError('mock network')
        if failure == 'timeout':
            raise TimeoutError('mock timeout')
        raise urllib.error.HTTPError(request.full_url, int(failure), 'mock ' + failure, None, None)
    if stage == 'download':
        return io.BytesIO(b'example video')
    return io.BytesIO(json.dumps({
        'id': 'video-created-123',
        'status': 'queued' if scenario.get('expired') else 'completed',
    }).encode())

time.sleep = sleep
urllib.request.urlopen = urlopen
exec(fixture['source'], {})
`

function runWorkflow(
  language: 'python' | 'javascript',
  scenario: WorkflowScenario
): {
  status: number | null
  stdout: string
  stderr: string
  requests: string[]
  video: string | undefined
} {
  const directory = mkdtempSync(join(tmpdir(), 'video-doc-workflow-'))
  const videoPath = join(directory, 'video.mp4')
  try {
    const result = spawnSync(
      language === 'python' ? pythonExecutable : process.execPath,
      language === 'python'
        ? ['-c', pythonHarness]
        : ['--input-type=module', '-e', javascriptHarness],
      {
        cwd: directory,
        encoding: 'utf8',
        env: { ...process.env, NEW_API_KEY: 'workflow-test-key' },
        input: JSON.stringify({
          scenario,
          source: buildVideoExample({
            baseUrl: 'https://gateway.example.com/v1',
            provider: 'ctyun-cdance',
            language,
            operation: 'workflow',
          }),
        }),
        timeout: 10000,
      }
    )
    if (result.error) throw result.error
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      requests: result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('REQUEST ')),
      video: existsSync(videoPath)
        ? readFileSync(videoPath, 'utf8')
        : undefined,
    }
  } finally {
    if (existsSync(videoPath)) unlinkSync(videoPath)
    rmdirSync(directory)
  }
}

describe.each(['python', 'javascript'] as const)('%s workflow', (language) => {
  beforeAll(() => {
    if (
      language !== 'python' ||
      process.platform !== 'win32' ||
      process.env.VIDEO_DOCS_PYTHON
    ) {
      return
    }
    // Resolve Windows batch shims before invoking Python without a shell.
    const interpreter = spawnSync(
      process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/s', '/c', 'python'],
      {
        encoding: 'utf8',
        input: 'import sys\nprint(sys.executable)\n',
        timeout: 10000,
      }
    )
    if (interpreter.error) throw interpreter.error
    expect(interpreter.status, interpreter.stderr).toBe(0)
    pythonExecutable = interpreter.stdout.trim()
  })

  it.each(
    (['poll', 'download'] as const).flatMap((stage) =>
      (['429', '503', 'network', 'timeout'] as const).map((failure) => ({
        stage,
        failure,
      }))
    )
  )(
    'keeps the accepted task ID when $stage fails with $failure',
    (scenario) => {
      const result = runWorkflow(language, scenario)
      expect(result.status, result.stderr).toBe(1)
      expect(result.stderr).toContain(`mock ${scenario.failure}`)
      expect(result.requests).toEqual([
        'REQUEST POST /v1/videos',
        'REQUEST GET /v1/videos/video-created-123',
        ...(scenario.stage === 'download'
          ? ['REQUEST GET /v1/videos/video-created-123/content']
          : []),
      ])
      expect(result.stdout).toContain('Task ID: video-created-123')
      expect(result.stdout.indexOf('Task ID: video-created-123')).toBeLessThan(
        result.stdout.indexOf('REQUEST GET')
      )
      expect(result.video).toBeUndefined()
    }
  )

  it.each(['queued', 'completed'] as const)(
    'prints the ID before downloading a task created as %s',
    (initialStatus) => {
      const result = runWorkflow(language, { initialStatus })
      expect(result.status, result.stderr).toBe(0)
      expect(result.video).toBe('example video')
      expect(result.requests).toEqual([
        'REQUEST POST /v1/videos',
        ...(initialStatus === 'queued'
          ? ['REQUEST GET /v1/videos/video-created-123']
          : []),
        'REQUEST GET /v1/videos/video-created-123/content',
      ])
      expect(result.stdout).toContain('Task ID: video-created-123')
      expect(result.stdout.indexOf('Task ID: video-created-123')).toBeLessThan(
        result.stdout.indexOf('REQUEST GET')
      )
    }
  )

  it('keeps the original task ID when the polling deadline expires', () => {
    const result = runWorkflow(language, { expired: true })
    expect(result.status, result.stderr).toBe(1)
    expect(result.stderr).toContain(
      'Keep the task id and query it again: video-created-123'
    )
    expect(result.stdout).toContain('Task ID: video-created-123')
    expect(result.requests).toEqual([
      'REQUEST POST /v1/videos',
      'REQUEST GET /v1/videos/video-created-123',
    ])
  })
})
