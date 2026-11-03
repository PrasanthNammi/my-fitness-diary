// Shapes consumed at the auth boundary; authorization still validates claims at runtime.
export type AuthUser = {id?: string; email?: string};
export type AuthClaims = {sub?: string; iss?: string; aud?: string; client_id?: string; role?: string; session_id?: string; exp?: number};
export type AuthResponse = AuthUser & {access_token?: string; refresh_token?: string; user?: AuthUser; msg?: string; message?: string; error_description?: string};
