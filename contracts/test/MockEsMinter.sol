// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IMintable} from "../interfaces/IMintable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IERC721Enumerable {
    function totalSupply() external view returns (uint256);
}

/// @dev Mirrors ElectroSwap EsMinter: mint to self, then transfer tokens to the buyer.
contract MockEsMinter is IERC721Receiver {
    function mint(address collection, uint256 mintCount, address buyer) external payable {
        uint256 supplyBefore = IERC721Enumerable(collection).totalSupply();
        IMintable(collection).mint{value: msg.value}(mintCount);
        IERC721 erc = IERC721(collection);
        unchecked {
            for (uint256 i = 1; i <= mintCount; ++i) {
                erc.transferFrom(address(this), buyer, supplyBefore + i);
            }
        }
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {}
}
