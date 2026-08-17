import type { ZodType } from 'zod';
import { runtimeConfig } from '../config/runtimeConfig';

interface ApiErrorBody {
  error?: { code?: string; message?: string; requestId?: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends RequestInit { timeoutMs?: number }

export async function apiRequest<T>(path: string, schema: ZodType<T>, options: RequestOptions = {}) {
  const { timeoutMs = 10_000, signal: externalSignal, ...requestInit } = options;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort('timeout'), timeoutMs);
  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetch(`${runtimeConfig.apiBaseUrl}${path}`, {
      ...requestInit,
      credentials: 'include',
      headers: { accept: 'application/json', ...requestInit.headers },
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') ?? '';
    const body: unknown = contentType.includes('application/json') ? await response.json() : null;

    if (!response.ok) {
      const apiBody = body as ApiErrorBody | null;
      throw new ApiError(
        apiBody?.error?.message ?? 'Le service est momentanément indisponible.',
        response.status,
        apiBody?.error?.code ?? 'unexpected_api_error',
        apiBody?.error?.requestId,
        apiBody?.error?.details,
      );
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError('Le serveur a renvoyé une réponse invalide.', 502, 'invalid_api_response');
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError('La requête a été interrompue.', 0, 'request_aborted');
    throw new ApiError('Impossible de joindre Maw3id. Vérifiez votre connexion.', 0, 'network_error');
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}
