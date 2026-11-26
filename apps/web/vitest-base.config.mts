// Vitest options for `ng test` (runnerConfig in angular.json). The Home and ledger-field specs step a model for
// hundreds of frames and query a large DOM by role, which takes seconds under a parallel run.
export default {
  test: {
    testTimeout: 30_000,
  },
};
