'use strict';

const OFF = 0;

module.exports = {
  extends: 'fbjs-opensource',
  rules: {
    'max-len': OFF,
    'react/prop-types': OFF,
    'no-console': ['warn', {allow: ['assert']}],
  },
  settings: {
    react: {
      version: 'none',
    },
  },
  ignorePatterns: ['node_modules'],
};
