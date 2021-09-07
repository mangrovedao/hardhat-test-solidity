import { extendConfig, extendEnvironment, task, types as argumentTypes } from "hardhat/config";
import { lazyObject } from "hardhat/plugins";
import { HardhatConfig, HardhatUserConfig } from "hardhat/types";
import path from "path";
import testSolidity from "./lib.js";

export const TASK_TEST_SOLIDITY = "test-solidity";

// This import is needed to let the TypeScript compiler know that it should include your type
// extensions in your npm package's types file.
import "./type-extensions";

// Special task for running Solidity tests
// TODO add as test subtask
// TODO rename showTx to noRevert
task(TASK_TEST_SOLIDITY,
  "Run tests of Solidity contracts with suffix"
)
  .addOptionalVariadicPositionalParam(
    "contracts",
    "Which contracts to test (default:all)"
  )
  .addOptionalParam(
    "prefix",
    "Match test function names for prefix. Javascript regex. Remember to escape backslash and surround with single quotes if necessary.",
    ".*",
    argumentTypes.string
  )
  .addFlag("noCompile", "Don't compile before running this task")
  .addFlag("showEvents", "Show all non-test events during tests")
  .addFlag("showTestEvents", "Show all test events during tests")
  .addFlag("showTx", "Show all transaction hashes (disables revert between tests)")
  .addFlag("showGas", "Show gas used for each test")
  .addFlag("details", "Log events interpreted by the logFormatters hardhat.config parameter for additional details on the tests")
  .setAction(async (params, hre) => {
    await testSolidity(
      {
        noCompile: params.noCompile,
        argTestContractNames: params.contracts || [],
        details: params.details,
        showGas: params.showGas,
        showTx: params.showTx,
        showEvents: params.showEvents,
        showTestEvents: params.showTestEvents,
        prefix: params.prefix,
      },
      hre
    );
  });