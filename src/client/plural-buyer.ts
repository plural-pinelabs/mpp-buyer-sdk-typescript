import { resolveP3PBaseUrl } from "../config";
import {
  Challenge,
  Credential,
  BuyerRuntimeContext,
  CreateTokenOptions,
  FetchLike,
  PluralBuyerConfig,
  Token,
} from "../types";
import { validateConfig } from "../utils/validation";
import { ApiClient } from "./api-client";
import { FetchInterceptor } from "./fetch-interceptor";

export class BuyerMethods {
  constructor(private api: ApiClient) {}

  /** Create a one-time payment token through `POST /api/v1/customer/mpp/token`. */
  createToken(options: CreateTokenOptions): Promise<Token> {
    return this.api.createToken(options);
  }
}

export class PluralBuyerInstance {
  constructor(
    private interceptor: FetchInterceptor,
    private httpFetch: FetchLike,
    public methods: BuyerMethods,
  ) {}

  /** Send an HTTP request and automatically handle P3P 402 challenges. */
  request(method: string, url: string, init: RequestInit = {}, context?: BuyerRuntimeContext): Promise<Response> {
    return this.interceptor.request(method, url, init, context);
  }

  get(url: string, init: RequestInit = {}, context?: BuyerRuntimeContext): Promise<Response> {
    return this.request("GET", url, init, context);
  }

  post(url: string, init: RequestInit = {}, context?: BuyerRuntimeContext): Promise<Response> {
    return this.request("POST", url, init, context);
  }

  put(url: string, init: RequestInit = {}, context?: BuyerRuntimeContext): Promise<Response> {
    return this.request("PUT", url, init, context);
  }

  delete(url: string, init: RequestInit = {}, context?: BuyerRuntimeContext): Promise<Response> {
    return this.request("DELETE", url, init, context);
  }

  patch(url: string, init: RequestInit = {}, context?: BuyerRuntimeContext): Promise<Response> {
    return this.request("PATCH", url, init, context);
  }

  /** Fetch-style alias for `request`, matching browser naming. */
  fetch(url: string, method = "GET", init: RequestInit = {}, context?: BuyerRuntimeContext): Promise<Response> {
    return this.request(method, url, init, context);
  }

  /** Send an HTTP request without automatic 402 payment handling. */
  rawRequest(method: string, url: string, init: RequestInit = {}): Promise<Response> {
    return this.httpFetch(url, { ...init, method });
  }

  /** Manually create a Payment credential for a decoded seller challenge. */
  createCredential(challenge: Challenge, context?: BuyerRuntimeContext): Promise<Credential> {
    return this.interceptor.createCredentialForChallenge(challenge, context);
  }

  close(): void {
    // fetch-backed implementation has no persistent client to close.
  }
}

export class PluralBuyer {
  /** Create a buyer SDK instance from `PluralBuyerConfig`. */
  static create(config: PluralBuyerConfig): PluralBuyerInstance {
    validateConfig(config);
    const fetchImpl = config.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImpl) {
      throw new Error("A fetch implementation is required.");
    }

    const envBaseUrl = resolveP3PBaseUrl(config.env);
    const api = new ApiClient(config, envBaseUrl, fetchImpl);
    const interceptor = new FetchInterceptor(config, api, fetchImpl);
    return new PluralBuyerInstance(interceptor, fetchImpl, new BuyerMethods(api));
  }
}
