const SOURCE_PATH = 'contracts/EditableERC721.sol'

/** Turn a collection name into a valid Solidity contract identifier for explorer display. */
export function sanitizeSolidityContractName(collectionName) {
  const parts = String(collectionName ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (/^\d+$/.test(part)) return part
      const cleaned = part.replace(/[^a-zA-Z0-9]/g, '')
      if (!cleaned) return ''
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
    })
    .filter(Boolean)

  let name = parts.join('') || 'NFTCollection'
  if (/^\d/.test(name)) name = `Collection${name}`
  return name.slice(0, 64)
}

export function buildNamedVerificationBundle(bundle, collectionName) {
  const contractName = sanitizeSolidityContractName(collectionName)
  const input = structuredClone(bundle.standardJsonInput)
  const sources = input?.sources
  if (!sources?.[SOURCE_PATH]?.content) {
    throw new Error('EditableERC721 source missing from verification bundle')
  }

  sources[SOURCE_PATH] = {
    ...sources[SOURCE_PATH],
    content: sources[SOURCE_PATH].content.replace(
      /contract\s+EditableERC721\b/,
      `contract ${contractName}`,
    ),
  }

  return {
    compilerVersion: bundle.compilerVersion,
    contractName: `${SOURCE_PATH}:${contractName}`,
    standardJsonInput: input,
  }
}
