// Video protocol presentation adapted from QuantumNous/new-api's Doubao 1.1.0.
// Capabilities are from the CTYun edge AI gateway integration guide, not prices.
const VIDEO_MODELS = {
  "cdance2.0-0807": ["480p", "720p", "1080p", "4k"],
  "cdance2.0-fast-0807": ["480p", "720p"],
  "cdance2.0-mini-0807": ["480p", "720p"],
  "cdance2.5-0807": ["480p", "720p", "1080p"],
  "cdance2.0-0813": ["480p", "720p", "1080p"],
};
const RESOLUTIONS = ["480p", "720p", "1080p", "4k"];
// Mirrors relay/common.MaxTaskDurationSeconds; API v1 exposes no JS constant.
const MAX_DURATION_SECONDS = 3600;
const MAX_TOKENS = 2147483647;

export const meta = {
  apiVersion: 1,
  key: "ctyun-cdance",
  name: "CTYun Cdance",
  icon: "text:CT",
  version: "1.0.0",
  author: { name: "QuantumNous" },
  description: {
    en: "CTYun edge AI gateway Cdance / Seedance video generation",
    zh: "天翼云边缘 AI 网关 Cdance / Seedance 视频生成",
  },
  baseUrl: "https://ai.ctaigw.cn/v1",
  models: Object.keys(VIDEO_MODELS),
  fetchMode: "per_task",
  usageSchema: {
    tokens: { type: "number", unit: "token", description: { en: "Video generation unit price", zh: "视频生成单价" } },
    resolution: { enum: RESOLUTIONS, description: { en: "Output video resolution", zh: "输出视频分辨率" } },
  },
  usageExamples: [{ label: "720p · 11s", facts: { tokens: 238500, resolution: "720p" } }],
  routes: [
    { method: "POST", path: "/ctyun/v1/contents/generations/tasks", type: "submit", decode: "createTask", render: "taskCreated" },
    { method: "GET", path: "/ctyun/v1/contents/generations/tasks/:task_id", type: "query", render: "taskStatus" },
  ],
  protocols: [{ name: "openai_responses", supports: ["stream", "sync", "background"] }, "openai_video"],
};

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function objectValue(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(name + " must be an object");
  return value;
}

function normalizeResolution(value) {
  const raw = trimmed(value).toLowerCase();
  if (RESOLUTIONS.includes(raw)) return raw;
  // OpenAI Video size uses WxH. Keep the Doubao tier conversion, but reject
  // malformed sizes instead of silently selecting an arbitrary default.
  const match = /^(\d+)\s*[x*]\s*(\d+)$/.exec(raw);
  if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) throw new Error("resolution must be 480p, 720p, 1080p or 4k");
  const edge = Math.max(Number(match[1]), Number(match[2]));
  if (!Number.isFinite(edge) || edge > 3840) throw new Error("size exceeds the supported video resolution");
  if (edge >= 3840) return "4k";
  if (edge >= 1920) return "1080p";
  if (edge >= 1280) return "720p";
  return "480p";
}

// All entry surfaces share the same final body and reservation validation.
// Decoders run before model mapping; only the driver validates model capability.
function videoRequest(ctx, validateModel) {
  const req = objectValue(ctx.requestBody, "request body");
  const metadata = req.metadata === undefined ? {} : objectValue(req.metadata, "metadata");
  const body = Object.assign({}, metadata);
  // Common Video parameters may also be supplied at the protocol top level.
  // Metadata remains open-ended for future vendor extensions.
  for (const key of ["generate_audio", "ratio", "watermark", "return_last_frame", "seed", "service_tier", "draft"]) {
    if (Object.prototype.hasOwnProperty.call(req, key)) body[key] = req[key];
  }
  let duration;
  for (const value of [req.seconds, req.duration, metadata.seconds, metadata.duration]) {
    if (value === undefined) continue;
    if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !/^\d+$/.test(value.trim())))
      throw new Error("duration must be an integer between 1 and " + MAX_DURATION_SECONDS);
    const seconds = Number(value);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_DURATION_SECONDS)
      throw new Error("duration must be an integer between 1 and " + MAX_DURATION_SECONDS);
    if (duration !== undefined && duration !== seconds) throw new Error("conflicting duration and seconds values");
    duration = seconds;
  }
  if (duration === undefined) throw new Error("duration or seconds is required");
  let resolution;
  for (const value of [req.resolution, req.size, metadata.resolution]) {
    if (value === undefined) continue;
    const normalized = normalizeResolution(value);
    if (resolution !== undefined && resolution !== normalized) throw new Error("conflicting resolution and size values");
    resolution = normalized;
  }
  if (resolution === undefined) throw new Error("resolution or size is required");
  body.model = ctx.upstreamModel || req.model;
  if (validateModel) {
    if (!Object.prototype.hasOwnProperty.call(VIDEO_MODELS, body.model)) throw new Error("unsupported CTYun model: " + String(body.model));
    if (!VIDEO_MODELS[body.model].includes(resolution)) throw new Error("resolution " + resolution + " is not supported by " + body.model);
  }
  body.duration = duration;
  body.resolution = resolution;
  delete body.seconds;
  if (body.content !== undefined && !Array.isArray(body.content)) throw new Error("content must be an array");
  // Copy the array before appending: hooks can receive host-backed JSON values.
  const content = Array.isArray(body.content) ? Array.from(body.content) : [];
  if (req.images !== undefined && !Array.isArray(req.images)) throw new Error("images must be an array");
  const images = Array.from(req.images || []);
  for (const value of [req.image, req.input_reference]) {
    if (value !== undefined && value !== "" && !images.includes(value)) images.push(value);
  }
  for (const url of images) {
    if (!trimmed(url)) throw new Error("image references must be non-empty URLs");
    content.push({ type: "image_url", image_url: { url: url }, role: "reference_image" });
  }
  if (req.prompt !== undefined && typeof req.prompt !== "string") throw new Error("prompt must be a string");
  if (trimmed(req.prompt)) content.push({ type: "text", text: req.prompt });
  if (!content.length) throw new Error("prompt or content is required");
  body.content = content;
  return body;
}

function videoIntent(ctx, requestBody) {
  const model = trimmed(ctx.model || requestBody.model);
  if (!model) throw new Error("model is required");
  requestBody = Object.assign({}, requestBody, { model: model });
  const body = videoRequest({ requestBody: requestBody }, false);
  const hasReference = body.content.some((item) => item && item.type !== "text");
  return { kind: "submit", model: model, action: hasReference ? "image_to_video" : "text_to_video", requestBody: requestBody };
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
    // The host may fail a task after repeated unknown states or a timeout.
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
  return {
    url: ctx.baseUrl.replace(/\/+$/, "") + "/contents/generations/tasks",
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + ctx.apiKey },
    body: body,
    action: body.content.some((item) => item && item.type !== "text") ? "image_to_video" : "text_to_video",
    rewriteModel: body.model,
  };
}

export function parseSubmitResponse(ctx, resp) {
  if (!resp.body || !trimmed(resp.body.id)) throw new Error("upstream task id is empty");
  return { taskId: resp.body.id, taskData: resp.body };
}

export function extractUsage(ctx) {
  const body = videoRequest(ctx, true);
  if (ctx.usagePurpose === "billing_ratios") return null;
  const dimensions = { "480p": [854, 480], "720p": [1280, 720], "1080p": [1920, 1080], "4k": [3840, 2160] }[body.resolution];
  // CTYun final billing uses upstream usage tokens;
  // this value is reservation estimation only (Doubao's 24 fps formula).
  const tokens = (body.duration * dimensions[0] * dimensions[1] * 24) / 1024;
  return { tokens: tokens, resolution: body.resolution };
}

export function buildQueryRequest(ctx) {
  return {
    url: ctx.baseUrl.replace(/\/+$/, "") + "/contents/generations/tasks/" + encodeURIComponent(ctx.taskId),
    method: "GET",
    headers: { Accept: "application/json", Authorization: "Bearer " + ctx.apiKey },
  };
}

export function parseTaskResult(ctx, body) {
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
  // Do not coerce null, booleans or strings to a measured zero. A real zero
  // overrides the reservation; missing/invalid facts keep the host snapshot.
  for (const value of [usage.completion_tokens, usage.total_tokens]) {
    if (Number.isInteger(value) && value >= 0 && value <= MAX_TOKENS) {
      facts.tokens = value;
      break;
    }
  }
  for (const value of [body.resolution, (body.content || {}).resolution]) {
    const resolution = trimmed(value).toLowerCase();
    if (RESOLUTIONS.includes(resolution)) {
      facts.resolution = resolution;
      break;
    }
  }
  return facts;
}

export function listArtifacts(task) {
  if (task.status !== "SUCCESS") return [];
  const content = (task.data || {}).content || {};
  const artifacts = [];
  if (trimmed(content.video_url)) artifacts.push({ key: "video", type: "video" });
  if (trimmed(content.last_frame_url)) artifacts.push({ key: "last_frame", type: "image" });
  return artifacts;
}

export function buildContentRequest(ctx) {
  const content = (ctx.data || {}).content || {};
  const url = ctx.artifactKey === "video" ? content.video_url : ctx.artifactKey === "last_frame" ? content.last_frame_url : "";
  if (!trimmed(url)) throw new Error("artifact_not_found");
  return { url: url, method: ctx.clientRequest.method, credentialless: true };
}

function responsesInput(req) {
  const texts = [],
    images = [];
  const input = req.input;
  if (typeof input === "string") texts.push(input);
  else if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "string") {
        texts.push(item);
        continue;
      }
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const content = item.content === undefined ? [item] : Array.isArray(item.content) ? item.content : [item.content];
      for (const part of content) {
        if (typeof part === "string") {
          texts.push(part);
          continue;
        }
        if (!part || typeof part !== "object" || Array.isArray(part)) continue;
        if (["input_text", "text"].includes(part.type) && typeof part.text === "string") texts.push(part.text);
        if (["input_image", "image_url"].includes(part.type)) {
          let image = part.image_url;
          if (image && typeof image === "object") image = image.url;
          if (trimmed(image)) images.push(trimmed(image));
        }
      }
    }
  }
  return {
    prompt: texts
      .filter(function (text) {
        return trimmed(text);
      })
      .join("\n"),
    images: images,
  };
}

function responsesVideoText(ctx) {
  const artifact = ctx && ctx.artifacts && ctx.artifacts.video;
  const url = trimmed(artifact && artifact.url);
  if (!url) throw new Error("video artifact is unavailable");
  const escaped = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return '<video controls src="' + escaped + '"></video>';
}

export const protocols = {
  openai_responses: {
    decodeRequest: function (ctx) {
      if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required");
      const req = objectValue(ctx.body.value, "request body");
      if (req.input !== undefined && typeof req.input !== "string" && !Array.isArray(req.input)) throw new Error("input must be a string or array");
      if (req.images !== undefined && !Array.isArray(req.images)) throw new Error("images must be an array");
      const input = responsesInput(req);
      const requestBody = Object.assign({}, req, { images: (req.images || []).concat(input.images) });
      if (input.prompt) requestBody.prompt = input.prompt;
      return videoIntent(ctx, requestBody);
    },
    renderEvents: function (ctx, task, previousState) {
      const status = String(task.status || "UNKNOWN").toUpperCase();
      const value = Number(String(task.progress || "").replace("%", ""));
      const progress = Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
      const state = { status: status, progress: progress };
      if (status === "SUCCESS") {
        const text = responsesVideoText(ctx);
        const events = previousState && previousState.status === status ? [] : [{ type: "output", data: text }];
        return { events: events, state: state, done: true };
      }
      if (status === "FAILURE")
        return { events: [{ type: "error", code: "task_failed", message: task.fail_reason || "task failed" }], state: state, done: true };
      if (previousState && previousState.status === status && previousState.progress === progress) return { events: [], state: state, done: false };
      const event = { type: "progress", message: status.toLowerCase() };
      if (progress !== null) event.progress = progress;
      return { events: [event], state: state, done: false };
    },
    renderFinal: function (ctx, _task) {
      return {
        output: [
          {
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: responsesVideoText(ctx), annotations: [], logprobs: [] }],
          },
        ],
        metadata: { vendor: "ctyun-cdance" },
      };
    },
  },
};

protocols.openai_video = {
  decodeRequest: function (ctx) {
    if (!ctx.body || !["json", "multipart"].includes(ctx.body.kind)) throw new Error("JSON or multipart body required");
    if (ctx.body.kind === "json") return videoIntent(ctx, objectValue(ctx.body.value, "request body"));
    if ((ctx.body.files || []).length) throw new Error("CTYun requires references as URLs inside metadata.content");
    const req = {};
    for (const name of Object.keys(ctx.body.fields || {})) {
      const values = ctx.body.fields[name];
      if (values.length !== 1) throw new Error(name + " must be provided once");
      req[name] = values[0];
    }
    for (const name of ["generate_audio", "watermark", "return_last_frame", "draft"]) {
      if (req[name] === undefined) continue;
      if (req[name] !== "true" && req[name] !== "false") throw new Error(name + " must be true or false");
      req[name] = req[name] === "true";
    }
    if (req.seed !== undefined) {
      if (!/^-?\d+$/.test(req.seed) || !Number.isSafeInteger(Number(req.seed))) throw new Error("seed must be a safe integer");
      req.seed = Number(req.seed);
    }
    if (req.metadata !== undefined) {
      try {
        req.metadata = JSON.parse(req.metadata);
      } catch (e) {
        throw new Error("metadata must be a JSON object string", { cause: e });
      }
      objectValue(req.metadata, "metadata");
    }
    return videoIntent(ctx, req);
  },
  render: function (ctx, task) {
    // The host overlays public id, client model, status and timestamps while
    // preserving vendor content, usage and extension fields.
    return native.taskStatus(ctx, task);
  },
};
