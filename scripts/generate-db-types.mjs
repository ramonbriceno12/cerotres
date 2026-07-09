/**
 * Generates Supabase-compatible TypeScript types from the live PostgREST
 * OpenAPI schema. Uses backend/.env (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 *
 * Usage: node scripts/generate-db-types.mjs
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(root, "backend", ".env") });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env");
  process.exit(1);
}

const response = await fetch(`${supabaseUrl}/rest/v1/`, {
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/openapi+json",
    "User-Agent": "cerotres-types-gen/1.0",
  },
});

if (!response.ok) {
  console.error(`Failed to fetch schema: ${response.status} ${await response.text()}`);
  process.exit(1);
}

const schema = await response.json();
const definitions = schema.definitions ?? {};

const enumNames = new Map();

function collectEnumName(prop) {
  if (!prop?.enum?.length) return null;
  const format = prop.format ?? "";
  const match = format.match(/^public\.(.+)$/);
  if (match) return match[1];
  return null;
}

for (const def of Object.values(definitions)) {
  for (const prop of Object.values(def.properties ?? {})) {
    const enumName = collectEnumName(prop);
    if (enumName && prop.enum) {
      enumNames.set(enumName, prop.enum);
    }
  }
}

function openapiTypeToTs(prop) {
  const enumName = collectEnumName(prop);
  if (enumName) return `Database["public"]["Enums"]["${enumName}"]`;

  const format = prop.format ?? "";
  const type = prop.type;

  if (type === "string") {
    if (format === "uuid" || format === "text" || format.includes("timestamp") || format === "date") {
      return "string";
    }
    return "string";
  }
  if (type === "integer" || type === "number") return "number";
  if (type === "boolean") return "boolean";
  if (type === "array") return `${openapiTypeToTs(prop.items)}[]`;
  if (type === "object") return "Json";
  return "unknown";
}

function parseForeignKeys(description = "") {
  const relationships = [];
  const regex = /<fk table='([^']+)' column='([^']+)'\/>/g;
  let match;
  while ((match = regex.exec(description)) !== null) {
    relationships.push({
      foreignTableName: match[1],
      foreignColumns: [match[2]],
    });
  }
  return relationships;
}

function buildFieldLines(properties, required = [], { optional = false } = {}) {
  const lines = [];
  for (const [name, prop] of Object.entries(properties ?? {})) {
    const isRequired = required.includes(name);
    const nullable = prop.type === "string" && prop.format !== "uuid" && !prop.enum && !isRequired;
    const tsType = openapiTypeToTs(prop);
    const finalType = nullable && !prop.enum ? `${tsType} | null` : tsType;
    const marker = optional || !isRequired ? "?" : "";
    lines.push(`          ${name}${marker}: ${finalType}`);
  }
  return lines;
}

function buildRelationships(properties) {
  const relationships = [];
  for (const [column, prop] of Object.entries(properties ?? {})) {
    const fks = parseForeignKeys(prop.description);
    for (const fk of fks) {
      relationships.push({
        foreignKeyName: `${column}_fkey`,
        columns: [column],
        isOneToOne: false,
        referencedRelation: fk.foreignTableName,
        referencedColumns: fk.foreignColumns,
      });
    }
  }
  return relationships;
}

const tableNames = Object.keys(definitions).sort();
const tablesBlock = [];
const enumBlock = [...enumNames.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, values]) => `      ${name}: ${values.map((v) => `"${v}"`).join(" | ")}`)
  .join("\n");

for (const tableName of tableNames) {
  const def = definitions[tableName];
  const required = def.required ?? [];
  const properties = def.properties ?? {};
  const rowLines = buildFieldLines(properties, required);
  const insertLines = buildFieldLines(properties, required, { optional: true });
  const updateLines = buildFieldLines(properties, [], { optional: true });
  const relationships = buildRelationships(properties);

  const relationshipLines = relationships.map(
    (rel) =>
      `          {\n` +
      `            foreignKeyName: "${rel.foreignKeyName}"\n` +
      `            columns: [${rel.columns.map((c) => `"${c}"`).join(", ")}]\n` +
      `            isOneToOne: ${rel.isOneToOne}\n` +
      `            referencedRelation: "${rel.referencedRelation}"\n` +
      `            referencedColumns: [${rel.referencedColumns.map((c) => `"${c}"`).join(", ")}]\n` +
      `          }`,
  );

  tablesBlock.push(
    `      ${tableName}: {\n` +
      `        Row: {\n${rowLines.join("\n")}\n        }\n` +
      `        Insert: {\n${insertLines.join("\n")}\n        }\n` +
      `        Update: {\n${updateLines.join("\n")}\n        }\n` +
      `        Relationships: [\n${relationshipLines.join(",\n")}\n        ]\n` +
      `      }`,
  );
}

const generatedAt = new Date().toISOString();
const output = `// Generated by scripts/generate-db-types.mjs — do not edit by hand.
// Regenerate: npm run gen:types
// Source: live Supabase PostgREST schema (${generatedAt})

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
${tablesBlock.join("\n")}
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
${enumBlock}
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    ? (PublicSchema["Tables"] & PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never
`;

const outPath = path.join(root, "types", "database.types.ts");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, output);

console.log(`Wrote ${outPath} (${tableNames.length} tables, ${enumNames.size} enums)`);
