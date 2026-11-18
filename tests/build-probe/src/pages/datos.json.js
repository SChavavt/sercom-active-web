// Sonda de compilación: publica los datos públicos como archivo JSON (ver tests/build-output.test.mjs).
import { brands, categories, mode, products } from '../../../../src/lib/site-data.mjs';

export const GET = () => new Response(JSON.stringify({ mode, categories, brands, products }), { headers: { 'Content-Type': 'application/json' } });
