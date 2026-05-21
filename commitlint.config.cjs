'use strict';

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['engine', 'shared', 'ci', 'docker', 'deps', 'config', 'docs', 'release'],
    ],
    'scope-empty': [1, 'never'],
  },
};
