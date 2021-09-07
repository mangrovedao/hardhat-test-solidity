const debug = require("debug")("hardhat:test-solidity:generate");
const Mocha = require("mocha"); // Testing library
const assert = require("chai").assert; // Assertion library
const defaultLogFormatters = require('./logFormatters');
const defaultTesters = require('./testers');

module.exports = async (hre, schema, artifacts, testContracts, opts) => {

  const mocha = new Mocha(hre.mocha); // Instantiate to generate tests
  const ethers = hre.ethers; // Local ethers.js shortcut

  /** 
   * Format arguments for readability
   * In particular, the following heuristic is used for numbers:
   * - show the raw number below 1 billion
   * - show in units of 1 billion (that is, 1 gwei) if below 10^6 gwei
   * - otherwise, show in units of 10^18 (that is, 1 ether)
   */
  const formatArg = (arg, type /*optional*/) => {
    if (Array.isArray(arg)) {
      // types of the form 'type[]'
      const newtype = 
        (typeof type === "string" && type.endsWith('[]'))
        ?  type.slice(0, -2) 
        : undefined;
      return arg.map((a) => formatArg(a, newtype)).join(',');
    }

    if (type && type === "address") {
      arg = ethers.utils.getAddress(arg);
    } else if (type && type.startsWith("uint")) {
      arg = ethers.BigNumber.from(arg);
    }

    if (ethers.BigNumber.isBigNumber(arg)) {
      if (arg.lt(ethers.utils.parseUnits("1", "gwei"))) {
        return arg.toString();
      } else if (arg.lt(ethers.utils.parseUnits("1000000", "gwei"))) {
        return `${ethers.utils.formatUnits(arg, "gwei")} gigaunits`;
      } else {
        return `${ethers.utils.formatUnits(arg, "ether")} exaunits`;
      }
    } else if (ethers.utils.isAddress(arg)) {
      return getRegister(arg) || arg;
    } else if (typeof arg === "undefined") {
      return "<undefined>";
    } else {
      return arg.toString();
    }
  };

  /** Events can register names for addresses */
  const registers = {};
  const normalizeReg = (addr) => `${addr}`.toLowerCase();
  const getRegister = (addr) => {
    const name = registers[normalizeReg(addr)];
    debug(`resolved ${addr} to ${name}`);
    return name;
  };
  const setRegister = (addr, name) => (registers[normalizeReg(addr)] = name);

  const configLogFormatters = hre.config.testSolidity?.logFormatters || (() => { return {};});

  const logFormatters = {
    ...(defaultLogFormatters(hre, formatArg)),
    ...(configLogFormatters(hre,formatArg))
  };
  /** From a parsed log, return a mapping with reformatted arguments.
   *  uses the log's event fragment to format according to the field type.
   *  output format: {name: {value,type},...}
   */
  const normalizeLogArgs = (log) => {
    let norm = {};
    log.eventFragment.inputs.forEach((input, i) => {
      // anonymous log inputs have an index, we turn that into a name
      // there is a collision risk!
      const name = input.name || i.toString();
      norm[name] = {
        type: input.type,
        value: formatArg(log.args[name], input.type),
      };
    });
    return norm;
  };

  /** Turn parsed log into pretty-printing string */
  const logToString = (log, rawLog, testContractName) => {
    let address = getRegister(rawLog.address) || rawLog.address;
    if (!log) {
      return `Could not parse the following raw log issued during ${testContractName} (adress: ${address}):\n` + util.inspect(rawLog);
    } else {
      const normalizedArray = Object.entries(normalizeLogArgs(log));
      let padLength = Math.max(
        ...normalizedArray.map(([name]) => `${name}`.length)
      );

      return (
        `Event ${log.signature}\n` +
        ` issued during ${testContractName} (address ${address})\n` +
        normalizedArray
          .map(
            ([name, { value, type }]) =>
              `  ${name.padEnd(padLength, " ")}: ${value} (${type})`
          )
          .join("\n") +
        "\n"
      );
    }
  };


  /** Iterate through known contracts and try to parse the raw log given */
  const tryParseLog = (rawLog) => {
    let log;
    let originator;
    for (const artifact of artifacts) {
      const iface = new ethers.utils.Interface(artifact.abi);
      try {
        log = iface.parseLog(rawLog);
        originator = artifact;
        break;
      } catch (e) {
        continue;
      }
    }
    return { log, originator };
  };

  const configTesters = hre.config.testSolidity?.testers || (() => { return {}; });

  const testers = {
    ...(defaultTesters(hre,formatArg,assert)),
    ...(configTesters(hre,formatArg,assert))
  }

  const processLogs = (receipt, testContract, testContractObj) => {
    let expectedAddress = null;
    let unknownEvents = [];
    for (const rawLog of receipt.logs) {
      //console.dir(expectations,{depth:null});
      const { log, originator } = tryParseLog(rawLog);
      const fromTest = rawLog.address === testContract.address;

      /* Display raw log if option requires it */
      if ((fromTest && opts.showTestEvents) || (!fromTest && opts.showEvents)) {
        console.log(logToString(log, rawLog, testContractObj.contractName));
      }

      // do we recognise the event
      if (log && testers[log.name]) {
        testers[log.name].trigger(log.args);
      } else if (fromTest && log && log.name === "ExpectFrom") {
        expectedAddress = log.args.from;
      } else if (fromTest && log && log.name === "Register") {
        setRegister(log.args.addr, log.args.name);
      } else if (fromTest && expectedAddress) {
        // Maybe we're emitting something to be expected
        const match = (_rawLog, rawExpect) => {
          return (
            _rawLog.address === expectedAddress &&
            _rawLog.topics.every((t, i) => rawExpect.topics[i] === t) &&
            _rawLog.data === rawExpect.data
          );
        };
        /* We received news that we're expecting an event but there are no
           unknown events in the queue. */
        while (true) {
          if (unknownEvents.length === 0) {
            console.log(
              "Missing at least one expected events, use --show-events and --show-test-events to see all events received."
            );
            console.log("Missed event:");
            const parsedAddress = getRegister(expectedAddress) || expectedAddress;
            console.log(`Expected from ${parsedAddress}:`);

            const logAsString = logToString(log, rawLog, testContractObj.contractName);
            console.log(logAsString);

            assert.fail(
              `Missed expected event from ${parsedAddress}:\n` + logAsString
            );
            break;
          } else if (match(unknownEvents.shift(), rawLog)) {
            break;
          }
        }
      } else {
        unknownEvents.push(rawLog);
      }

      if (log && logFormatters[log.name] && opts.details) {
        logFormatters[log.name](log, rawLog, originator);
      }
    }
  };


  // Recursively deploy libraries associated to a contract, with caching.
  const deployedLibraries = {};
  const deploy = async (contractName) => {
    const deployFrom = await (await ethers.getSigners())[0].getAddress();
    const artifact = await hre.artifacts.readArtifact(contractName);
    let returnLibraries = {};
    for (const file in artifact.linkReferences) {
      for (const libName in artifact.linkReferences[file]) {
        if (!deployedLibraries[libName]) {
          const deployOpts = { from: deployFrom, libraries: await deploy(libName) };
          debug("deploying lib %s %o", libName, deployOpts);
          const lib = await hre.deployments.deploy(libName, deployOpts);
          deployedLibraries[libName] = lib;
        }
        returnLibraries[libName] = deployedLibraries[libName].address;
      }
    }
    return returnLibraries;
  };

  // Recursive function looks through known contracts and deploys
  // as much as necessary. For instance, if given "C_Test",
  // and "C_Test_Pre" and "C_Test_Pre_Pre" exist, will deploy:
  // - C_Test_Pre_Pre (at some address <a1>)
  // - C_Test_Pre with constructor argument <a1> (at some address <a2>)
  // - C_Test with constructor argument <a2>
  const deployWithPres = async (currentName) => {
    const nextName = schema.toPre(currentName);
    let args = [];
    if (artifacts.some((c) => c.contractName === nextName)) {
      const next = await deployWithPres(nextName);
      args = [next.address];
    }
    const libraries = await deploy(currentName);
    const accounts = await ethers.getSigners();
    const deployFrom = await accounts[0].getAddress();
    const opts = { from: deployFrom, args, libraries };
    debug("deployWithPres ends recursion with %s %o", currentName, opts);
    const deployed = await hre.deployments.deploy(currentName, opts);
    const contract = new ethers.Contract(
      deployed.address,
      deployed.abi,
      accounts[0]
    );
    return contract;
  };

  for (const testContractObj of testContracts) {

    // deploy test contracts and dependencies
    const testContract = await deployWithPres(
      testContractObj.contractName
    );
    debug(`testContractObj name: ${testContractObj.contractName}`);

    // configure new mocha test suite
    const suite = new Mocha.Suite(testContractObj.contractName, {});
    suite.file = testContractObj.sourceName;
    mocha.suite.addSuite(suite);
    suite.timeout(hre.config.testSolidity?.timeout || 300000/* ms */);

    // state revert snapshot number
    let suiteSnapnum;

    // Save snapshots before test suite and send ETH to test contract
    suite.beforeAll(
      `Before testing, snapshot & fund ${testContractObj.contractName}`,
      async function () {
        // Rember before state
        if (!opts.showTx) {
          suiteSnapnum = await hre.network.provider.request({
            method: "evm_snapshot",
          });
        }
        // Fund test contract
        const accounts = await ethers.getSigners();
        await accounts[0].sendTransaction({
          to: testContract.address,
          value: ethers.utils.parseUnits("1000", "ether"),
        });
      }
    );

    // Sort functions alphabetically
    const sortedFunctions = Object.entries(
      testContract.interface.functions
    ).sort(([fnA], [fnB]) => fnA.localeCompare(fnB, "en", {}));

    // Run _beforeAll solidity functions before suite
    for (const [fnName, fnFragment] of sortedFunctions) {
      if (
        schema.isBeforeAllFunction(fnName) &&
        fnFragment.inputs.length === 0
      ) {
        suite.beforeAll(
          `${testContractObj.contractName}.${fnName}`,
          async () => {
            debug("Running beforeAll named %s", fnName);
            let receipt = await (await testContract[fnName]()).wait();
            processLogs(receipt, testContract, testContractObj);
          }
        );
      }
    }

    // Setup evm revert after each function call
    // test snapshot number
    let testSnapnum;
    if (!opts.showTx) {
      suite.afterEach("EVM revert", async () => {
        await hre.network.provider.request({
          method: "evm_revert",
          params: [testSnapnum],
        });
      });
    }

    // After a suite, revert unless asked to show txid
    if (!opts.showTx) {
      suite.afterAll(`After testing, revert to former state`, async () => {
        await hre.network.provider.request({
          method: "evm_revert",
          params: [suiteSnapnum],
        });
      });
    }


    // Add each _test function as a mocha test
    const regexp = new RegExp(`^${opts.prefix}.*`);
    for (const [fnName, fnFragment] of sortedFunctions) {
      debug("Creating test for %s", fnName);
      if (schema.isTestFailFunction(fnName)) {
        // TODO or remove testFail
      } else if (schema.isTestFunction(fnName)) {
        if (!regexp.test(fnName)) {
          continue;
        }
        const fnRootName = schema.toFunctionRootName(fnName);
        const beforeName = schema.toBeforeFunction(fnRootName);
        const test = new Mocha.Test(`${fnRootName}`, async () => {
          if (!opts.showTx) {
            testSnapnum = await hre.network.provider.request({
              method: "evm_snapshot",
            });
          }
          // Once a _test function has been call, inspect logs to check
          if (testContract[beforeName]) {
            let beforeTx = await testContract[beforeName]({
              gasLimit: 12000000,
            });
            await beforeTx.wait();
          }

          // for failed tests. Failed tests/logs after the first one are not
          // shown.
          let tx = await testContract[fnName]({ gasLimit: 12000000 });
          let receipt = await tx.wait();
          if (opts.showGas) {
            console.log(`${fnName} gas: ${receipt.gasUsed}`);
          }
          if (opts.showTx) {
            console.log(`${fnName} tx: ${receipt.transactionHash}`);
          }
          // This doesn't get processed if the tx reverts.
          processLogs(receipt, testContract, testContractObj);
        });
        test.file = testContractObj.sourceName;
        suite.addTest(test);
      }
    }
  }
  return mocha;
};
