require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.27",
      settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "cancun",
        },
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    localhost: {},
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
};
