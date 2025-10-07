import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

dotenv.config();

const url = process.env.DATABASE_URL;

export const db = drizzle(url || "", {
  schema,
});
