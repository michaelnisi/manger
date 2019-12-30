'use strict'

module.exports = {
  bracketSpacing: false,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 80,
  overrides: [
    {
      files: '*.json',
      options: {
        parser: 'json',
      },
    },
  ],
}
