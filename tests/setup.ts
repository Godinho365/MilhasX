import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// NODE_ENV é definido como "test" pelo vitest
