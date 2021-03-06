module.exports = (hre,formatArg,assert) => {
  /** Fail if event signals test failure. */
  const genericFail = ({ success, actual, expected, message }) => {
    if (!success) {
      assert.fail(
        `${message}\nActual:   ${formatArg(actual)}\nExpected: ${formatArg(
          expected
        )}`
      );
    }
  };
  return {
    TestEqAddress: { trigger: genericFail },
    TestEqString: { trigger: genericFail },
    TestEqUint: { trigger: genericFail },
    TestEqBytes: { trigger: genericFail },
    TestEqBytes32: { trigger: genericFail },
    TestEqBool: { trigger: genericFail },
    TestLess: {
      trigger: ({ success, message, actual, expected }) => {
        if (!success) {
          assert.fail(`${actual} should be < ${expected} (${message})`);
        }
      }
    },
    TestLessEq: {
      trigger: ({ success, message, actual, expected }) => {
        if (!success) {
          assert.fail(`${actual} should be <= ${expected} (${message})`);
        }
      }
    },
    TestMore: {
      trigger: ({ success, message, actual, expected }) => {
        if (!success) {
          assert.fail(`${actual} should be > ${expected} (${message})`);
        }
      }
    },
    TestMoreEq: {
      trigger: ({ success, message, actual, expected }) => {
        if (!success) {
          assert.fail(`${actual} should be >= ${expected} (${message})`);
        }
      }
    },
    TestTrue: {
      trigger: ({ message, success }) => {
        if (!success) { assert.fail(message); }
      }
    },
  };
};
