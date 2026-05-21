import { DEFAULT_BASE_URL } from "../config";
import {
  Challenge,
  Credential,
  CreateMandateOptions,
  CreateTokenOptions,
  FetchLike,
  GrantTokenClaims,
  Mandate,
  PluralBuyerConfig,
  Token,
} from "../types";
import { validateConfig } from "../utils/validation";
import { ApiClient } from "./api-client";
import { AuthManager } from "./auth-manager";
import { FetchInterceptor } from "./fetch-interceptor";

export class BuyerMethods {
  constructor(private api: ApiClient) {}

  /** Create a mandate/pre-authorization through `POST /mpp/v1/pre-authorize`. */
  createMandate(options: CreateMandateOptions): Promise<Mandate> {
    return this.api.createMandate(options);
  }

  /** Fetch mandate/pre-authorization status through `GET /mpp/v1/authorization/{id}`. */
  getMandate(mandateId: string): Promise<Mandate> {
    return this.api.getMandate(mandateId);
  }

  /** Create a one-time payment token through `POST /mpp/v1/token`. */
  createToken(options: CreateTokenOptions): Promise<Token> {
    return this.api.createToken(options);
  }
}

export class PluralBuyerInstance {
  public grantClaims?: GrantTokenClaims;

  constructor(
    private interceptor: FetchInterceptor,
    private httpFetch: FetchLike,
    public methods: BuyerMethods,
  ) {}

  /** Send an HTTP request and automatically handle MPP 402 challenges. */
  request(method: string, url: string, init: RequestInit = {}): Promise<Response> {
    return this.interceptor.request(method, url, init);
  }

  get(url: string, init: RequestInit = {}): Promise<Response> {
    return this.request("GET", url, init);
  }

  post(url: string, init: RequestInit = {}): Promise<Response> {
    return this.request("POST", url, init);
  }

  put(url: string, init: RequestInit = {}): Promise<Response> {
    return this.request("PUT", url, init);
  }

  delete(url: string, init: RequestInit = {}): Promise<Response> {
    return this.request("DELETE", url, init);
  }

  patch(url: string, init: RequestInit = {}): Promise<Response> {
    return this.request("PATCH", url, init);
  }

  /** Fetch-style alias for `request`, matching browser naming. */
  fetch(url: string, method = "GET", init: RequestInit = {}): Promise<Response> {
    return this.request(method, url, init);
  }

  /** Send an HTTP request without automatic 402 payment handling. */
  rawRequest(method: string, url: string, init: RequestInit = {}): Promise<Response> {
    return this.httpFetch(url, { ...init, method });
  }

  /** Manually create a Payment credential for a decoded seller challenge. */
  createCredential(challenge: Challenge): Promise<Credential> {
    return this.interceptor.createCredentialForChallenge(challenge);
  }

  /** Verify the configured Grantex grant token and cache its claims. */
  async verifyGrant(): Promise<GrantTokenClaims | undefined> {
    const claims = await this.interceptor.verifyGrant();
    this.grantClaims = claims;
    return claims;
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

    const authBaseUrl = config.authBaseUrl ?? config.baseUrl ?? DEFAULT_BASE_URL;
    const mppBaseUrl = config.mppBaseUrl ?? config.baseUrl ?? DEFAULT_BASE_URL;
    const auth = new AuthManager(config, authBaseUrl, fetchImpl);
    const api = new ApiClient(config, mppBaseUrl, auth, fetchImpl);
    const interceptor = new FetchInterceptor(config, api, fetchImpl);
    return new PluralBuyerInstance(interceptor, fetchImpl, new BuyerMethods(api));
  }

  /** Create a buyer SDK instance and immediately verify its Grantex grant token. */
  static async createVerified(config: PluralBuyerConfig): Promise<PluralBuyerInstance> {
    const instance = PluralBuyer.create(config);
    if (config.grantex) {
      await instance.verifyGrant();
    }
    return instance;
  }
}
