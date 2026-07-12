// Uso: node scripts/subir-assets-menu.mjs
// Lee SUPABASE_SERVICE_ROLE_KEY y NEXT_PUBLIC_SUPABASE_URL de .env.local.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const slugAId = {
  "super-criollita": "00000000-0000-4000-8000-000000000301",
  "criollita-con-res": "00000000-0000-4000-8000-000000000302",
  "criollita-con-pollo": "00000000-0000-4000-8000-000000000303",
  "criollita-de-huevos-pericos": "00000000-0000-4000-8000-000000000304",
  "criollita-con-queso": "00000000-0000-4000-8000-000000000305",
  "chorizo-santarrosano": "00000000-0000-4000-8000-000000000306",
  "jugo-de-fresa-en-leche": "00000000-0000-4000-8000-000000000307",
  "jugo-de-mora-en-leche": "00000000-0000-4000-8000-000000000308",
  "jugo-de-mango-en-leche": "00000000-0000-4000-8000-000000000309",
  "jugo-de-guanabana-en-leche": "00000000-0000-4000-8000-000000000310",
  "gaseosa": "00000000-0000-4000-8000-000000000311",
  "jugo-hit": "00000000-0000-4000-8000-000000000312",
  "cafe": "00000000-0000-4000-8000-000000000313",
  "cafe-en-leche": "00000000-0000-4000-8000-000000000314",
};

for (const archivo of readdirSync("supabase/assets/menu")) {
  const slug = path.basename(archivo, ".svg");
  const id = slugAId[slug];
  if (!id) throw new Error(`SVG sin producto: ${archivo}`);
  const ruta = `productos/${id}.svg`;
  const { error } = await supabase.storage
    .from("menu")
    .upload(ruta, readFileSync(`supabase/assets/menu/${archivo}`), {
      contentType: "image/svg+xml",
      upsert: true,
    });
  if (error) throw new Error(`${archivo}: ${error.message}`);
  const url = supabase.storage.from("menu").getPublicUrl(ruta).data.publicUrl;
  const { error: e2 } = await supabase.from("productos").update({ imagen_url: url }).eq("id", id);
  if (e2) throw new Error(`imagen_url ${slug}: ${e2.message}`);
  console.log(`OK ${slug}`);
}
console.log("Listo: 14 imágenes subidas y enlazadas.");
