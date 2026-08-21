// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Standard NFT marketplace mint interface (IMintable).
/// @dev Compatible with ElectroSwap and other marketplaces that host IMintable minting.
interface IMintable {
    function mintPrice() external view returns (uint256);

    function mintableCount(address account) external view returns (uint256);

    function mint(uint256 mintCount) external payable;
}
