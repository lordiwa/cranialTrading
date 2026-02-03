import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import pluginSecurity from 'eslint-plugin-security'
import globals from 'globals'

/**
 * ESLint Configuration for Cranial Trading
 *
 * Production-ready, strict configuration focused on:
 * - Security vulnerabilities detection
 * - TypeScript strict type checking
 * - Vue 3 best practices
 * - Code quality and maintainability
 * - Extensibility patterns
 *
 * @see https://eslint.org/docs/latest/use/configure/configuration-files
 * @see https://typescript-eslint.io/getting-started/typed-linting
 * @see https://eslint.vuejs.org/user-guide/
 */
export default tseslint.config(
  // ============================================================
  // IGNORE PATTERNS
  // ============================================================
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'functions/**',
      '.firebase/**',
      'coverage/**',
      '*.config.js',
      '*.config.ts',
      'public/**',
      '**/*.d.ts',
    ]
  },

  // ============================================================
  // BASE CONFIGURATIONS
  // ============================================================

  // JavaScript recommended rules
  js.configs.recommended,

  // TypeScript strict type-checked rules (production-grade)
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Vue recommended rules
  ...pluginVue.configs['flat/recommended'],

  // Security plugin
  pluginSecurity.configs.recommended,

  // ============================================================
  // LANGUAGE OPTIONS - VUE FILES
  // ============================================================
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
      globals: {
        ...globals.browser,
      },
    },
  },

  // ============================================================
  // LANGUAGE OPTIONS - TYPESCRIPT FILES
  // ============================================================
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },

  // ============================================================
  // PROJECT-SPECIFIC RULES
  // ============================================================
  {
    files: ['**/*.{ts,tsx,vue}'],
    rules: {
      // ----------------------------------------------------------
      // TYPESCRIPT RULES - Strict but practical
      // ----------------------------------------------------------

      // Allow explicit any in specific cases (warn instead of error)
      '@typescript-eslint/no-explicit-any': 'warn',

      // Unused variables (allow underscore prefix for intentionally unused)
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // Allow non-null assertions in Vue (needed for refs)
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // Require explicit return types on public API
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // Floating promises - warn only (Vue lifecycle hooks often don't await)
      '@typescript-eslint/no-floating-promises': 'warn',

      // Require await in async functions
      '@typescript-eslint/require-await': 'warn',

      // Prevent misused promises
      '@typescript-eslint/no-misused-promises': ['error', {
        checksVoidReturn: {
          attributes: false, // Allow async event handlers in Vue
        },
      }],

      // Allow empty functions (common in Vue lifecycle)
      '@typescript-eslint/no-empty-function': 'off',

      // Consistent type imports
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'inline-type-imports',
      }],

      // Prefer nullish coalescing
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',

      // Prefer optional chain
      '@typescript-eslint/prefer-optional-chain': 'error',

      // No unnecessary type assertions
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',

      // Allow defensive optional chaining
      '@typescript-eslint/no-unnecessary-condition': 'off',

      // Restrict template expressions (security)
      '@typescript-eslint/restrict-template-expressions': ['error', {
        allowNumber: true,
        allowBoolean: true,
        allowNullish: true,
      }],

      // Allow dynamic delete (common with object manipulation)
      '@typescript-eslint/no-dynamic-delete': 'off',

      // Allow plus operands with any (external API data)
      '@typescript-eslint/restrict-plus-operands': 'warn',

      // Allow unsafe member access for Firebase and external APIs
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',

      // ----------------------------------------------------------
      // VUE RULES - Best practices for Vue 3
      // ----------------------------------------------------------

      // Component naming (allow single-word for pages)
      'vue/multi-word-component-names': 'off',

      // Require props defaults (extensibility)
      'vue/require-default-prop': 'warn',

      // No v-html (XSS prevention) - warn for legitimate use cases
      'vue/no-v-html': 'warn',

      // Require explicit emits (Vue 3 best practice)
      'vue/require-explicit-emits': 'error',

      // Component API style (Composition API preferred)
      'vue/component-api-style': ['error', ['script-setup', 'composition']],

      // Define macros order
      'vue/define-macros-order': ['error', {
        order: ['defineProps', 'defineEmits', 'defineSlots'],
      }],

      // Block order in SFC
      'vue/block-order': ['error', {
        order: ['script', 'template', 'style'],
      }],

      // No unused refs
      'vue/no-unused-refs': 'error',

      // No unused components
      'vue/no-unused-components': 'error',

      // Require v-bind shorthand
      'vue/v-bind-style': ['error', 'shorthand'],

      // Require v-on shorthand
      'vue/v-on-style': ['error', 'shorthand'],

      // Require v-slot shorthand
      'vue/v-slot-style': ['error', 'shorthand'],

      // Prefer template over render function
      'vue/prefer-template': 'error',

      // No duplicate attributes
      'vue/no-duplicate-attributes': 'error',

      // Require key with v-for
      'vue/require-v-for-key': 'error',

      // No use v-if with v-for
      'vue/no-use-v-if-with-v-for': 'error',

      // No side effects in computed
      'vue/no-side-effects-in-computed-properties': 'error',

      // Formatting rules (off - let Prettier handle)
      'vue/html-self-closing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/html-indent': 'off',
      'vue/attributes-order': 'off',
      'vue/html-closing-bracket-spacing': 'off',

      // ----------------------------------------------------------
      // SECURITY RULES (eslint-plugin-security)
      // ----------------------------------------------------------

      // Detect potential command injection
      'security/detect-child-process': 'error',

      // Detect eval usage (code injection risk)
      'security/detect-eval-with-expression': 'error',

      // Detect non-literal fs filename (path traversal risk)
      'security/detect-non-literal-fs-filename': 'warn',

      // Detect non-literal require (dynamic import risk)
      'security/detect-non-literal-require': 'warn',

      // Detect non-literal regexp (ReDoS risk)
      'security/detect-non-literal-regexp': 'warn',

      // Detect object injection (prototype pollution risk)
      'security/detect-object-injection': 'warn',

      // Detect possible timing attacks
      'security/detect-possible-timing-attacks': 'warn',

      // Detect unsafe regex (ReDoS risk) - warn for review
      'security/detect-unsafe-regex': 'warn',

      // Buffer no assert
      'security/detect-buffer-noassert': 'error',

      // Disable mustache escape (XSS in templates)
      'security/detect-disable-mustache-escape': 'error',

      // No csrf before method override
      'security/detect-no-csrf-before-method-override': 'error',

      // Pseudorandom bytes (weak crypto)
      'security/detect-pseudoRandomBytes': 'error',

      // Bidi characters (trojan source)
      'security/detect-bidi-characters': 'error',

      // ----------------------------------------------------------
      // GENERAL JAVASCRIPT RULES
      // ----------------------------------------------------------

      // No console in production (warn to allow debugging during dev)
      'no-console': ['warn', {
        allow: ['warn', 'error', 'info'],
      }],

      // No debugger statements
      'no-debugger': 'error',

      // Prefer const over let
      'prefer-const': 'error',

      // No var
      'no-var': 'error',

      // Require strict equality
      'eqeqeq': ['error', 'always', { null: 'ignore' }],

      // No eval (security)
      'no-eval': 'error',

      // No implied eval (security)
      'no-implied-eval': 'error',

      // No new Function (security)
      'no-new-func': 'error',

      // No script URLs (XSS prevention)
      'no-script-url': 'error',

      // No with statement
      'no-with': 'error',

      // No alert/confirm/prompt
      'no-alert': 'warn',

      // Require radix parameter (warn - often obvious from context)
      'radix': 'warn',

      // No useless catch
      'no-useless-catch': 'error',

      // No useless return
      'no-useless-return': 'error',

      // Prefer promise reject errors
      'prefer-promise-reject-errors': 'error',

      // Require await in async
      'require-await': 'off', // Using TypeScript version

      // No unused vars (using TypeScript version)
      'no-unused-vars': 'off',

      // No return await (performance)
      'no-return-await': 'off', // Using @typescript-eslint/return-await
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],

      // Object shorthand
      'object-shorthand': ['error', 'always'],

      // Prefer arrow callback
      'prefer-arrow-callback': 'error',

      // Prefer spread
      'prefer-spread': 'error',

      // Prefer rest params
      'prefer-rest-params': 'error',

      // No duplicate imports
      'no-duplicate-imports': 'error',

      // Sort imports (basic, for more control use eslint-plugin-import)
      'sort-imports': ['error', {
        ignoreCase: true,
        ignoreDeclarationSort: true,
        ignoreMemberSort: false,
        memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
      }],
    },
  },

  // ============================================================
  // RELAXED RULES FOR TEST FILES
  // ============================================================
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      'security/detect-object-injection': 'off',
    },
  },

  // ============================================================
  // RELAXED RULES FOR CONFIG FILES
  // ============================================================
  {
    files: ['*.config.ts', '*.config.js', 'vite.config.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
)
