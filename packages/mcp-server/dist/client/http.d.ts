export declare class GeminiHttpClient {
    private baseUrl;
    private apiKey;
    private apiSecret;
    constructor();
    publicGet<T>(endpoint: string, params?: Record<string, string>): Promise<T>;
    authenticatedPost<T>(endpoint: string, body?: Record<string, unknown>): Promise<T>;
}
