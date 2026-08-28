// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IMintable} from "./interfaces/IMintable.sol";

interface IERC721Enumerable {
    function totalSupply() external view returns (uint256);
}

interface IERC1155MintEdition {
    function mintEdition(uint256 tokenId, uint256 amount) external payable;
}

interface IERC721Balance {
    function balanceOf(address owner) external view returns (uint256);
}

/// @notice Collects launchpad platform mint fees for etn-nft-launchpad.club only.
/// @dev IMintable collections accept mint price only; external marketplaces never pay the launchpad fee.
contract LaunchpadMinter is IERC721Receiver {
    uint96 public immutable platformMintFeeBps;
    address public immutable platformTreasury;
    address public immutable electroGemsCollection;
    address public immutable clubWatchCollection;

    constructor(
        uint96 platformMintFeeBps_,
        address platformTreasury_,
        address electroGems_,
        address clubWatch_
    ) {
        require(platformMintFeeBps_ <= 10_000, "Invalid fee bps");
        require(platformTreasury_ != address(0), "Invalid treasury");
        platformMintFeeBps = platformMintFeeBps_;
        platformTreasury = platformTreasury_;
        electroGemsCollection = electroGems_;
        clubWatchCollection = clubWatch_;
    }

    /// @notice Total ETN a buyer pays through the launchpad (mint price + platform fee when applicable).
    function requiredMintPayment(
        address collection,
        address buyer,
        uint256 mintCount
    ) external view returns (uint256) {
        uint256 base = IMintable(collection).mintPrice() * mintCount;
        return base + _platformFee(buyer, base);
    }

    /// @notice Mint ERC-721 via IMintable and deliver tokens to the buyer.
    function mintERC721(address collection, uint256 mintCount) external payable {
        require(mintCount > 0, "Quantity zero");
        uint256 base = IMintable(collection).mintPrice() * mintCount;
        uint256 platformFee = _platformFee(msg.sender, base);
        require(msg.value == base + platformFee, "Incorrect payment");

        if (platformFee > 0) {
            (bool sentFee, ) = platformTreasury.call{value: platformFee}("");
            require(sentFee, "Platform fee transfer failed");
        }

        uint256 startingSupply = IERC721Enumerable(collection).totalSupply();
        IMintable(collection).mint{value: base}(mintCount);

        for (uint256 i = 1; i <= mintCount; i++) {
            IERC721(collection).safeTransferFrom(address(this), msg.sender, startingSupply + i);
        }
    }

    /// @notice Mint a specific ERC-1155 edition and deliver copies to the buyer.
    function mintEdition(address collection, uint256 tokenId, uint256 amount) external payable {
        require(amount > 0, "Quantity zero");
        uint256 base = IMintable(collection).mintPrice() * amount;
        uint256 platformFee = _platformFee(msg.sender, base);
        require(msg.value == base + platformFee, "Incorrect payment");

        if (platformFee > 0) {
            (bool sentFee, ) = platformTreasury.call{value: platformFee}("");
            require(sentFee, "Platform fee transfer failed");
        }

        IERC1155MintEdition(collection).mintEdition{value: base}(tokenId, amount);
        IERC1155(collection).safeTransferFrom(address(this), msg.sender, tokenId, amount, "");
    }

    function _platformFee(address buyer, uint256 base) internal view returns (uint256) {
        if (base == 0 || _isPlatformFeeExempt(buyer)) return 0;
        return (base * uint256(platformMintFeeBps)) / 10_000;
    }

    function _isPlatformFeeExempt(address account) internal view returns (bool) {
        return
            electroGemsCollection != address(0) &&
            clubWatchCollection != address(0) &&
            IERC721Balance(electroGemsCollection).balanceOf(account) > 0 &&
            IERC721Balance(clubWatchCollection).balanceOf(account) > 0;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
