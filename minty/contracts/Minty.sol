// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract Minty is ERC721, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint256 private _nextTokenId;
    mapping(uint256 tokenId => string) private _tokenURIs;

    string private _baseTokenURI;

    constructor(string memory tokenName, string memory symbol) ERC721(tokenName, symbol) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    function mintToken(address to, string memory uri) public onlyRole(MINTER_ROLE) whenNotPaused returns (uint256) {
        require(bytes(uri).length > 0, "uri must not be empty");
        _nextTokenId++;
        uint256 tokenId = _nextTokenId;
        _safeMint(to, tokenId);
        _tokenURIs[tokenId] = uri;
        return tokenId;
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        _requireOwned(tokenId);
        string memory uri = _tokenURIs[tokenId];
        if (bytes(uri).length > 0) return uri;
        return string(abi.encodePacked(_baseTokenURI, Strings.toString(tokenId)));
    }

    function setBaseURI(string memory baseURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseTokenURI = baseURI;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
