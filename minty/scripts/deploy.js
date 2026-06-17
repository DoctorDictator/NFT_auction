const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const Minty = await hre.ethers.getContractFactory("Minty");
  const minty = await Minty.deploy("NFT Marketplace", "NFTM");
  await minty.waitForDeployment();
  console.log("Minty deployed to:", await minty.getAddress());

  const Marketplace = await hre.ethers.getContractFactory("Marketplace");
  const marketplace = await Marketplace.deploy(deployer.address, 250);
  await marketplace.waitForDeployment();
  console.log("Marketplace deployed to:", await marketplace.getAddress());

  const MINTER_ROLE = await minty.MINTER_ROLE();
  await minty.grantRole(MINTER_ROLE, deployer.address);

  const deployment = {
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    network: hre.network.name,
    contracts: {
      Minty: { address: await minty.getAddress() },
      Marketplace: { address: await marketplace.getAddress() },
    },
  };

  const fs = require("fs");
  const content = JSON.stringify(deployment, null, 2);
  fs.writeFileSync("deployment.json", content);
  try { fs.writeFileSync("../frontend/public/deployment.json", content); } catch {}
  console.log("Deployment info written to deployment.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
