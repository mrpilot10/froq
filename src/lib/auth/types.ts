export type AuthMode = "login" | "signup";

export type AuthStep = "phone" | "otp" | "loading";

export interface AuthUser {
  name: string;
  phone: string;
  email?: string;
}
