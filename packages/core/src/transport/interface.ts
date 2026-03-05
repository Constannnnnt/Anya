import type { AgentMessage } from '../types';

export interface ModelTransportRequest {
  systemPrompt: string;
  messages: AgentMessage[];
  newUserMessage: string;
}

export interface ModelTransportResponse {
  content: string;
  raw?: unknown;
}

/**
 * Adapter boundary for model providers (Gemini/OpenAI/local/etc).
 * Keeps core orchestration provider-agnostic.
 */
export interface ModelTransport {
  complete(request: ModelTransportRequest): Promise<ModelTransportResponse>;
}
