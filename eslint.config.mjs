import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        chrome: 'readonly',
        AbortController: 'readonly',
        DOMParser: 'readonly',
        fetch: 'readonly',
        navigator: 'readonly',
        document: 'readonly',
        window: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLAnchorElement: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        require: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-empty': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-unreachable': 'error',
      'no-unsafe-negation': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-var': 'warn',
      'prefer-const': 'warn',
      'eqeqeq': ['warn', 'smart'],
      'no-multi-spaces': 'warn',
      'no-trailing-spaces': 'warn',
      'semi': ['warn', 'always'],
      // background.js 用双引号；options 页面沿用单引号，按文件分别约束（见下方 override）
      'quotes': ['warn', 'double', { avoidEscape: true }]
    }
  },
  {
    // options 页脚本沿用单引号风格（含单引号的字符串仍允许双引号避免转义）
    files: ['options/**/*.js'],
    rules: {
      'quotes': ['warn', 'single', { avoidEscape: true }]
    }
  },
  {
    ignores: ['node_modules/', '*.min.js']
  }
];