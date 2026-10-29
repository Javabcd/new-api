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
import { VIDEO_DOC_PROVIDERS, type VideoDocProviderId } from './providers'

export type VideoExampleLanguage = 'curl' | 'python' | 'javascript'
export type VideoExampleOperation =
  | 'create'
  | 'retrieve'
  | 'content'
  | 'workflow'

export function buildVideoExample(props: {
  baseUrl: string
  provider: VideoDocProviderId
  language: VideoExampleLanguage
  operation: VideoExampleOperation
  imageReference?: boolean
}): string {
  const payload = {
    model: VIDEO_DOC_PROVIDERS[props.provider].model,
    prompt: 'A cat walking beside a quiet river, cinematic tracking shot',
    seconds: 5,
    metadata: { resolution: '720p', ratio: '16:9' },
    ...(props.imageReference
      ? { input_reference: 'https://example.com/reference.png' }
      : {}),
  }
  const body = JSON.stringify(payload, null, 2)
  const baseUrl = props.baseUrl.replace(/\/+$/, '')

  if (props.language === 'curl') {
    const quotedUrl = `'${baseUrl.replaceAll("'", "'\"'\"'")}'`
    const create = [
      `curl --fail ${quotedUrl}'/videos' \\`,
      '  -H "Authorization: Bearer $NEW_API_KEY" \\',
      '  -H "Content-Type: application/json" \\',
      `  -d '${body}'`,
    ].join('\n')
    const retrieve = [
      "TASK_ID='YOUR_TASK_ID'",
      `curl --fail ${quotedUrl}'/videos/'` + `"$TASK_ID" \\`,
      '  -H "Authorization: Bearer $NEW_API_KEY"',
    ].join('\n')
    const content = [
      "TASK_ID='YOUR_TASK_ID'",
      `curl --fail ${quotedUrl}'/videos/'` + `"$TASK_ID"` + `'/content' \\`,
      '  -H "Authorization: Bearer $NEW_API_KEY" \\',
      '  --output video.mp4',
    ].join('\n')
    if (props.operation === 'create') return create
    if (props.operation === 'retrieve') return retrieve
    if (props.operation === 'content') return content
    return [create, retrieve, content].join('\n\n')
  }

  if (props.language === 'python') {
    const setup = [
      'import json',
      'import os',
      'import shutil',
      'import time',
      'from urllib.request import Request, urlopen',
      '',
      `base_url = ${JSON.stringify(baseUrl)}`,
      'headers = {"Authorization": "Bearer " + os.environ["NEW_API_KEY"]}',
      '',
      'def request(path, payload=None):',
      '    data = None if payload is None else json.dumps(payload).encode("utf-8")',
      '    return urlopen(Request(base_url + path, data=data,',
      '                           headers={**headers, "Content-Type": "application/json"}), timeout=120)',
    ]
    const create = [
      `payload = json.loads(${JSON.stringify(JSON.stringify(payload))})`,
      'with request("/videos", payload) as response:',
      '    task = json.load(response)',
    ]
    const retrieve = [
      'task_id = "YOUR_TASK_ID"',
      'with request("/videos/" + task_id) as response:',
      '    task = json.load(response)',
      'print(json.dumps(task, indent=2))',
    ]
    const download = [
      'with request("/videos/" + task_id + "/content") as response, open("video.mp4", "wb") as output:',
      '    shutil.copyfileobj(response, output)',
    ]
    if (props.operation === 'create') {
      return [
        ...setup,
        '',
        ...create,
        'print(json.dumps(task, indent=2))',
      ].join('\n')
    }
    if (props.operation === 'retrieve') {
      return [...setup, '', ...retrieve].join('\n')
    }
    if (props.operation === 'content') {
      return [...setup, '', 'task_id = "YOUR_TASK_ID"', ...download].join('\n')
    }
    return [
      ...setup,
      '',
      ...create,
      '',
      'task_id = task["id"]',
      'print("Task ID:", task_id, flush=True)',
      'deadline = time.monotonic() + 600',
      'while task["status"] not in ("completed", "failed"):',
      '    if time.monotonic() >= deadline:',
      '        raise TimeoutError("Keep the task id and query it again: " + task_id)',
      '    time.sleep(5)',
      '    with request("/videos/" + task_id) as response:',
      '        task = json.load(response)',
      'if task["status"] == "failed":',
      '    raise RuntimeError(task.get("error", task))',
      ...download,
    ].join('\n')
  }

  const setup = [
    "import { createWriteStream } from 'node:fs'",
    "import { Readable } from 'node:stream'",
    "import { pipeline } from 'node:stream/promises'",
    "import { setTimeout } from 'node:timers/promises'",
    '',
    `const baseUrl = ${JSON.stringify(baseUrl)}`,
    '',
    'async function request(path, options = {}) {',
    '  const response = await fetch(baseUrl + path, {',
    '    ...options,',
    '    headers: {',
    "      Authorization: 'Bearer ' + process.env.NEW_API_KEY,",
    "      'Content-Type': 'application/json',",
    '    },',
    '    signal: AbortSignal.timeout(120000),',
    '  })',
    '  if (!response.ok) throw new Error(await response.text())',
    '  return response',
    '}',
  ]
  const create = [
    "let task = await (await request('/videos', {",
    "  method: 'POST',",
    `  body: JSON.stringify(${body}),`,
    '})).json()',
  ]
  const retrieve = [
    "const taskId = 'YOUR_TASK_ID'",
    "const task = await (await request('/videos/' + taskId)).json()",
    'console.log(task)',
  ]
  const download = [
    "const response = await request('/videos/' + taskId + '/content')",
    "if (!response.body) throw new Error('Empty video response')",
    "await pipeline(Readable.fromWeb(response.body), createWriteStream('video.mp4'))",
  ]
  if (props.operation === 'create') {
    return [...setup, '', ...create, 'console.log(task)'].join('\n')
  }
  if (props.operation === 'retrieve') {
    return [...setup, '', ...retrieve].join('\n')
  }
  if (props.operation === 'content') {
    return [...setup, '', "const taskId = 'YOUR_TASK_ID'", ...download].join(
      '\n'
    )
  }
  return [
    ...setup,
    '',
    ...create,
    '',
    'const taskId = task.id',
    "console.log('Task ID:', taskId)",
    'const deadline = Date.now() + 600000',
    "while (!['completed', 'failed'].includes(task.status)) {",
    "  if (Date.now() >= deadline) throw new Error('Keep the task id and query it again: ' + taskId)",
    '  await setTimeout(5000)',
    "  task = await (await request('/videos/' + taskId)).json()",
    '}',
    "if (task.status === 'failed') throw new Error(JSON.stringify(task.error ?? task))",
    ...download,
  ].join('\n')
}
