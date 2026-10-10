// Video task hooks adapted from QuantumNous/new-api's Doubao plugin.
const MODEL = "millu-sd-x-2-5-260801";
const RESOLUTIONS = ["720p", "1080p"];
// New API safety limit (relay/common.MaxTaskDurationSeconds), not a Millu model limit.
const MAX_DURATION_SECONDS = 3600;
const MAX_TOKENS = 2147483647;
const REQUEST_KEYS = ["content", "ratio", "generate_audio", "watermark", "return_last_frame", "execution_expires_after", "priority", "draft", "seed", "camera_fixed", "tools", "web_search", "safety_identifier"];

export const meta = {
  apiVersion: 1,
  key: "millu-seedance",
  name: "Millu Seedance",
  icon: "text:MI",
  version: "1.0.0",
  author: { name: "QuantumNous" },
  description: { en: "Seedance video generation via Millu", zh: "通过 Millu 提供 Seedance 视频生成" },
  website: "https://api.millu.tv/api-docs/video/seedance-native",
  baseUrl: "https://api.millu.tv",
  models: [MODEL],
  fetchMode: "per_task",
  auth: "api_key",
  upstreams: ["vendor", "new_api"],
  usageSchema: {
    tokens: { type: "number", unit: "token", description: { en: "Video generation token unit price", zh: "视频生成 Token 单价" } },
    resolution: {
      enum: RESOLUTIONS,
      description: { en: "Output video resolution", zh: "输出视频分辨率" },
      enumLabels: { "720p": { en: "720p", zh: "720p" }, "1080p": { en: "1080p", zh: "1080p" } },
    },
    video_input: {
      enum: ["none", "video"],
      description: { en: "Reference video input", zh: "参考视频输入" },
      enumLabels: { none: { en: "No reference video", zh: "无参考视频" }, video: { en: "With reference video", zh: "包含参考视频" } },
    },
  },
  usageExamples: [
    { label: "720p · 5s · 16:9", facts: { tokens: 108000, resolution: "720p", video_input: "none" } },
    { label: "1080p · 5s · 16:9", facts: { tokens: 243000, resolution: "1080p", video_input: "none" } },
    { label: "720p · 5s · 16:9 · 视频参考", facts: { tokens: 108000, resolution: "720p", video_input: "video" } },
  ],
  routes: [
    { method: "POST", path: "/millu/api/v3/contents/generations/tasks", type: "submit", decode: "createTask", render: "taskCreated" },
    { method: "GET", path: "/millu/api/v3/contents/generations/tasks/:task_id", type: "query", render: "taskStatus" },
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

function apiRoot(ctx) {
  return ctx.baseUrl.replace(/\/+$/, "") + (ctx.upstream && ctx.upstream.kind === "new_api" ? "/millu" : "");
}

function authHeader(ctx) {
  const value = trimmed(ctx.authHeader) || trimmed(ctx.apiKey);
  if (!value) throw new Error("API key is required");
  // api_key auth supplies a raw key; new_api supplies an already formed header.
  return /^Bearer\s+/i.test(value) ? value : "Bearer " + value;
}

function requestHeader(ctx, name) {
  for (const key of Object.keys(ctx.requestHeaders || {})) {
    if (key.toLowerCase() === name.toLowerCase() && trimmed(ctx.requestHeaders[key])) return ctx.requestHeaders[key];
  }
  return ctx.publicTaskId;
}

function normalizeResolution(value, size) {
  const raw = trimmed(value).toLowerCase();
  if (RESOLUTIONS.includes(raw)) return raw;
  if (size && raw === "1280x720") return "720p";
  if (size && raw === "1920x1080") return "1080p";
  throw new Error("resolution must be 720p or 1080p; size must be 1280x720 or 1920x1080");
}

// Shared by native, generic Task API and OpenAI Video, including reservation.
// Decoders run before channel mapping: model validation belongs to driver hooks.
function videoRequest(ctx, validateModel) {
  const req = objectValue(ctx.requestBody, "request body");
  const metadata = req.metadata === undefined ? {} : objectValue(req.metadata, "metadata");
  const body = {};
  for (const source of [metadata, req]) {
    if (source.callback_url !== undefined && source.callback_url !== "" && source.callback_url !== null)
      throw new Error("callback_url is not supported by Millu");
    if (source.frames !== undefined) throw new Error("frames is not enabled by this Millu plugin");
    for (const key of REQUEST_KEYS) {
      if (Object.prototype.hasOwnProperty.call(source, key)) body[key] = source[key];
    }
  }
  body.model = ctx.upstreamModel || req.model || ctx.model;
  if (validateModel && body.model !== MODEL) throw new Error("unsupported Millu model: " + String(body.model));
  let duration;
  for (const value of [req.seconds, req.duration, metadata.seconds, metadata.duration]) {
    if (value === undefined) continue;
    if (value === -1 || value === "-1")
      throw new Error("duration=-1 smart duration is not enabled because a safe reservation upper bound is not documented");
    if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !/^\d+$/.test(value.trim())))
      throw new Error("duration must be an integer between 1 and " + MAX_DURATION_SECONDS);
    const seconds = Number(value);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_DURATION_SECONDS)
      throw new Error("duration must be an integer between 1 and " + MAX_DURATION_SECONDS);
    if (duration !== undefined && duration !== seconds) throw new Error("conflicting duration and seconds values");
    duration = seconds;
  }
  // Omission is intentional: reservation defaults must never change upstream defaults.
  if (duration !== undefined) body.duration = duration;
  for (const source of [metadata, req]) {
    for (const key of ["resolution", "size"]) {
      if (source[key] === undefined) continue;
      const resolution = normalizeResolution(source[key], key === "size");
      if (body.resolution !== undefined && body.resolution !== resolution) throw new Error("conflicting resolution and size values");
      body.resolution = resolution;
    }
  }
  if (body.content !== undefined && !Array.isArray(body.content)) throw new Error("content must be an array");
  const content = Array.from(body.content || []);
  if (req.images !== undefined && !Array.isArray(req.images)) throw new Error("images must be an array");
  const images = Array.from(req.images || []);
  for (const value of [req.image, req.input_reference]) {
    if (value !== undefined && !images.includes(value)) images.push(value);
  }
  for (const url of images) content.push({ type: "image_url", image_url: { url: url }, role: "reference_image" });
  if (req.prompt !== undefined) {
    if (typeof req.prompt !== "string" || !trimmed(req.prompt)) throw new Error("prompt must be a non-empty string");
    content.push({ type: "text", text: req.prompt });
  }
  if (!content.length || content.length > 64) throw new Error("content must contain between 1 and 64 items");
  let imageCount = 0;
  let missingImageRole = false;
  let firstFrame = false;
  let lastFrame = false;
  for (const item of content) {
    objectValue(item, "content item");
    if (item.type === "text") {
      if (!trimmed(item.text) || Array.from(item.text).length > 20000) throw new Error("text must contain between 1 and 20000 characters");
      continue;
    }
    if (!["image_url", "video_url", "audio_url"].includes(item.type)) throw new Error("unsupported content type");
    const url = objectValue(item[item.type], item.type).url;
    if (!trimmed(url) || !/^(https?:\/\/|asset:\/\/|data:)/i.test(url)) throw new Error(item.type + " must contain an HTTP, HTTPS, asset or Data URL");
    // Inline media byte limits remain upstream-owned; do not decode/copy large Base64 payloads here.
    const roles = item.type === "image_url" ? ["first_frame", "last_frame", "reference_image"] : item.type === "video_url" ? ["user", "reference_video"] : ["user", "reference_audio"];
    if (item.role !== undefined && !roles.includes(item.role)) throw new Error("invalid " + item.type + " role");
    if (item.type === "image_url") {
      imageCount++;
      missingImageRole = missingImageRole || item.role === undefined;
      firstFrame = firstFrame || item.role === "first_frame";
      lastFrame = lastFrame || item.role === "last_frame";
    }
  }
  if (imageCount > 1 && missingImageRole) throw new Error("multiple images require an explicit role for every image");
  if (lastFrame && !firstFrame) throw new Error("last_frame requires first_frame");
  if (body.ratio !== undefined && !["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"].includes(body.ratio)) throw new Error("unsupported ratio");
  if ((firstFrame || lastFrame || missingImageRole) && body.ratio !== undefined && body.ratio !== "adaptive")
    throw new Error("Seedance 2.5 first/last-frame tasks require ratio=adaptive or omitted");
  if (body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.some((tool) => !tool || tool.type !== "web_search")))
    throw new Error("tools only supports web_search");
  body.content = content;
  return body;
}

function videoIntent(ctx, requestBody) {
  const model = trimmed(ctx.model || requestBody.model);
  if (!model) throw new Error("model is required");
  requestBody = Object.assign({}, requestBody, { model: model });
  const body = videoRequest({ requestBody: requestBody }, false);
  return { kind: "submit", model: model, action: body.content.some((item) => item.type !== "text") ? "image_to_video" : "text_to_video", requestBody: requestBody };
}

export const native = {
  createTask: function (ctx) {
    if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required");
    const body = objectValue(ctx.body.value, "request body");
    return videoIntent({ model: body.model }, { model: body.model, metadata: body });
  },
  taskCreated: function (ctx, task) {
    return Object.assign({}, task.data || {}, { id: task.task_id });
  },
  taskStatus: function (ctx, task) {
    const output = Object.assign({}, task.data || {}, { id: task.task_id });
    if (output.model && task.properties && task.properties.origin_model_name) output.model = task.properties.origin_model_name;
    if (!output.status) output.status = { SUCCESS: "succeeded", IN_PROGRESS: "running" }[task.status] || "queued";
    // A host timeout/poll failure must also be terminal for a chained gateway.
    if (task.status === "FAILURE") {
      output.status = "failed";
      output.error = Object.assign({}, output.error || {}, { message: task.fail_reason || (output.error || {}).message || "task failed" });
    }
    return output;
  },
  error: function (ctx, error) {
    return { error: { code: error.code, message: error.message } };
  },
};

export function buildSubmitRequest(ctx) {
  const body = videoRequest(ctx, true);
  const idempotencyKey = requestHeader(ctx, "Idempotency-Key");
  if (!trimmed(idempotencyKey)) throw new Error("missing stable idempotency key");
  return {
    url: apiRoot(ctx) + "/api/v3/contents/generations/tasks",
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: authHeader(ctx), "Idempotency-Key": idempotencyKey, "X-Request-ID": requestHeader(ctx, "X-Request-ID") },
    body: body,
    action: body.content.some((item) => item.type !== "text") ? "image_to_video" : "text_to_video",
    rewriteModel: body.model,
  };
}

export function parseSubmitResponse(ctx, resp) {
  if (resp.body && resp.body.error) throw new Error([resp.body.error.code, resp.body.error.message].filter(Boolean).join(": ") || "upstream error");
  if (!resp.body || !trimmed(resp.body.id)) throw new Error("task_id is empty");
  return { taskId: resp.body.id, taskData: resp.body };
}

export function extractUsage(ctx) {
  const body = videoRequest(ctx, true);
  if (ctx.usagePurpose === "billing_ratios") return null;
  const resolution = body.resolution || "720p";
  const dimensions = resolution === "1080p" ? [1920, 1080] : [1280, 720];
  // Reservation heuristic, not Millu's exact dimensions for every ratio.
  // Reference-video duration is never added; completion overlays actual usage.
  const tokens = Math.ceil(dimensions[0] * dimensions[1] * 24 * (body.duration === undefined ? 5 : body.duration) / 1024);
  return { tokens: tokens, resolution: resolution, video_input: body.content.some((item) => item.type === "video_url") ? "video" : "none" };
}

export function buildQueryRequest(ctx) {
  return {
    url: apiRoot(ctx) + "/api/v3/contents/generations/tasks/" + encodeURIComponent(ctx.taskId),
    method: "GET",
    headers: { Accept: "application/json", Authorization: authHeader(ctx), "X-Request-ID": ctx.publicTaskId },
  };
}

export function parseTaskResult(ctx, body) {
  body = body || {};
  if (body.status === "pending" || body.status === "queued") return { status: "QUEUED", progress: "10%" };
  if (body.status === "processing" || body.status === "running") return { status: "IN_PROGRESS", progress: "50%" };
  if (body.status === "succeeded") {
    const result = { status: "SUCCESS", progress: "100%", url: (body.content || {}).video_url || "" };
    const facts = extractUsageOnComplete(ctx, result, body);
    if (facts.tokens !== undefined) result.completionTokens = facts.tokens;
    return result;
  }
  if (["failed", "expired", "cancelled"].includes(body.status)) {
    const error = body.error || {};
    return { status: "FAILURE", progress: "100%", reason: [error.code, error.message].filter(Boolean).join(": ") || body.status };
  }
  return { status: "UNKNOWN", reason: "unrecognized status: " + String(body.status || "") };
}

export function extractUsageOnComplete(ctx, result, body) {
  if (!body || body.status !== "succeeded") return {};
  const facts = {};
  const usage = body.usage || {};
  for (const value of [usage.completion_tokens, usage.total_tokens]) {
    if (Number.isInteger(value) && value > 0 && value <= MAX_TOKENS) {
      facts.tokens = value;
      break;
    }
  }
  const resolution = trimmed(body.resolution).toLowerCase();
  if (RESOLUTIONS.includes(resolution)) facts.resolution = resolution;
  // Omit video_input: the host keeps the frozen submission fact.
  return facts;
}

export function listArtifacts(task) {
  if (task.status !== "SUCCESS") return [];
  const data = task.data || {};
  const content = data.content || {};
  const artifacts = [];
  if (trimmed(content.video_url)) {
    const video = { key: "video", type: "video" };
    if (data.output_format === "mp4") video.mimeType = "video/mp4";
    if (data.output_format === "mov") video.mimeType = "video/quicktime";
    artifacts.push(video);
  }
  if (trimmed(content.last_frame_url)) artifacts.push({ key: "last_frame", type: "image" });
  return artifacts;
}

export function buildContentRequest(ctx) {
  const content = (ctx.data || {}).content || {};
  const url = ctx.artifactKey === "video" ? content.video_url : ctx.artifactKey === "last_frame" ? content.last_frame_url : "";
  if (!trimmed(url)) throw new Error("artifact_not_found");
  // Signed URLs expire after 24h; no credentials or permanent-storage promise.
  return { url: url, method: ctx.clientRequest.method, credentialless: true };
}

export const protocols = {
  openai_video: {
    decodeRequest: function (ctx) {
      if (!ctx.body || !["json", "multipart"].includes(ctx.body.kind)) throw new Error("JSON or multipart body required");
      if (ctx.body.kind === "json") return videoIntent(ctx, objectValue(ctx.body.value, "request body"));
      if ((ctx.body.files || []).length) throw new Error("Millu requires media references as URLs or Data URLs inside metadata.content");
      const req = {};
      for (const name of Object.keys(ctx.body.fields || {})) {
        const values = ctx.body.fields[name];
        if (values.length !== 1) throw new Error(name + " must be provided once");
        req[name] = values[0];
      }
      for (const name of ["generate_audio", "watermark", "return_last_frame", "draft", "camera_fixed", "web_search"]) {
        if (req[name] === undefined) continue;
        if (req[name] !== "true" && req[name] !== "false") throw new Error(name + " must be true or false");
        req[name] = req[name] === "true";
      }
      for (const name of ["seed", "priority", "execution_expires_after"]) {
        if (req[name] === undefined) continue;
        if (!/^-?\d+$/.test(req[name]) || !Number.isSafeInteger(Number(req[name]))) throw new Error(name + " must be a safe integer");
        req[name] = Number(req[name]);
      }
      for (const name of ["metadata", "content", "images", "tools"]) {
        if (req[name] === undefined) continue;
        try {
          req[name] = JSON.parse(req[name]);
        } catch (e) {
          throw new Error(name + " must be valid JSON");
        }
      }
      return videoIntent(ctx, req);
    },
    render: function (ctx, task) {
      // Host owns public identity/status; preserve the provider snapshot and usage.
      return native.taskStatus(ctx, task);
    },
  },
};
