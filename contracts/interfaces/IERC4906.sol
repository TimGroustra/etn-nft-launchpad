// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ERC-4906
/// @dev Metadata Update Extension
interface IERC4906 {
    event MetadataUpdate(uint256 _tokenId);
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);
}
