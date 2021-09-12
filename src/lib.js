const util = require("util");
const debug = require("debug")("hardhat:test-solidity");
const prepare = require('./prepare');
const generate = require('./generate')

// Run solidity tests for contracts in opts.argTestContractNames.
// If opts.showTestEvents is true, all events from the testing contract logged during test run will be shown.
// If opts.showEvents is true, all events NOT from the testing contract logged during test run will be shown.
// Note that hardhat's console runs parallel to events and will be shown regardless
// (and the console messages are not reverted like regular logs).
module.exports = (opts, hre) => {
  const ethers = hre.ethers; // Local ethers.js shortcut

  /** Testing schema, must be kept in sync with test.sol */
  const schema = {
    preContract: "_Pre", // naming convention for pre*-testing contracts
    testContract: "_Test", // naming convention for testing contracts
    toFunctionRootName: (fnName) => {
      return fnName.slice(0, -7);
    },
    toBeforeFunction: (fnRootName) => {
      return `${fnRootName}_before`;
    },
    isTestContract(name) {
      return name.endsWith("_Test");
    },
    toTest(contractName) {
      return `${contractName}_Test`;
    },
    toPre(contractName) {
      return `${contractName}_Pre`;
    },
    // Functions of testing contracts that follow these conventions will
    // be run by the testing routine below.
    isTestFunction(fn) {
      return fn.endsWith("_test()");
    },
    isTestFailFunction(fn) {
      return fn.endsWith("_testFail()");
    },
    isBeforeAllFunction(fn) {
      return fn.endsWith("_beforeAll()");
    }
  };

  // Iterate through contracts that need testing. For each:
  // - Fund the test contract with 1000 ethers
  // - Run any functions that end with _beforeAll
  // - Run each test function

  return new Promise(async (resolve, reject) => {

    try {

      debug("Contracts given: %o", opts.argTestContractNames);

      // Make sure contracts are freshly compiled before running tests
      if (!opts.noCompile) {
        await hre.run("compile");
      }

      if (opts.showTx) {
        console.log(
          "! No reverts because --show-tx is true. txhash would not be usable if test suite reverted after running."
        );
      }

      const {artifacts, testContracts} = await prepare(hre, schema, opts);
      debug( "Will run tests of: %o", testContracts.map((c) => c.contractName));

      // create mocha tests
      const mocha = await generate(hre, schema, artifacts,testContracts, opts)
      // await createTests(artifacts, testContracts);

      // run them
      mocha.run((failures) => {
        if (failures) {
          reject("At least one test failed.");
        } else {
          resolve("All tests passed.");
        }
      });
    } catch (e) {
      reject(e);
    }
  });
};
