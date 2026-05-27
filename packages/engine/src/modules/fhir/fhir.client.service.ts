import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  FhirBundle,
  FhirCapabilityStatement,
  FhirResource,
} from './interfaces/fhir-resource.interface';
import type { FhirSearchParams } from './interfaces/fhir-search-params.interface';

@Injectable()
export class FhirClientService {
  private readonly logger = new Logger(FhirClientService.name);
  private readonly client: AxiosInstance;
  readonly fhirServerUrl: string;
  private readonly healthCheckTimeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.fhirServerUrl = this.config.get<string>('FHIR_SERVER_URL', 'http://localhost:8080/fhir');
    const requestTimeoutMs = this.config.get<number>('FHIR_REQUEST_TIMEOUT_MS', 30_000);
    this.healthCheckTimeoutMs = this.config.get<number>('FHIR_HEALTH_CHECK_TIMEOUT_MS', 3_000);

    this.client = axios.create({
      baseURL: this.fhirServerUrl,
      timeout: requestTimeoutMs,
      headers: { Accept: 'application/fhir+json', 'Content-Type': 'application/fhir+json' },
    });
  }

  async getCapabilityStatement(): Promise<FhirCapabilityStatement> {
    return this.request<FhirCapabilityStatement>('/metadata', {
      timeout: this.healthCheckTimeoutMs,
    });
  }

  async getResourceCount(resourceType: string): Promise<number> {
    const bundle = await this.request<FhirBundle>(`/${resourceType}`, {
      params: { _summary: 'count' },
    });
    return bundle.total ?? 0;
  }

  async searchResources<T extends FhirResource>(
    resourceType: string,
    params: FhirSearchParams,
  ): Promise<FhirBundle<T>> {
    return this.request<FhirBundle<T>>(`/${resourceType}`, { params });
  }

  async getResource<T extends FhirResource>(resourceType: string, id: string): Promise<T> {
    return this.request<T>(`/${resourceType}/${id}`);
  }

  async fetchPageByUrl<T extends FhirResource>(absoluteUrl: string): Promise<FhirBundle<T>> {
    this.logger.log(`[page] ${absoluteUrl}`);
    const res = await this.client.get<FhirBundle<T>>(absoluteUrl, { baseURL: '' });
    return res.data;
  }

  private async request<T>(
    path: string,
    options: { params?: Record<string, string>; timeout?: number } = {},
  ): Promise<T> {
    const url = `${this.fhirServerUrl}${path}`;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`${path}${options.params ? ' ' + JSON.stringify(options.params) : ''}`);
        const res = await this.client.get<T>(path, {
          params: options.params,
          timeout: options.timeout,
        });
        return res.data;
      } catch (err) {
        const axiosErr = err as AxiosError;
        const status = axiosErr.response?.status ?? 0;

        if (status >= 400 && status < 500) {
          this.logger.warn(`FHIR 4xx ${status.toString()} on ${url}`);
          throw err;
        }

        if (attempt < maxRetries) {
          const waitMs = attempt === 0 ? 500 : 2_000;
          this.logger.warn(
            `FHIR request failed (${status.toString() || 'network'}), retry ${(attempt + 1).toString()} in ${(waitMs / 1000).toString()}s`,
          );
          await new Promise((r) => setTimeout(r, waitMs));
        } else {
          this.logger.error(
            `FHIR request failed after ${(maxRetries + 1).toString()} attempts: ${url}`,
          );
          throw err;
        }
      }
    }

    throw new Error(`Unreachable: request to ${url} failed`);
  }
}
