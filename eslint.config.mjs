import next from 'eslint-config-next';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...next,
  {
    rules: {
      // Prettier will handle formatting
    },
  },
];


