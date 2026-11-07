# BLAKE2b Spam Scanner

Web simple que escanea bloques de la cadena BLAKE2b (vía mempool.guide) buscando posible spam / BPUB.

## Funcionalidades actuales
- Lista últimos bloques
- Escanea un rango de alturas
- Heurística básica (muchos inputs/outputs, tamaño grande)
- Enlaces a bitfiles y al explorer
- Imágenes borrosas por defecto (NSFW)

## Desarrollo local
```bash
npm install
npm run dev
```

## Despliegue en Vercel
1. Sube este código a un repositorio de GitHub
2. Importa el repo en Vercel
3. O usa `vercel` CLI si lo tienes configurado

## Notas
- La detección es heurística, no perfecta.
- No indexa imágenes reales todavía (solo placeholder blur).
- Para NSFW real haría falta un modelo (nsfwjs u similar) en el cliente o backend.
