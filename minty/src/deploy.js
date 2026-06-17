const fs = require("fs/promises");
const { F_OK } = require("fs");

const inquirer = require("inquirer");
const config = require("getconfig");

async function deployContracts(name, symbol) {
  const hardhat = require("hardhat");
  const network = hardhat.network.name;
  const chainId = (await hardhat.ethers.provider.getNetwork()).chainId;

  const Minty = await hardhat.ethers.getContractFactory("Minty");
  const minty = await Minty.deploy(name, symbol);

  const Auction = await hardhat.ethers.getContractFactory("Auction");
  const auction = await Auction.deploy();

  const deployment = {
    chainId: Number(chainId),
    network,
    contracts: {
      Minty: {
        address: await minty.getAddress(),
        abi: minty.interface.formatJson(),
      },
      Auction: {
        address: await auction.getAddress(),
        abi: auction.interface.formatJson(),
      },
    },
  };

  await writeDeploymentInfo(deployment, "deployment.json");
  return deployment;
}

async function writeDeploymentInfo(info, filename = "deployment.json") {
  const content = JSON.stringify(info, null, 2);
  await fs.writeFile(filename, content, { encoding: "utf-8" });
}

async function saveDeploymentInfo(info, filename = undefined) {
  if (!filename) {
    filename = config.deploymentConfigFile || "deployment.json";
  }
  const exists = await fileExists(filename);
  if (exists) {
    const overwrite = await confirmOverwrite(filename);
    if (!overwrite) {
      return false;
    }
  }

  console.log(`Writing deployment info to ${filename}`);
  const content = JSON.stringify(info, null, 2);
  await fs.writeFile(filename, content, { encoding: "utf-8" });
  return true;
}

async function loadDeploymentInfo(path) {
  if (!path) {
    path = config.deploymentConfigFile || "deployment.json";
  }
  const content = await fs.readFile(path, { encoding: "utf8" });
  return JSON.parse(content);
}

async function fileExists(path) {
  try {
    await fs.access(path, F_OK);
    return true;
  } catch (e) {
    return false;
  }
}

async function confirmOverwrite(filename) {
  const answers = await inquirer.prompt([
    {
      type: "confirm",
      name: "overwrite",
      message: `File ${filename} exists. Overwrite it?`,
      default: false,
    },
  ]);
  return answers.overwrite;
}

module.exports = {
  deployContracts,
  loadDeploymentInfo,
  saveDeploymentInfo,
};
