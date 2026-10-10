import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages publica o app em /cronograma-criare/.
// Se o nome do repositório mudar, atualize base abaixo.
export default defineConfig({
  plugins: [react()],
  base: "/cronograma-criare/"
});
