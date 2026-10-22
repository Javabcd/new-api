// Task hooks follow QuantumNous/new-api's Doubao plugin contract.
const MODEL = "doubao-seedance-2-0-260128";
const UPSTREAM_MODEL = "doubao-seedance-2.0";
const RESOLUTIONS = ["480p", "720p", "1080p"];
const MAX_TOKENS = 2147483647;
const REQUEST_DEFAULTS = {
  return_last_frame: false,
  execution_expires_after: 172800,
  generate_audio: true,
  resolution: "720p",
  ratio: "adaptive",
  duration: 5,
  watermark: false,
};

export const meta = {
  apiVersion: 1,
  key: "moma-seedance",
  name: "China Mobile MoMa Seedance",
  icon: "text:Mo",
  version: "1.3.0",
  author: { name: "QuantumNous" },
  description: {
    en: "MoMa Seedance task parameters via direct HTTP; SDK video encryption is not supported; result URLs expire after 24 hours",
    zh: "通过非加密 HTTP 支持 MoMa Seedance 任务参数，未实现 SDK 视频文件加密，结果链接 24 小时后失效",
  },
  baseUrl: "https://zhenze-huhehaote.cmecloud.cn",
  models: [MODEL, UPSTREAM_MODEL],
  fetchMode: "per_task",
  requiredCapabilities: ["task-auto-duration@1"],
  auth: "api_key",
  upstreams: ["vendor", "new_api"],
  usageSchema: {
    tokens: { type: "number", unit: "token", description: { en: "Video generation token unit price", zh: "视频生成 Token 单价" } },
    resolution: { enum: RESOLUTIONS, description: { en: "Output video resolution", zh: "输出视频分辨率" } },
    video_input: {
      enum: ["none", "video"],
      description: { en: "Reference video input", zh: "参考视频输入" },
      enumLabels: { none: { en: "No reference video", zh: "无参考视频" }, video: { en: "With reference video", zh: "包含参考视频" } },
    },
  },
  usageExamples: [
    { label: "480p · 5s", facts: { tokens: 48038, resolution: "480p", video_input: "none" } },
    { label: "720p · 5s", facts: { tokens: 108000, resolution: "720p", video_input: "none" } },
    { label: "1080p · 5s", facts: { tokens: 243000, resolution: "1080p", video_input: "none" } },
    { label: "480p · 5s · video", facts: { tokens: 48038, resolution: "480p", video_input: "video" } },
    { label: "720p · 5s · video", facts: { tokens: 108000, resolution: "720p", video_input: "video" } },
    { label: "1080p · 5s · video", facts: { tokens: 243000, resolution: "1080p", video_input: "video" } },
  ],
  routes: [
    { method: "POST", path: "/moma/api/v3/contents/generations/tasks", type: "submit", decode: "createTask", render: "taskCreated" },
    { method: "GET", path: "/moma/api/v3/contents/generations/tasks/:task_id", type: "query", render: "taskStatus" },
  ],
  protocols: ["openai_video"],
};

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function objectValue(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(name + " must be an object");
  return value;
}

function resolveMomaModel(ctx) {
  const model = ctx.upstreamModel || ctx.model || (ctx.requestBody || {}).model;
  if (model !== MODEL && model !== UPSTREAM_MODEL) throw new Error("unsupported MoMa model");
  return UPSTREAM_MODEL;
}

function apiRoot(ctx) {
  let root = ctx.baseUrl.replace(/\/+$/, "").replace(/\/api\/v3$/, "");
  if (ctx.upstream && ctx.upstream.kind === "new_api" && !root.endsWith("/moma")) root += "/moma";
  return root + "/api/v3";
}

function authHeader(ctx) {
  const value = trimmed(ctx.authHeader) || trimmed(ctx.apiKey);
  if (!value) throw new Error("API key is required");
  return /^Bearer\s+/i.test(value) ? value : "Bearer " + value;
}

function validateMediaSource(type, url) {
  if (typeof url !== "string" || !url || url.trim() !== url) throw new Error(type + " requires a non-empty URL without surrounding whitespace");
  // Validate references without fetching user-controlled media.
  if (/^https?:\/\/[^\s/?#@\\]+(?:[/?#][^\s\\]*)?$/i.test(url) || /^asset:\/\/[^\s/?#@\\]+$/.test(url)) return;
  if (type === "video_url") throw new Error("video_url requires an HTTP(S) URL or asset:// reference");
  const isImage = type === "image_url";
  const limit = (isImage ? 30 : 15) * 1024 * 1024;
  if (url.length > Math.ceil(limit / 3) * 4 + 64) throw new Error(type + " exceeds the inline media size limit");
  const match = /^data:(image|audio)\/([a-z0-9]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  const formats = isImage ? ["jpeg", "png", "webp", "bmp", "tiff", "gif"] : ["wav", "mp3"];
  if (!match || match[1] !== (isImage ? "image" : "audio") || !formats.includes(match[2]) || match[3].length % 4 !== 0)
    throw new Error(type + " requires an HTTP(S) URL, asset:// reference or valid Base64 data URL");
  const padding = match[3].endsWith("==") ? 2 : match[3].endsWith("=") ? 1 : 0;
  const bytes = (match[3].length / 4) * 3 - padding;
  if ((isImage && bytes >= limit) || (!isImage && bytes > limit)) throw new Error(type + " exceeds the inline media size limit");
}

// SDK source: https://ecloud.10086.cn/api/query/maas/public/backend/model/link/aicc-sdk/python/download
// The official Python SDK's create_video_generation_task forwards data without
// injecting defaults or moving content roles (maas_seedance/client.py:137-165,
// vendored seedance_inference_client.py:150-186). Keep the wire body explicit;
// documented defaults apply only to the effective request and reservation.
function normalizeMomaRequest(ctx, validateModel) {
  const req = objectValue(ctx.requestBody, "request body");
  const metadata = req.metadata === undefined ? {} : objectValue(req.metadata, "metadata");
  const body = {};
  for (const source of [metadata, req]) {
    for (const key of ["size", "frames", "enableVideoEncrypt", "publicKeyPath", "privateKeyPath"]) {
      if (source[key] !== undefined) throw new Error(key + " is not supported by MoMa");
    }
    for (const key of [
      "content",
      "ratio",
      "resolution",
      "return_last_frame",
      "execution_expires_after",
      "generate_audio",
      "tools",
      "safety_identifier",
      "watermark",
    ]) {
      if (Object.prototype.hasOwnProperty.call(source, key)) body[key] = source[key];
    }
  }
  if (validateModel) body.model = resolveMomaModel(ctx);
  let duration;
  for (const [key, value] of [
    ["seconds", req.seconds],
    ["duration", req.duration],
    ["seconds", metadata.seconds],
    ["duration", metadata.duration],
  ]) {
    if (value === undefined) continue;
    // OpenAI Video seconds may be a string; native JSON duration stays numeric.
    const seconds = key === "seconds" && typeof value === "string" && /^(?:-1|\d+)$/.test(value) ? Number(value) : value;
    // MoMa documents [4, 15], stricter than the host's 3600-second safety cap.
    if (!Number.isInteger(seconds) || (seconds !== -1 && (seconds < 4 || seconds > 15))) throw new Error("duration must be -1 or an integer between 4 and 15");
    if (duration !== undefined && duration !== seconds) throw new Error("conflicting duration and seconds values");
    duration = seconds;
  }
  if (duration !== undefined) body.duration = duration;
  if (body.resolution !== undefined && !RESOLUTIONS.includes(body.resolution)) throw new Error("resolution must be 480p, 720p or 1080p");
  if (body.ratio !== undefined && !["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"].includes(body.ratio)) throw new Error("invalid MoMa ratio");
  for (const key of ["return_last_frame", "generate_audio", "watermark"]) {
    if (body[key] !== undefined && typeof body[key] !== "boolean") throw new Error(key + " must be a boolean");
  }
  if (
    body.execution_expires_after !== undefined &&
    (!Number.isInteger(body.execution_expires_after) || body.execution_expires_after < 3600 || body.execution_expires_after > 259200)
  )
    throw new Error("execution_expires_after must be an integer between 3600 and 259200");
  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools)) throw new Error("tools must be an array");
    body.tools = body.tools.map((tool) => {
      if (objectValue(tool, "tool").type !== "web_search") throw new Error("tools only supports web_search");
      return { type: "web_search" };
    });
  }
  if (
    body.safety_identifier !== undefined &&
    (typeof body.safety_identifier !== "string" || body.safety_identifier.length > 128 || Array.from(body.safety_identifier).length > 64)
  )
    throw new Error("safety_identifier must be a string of at most 64 characters");
  if (body.content !== undefined && !Array.isArray(body.content)) throw new Error("content must be an array");
  const content = Array.from(body.content || []);
  if (req.images !== undefined && !Array.isArray(req.images)) throw new Error("images must be an array");
  const images = Array.from(req.images || []);
  for (const value of [req.image, req.input_reference]) {
    if (value !== undefined && !images.includes(value)) images.push(value);
  }
  for (const url of images) content.push({ type: "image_url", image_url: { url: url }, role: "reference_image" });
  if (req.prompt !== undefined) {
    if (!trimmed(req.prompt)) throw new Error("prompt must be a non-empty string");
    if (!content.some((item) => item && item.type === "text" && item.text === req.prompt)) content.push({ type: "text", text: req.prompt });
  }
  if (!content.length) throw new Error("content must not be empty");
  const counts = { first_frame: 0, last_frame: 0, reference_image: 0, reference_video: 0, reference_audio: 0 };
  body.content = content.map((item) => {
    objectValue(item, "content item");
    if (item.type === "text") {
      if (!trimmed(item.text)) throw new Error("text must be a non-empty string");
      return { type: "text", text: item.text };
    }
    if (!["image_url", "video_url", "audio_url"].includes(item.type)) throw new Error("unsupported content type");
    const roles = { image_url: ["first_frame", "last_frame", "reference_image"], video_url: ["reference_video"], audio_url: ["reference_audio"] }[item.type];
    if (!roles.includes(item.role)) throw new Error("invalid " + item.type + " role");
    const url = objectValue(item[item.type], item.type).url;
    validateMediaSource(item.type, url);
    counts[item.role]++;
    const entry = { type: item.type };
    entry[item.type] = { url: url };
    entry.role = item.role;
    return entry;
  });
  if (counts.first_frame > 1 || counts.last_frame > 1 || counts.reference_image > 9 || counts.reference_video > 3 || counts.reference_audio > 3)
    throw new Error("too many MoMa media references");
  if (counts.last_frame && !counts.first_frame) throw new Error("last_frame requires first_frame");
  if ((counts.first_frame || counts.last_frame) && (counts.reference_image || counts.reference_video || counts.reference_audio))
    throw new Error("first/last frames cannot be mixed with multimodal references");
  if (counts.reference_audio && !counts.reference_image && !counts.reference_video) throw new Error("audio_url requires a reference image or video");

  const serialized = JSON.stringify(body);
  let bytes = serialized.length;
  // Conservatively include the host JSON codec's HTML/line-separator escapes.
  const escaped = /[<>&\u0080-\u{10ffff}]/gu;
  let match;
  while (bytes <= 64 * 1024 * 1024 && (match = escaped.exec(serialized)) !== null) {
    const point = match[0].codePointAt(0);
    bytes += point < 0x80 || point === 0x2028 || point === 0x2029 ? 5 : point < 0x800 ? 1 : 2;
  }
  if (bytes > 64 * 1024 * 1024) throw new Error("MoMa request body exceeds 64 MB");
  return { explicitRequest: body, effectiveRequest: Object.assign({}, REQUEST_DEFAULTS, body) };
}

function videoIntent(ctx, requestBody) {
  const model = trimmed(ctx.model || requestBody.model);
  if (!model) throw new Error("model is required");
  // Decoding precedes channel model mapping, so validate the model in drivers.
  const body = normalizeMomaRequest({ requestBody: requestBody }, false).explicitRequest;
  return { kind: "submit", model: model, action: body.content.some((item) => item.type !== "text") ? "image_to_video" : "text_to_video", requestBody: body };
}

function extractUpstreamError(ctx, body) {
  const error = body.error || {};
  let message =
    [trimmed(error.code) || trimmed(body.errorCode) || trimmed(error.type), trimmed(error.message) || trimmed(body.errorMessage)].filter(Boolean).join(": ") ||
    trimmed(body.status) ||
    "MoMa upstream error";
  // A provider can echo a credential in its message; do not persist or return it.
  for (const secret of [ctx.authHeader, ctx.apiKey, trimmed(ctx.authHeader).replace(/^Bearer\s+/i, "")]) {
    if (trimmed(secret)) message = message.split(secret).join("[redacted]");
  }
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

export const native = {
  createTask: function (ctx) {
    if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required");
    const body = objectValue(ctx.body.value, "request body");
    return videoIntent({ model: body.model }, body);
  },
  taskCreated: function (ctx, task) {
    return Object.assign({}, task.data || {}, { id: task.task_id });
  },
  taskStatus: function (ctx, task) {
    const output = Object.assign({}, task.data || {}, { id: task.task_id });
    if (!output.status) output.status = { SUCCESS: "succeeded", IN_PROGRESS: "running" }[task.status] || "queued";
    if (task.status === "FAILURE") {
      if (!["failed", "cancelled", "expired"].includes(output.status)) output.status = "failed";
      const code = trimmed((output.error || {}).code);
      output.error = { message: task.fail_reason || "task failed" };
      if (code) output.error.code = code;
      delete output.errorMessage;
    }
    return output;
  },
  error: function (ctx, error) {
    return { error: { code: error.code, message: error.message } };
  },
};

export function buildSubmitRequest(ctx) {
  const body = normalizeMomaRequest(ctx, true).explicitRequest;
  const headers = { "Content-Type": "application/json", Accept: "application/json", Authorization: authHeader(ctx) };
  // Official SDK download from the PDF, maas_seedance/client.py:155-157,
  // _has_video_input:243-254: only content entries of type video_url trigger it.
  if (body.content.some((item) => item.type === "video_url")) headers["Input-Has-Video"] = "true";
  return {
    url: apiRoot(ctx) + "/contents/generations/tasks",
    method: "POST",
    headers: headers,
    body: body,
    action: body.content.some((item) => item.type !== "text") ? "image_to_video" : "text_to_video",
    rewriteModel: body.model,
  };
}

export function parseSubmitResponse(ctx, resp) {
  const body = objectValue(resp.body, "MoMa response");
  if (body.error || body.errorCode || body.errorMessage || (resp.statusCode && (resp.statusCode < 200 || resp.statusCode >= 300)))
    throw new Error(extractUpstreamError(ctx, body));
  if (!trimmed(body.id)) throw new Error("task_id is empty");
  return { taskId: body.id, taskData: body };
}

export function extractUsage(ctx) {
  const body = normalizeMomaRequest(ctx, true).effectiveRequest;
  if (ctx.usagePurpose === "billing_ratios") throw new Error("MoMa requires token usage expression pricing");
  // Borrow Doubao's 24 fps /1024 reservation heuristic at the effective
  // resolution. It is not MoMa's billing formula: measured usage replaces it.
  // Missing duration uses the documented 5s; automatic duration reserves 15s.
  const dimensions = { "480p": [854, 480], "720p": [1280, 720], "1080p": [1920, 1080] }[body.resolution];
  return {
    tokens: Math.ceil(((body.duration === -1 ? 15 : body.duration) * dimensions[0] * dimensions[1] * 24) / 1024),
    resolution: body.resolution,
    video_input: body.content.some((item) => item.type === "video_url") ? "video" : "none",
  };
}

export function buildQueryRequest(ctx) {
  return {
    url: apiRoot(ctx) + "/contents/generations/tasks/" + encodeURIComponent(ctx.taskId),
    method: "GET",
    headers: { Accept: "application/json", Authorization: authHeader(ctx) },
  };
}

export function parseTaskResult(ctx, body) {
  body = objectValue(body, "MoMa response");
  if (body.status === "queued") return { status: "QUEUED", progress: "10%" };
  if (body.status === "running") return { status: "IN_PROGRESS", progress: "50%" };
  if (body.status === "succeeded") {
    const result = { status: "SUCCESS", progress: "100%", url: trimmed((body.content || {}).video_url) };
    const facts = extractUsageOnComplete(ctx, result, body);
    if (facts.tokens !== undefined) result.totalTokens = facts.tokens;
    return result;
  }
  if (["failed", "cancelled", "expired"].includes(body.status)) return { status: "FAILURE", progress: "100%", reason: extractUpstreamError(ctx, body) };
  return { status: "UNKNOWN", reason: extractUpstreamError(ctx, body) };
}

export function extractUsageOnComplete(ctx, result, body) {
  if (!body || body.status !== "succeeded") return {};
  const facts = {};
  const usage = body.usage || {};
  for (const value of [usage.total_tokens, usage.completion_tokens]) {
    if (Number.isInteger(value) && value > 0 && value <= MAX_TOKENS) {
      facts.tokens = value;
      break;
    }
  }
  const resolution = trimmed(body.resolution).toLowerCase();
  if (RESOLUTIONS.includes(resolution)) facts.resolution = resolution;
  // Omit video_input: it describes the frozen request, not the generated video.
  // Omitted facts retain their frozen submission values; never invent measured
  // tokens or an output resolution when MoMa omits or returns invalid values.
  return facts;
}

export function listArtifacts(task) {
  if (task.status !== "SUCCESS") return [];
  const content = (task.data || {}).content || {};
  const artifacts = [];
  if (trimmed(content.video_url)) artifacts.push({ key: "video", type: "video", mimeType: "video/mp4" });
  if (trimmed(content.last_frame_url)) artifacts.push({ key: "last_frame", type: "image", mimeType: "image/png" });
  return artifacts;
}

export function buildContentRequest(ctx) {
  const field = { video: "video_url", last_frame: "last_frame_url" }[ctx.artifactKey];
  const url = field && trimmed(((ctx.data || {}).content || {})[field]);
  if (!url) throw new Error("artifact_not_found");
  // Signed URLs are temporary. Host proxy checks apply; never forward API keys.
  return { url: url, method: ctx.clientRequest.method, credentialless: true };
}

export const protocols = {
  openai_video: {
    decodeRequest: function (ctx) {
      if (!ctx.body || !["json", "multipart"].includes(ctx.body.kind)) throw new Error("JSON or multipart body required");
      if (ctx.body.kind === "json") return videoIntent(ctx, objectValue(ctx.body.value, "request body"));
      if ((ctx.body.files || []).length) throw new Error("MoMa does not support uploaded files; use URL, asset or Base64 references in metadata.content");
      const req = {};
      for (const name of Object.keys(ctx.body.fields || {})) {
        const values = ctx.body.fields[name];
        if (values.length !== 1) throw new Error("multipart fields must be provided once");
        req[name] = values[0];
      }
      for (const name of ["return_last_frame", "generate_audio", "watermark"]) {
        if (req[name] === undefined) continue;
        if (req[name] !== "true" && req[name] !== "false") throw new Error(name + " must be true or false");
        req[name] = req[name] === "true";
      }
      for (const name of ["duration", "execution_expires_after"]) {
        if (req[name] === undefined) continue;
        if (!/^-?\d+$/.test(req[name])) throw new Error(name + " must be an integer");
        req[name] = Number(req[name]);
      }
      for (const name of ["metadata", "content", "images", "tools"]) {
        if (req[name] === undefined) continue;
        try {
          req[name] = JSON.parse(req[name]);
        } catch (e) {
          // Parser errors may include client payloads; expose only the field name.
          // eslint-disable-next-line preserve-caught-error
          throw new Error(name + " must be valid JSON");
        }
      }
      return videoIntent(ctx, req);
    },
    render: function (ctx, task) {
      return native.taskStatus(ctx, task);
    },
  },
};
