const hre = require("hardhat");

async function main() {
  const network = hre.network.name;
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;

  const Minty = await hre.ethers.getContractFactory("Minty");
  const minty = await Minty.deploy("MintyNFT", "MNT");
  await minty.waitForDeployment();
  const mintyAddr = await minty.getAddress();
  console.log(`Minty deployed to ${mintyAddr}`);

  const Auction = await hre.ethers.getContractFactory("Auction");
  const auction = await Auction.deploy();
  await auction.waitForDeployment();
  const auctionAddr = await auction.getAddress();
  console.log(`Auction deployed to ${auctionAddr}`);

  const deployment = {
    chainId: Number(chainId),
    network,
    contracts: {
      Minty: {
        address: mintyAddr,
        abi: minty.interface.formatJson(),
      },
      Auction: {
        address: auctionAddr,
        abi: auction.interface.formatJson(),
      },
    },
  };

  const fs = require("fs");
  fs.writeFileSync("deployment.json", JSON.stringify(deployment, null, 2));
  console.log("Deployment info written to deployment.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
