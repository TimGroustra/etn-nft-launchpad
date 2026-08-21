// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice ElectroSwap NFT marketplace mint interface.
/// @dev See https://electroswap.io/docs/nft-marketplace/imintable
interface IMintable {
    function mintPrice() external view returns (uint256);

    function mintableCount(address account) external view returns (uint256);

    function mint(uint256 mintCount) external payable;
}
