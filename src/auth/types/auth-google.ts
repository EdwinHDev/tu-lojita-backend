export interface GooglePayload {
  iss: string;
  azp: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: boolean;
  nbf: number;
  exp: number;
  iat: number;
  given_name: string;
  family_name: string;
  picture: string;
  locale: string;
}