const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Minty", function () {
  let minty;
  let admin;
  let minter;
  let user;

  beforeEach(async () => {
    [admin, minter, user] = await ethers.getSigners();
    const Minty = await ethers.getContractFactory("Minty");
    minty = await Minty.deploy("TestNFT", "TNFT");
  });

  describe("Roles", () => {
    it("should grant DEFAULT_ADMIN_ROLE to deployer", async () => {
      expect(await minty.hasRole(await minty.DEFAULT_ADMIN_ROLE(), admin.address)).to.be.true;
    });

    it("should grant MINTER_ROLE to deployer", async () => {
      expect(await minty.hasRole(await minty.MINTER_ROLE(), admin.address)).to.be.true;
    });

    it("should allow admin to grant MINTER_ROLE", async () => {
      const MINTER_ROLE = await minty.MINTER_ROLE();
      await minty.connect(admin).grantRole(MINTER_ROLE, minter.address);
      expect(await minty.hasRole(MINTER_ROLE, minter.address)).to.be.true;
    });

    it("should allow admin to revoke MINTER_ROLE", async () => {
      const MINTER_ROLE = await minty.MINTER_ROLE();
      await minty.connect(admin).grantRole(MINTER_ROLE, minter.address);
      await minty.connect(admin).revokeRole(MINTER_ROLE, minter.address);
      expect(await minty.hasRole(MINTER_ROLE, minter.address)).to.be.false;
    });
  });

  describe("Minting", () => {
    it("should revert if non-minter tries to mint", async () => {
      await expect(
        minty.connect(user).mintToken(user.address, "ipfs://test")
      ).to.be.reverted;
    });

    it("should revert if URI is empty", async () => {
      await expect(
        minty.connect(admin).mintToken(admin.address, "")
      ).to.be.revertedWith("uri must not be empty");
    });

    it("should mint token and return correct tokenId", async () => {
      const tx = await minty.connect(admin).mintToken(user.address, "ipfs://QmTest");
      await expect(tx).to.emit(minty, "Transfer").withArgs(ethers.ZeroAddress, user.address, 1);
    });

    it("should store full IPFS URI", async () => {
      await minty.connect(admin).mintToken(user.address, "ipfs://QmTestURI");
      const uri = await minty.tokenURI(1);
      expect(uri).to.equal("ipfs://QmTestURI");
    });

    it("should increment token IDs", async () => {
      await minty.connect(admin).mintToken(user.address, "ipfs://first");
      await minty.connect(admin).mintToken(user.address, "ipfs://second");
      await minty.connect(admin).mintToken(user.address, "ipfs://third");
      expect(await minty.tokenURI(1)).to.equal("ipfs://first");
      expect(await minty.tokenURI(2)).to.equal("ipfs://second");
      expect(await minty.tokenURI(3)).to.equal("ipfs://third");
    });

    it("should allow MINTER_ROLE to mint", async () => {
      const MINTER_ROLE = await minty.MINTER_ROLE();
      await minty.connect(admin).grantRole(MINTER_ROLE, minter.address);
      const tx = await minty.connect(minter).mintToken(user.address, "ipfs://QmMinter");
      await expect(tx).to.emit(minty, "Transfer").withArgs(ethers.ZeroAddress, user.address, 1);
    });
  });

  describe("ERC721 compliance", () => {
    it("should support ERC721 and AccessControl interfaces", async () => {
      const ERC721_ID = "0x80ac58cd";
      const AccessControl_ID = "0x7965db0b";
      expect(await minty.supportsInterface(ERC721_ID)).to.be.true;
      expect(await minty.supportsInterface(AccessControl_ID)).to.be.true;
    });

    it("should allow token transfer by owner", async () => {
      await minty.connect(admin).mintToken(admin.address, "ipfs://transfer");
      await minty.connect(admin).transferFrom(admin.address, user.address, 1);
      expect(await minty.ownerOf(1)).to.equal(user.address);
    });
  });
});
