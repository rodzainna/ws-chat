import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.md",
      "server/src/generated/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "server/prisma.config.ts",
            "server/vitest.config.ts",
            "server/vitest.integration.config.ts",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["client/**/*.tsx", "client/**/*.ts"],
    extends: [reactHooks.configs.flat["recommended-latest"]],
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ["client/src/components/ui/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  eslintConfigPrettier,
);
