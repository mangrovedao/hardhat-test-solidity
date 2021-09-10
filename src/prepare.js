const debug = require("debug")("hardhat:test-solidity:prepare");
module.exports = async (hre, schema, opts) => {
    // Get the list of contracts as parsed by Buidler
  const getArtifacts = async () => {
    return Promise.all(
      (await hre.artifacts.getAllFullyQualifiedNames()).map(
        async (n) => await hre.artifacts.readArtifact(n)
      )
    );
  };

  // fail early if one of the requested test contracts doesn't exist
  for (const name of opts.argTestContractNames) {
    await hre.artifacts.readArtifact(schema.toTest(name));
  }

  // otherwise, get all necessary contracts
  const artifacts = await getArtifacts();
  debug("Artifacts names: %o", artifacts.map((c) => c.contractName));

  // Find all contracts C such that C_Test exists.
  const testableContracts = artifacts.filter((c) => {
    return schema.isTestContract(c.contractName);
  });

  debug("Testable contracts: %o", testableContracts.map((c) => c.contractName));

  // If no specific contract has been given, try to test all contracts
  const testContracts =
    (opts.argTestContractNames.length === 0)
      ? testableContracts
      : artifacts.filter((c) =>
        opts.argTestContractNames.map(schema.toTest).includes(c.contractName)
      );

  return {artifacts, testContracts};
};



