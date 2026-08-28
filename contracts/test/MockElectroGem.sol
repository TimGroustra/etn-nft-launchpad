// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Minimal ElectroGem stand-in for Gem Shards free-mint tests.
contract MockElectroGem is ERC721, Ownable {
    uint256 private _nextTokenId = 1;

    constructor(address initialOwner) ERC721("ElectroGem", "EGEM") Ownable(initialOwner) {}

    function mint(address to) external onlyOwner returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _mint(to, tokenId);
    }

    function mintTo(address to, uint256 tokenId) external onlyOwner {
        _mint(to, tokenId);
    }
}
