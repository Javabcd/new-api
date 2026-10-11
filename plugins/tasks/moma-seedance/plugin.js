// Task hooks follow QuantumNous/new-api's Doubao plugin contract.
const MODEL = "doubao-seedance-2-0-260128";
const UPSTREAM_MODEL = "doubao-seedance-2.0";
const MAX_TOKENS = 2147483647;

export const meta = {
  apiVersion: 1,
  key: "moma-seedance",
  name: "China Mobile MoMa Seedance",
  icon: "text:Mo",
  version: "1.0.0",
  author: { name: "QuantumNous" },
  description: { en: "Seedance video generation via China Mobile MoMa", zh: "通过中国移动 MoMa 提供 Seedance 视频生成" },
  baseUrl: "https://zhenze-huhehaote.cmecloud.cn",
  models: [MODEL, UPSTREAM_MODEL],
  fetchMode: "per_task",
  auth: "api_key",
  upstreams: ["vendor", "new_api"],
  usageSchema: {
    tokens: { type: "number", unit: "token", description: { en: "Video generation token unit price", zh: "视频生成 Token 单价" } },
  },
  usageExamples: [{ label: "MoMa · 11s", facts: { tokens: 411300 } }],
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
  return ctx.baseUrl.replace(/\/+$/, "") + (ctx.upstream && ctx.upstream.kind === "new_api" ? "/moma" : "");
}

function authHeader(ctx) {
  const value = trimmed(ctx.authHeader) || trimmed(ctx.apiKey);
  if (!value) throw new Error("API key is required");
  return /^Bearer\s+/i.test(value) ? value : "Bearer " + value;
}

// Only the documented create fields may reach MoMa. Reservation facts are
// computed separately and never copied into this object.
function buildMomaBody(ctx, validateModel) {
  const req = objectValue(ctx.requestBody, "request body");
  const metadata = req.metadata === undefined ? {} : objectValue(req.metadata, "metadata");
  const body = {};
  for (const source of [metadata, req]) {
    for (const key of ["resolution", "size", "frames"]) {
      if (source[key] !== undefined) throw new Error(key + " is not supported by MoMa");
    }
    for (const key of ["content", "ratio", "generate_audio", "watermark"]) {
      if (Object.prototype.hasOwnProperty.call(source, key)) body[key] = source[key];
    }
  }
  if (validateModel) body.model = resolveMomaModel(ctx);
  let duration;
  for (const value of [req.seconds, req.duration, metadata.seconds, metadata.duration]) {
    if (value === undefined) continue;
    if (value === -1 || value === "-1") throw new Error("duration=-1 is not enabled: MoMa smart duration creation is not documented");
    if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !/^\d+$/.test(value)))
      throw new Error("duration must be an integer between 4 and 15");
    const seconds = Number(value);
    // MoMa documents [4, 15], stricter than the host's 3600-second safety cap.
    if (!Number.isInteger(seconds) || seconds < 4 || seconds > 15) throw new Error("duration must be an integer between 4 and 15");
    if (duration !== undefined && duration !== seconds) throw new Error("conflicting duration and seconds values");
    duration = seconds;
  }
  if (duration !== undefined) body.duration = duration;
  if (body.ratio !== undefined && !["16:9", "9:16", "1:1"].includes(body.ratio)) throw new Error("ratio must be 16:9, 9:16 or 1:1");
  for (const key of ["generate_audio", "watermark"]) {
    if (body[key] !== undefined && typeof body[key] !== "boolean") throw new Error(key + " must be a boolean");
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
    if (!trimmed(req.prompt)) throw new Error("prompt must be a non-empty string");
    if (!content.some((item) => item && item.type === "text" && item.text === req.prompt)) content.push({ type: "text", text: req.prompt });
  }
  if (!content.length) throw new Error("content must not be empty");
  body.content = content.map((item) => {
    objectValue(item, "content item");
    if (item.type === "text") {
      if (!trimmed(item.text)) throw new Error("text must be a non-empty string");
      return { type: "text", text: item.text };
    }
    if (!["image_url", "video_url", "audio_url"].includes(item.type)) throw new Error("unsupported content type");
    const role = { image_url: "reference_image", video_url: "reference_video", audio_url: "reference_audio" }[item.type];
    const url = objectValue(item[item.type], item.type).url;
    // Format validation only; the provider retrieves the public URL. Never
    // download input media here or turn an uploaded file into a data URL.
    if (typeof url !== "string" || !/^https?:\/\/[^\s/?#@\\]+(?:[/?#][^\s\\]*)?$/i.test(url))
      throw new Error(item.type + " requires a public HTTP or HTTPS URL");
    if (item.role !== undefined && item.role !== role) throw new Error("invalid " + item.type + " role");
    const entry = { type: item.type };
    entry[item.type] = { url: url };
    if (item.role !== undefined) entry.role = item.role;
    return entry;
  });
  return body;
}

function videoIntent(ctx, requestBody) {
  const model = trimmed(ctx.model || requestBody.model);
  if (!model) throw new Error("model is required");
  // Decoding precedes channel model mapping, so validate the model in drivers.
  const body = buildMomaBody({ requestBody: requestBody }, false);
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
      output.error = { message: task.fail_reason || "task failed" };
      delete output.errorMessage;
    }
    return output;
  },
  error: function (ctx, error) {
    return { error: { code: error.code, message: error.message } };
  },
};

export function buildSubmitRequest(ctx) {
  const body = buildMomaBody(ctx, true);
  return {
    url: apiRoot(ctx) + "/api/v3/contents/generations/tasks",
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: authHeader(ctx) },
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
  const body = buildMomaBody(ctx, true);
  if (ctx.usagePurpose === "billing_ratios") throw new Error("MoMa requires token usage expression pricing");
  // Borrow only Doubao's reservation heuristic: 1080p maximum pixel dimensions,
  // 24 fps and /1024. This is NOT a MoMa billing formula or a resolution default.
  // Missing duration reserves 15s; neither estimate is written into the request.
  // MoMa's measured tokens replace this estimate at completion.
  return { tokens: Math.ceil(((body.duration === undefined ? 15 : body.duration) * 1920 * 1080 * 24) / 1024) };
}

export function buildQueryRequest(ctx) {
  return {
    url: apiRoot(ctx) + "/api/v3/contents/generations/tasks/" + encodeURIComponent(ctx.taskId),
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
  const usage = body.usage || {};
  for (const value of [usage.total_tokens, usage.completion_tokens]) {
    if (Number.isInteger(value) && value > 0 && value <= MAX_TOKENS) return { tokens: value };
  }
  // Missing/invalid measured usage keeps the host's frozen reservation, rather
  // than pretending an estimated quantity was reported by MoMa.
  return {};
}

export function listArtifacts(task) {
  if (task.status !== "SUCCESS" || !trimmed(((task.data || {}).content || {}).video_url)) return [];
  return [{ key: "video", type: "video", mimeType: "video/mp4" }];
}

export function buildContentRequest(ctx) {
  const url = trimmed(((ctx.data || {}).content || {}).video_url);
  if (ctx.artifactKey !== "video" || !url) throw new Error("artifact_not_found");
  // Signed URLs are temporary. Host proxy checks apply; never forward API keys.
  return { url: url, method: ctx.clientRequest.method, credentialless: true };
}

export const protocols = {
  openai_video: {
    decodeRequest: function (ctx) {
      if (!ctx.body || !["json", "multipart"].includes(ctx.body.kind)) throw new Error("JSON or multipart body required");
      if (ctx.body.kind === "json") return videoIntent(ctx, objectValue(ctx.body.value, "request body"));
      if ((ctx.body.files || []).length) throw new Error("MoMa does not support uploaded files; use public URLs in metadata.content");
      const req = {};
      for (const name of Object.keys(ctx.body.fields || {})) {
        const values = ctx.body.fields[name];
        if (values.length !== 1) throw new Error("multipart fields must be provided once");
        req[name] = values[0];
      }
      for (const name of ["generate_audio", "watermark"]) {
        if (req[name] === undefined) continue;
        if (req[name] !== "true" && req[name] !== "false") throw new Error(name + " must be true or false");
        req[name] = req[name] === "true";
      }
      for (const name of ["metadata", "content", "images"]) {
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
