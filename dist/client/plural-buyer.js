"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluralBuyer = exports.PluralBuyerInstance = exports.BuyerMethods = void 0;
const config_1 = require("../config");
const validation_1 = require("../utils/validation");
const api_client_1 = require("./api-client");
const auth_manager_1 = require("./auth-manager");
const fetch_interceptor_1 = require("./fetch-interceptor");
class BuyerMethods {
    api;
    constructor(api) {
        this.api = api;
    }
    /** Create a mandate/pre-authorization through `POST /mpp/v1/pre-authorize`. */
    createMandate(options) {
        return this.api.createMandate(options);
    }
    /** Fetch mandate/pre-authorization status through `GET /mpp/v1/authorization/{id}`. */
    getMandate(mandateId) {
        return this.api.getMandate(mandateId);
    }
    /** Create a one-time payment token through `POST /mpp/v1/token`. */
    createToken(options) {
        return this.api.createToken(options);
    }
}
exports.BuyerMethods = BuyerMethods;
class PluralBuyerInstance {
    interceptor;
    httpFetch;
    methods;
    grantClaims;
    constructor(interceptor, httpFetch, methods) {
        this.interceptor = interceptor;
        this.httpFetch = httpFetch;
        this.methods = methods;
    }
    /** Send an HTTP request and automatically handle MPP 402 challenges. */
    request(method, url, init = {}) {
        return this.interceptor.request(method, url, init);
    }
    get(url, init = {}) {
        return this.request("GET", url, init);
    }
    post(url, init = {}) {
        return this.request("POST", url, init);
    }
    put(url, init = {}) {
        return this.request("PUT", url, init);
    }
    delete(url, init = {}) {
        return this.request("DELETE", url, init);
    }
    patch(url, init = {}) {
        return this.request("PATCH", url, init);
    }
    /** Fetch-style alias for `request`, matching browser naming. */
    fetch(url, method = "GET", init = {}) {
        return this.request(method, url, init);
    }
    /** Send an HTTP request without automatic 402 payment handling. */
    rawRequest(method, url, init = {}) {
        return this.httpFetch(url, { ...init, method });
    }
    /** Manually create a Payment credential for a decoded seller challenge. */
    createCredential(challenge) {
        return this.interceptor.createCredentialForChallenge(challenge);
    }
    /** Verify the configured Grantex grant token and cache its claims. */
    async verifyGrant() {
        const claims = await this.interceptor.verifyGrant();
        this.grantClaims = claims;
        return claims;
    }
    close() {
        // fetch-backed implementation has no persistent client to close.
    }
}
exports.PluralBuyerInstance = PluralBuyerInstance;
class PluralBuyer {
    /** Create a buyer SDK instance from `PluralBuyerConfig`. */
    static create(config) {
        (0, validation_1.validateConfig)(config);
        const fetchImpl = config.fetch ?? globalThis.fetch?.bind(globalThis);
        if (!fetchImpl) {
            throw new Error("A fetch implementation is required.");
        }
        const authBaseUrl = config.authBaseUrl ?? config.baseUrl ?? config_1.DEFAULT_BASE_URL;
        const mppBaseUrl = config.mppBaseUrl ?? config.baseUrl ?? config_1.DEFAULT_BASE_URL;
        const auth = new auth_manager_1.AuthManager(config, authBaseUrl, fetchImpl);
        const api = new api_client_1.ApiClient(config, mppBaseUrl, auth, fetchImpl);
        const interceptor = new fetch_interceptor_1.FetchInterceptor(config, api, fetchImpl);
        return new PluralBuyerInstance(interceptor, fetchImpl, new BuyerMethods(api));
    }
    /** Create a buyer SDK instance and immediately verify its Grantex grant token. */
    static async createVerified(config) {
        const instance = PluralBuyer.create(config);
        if (config.grantex) {
            await instance.verifyGrant();
        }
        return instance;
    }
}
exports.PluralBuyer = PluralBuyer;
