import 'dotenv/config';
import * as joi from 'joi';

interface EnvVars {
  PORT: number;
  DB_PASSWORD: string;
  DB_NAME: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_USERNAME: string;
  HOST_API: string;
  JWT_SECRET: string;
  HOST_ORIGIN: string;
  EMAIL_HOST: string;
  EMAIL_PORT: number;
  EMAIL_SECURE: boolean;
  EMAIL_USER: string;
  EMAIL_PASS: string;
  GOOGLE_CLIENT_ID: string;
  JWT_REFRESH_SECRET: string;

  // Frontend URLs
  FRONTEND_VENDOR_URL_DEV: string;
  FRONTEND_VENDOR_URL_PROD: string;
  FRONTEND_ADMIN_URL_DEV: string;
  FRONTEND_ADMIN_URL_PROD: string;
  FRONTEND_CUSTOMER_URL_DEV: string;
  FRONTEND_CUSTOMER_URL_PROD: string;
}

const envsSchema = joi
  .object({
    PORT: joi.number().required(),
    DB_PASSWORD: joi.string().required(),
    DB_NAME: joi.string().required(),
    DB_HOST: joi.string().required(),
    DB_PORT: joi.number().required(),
    DB_USERNAME: joi.string().required(),
    HOST_API: joi.string().required(),
    JWT_SECRET: joi.string().required(),
    HOST_ORIGIN: joi.string().required(),
    EMAIL_HOST: joi.string().required(),
    EMAIL_PORT: joi.number().required(),
    EMAIL_SECURE: joi.boolean().required(),
    EMAIL_USER: joi.string().required(),
    EMAIL_PASS: joi.string().required(),
    GOOGLE_CLIENT_ID: joi.string().required(),
    JWT_REFRESH_SECRET: joi.string().required(),

    // Frontend URLs
    FRONTEND_VENDOR_URL_DEV: joi.string().required(),
    FRONTEND_VENDOR_URL_PROD: joi.string().required(),
    FRONTEND_ADMIN_URL_DEV: joi.string().required(),
    FRONTEND_ADMIN_URL_PROD: joi.string().required(),
    FRONTEND_CUSTOMER_URL_DEV: joi.string().required(),
    FRONTEND_CUSTOMER_URL_PROD: joi.string().required(),
  })
  .unknown(true);

const { error, value } = envsSchema.validate({
  ...process.env,
}) as { error?: { message: string }; value: EnvVars };

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const envVars = value;

export const envs = {
  port: envVars.PORT,
  dbPassword: envVars.DB_PASSWORD,
  dbName: envVars.DB_NAME,
  dbHost: envVars.DB_HOST,
  dbPort: envVars.DB_PORT,
  dbUsername: envVars.DB_USERNAME,
  hostApi: envVars.HOST_API,
  jwtSecret: envVars.JWT_SECRET,
  hostOrigin: envVars.HOST_ORIGIN,
  emailHost: envVars.EMAIL_HOST,
  emailPort: envVars.EMAIL_PORT,
  emailSecure: envVars.EMAIL_SECURE,
  emailUser: envVars.EMAIL_USER,
  emailPass: envVars.EMAIL_PASS,
  googleClientId: envVars.GOOGLE_CLIENT_ID,
  jwtRefreshSecret: envVars.JWT_REFRESH_SECRET,

  // Frontend URLs
  frontendVendorUrlDev: envVars.FRONTEND_VENDOR_URL_DEV,
  frontendVendorUrlProd: envVars.FRONTEND_VENDOR_URL_PROD,
  frontendAdminUrlDev: envVars.FRONTEND_ADMIN_URL_DEV,
  frontendAdminUrlProd: envVars.FRONTEND_ADMIN_URL_PROD,
  frontendCustomerUrlDev: envVars.FRONTEND_CUSTOMER_URL_DEV,
  frontendCustomerUrlProd: envVars.FRONTEND_CUSTOMER_URL_PROD,
};
