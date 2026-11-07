/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'jsdom',
  preset: 'ts-jest',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        module: 'commonjs',
        target: 'ES2020',
        lib: ['ES2020', 'DOM'],
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        moduleResolution: 'node',
        skipLibCheck: true,
        resolveJsonModule: true,
        isolatedModules: true,
      },
      diagnostics: {
        ignorePatterns: ['src/services/api.ts', 'src/core/security/*.ts', 'src/views/sync/*.tsx', 'src/components/copilot/*.tsx', 'src/components/layout/AppShell.tsx', 'src/components/layout/AppSidebar.tsx'],
      },
    }],
  },
  testMatch: ['**/src/tests/**/*.test.tsx', '**/src/tests/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
