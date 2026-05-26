"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiClient = void 0;
const types_1 = require("../types");
const http_1 = require("../utils/http");
const parsers_1 = require("../utils/parsers");
const validation_1 = require("../utils/validation");
class ApiClient {
    config;
    baseUrl;
    auth;
    fetchImpl;
    constructor(config, baseUrl, auth, fetchImpl) {
        this.config = config;
        this.baseUrl = baseUrl;
        this.auth = auth;
        this.fetchImpl = fetchImpl;
    }
    /** Create an MPP mandate/pre-authorization and normalize the service response. */
    async createMandate(options) {
        (0, validation_1.validateCreateMandateOptions)(options);
        const customerReference = options.customerReference ?? options.customerId ?? (0, validation_1.normalizeMobileNumber)(options.mobileNumber);
        const body = {
            type: options.paymentType ?? "SBMD",
            customer_reference: customerReference,
            amount: { value: String(options.amount.value), currency: options.amount.currency },
            validity_in_days: options.validityInDays ?? 7,
        };
        if (options.description) {
            body.description = options.description;
        }
        const data = await this.request("POST", "/mpp/v1/pre-authorize", body, {
            "Idempotency-Key": options.idempotencyKey ?? randomId(),
        });
        return (0, parsers_1.parseMandate)(data);
    }
    /** Fetch a mandate/pre-authorization by authorization id. */
    async getMandate(mandateId) {
        if (!mandateId) {
            throw new Error("mandateId is required");
        }
        const data = await this.request("GET", `/mpp/v1/authorization/${encodeURIComponent(mandateId)}`);
        return (0, parsers_1.parseMandate)(data);
    }
    /** Create a one-time payment token for an active authorization. */
    async createToken(options) {
        if (!options.customerReference && !options.customerId) {
            throw new Error("CreateTokenOptions: customerReference or customerId is required");
        }
        const data = await this.request("POST", "/mpp/v1/token", {
            type: options.paymentType ?? "SBMD",
            customer_reference: options.customerReference ?? options.customerId ?? "",
        });
        return (0, parsers_1.parseToken)(data);
    }
    /** Authenticated MPP request wrapper that unwraps `{ data: ... }` envelopes. */
    async request(method, path, body, extraHeaders = {}) {
        const token = await this.auth.getAccessToken();
        const response = await (0, http_1.requestWithRetry)(this.fetchImpl, `${stripSlash(this.baseUrl)}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
                ...(body !== undefined && method !== "GET" ? { "Content-Type": "application/json" } : {}),
                ...extraHeaders,
            },
            body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined,
        }, this.config);
        if (!response.ok) {
            throw types_1.MppError.fromResponse(response.status, await (0, http_1.safeJson)(response));
        }
        const payload = await response.json();
        const record = (0, parsers_1.asRecord)(payload);
        return record && "data" in record ? record.data : payload;
    }
}
exports.ApiClient = ApiClient;
function randomId() {
    if (typeof globalThis.crypto?.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function stripSlash(value) {
    return value.replace(/\/$/, "");
}
