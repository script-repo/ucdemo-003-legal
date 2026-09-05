/**
 * Shared Nutanix AI endpoint configuration.
 * Used by all use cases for chat completions and embeddings.
 *
 * Chat completions: POST /chat/completions  (model: llama3-1-8b)
 * Embeddings:       POST /embeddings        (model: llama-3-2-embed)
 */

export const AI_CONFIG = {
  baseUrl: 'https://nai.hpoc.nutanix.com:443/api/v1',
  // Do not hardcode real credentials here — this file is published to a
  // public GitHub repo. Inject via build-time env var or (preferably) route
  // through a server-side proxy that injects the key, as server.py /
  // nginx/default.conf.template do for the live use-case apps.
  apiKey: 'REPLACE_WITH_YOUR_NAI_API_KEY',
  chatModel: 'llama3-1-8b',
  embeddingModel: 'llama-3-2-embed',
  defaults: {
    maxTokens: 1024,
    stream: false,
  },
};

/**
 * Send a chat completion request.
 * @param {Array<{role: string, content: string}>} messages
 * @param {Object} [opts] - Optional overrides (maxTokens, stream, model).
 * @returns {Promise<Object>} - Full API response JSON.
 */
export async function chatCompletion(messages, opts = {}) {
  const body = {
    model: opts.model || AI_CONFIG.chatModel,
    messages,
    max_tokens: opts.maxTokens || AI_CONFIG.defaults.maxTokens,
    stream: opts.stream ?? AI_CONFIG.defaults.stream,
  };

  const res = await fetch(`${AI_CONFIG.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Chat completions failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Generate embeddings for one or more inputs.
 * @param {string|string[]} input - Text or array of texts to embed.
 * @param {Object} [opts] - Optional overrides (model).
 * @returns {Promise<Object>} - Full API response JSON with embedding vectors.
 */
export async function embed(input, opts = {}) {
  const body = {
    model: opts.model || AI_CONFIG.embeddingModel,
    input,
  };

  const res = await fetch(`${AI_CONFIG.baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Embeddings failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
